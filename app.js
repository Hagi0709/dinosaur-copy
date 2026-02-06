// app.js
(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
  const toHira = (s) => (s || '').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const norm = (s) => toHira(String(s || '').toLowerCase()).replace(/\s+/g, '');

  // ✅ 安定ID生成（同じ名前 → 同じID）
  function stableHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  function stableId(prefix, name) {
    const key = norm(name);
    return `${prefix}_${stableHash(key)}`;
  }

  /* ========= storage keys ========= */
  const LS = {
    DINO_CUSTOM: 'dino_custom_v1',
    ITEM_CUSTOM: 'item_custom_v1',
    DINO_HIDDEN: 'dino_hidden_v1',
    ITEM_HIDDEN: 'item_hidden_v1',
    DINO_ORDER: 'dino_order_v1',
    ITEM_ORDER: 'item_order_v1',
    PRICES: 'prices_v1',
    DELIVERY: 'delivery_v1',
    DINO_IMAGES: 'dino_images_v1', // { [dinoId]: dataURL }
  };
  const loadJSON = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ========= prices ========= */
  const defaultPrices = {
    '受精卵': 30, '受精卵(指定)': 50,
    '胚': 50, '胚(指定)': 100,
    '幼体': 100,
    '成体': 500,
    'クローン': 500, 'クローン(指定)': 300,
  };
  const prices = Object.assign({}, defaultPrices, loadJSON(LS.PRICES, {}));
  const typeList = Object.keys(defaultPrices);
  const specifiedMap = { '受精卵': '受精卵(指定)', '胚': '胚(指定)', 'クローン': 'クローン(指定)' };

  /* ========= images ========= */
  const dinoImages = Object.assign({}, loadJSON(LS.DINO_IMAGES, {})); // id -> dataURL

  /* ========= DOM ========= */
  const el = {
    q: $('#q'),
    qClear: $('#qClear'),
    delivery: $('#delivery'),
    copy: $('#copy'),
    total: $('#total'),
    out: $('#out'),

    tabDinos: $('#tabDinos'),
    tabItems: $('#tabItems'),
    list: $('#list'),

    openManage: $('#openManage'),
    modalOverlay: $('#modalOverlay'),
    modalBody: $('#modalBody'),
    closeManage: $('#closeManage'),
    mTabCatalog: $('#mTabCatalog'),
    mTabPrices: $('#mTabPrices'),

    // ✅ 追加/編集モーダル（index.htmlに存在）
    editOverlay: $('#editOverlay'),
    editBody: $('#editBody'),
    editTitle: $('#editTitle'),
    editClose: $('#editClose'),

    // ✅ 確認モーダル（index.htmlに存在）
    confirmOverlay: $('#confirmOverlay'),
    confirmText: $('#confirmText'),
    confirmCancel: $('#confirmCancel'),
    confirmOk: $('#confirmOk'),

    // ✅ 画像ビューア（index.htmlに存在）
    imgOverlay: $('#imgOverlay'),
    imgClose: $('#imgClose'),
    imgViewerImg: $('#imgViewerImg'),
  };

  /* ========= sanity (reset) ========= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    location.replace(location.pathname);
    return;
  }

  /* ========= data ========= */
  const hidden = {
    dino: new Set(loadJSON(LS.DINO_HIDDEN, [])),
    item: new Set(loadJSON(LS.ITEM_HIDDEN, [])),
  };
  const order = {
    dino: loadJSON(LS.DINO_ORDER, []),
    item: loadJSON(LS.ITEM_ORDER, []),
  };
  const custom = {
    dino: loadJSON(LS.DINO_CUSTOM, []), // [{id,name,defType}]
    item: loadJSON(LS.ITEM_CUSTOM, []), // [{id,name,unit,price}]
  };

  let dinos = [];
  let items = [];
  let activeTab = 'dino';

  // inputState: key -> {type,m,f} or {qty}
  const inputState = new Map();
  // duplicated cards keys (ephemeral)
  const ephemeralKeys = new Set();

  /* ========= fetch & parse ========= */
  async function fetchTextSafe(path) {
    try {
      const r = await fetch(path + '?ts=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return '';
      return await r.text();
    } catch { return ''; }
  }

  function parseDinoLine(line) {
    line = (line || '').trim();
    if (!line || line.startsWith('#')) return null;
    line = line.replace(/^・/, '').trim();
    if (!line) return null;
    const [nameRaw, defRaw] = line.split('|').map(s => (s || '').trim());
    if (!nameRaw) return null;
    const defType = (defRaw && prices[defRaw] != null) ? defRaw : '受精卵';

    // ✅ 安定ID（並び順・画像・非表示がリロードで維持）
    return { id: stableId('d', nameRaw), name: nameRaw, defType, kind: 'dino' };
  }

  function parseItemLine(line) {
    line = (line || '').trim();
    if (!line || line.startsWith('#')) return null;
    const parts = line.split('|').map(s => (s || '').trim());
    if (parts.length < 3) return null;
    const name = parts[0];
    const unit = Number(parts[1]);
    const price = Number(parts[2]);
    if (!name || !Number.isFinite(unit) || !Number.isFinite(price)) return null;

    // ✅ 安定ID
    return { id: stableId('i', name), name, unit, price, kind: 'item' };
  }

  /* ========= ordering ========= */
  function ensureOrderList(list, kind) {
    const ids = list.map(x => x.id);
    const ord = (order[kind] || []).filter(id => ids.includes(id));
    ids.forEach(id => { if (!ord.includes(id)) ord.push(id); });
    order[kind] = ord;
    saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
  }

  function sortByOrder(list, kind) {
    const ord = order[kind] || [];
    const idx = new Map(ord.map((id, i) => [id, i]));
    return list.slice().sort((a, b) => {
      const ai = idx.has(a.id) ? idx.get(a.id) : 1e9;
      const bi = idx.has(b.id) ? idx.get(b.id) : 1e9;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, 'ja');
    });
  }

  /* ========= behavior rules ========= */
  function ensureDinoState(key, defType) {
    if (!inputState.has(key)) inputState.set(key, { type: defType || '受精卵', m: 0, f: 0 });
    return inputState.get(key);
  }
  function ensureItemState(key) {
    if (!inputState.has(key)) inputState.set(key, { qty: 0 });
    return inputState.get(key);
  }

  // 両方>0なら(指定)へ。両方0なら(指定)解除。
  function autoSpecify(s) {
    const m = Number(s.m || 0), f = Number(s.f || 0);
    const base = String(s.type || '受精卵').replace('(指定)', '');
    const hasSpecified = /\(指定\)$/.test(String(s.type || ''));
    if (m > 0 && f > 0) {
      s.type = specifiedMap[base] || (base + '(指定)');
      return;
    }
    if (m === 0 && f === 0 && hasSpecified) {
      s.type = base;
    }
  }

  /* ========= output ========= */
  function rebuildOutput() {
    const lines = [];
    let sum = 0;
    let idx = 1;

    const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    for (const d of dList) {
      const baseKey = d.id;
      const keys = [baseKey, ...Array.from(ephemeralKeys).filter(k => k.startsWith(baseKey + '__dup'))];

      for (const k of keys) {
        const s = inputState.get(k);
        if (!s) continue;

        const type = s.type || d.defType || '受精卵';
        const m = Number(s.m || 0);
        const f = Number(s.f || 0);
        const qty = m + f;
        if (qty <= 0) continue;

        const unitPrice = prices[type] || 0;
        const price = unitPrice * qty;
        sum += price;

        const tOut = String(type).replace('(指定)', '');
        const isPair = /\(指定\)$/.test(type) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(type);

        let line = '';
        if (isPair) {
          if (m === f) {
            line = `${d.name}${tOut}ペア${m > 1 ? '×' + m : ''} = ${price.toLocaleString('ja-JP')}円`;
          } else {
            const p = [];
            if (m > 0) p.push(`♂×${m}`);
            if (f > 0) p.push(`♀×${f}`);
            line = `${d.name}${tOut} ${p.join(' ')} = ${price.toLocaleString('ja-JP')}円`;
          }
        } else {
          line = `${d.name}${tOut}×${qty} = ${price.toLocaleString('ja-JP')}円`;
        }

        lines.push(`${idx}. ${line}`);
        idx++;
      }
    }

    const iList = sortByOrder(items.filter(it => !hidden.item.has(it.id)), 'item');
    for (const it of iList) {
      const s = inputState.get(it.id);
      if (!s) continue;
      const qty = Number(s.qty || 0);
      if (qty <= 0) continue;

      const totalCount = qty * Number(it.unit || 1);
      const price = qty * Number(it.price || 0);
      sum += price;

      lines.push(`${idx}. ${it.name} × ${totalCount} = ${price.toLocaleString('ja-JP')}円`);
      idx++;
    }

    el.total.textContent = yen(sum);

    el.out.value =
`この度はご検討いただきありがとうございます！
ご希望内容は以下となります👇🏻

${lines.join('\n')}
ーーーーーーーーーーーーーーー
計：${sum.toLocaleString('ja-JP')}円
最短納品目安 : ${el.delivery.value}

ご希望内容、金額をご確認の上購入の方よろしくお願いします🙏🏻

また、追加や変更などありましたら、お気軽にお申し付けください👍🏻`;
  }

  /* ========= collapse & search ========= */
  function getQtyForCard(key, kind) {
    if (kind === 'dino') {
      const s = inputState.get(key);
      return s ? (Number(s.m || 0) + Number(s.f || 0)) : 0;
    } else {
      const s = inputState.get(key);
      return s ? Number(s.qty || 0) : 0;
    }
  }

  function applyCollapseAndSearch() {
    const q = norm(el.q.value);

    $$('[data-card="1"]', el.list).forEach(card => {
      const name = card.dataset.name || '';
      const show = !q || norm(name).includes(q);
      card.style.display = show ? '' : 'none';

      const key = card.dataset.key;
      const kind = card.dataset.kind;
      const qty = getQtyForCard(key, kind);
      const collapsed = q ? !show : (qty === 0);
      card.classList.toggle('isCollapsed', collapsed);
    });
  }

  /* ========= cards ========= */
  function buildDinoCard(d, keyOverride = null) {
    const key = keyOverride || d.id;
    const s = ensureDinoState(key, d.defType);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.key = key;
    card.dataset.name = d.name;
    card.dataset.kind = 'dino';

    card.innerHTML = `
      <div class="cardInner">
        <div class="cardHead">
          <button class="cardToggle" type="button" aria-label="開閉" data-act="toggle"></button>
          <div class="name"></div>
          <div class="right">
            <select class="type" aria-label="種類"></select>
            <div class="unit"></div>
          </div>
        </div>

        <div class="controls">
          <div class="stepper male">
            <button class="btn" type="button" data-act="m-">−</button>
            <div class="val js-m">0</div>
            <button class="btn" type="button" data-act="m+">＋</button>
          </div>

          <div class="stepper female">
            <button class="btn" type="button" data-act="f-">−</button>
            <div class="val js-f">0</div>
            <button class="btn" type="button" data-act="f+">＋</button>
          </div>

          <button class="dupBtn" type="button" data-act="dup">複製</button>
        </div>
      </div>
    `;

    $('.name', card).textContent = d.name;

    const sel = $('.type', card);
    sel.innerHTML = typeList.map(t => `<option value="${t}">${t}</option>`).join('');
    sel.value = s.type;

    const unit = $('.unit', card);
    unit.textContent = `単価${prices[s.type] || 0}円`;

    const mEl = $('.js-m', card);
    const fEl = $('.js-f', card);
    mEl.textContent = String(s.m || 0);
    fEl.textContent = String(s.f || 0);

    const initialQty = Number(s.m || 0) + Number(s.f || 0);
    card.classList.toggle('isCollapsed', initialQty === 0);

    function syncUI() {
      sel.value = s.type;
      unit.textContent = `単価${prices[s.type] || 0}円`;
      mEl.textContent = String(s.m || 0);
      fEl.textContent = String(s.f || 0);

      if (!el.q.value.trim()) {
        const q = (Number(s.m || 0) + Number(s.f || 0));
        card.classList.toggle('isCollapsed', q === 0);
      }
    }

    function step(sex, delta) {
      if (sex === 'm') s.m = Math.max(0, Number(s.m || 0) + delta);
      if (sex === 'f') s.f = Math.max(0, Number(s.f || 0) + delta);
      autoSpecify(s);
      syncUI();
      rebuildOutput();
      applyCollapseAndSearch();
    }

    sel.addEventListener('change', (ev) => {
      ev.stopPropagation();
      s.type = sel.value;
      autoSpecify(s);
      syncUI();
      rebuildOutput();
      applyCollapseAndSearch();
    });

    $('.cardToggle', card).addEventListener('click', (ev) => {
      ev.preventDefault();
      if (el.q.value.trim()) return;
      card.classList.toggle('isCollapsed');
    });

    $$('button[data-act]', card).forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.act;

        if (act === 'm-') step('m', -1);
        if (act === 'm+') step('m', +1);
        if (act === 'f-') step('f', -1);
        if (act === 'f+') step('f', +1);

        if (act === 'dup') {
          const dupKey = `${d.id}__dup_${uid()}`;
          ephemeralKeys.add(dupKey);
          inputState.set(dupKey, { type: s.type, m: 0, f: 0 });

          const dupCard = buildDinoCard(d, dupKey);
          dupCard.dataset.name = d.name;
          dupCard.dataset.key = dupKey;

          card.after(dupCard);
          rebuildOutput();
          applyCollapseAndSearch();
        }
      });
    });

    return card;
  }

  function buildItemCard(it) {
    const s = ensureItemState(it.id);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.key = it.id;
    card.dataset.name = it.name;
    card.dataset.kind = 'item';

    card.innerHTML = `
      <div class="cardInner">
        <div class="cardHead">
          <button class="cardToggle" type="button" aria-label="開閉" data-act="toggle"></button>
          <div class="name"></div>
          <div class="right">
            <div class="unit"></div>
          </div>
        </div>

        <div class="controls">
          <div class="stepper" style="flex:1;">
            <button class="btn" type="button" data-act="-">−</button>
            <div class="val js-q">0</div>
            <button class="btn" type="button" data-act="+">＋</button>
          </div>
        </div>
      </div>
    `;

    $('.name', card).textContent = it.name;
    $('.unit', card).textContent = `単価${it.price}円`;

    const qEl = $('.js-q', card);
    qEl.textContent = String(s.qty || 0);

    card.classList.toggle('isCollapsed', Number(s.qty || 0) === 0);

    $('.cardToggle', card).addEventListener('click', (ev) => {
      ev.preventDefault();
      if (el.q.value.trim()) return;
      card.classList.toggle('isCollapsed');
    });

    $$('button[data-act]', card).forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.act;
        if (act === '-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
        if (act === '+') s.qty = Math.max(0, Number(s.qty || 0) + 1);

        qEl.textContent = String(s.qty || 0);

        if (!el.q.value.trim()) card.classList.toggle('isCollapsed', Number(s.qty || 0) === 0);

        rebuildOutput();
        applyCollapseAndSearch();
      });
    });

    return card;
  }

  /* ========= render ========= */
  function renderList() {
    el.list.innerHTML = '';

    if (activeTab === 'dino') {
      const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
      dList.forEach(d => el.list.appendChild(buildDinoCard(d)));
    } else {
      const iList = sortByOrder(items.filter(i => !hidden.item.has(i.id)), 'item');
      iList.forEach(it => el.list.appendChild(buildItemCard(it)));
    }

    rebuildOutput();
    applyCollapseAndSearch();
  }

  function setTab(tab) {
    activeTab = tab;
    el.tabDinos.classList.toggle('isActive', tab === 'dino');
    el.tabItems.classList.toggle('isActive', tab === 'item');
    renderList();
  }

  /* ========= manage modal ========= */
  function openModal() {
    el.modalOverlay.classList.remove('isHidden');
    setManageTab('catalog');
  }
  function closeModal() {
    el.modalOverlay.classList.add('isHidden');
    el.modalBody.innerHTML = '';
  }

  function setManageTab(kind) {
    el.mTabCatalog.classList.toggle('isActive', kind === 'catalog');
    el.mTabPrices.classList.toggle('isActive', kind === 'prices');

    const mTabImages = $('#mTabImages');
    if (mTabImages) mTabImages.classList.toggle('isActive', kind === 'images');

    el.modalBody.innerHTML = '';
    if (kind === 'catalog') el.modalBody.appendChild(renderManageCatalog());
    if (kind === 'prices') el.modalBody.appendChild(renderManagePrices());
    if (kind === 'images') el.modalBody.appendChild(renderManageImages());
  }

  /* ========= confirm modal ========= */
  let confirmResolve = null;
  function confirmAsk(text) {
    return new Promise((resolve) => {
      if (!el.confirmOverlay) return resolve(false);
      confirmResolve = resolve;
      el.confirmText.textContent = text || '削除しますか？';
      el.confirmOverlay.classList.remove('isHidden');
    });
  }
  function confirmClose(val) {
    if (!el.confirmOverlay) return;
    el.confirmOverlay.classList.add('isHidden');
    if (confirmResolve) {
      const r = confirmResolve;
      confirmResolve = null;
      r(!!val);
    }
  }

  el.confirmCancel?.addEventListener('click', () => confirmClose(false));
  el.confirmOk?.addEventListener('click', () => confirmClose(true));
  el.confirmOverlay?.addEventListener('click', (e) => {
    if (e.target === el.confirmOverlay) confirmClose(false);
  });

  /* ========= edit/add modal ========= */
  function openEditModal(title, bodyEl) {
    if (!el.editOverlay) return;
    el.editTitle.textContent = title;
    el.editBody.innerHTML = '';
    el.editBody.appendChild(bodyEl);
    el.editOverlay.classList.remove('isHidden');
  }
  function closeEditModal() {
    if (!el.editOverlay) return;
    el.editOverlay.classList.add('isHidden');
    el.editBody.innerHTML = '';
  }
  el.editClose?.addEventListener('click', closeEditModal);
  el.editOverlay?.addEventListener('click', (e) => {
    if (e.target === el.editOverlay) closeEditModal();
  });

  /* ========= manage: prices ========= */
  function renderManagePrices() {
    const box = document.createElement('div');

    const grid = document.createElement('div');
    grid.className = 'priceGrid';

    typeList.forEach(t => {
      const key = document.createElement('div');
      key.className = 'pKey';
      key.textContent = t;

      const val = document.createElement('div');
      val.className = 'pVal';
      val.innerHTML = `<input type="number" inputmode="numeric" value="${prices[t] || 0}" data-type="${t}">`;

      grid.appendChild(key);
      grid.appendChild(val);
    });

    const save = document.createElement('div');
    save.style.marginTop = '12px';
    save.innerHTML = `<button class="pill" type="button" data-act="savePrices">保存</button>`;

    box.appendChild(grid);
    box.appendChild(save);

    box.addEventListener('click', (e) => {
      if (e.target?.dataset?.act !== 'savePrices') return;
      $$('input[data-type]', box).forEach(inp => {
        const t = inp.dataset.type;
        prices[t] = Number(inp.value || 0);
      });
      saveJSON(LS.PRICES, prices);
      renderList();
      closeModal();
    });

    return box;
  }

  /* ========= manage: catalog (並び替え/削除 + 追加) ========= */
  function renderManageCatalog() {
    const wrap = document.createElement('div');

    // ✅ 追加ボタン（恐竜タブの時だけ表示）
    if (activeTab === 'dino') {
      const addBar = document.createElement('div');
      addBar.style.marginBottom = '12px';
      addBar.innerHTML = `<button class="pill" type="button" data-act="addDino">＋ 恐竜を追加</button>`;
      wrap.appendChild(addBar);
    }

    const list = (activeTab === 'dino')
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    list.forEach(obj => {
      const r = document.createElement('div');
      r.className = 'mRow';
      r.innerHTML = `
        <div class="mName">${obj.name}</div>
        <button class="sBtn" type="button" data-act="up" data-id="${obj.id}">↑</button>
        <button class="sBtn" type="button" data-act="down" data-id="${obj.id}">↓</button>
        <button class="sBtn danger" type="button" data-act="del" data-id="${obj.id}">削除</button>
      `;
      wrap.appendChild(r);
    });

    wrap.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      const id = e.target?.dataset?.id;

      // ✅ 追加
      if (act === 'addDino') {
        openAddDino();
        return;
      }

      if (!act || !id) return;

      const kind = activeTab;
      const ord = (order[kind] || []).slice();
      const i = ord.indexOf(id);

      if (act === 'up' && i > 0) {
        [ord[i], ord[i - 1]] = [ord[i - 1], ord[i]];
        order[kind] = ord;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
        renderList();
        closeModal();
        return;
      }

      if (act === 'down' && i !== -1 && i < ord.length - 1) {
        [ord[i], ord[i + 1]] = [ord[i + 1], ord[i]];
        order[kind] = ord;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
        renderList();
        closeModal();
        return;
      }

      if (act === 'del') {
        const ok = await confirmAsk('削除しますか？');
        if (!ok) return;

        if (kind === 'dino') {
          hidden.dino.add(id);
          saveJSON(LS.DINO_HIDDEN, Array.from(hidden.dino));
        } else {
          hidden.item.add(id);
          saveJSON(LS.ITEM_HIDDEN, Array.from(hidden.item));
        }

        renderList();
        closeModal();
      }
    });

    return wrap;
  }

  function openAddDino() {
    const box = document.createElement('div');

    box.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="font-weight:950;">恐竜を追加</div>

        <div class="pKey">名前</div>
        <div class="pVal"><input id="addName" type="text" placeholder="例：TEKギガノト" autocomplete="off"></div>

        <div class="pKey">デフォルト種類</div>
        <div class="pVal">
          <select id="addType">
            ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">追加</button>
        </div>
      </div>
    `;

    openEditModal('追加 / 編集', box);

    box.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') {
        closeEditModal();
        return;
      }

      if (act === 'save') {
        const name = ($('#addName', box)?.value || '').trim();
        const defType = ($('#addType', box)?.value || '受精卵');

        if (!name) return;

        // ✅ custom恐竜は「永続ID」で保存（コード書き換えでも消えない）
        const id = stableId('c', name);

        // 既に同名（同ID）があれば更新扱い
        const idx = custom.dino.findIndex(x => x.id === id);
        if (idx >= 0) custom.dino[idx] = { id, name, defType };
        else custom.dino.push({ id, name, defType });

        saveJSON(LS.DINO_CUSTOM, custom.dino);

        // 表示用データに反映
        const exists = dinos.findIndex(d => d.id === id);
        if (exists >= 0) dinos[exists] = { id, name, defType, kind: 'dino' };
        else dinos.push({ id, name, defType, kind: 'dino' });

        // orderに追加（末尾）
        const ord = (order.dino || []).slice();
        if (!ord.includes(id)) ord.push(id);
        order.dino = ord;
        saveJSON(LS.DINO_ORDER, ord);

        closeEditModal();
        renderList();
        closeModal();
      }
    });
  }

  /* ========= Images tab ========= */
  function renderManageImages() {
    const wrap = document.createElement('div');
    const list = sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino');

    list.forEach(d => {
      const row = document.createElement('div');
      row.className = 'imgRow';

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const url = dinoImages[d.id];
      if (url) thumb.innerHTML = `<img src="${url}" alt="">`;
      else thumb.textContent = 'No Image';

      const mid = document.createElement('div');
      mid.className = 'imgMid';

      const name = document.createElement('div');
      name.className = 'imgName';
      name.textContent = d.name;

      const btns = document.createElement('div');
      btns.className = 'imgBtns';

      const pick = document.createElement('button');
      pick.className = 'pill';
      pick.type = 'button';
      pick.textContent = '選択';

      const del = document.createElement('button');
      del.className = 'pill danger';
      del.type = 'button';
      del.textContent = '削除';

      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.style.display = 'none';

      pick.addEventListener('click', () => file.click());

      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        const dataUrl = await fileToDataURL(f);

        // ✅ 画像は localStorage に永続化（リロードで消えない）
        dinoImages[d.id] = dataUrl;
        saveJSON(LS.DINO_IMAGES, dinoImages);

        thumb.innerHTML = `<img src="${dataUrl}" alt="">`;
      });

      del.addEventListener('click', async () => {
        const ok = await confirmAsk('画像を削除しますか？');
        if (!ok) return;

        delete dinoImages[d.id];
        saveJSON(LS.DINO_IMAGES, dinoImages);
        thumb.textContent = 'No Image';
      });

      // ✅ サムネタップで拡大（あなたの imgOverlay を使用）
      thumb.addEventListener('click', () => {
        const u = dinoImages[d.id];
        if (!u) return;
        openImgViewer(u);
      });

      btns.appendChild(pick);
      btns.appendChild(del);

      mid.appendChild(name);
      mid.appendChild(btns);

      row.appendChild(thumb);
      row.appendChild(mid);
      row.appendChild(file);

      wrap.appendChild(row);
    });

    return wrap;
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function openImgViewer(url) {
    if (!el.imgOverlay || !el.imgViewerImg) return;
    el.imgViewerImg.src = url;
    el.imgOverlay.classList.remove('isHidden');
  }
  function closeImgViewer() {
    if (!el.imgOverlay) return;
    el.imgOverlay.classList.add('isHidden');
    if (el.imgViewerImg) el.imgViewerImg.src = '';
  }
  el.imgClose?.addEventListener('click', closeImgViewer);
  el.imgOverlay?.addEventListener('click', (e) => {
    if (e.target === el.imgOverlay) closeImgViewer();
  });

  /* ========= events ========= */
  el.tabDinos?.addEventListener('click', () => setTab('dino'));
  el.tabItems?.addEventListener('click', () => setTab('item'));

  el.q?.addEventListener('input', applyCollapseAndSearch);
  el.qClear?.addEventListener('click', () => { el.q.value = ''; applyCollapseAndSearch(); });

  const savedDelivery = localStorage.getItem(LS.DELIVERY);
  if (savedDelivery && el.delivery) el.delivery.value = savedDelivery;

  el.delivery?.addEventListener('change', () => {
    localStorage.setItem(LS.DELIVERY, el.delivery.value);
    rebuildOutput();
  });

  el.copy?.addEventListener('click', async () => {
    const text = el.out.value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const prev = el.copy.textContent;
      el.copy.textContent = 'コピー済み✓';
      el.copy.disabled = true;
      setTimeout(() => { el.copy.textContent = prev; el.copy.disabled = false; }, 1100);
    } catch {
      el.out.focus();
      el.out.select();
      document.execCommand('copy');
    }
  });

  el.openManage?.addEventListener('click', openModal);
  el.closeManage?.addEventListener('click', closeModal);
  el.modalOverlay?.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closeModal();
  });

  el.mTabCatalog?.addEventListener('click', () => setManageTab('catalog'));
  el.mTabPrices?.addEventListener('click', () => setManageTab('prices'));
  $('#mTabImages')?.addEventListener('click', () => setManageTab('images'));

  el.confirmOverlay?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') confirmClose(false);
  });
  el.editOverlay?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditModal();
  });
  el.modalOverlay?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImgViewer();
  });

  /* ========= init ========= */
  async function init() {
    const dText = await fetchTextSafe('./dinos.txt');
    const iText = await fetchTextSafe('./items.txt');

    const baseD = dText.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
    const baseI = iText.split(/\r?\n/).map(parseItemLine).filter(Boolean);

    // ✅ customはローカル保存（コード書き換えでも消えない）
    dinos = baseD.concat(custom.dino.map(x => ({ id: x.id, name: x.name, defType: x.defType, kind: 'dino' })));
    items = baseI.concat(custom.item.map(x => ({ id: x.id, name: x.name, unit: x.unit, price: x.price, kind: 'item' })));

    // ✅ orderは常に不足分を補完（追加分や新規恐竜も反映）
    ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');

    // 初期タブ
    setTab('dino');
  }

  init();
})();