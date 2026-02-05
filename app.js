(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
  const toHira = (s) => (s || '').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const norm = (s) => toHira(String(s || '').toLowerCase()).replace(/\s+/g, '');

  /* ========= storage ========= */
  const LS = {
    DINO_CUSTOM: 'dino_custom_v1',
    ITEM_CUSTOM: 'item_custom_v1',
    DINO_HIDDEN: 'dino_hidden_v1',
    ITEM_HIDDEN: 'item_hidden_v1',
    DINO_ORDER: 'dino_order_v1',
    ITEM_ORDER: 'item_order_v1',
    PRICES: 'prices_v1',
    DELIVERY: 'delivery_v1',
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

  /* ========= DOM (index.html と一致させる) ========= */
  const el = {
    q: $('#q'),
    qClear: $('#qClear'),
    delivery: $('#delivery'),
    copy: $('#copy'),
    total: $('#total'),
    out: $('#out'),

    openManage: $('#openManage'),

    tabDinos: $('#tabDinos'),
    tabItems: $('#tabItems'),

    listRoot: $('#list'),

    // manage modal
    modalOverlay: $('#modalOverlay'),
    modalBody: $('#modalBody'),
    closeManage: $('#closeManage'),
    mTabCatalog: $('#mTabCatalog'),
    mTabPrices: $('#mTabPrices'),

    // confirm modal
    confirmOverlay: $('#confirmOverlay'),
    confirmText: $('#confirmText'),
    confirmCancel: $('#confirmCancel'),
    confirmOk: $('#confirmOk'),

    // edit modal
    editOverlay: $('#editOverlay'),
    editTitle: $('#editTitle'),
    editBody: $('#editBody'),
    editClose: $('#editClose'),
  };

  // 必須DOMが取れないなら何もせず落ちないように
  const must = ['q','qClear','delivery','copy','total','out','openManage','tabDinos','tabItems','listRoot','modalOverlay','modalBody','closeManage'];
  for (const k of must) {
    if (!el[k]) {
      console.warn('[app] missing element:', k);
      return;
    }
  }

  /* ========= reset helper ========= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    location.replace(location.pathname);
    return;
  }

  /* ========= scroll lock ========= */
  function lockScroll(on) {
    if (on) {
      const y = window.scrollY || 0;
      document.body.dataset.lockY = String(y);
      document.body.style.position = 'fixed';
      document.body.style.top = `-${y}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    } else {
      const y = Number(document.body.dataset.lockY || '0');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      delete document.body.dataset.lockY;
      window.scrollTo(0, y);
    }
  }

  /* ========= modal helpers ========= */
  function showOverlay(overlayEl) {
    overlayEl.classList.remove('isHidden');
    overlayEl.setAttribute('aria-hidden', 'false');
    lockScroll(true);
  }
  function hideOverlay(overlayEl) {
    overlayEl.classList.add('isHidden');
    overlayEl.setAttribute('aria-hidden', 'true');
    lockScroll(false);
  }

  function openManageModal() { showOverlay(el.modalOverlay); }
  function closeManageModal() {
    hideOverlay(el.modalOverlay);
    el.modalBody.innerHTML = '';
    // タブ状態は一覧に戻す
    el.mTabCatalog.classList.add('isActive');
    el.mTabPrices.classList.remove('isActive');
  }

  function openEditModal(title, node) {
    el.editTitle.textContent = title || '編集';
    el.editBody.innerHTML = '';
    if (node) el.editBody.appendChild(node);
    showOverlay(el.editOverlay);
  }
  function closeEditModal() {
    hideOverlay(el.editOverlay);
    el.editBody.innerHTML = '';
  }

  function confirmDialog(message, okText = '削除') {
    return new Promise((resolve) => {
      el.confirmText.textContent = message || '実行しますか？';
      el.confirmOk.textContent = okText;

      const onCancel = () => {
        cleanup();
        resolve(false);
      };
      const onOk = () => {
        cleanup();
        resolve(true);
      };
      function cleanup() {
        el.confirmCancel.removeEventListener('click', onCancel);
        el.confirmOk.removeEventListener('click', onOk);
        hideOverlay(el.confirmOverlay);
      }

      el.confirmCancel.addEventListener('click', onCancel);
      el.confirmOk.addEventListener('click', onOk);
      showOverlay(el.confirmOverlay);
    });
  }

  // overlay click to close (背景クリックでは閉じない：誤操作防止)
  el.closeManage.addEventListener('click', closeManageModal);
  el.editClose.addEventListener('click', closeEditModal);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.confirmOverlay.classList.contains('isHidden')) hideOverlay(el.confirmOverlay);
    else if (!el.editOverlay.classList.contains('isHidden')) closeEditModal();
    else if (!el.modalOverlay.classList.contains('isHidden')) closeManageModal();
  });

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
  // duplicated cards are ephemeral (リロードで消える)
  const ephemeralKeys = new Set();

  /* ========= list containers ========= */
  const listDino = document.createElement('div');
  const listItem = document.createElement('div');
  listDino.id = 'listDino';
  listItem.id = 'listItem';
  el.listRoot.appendChild(listDino);
  el.listRoot.appendChild(listItem);

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
    return { id: 'd_' + uid(), name: nameRaw, defType, kind: 'dino' };
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
    return { id: 'i_' + uid(), name, unit, price, kind: 'item' };
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

  /* ========= state ========= */
  function ensureDinoState(key, defType) {
    if (!inputState.has(key)) inputState.set(key, { type: defType || '受精卵', m: 0, f: 0 });
    return inputState.get(key);
  }
  function ensureItemState(key) {
    if (!inputState.has(key)) inputState.set(key, { qty: 0 });
    return inputState.get(key);
  }

  // ♀入力OK、両方>0なら(指定)へ。両方0なら(指定)解除。
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

    // dinos first
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

    // items next
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
  function applyCollapseAndSearch() {
    const q = norm(el.q.value);

    const root = (activeTab === 'dino') ? listDino : listItem;

    $$('[data-card="1"]', root).forEach(card => {
      const name = card.dataset.name || '';
      const show = !q || norm(name).includes(q);
      card.style.display = show ? '' : 'none';

      const key = card.dataset.key;
      let qty = 0;

      if (activeTab === 'dino') {
        const s = inputState.get(key);
        qty = s ? (Number(s.m || 0) + Number(s.f || 0)) : 0;
      } else {
        const s = inputState.get(key);
        qty = s ? Number(s.qty || 0) : 0;
      }

      // 通常: qty==0なら畳む / 検索中: ヒット以外畳む
      const collapsed = q ? !show : (qty === 0);
      card.classList.toggle('isCollapsed', collapsed);
    });
  }

  /* ========= cards (style.css の class に合わせる) ========= */
  function buildDinoCard(d) {
    const key = d.id;
    const s = ensureDinoState(key, d.defType);

    const wrap = document.createElement('div');
    wrap.className = 'cardWrap';
    wrap.dataset.card = '1';
    wrap.dataset.key = key;
    wrap.dataset.name = d.name;

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <div class="cardHead">
        <div class="name"></div>
        <div class="right">
          <select class="type"></select>
          <div class="unit"></div>
        </div>
      </div>

      <div class="controls grid2">
        <div class="stepper">
          <button class="btn" type="button" data-act="m-">−</button>
          <div class="val js-m">0</div>
          <button class="btn" type="button" data-act="m+">＋</button>
          <button class="mini" type="button" data-act="dup">複製</button>
        </div>

        <div class="stepper">
          <button class="btn" type="button" data-act="f-">−</button>
          <div class="val js-f">0</div>
          <button class="btn" type="button" data-act="f+">＋</button>
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

    sel.addEventListener('change', () => {
      s.type = sel.value;
      autoSpecify(s);
      sel.value = s.type;
      unit.textContent = `単価${prices[s.type] || 0}円`;
      rebuildOutput();
      applyCollapseAndSearch();
    });

    function refresh() {
      autoSpecify(s);
      sel.value = s.type;
      unit.textContent = `単価${prices[s.type] || 0}円`;
      mEl.textContent = String(s.m || 0);
      fEl.textContent = String(s.f || 0);
      rebuildOutput();
      applyCollapseAndSearch();
    }

    // iOS/Safariで委譲クリックが不安定になりやすいので「ボタン個別」に付ける
    $$('[data-act]', card).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const act = btn.dataset.act;

        if (act === 'm-') s.m = Math.max(0, Number(s.m || 0) - 1);
        if (act === 'm+') s.m = Math.max(0, Number(s.m || 0) + 1);
        if (act === 'f-') s.f = Math.max(0, Number(s.f || 0) - 1);
        if (act === 'f+') s.f = Math.max(0, Number(s.f || 0) + 1);

        if (act === 'dup') {
          const dupKey = `${key}__dup_${uid()}`;
          ephemeralKeys.add(dupKey);
          inputState.set(dupKey, { type: s.type, m: 0, f: 0 });

          const dup = buildDinoCard({ ...d, id: dupKey });
          wrap.after(dup);
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }

        refresh();
      }, { passive: false });
    });

    wrap.appendChild(card);
    return wrap;
  }

  function buildItemCard(it) {
    const s = ensureItemState(it.id);

    const wrap = document.createElement('div');
    wrap.className = 'cardWrap';
    wrap.dataset.card = '1';
    wrap.dataset.key = it.id;
    wrap.dataset.name = it.name;

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <div class="cardHead">
        <div class="name"></div>
        <div class="right">
          <div class="unit"></div>
        </div>
      </div>

      <div class="controls">
        <div class="stepper">
          <button class="btn" type="button" data-act="-">−</button>
          <div class="val js-q">0</div>
          <button class="btn" type="button" data-act="+">＋</button>
        </div>
      </div>
    `;

    $('.name', card).textContent = it.name;
    $('.unit', card).textContent = `単価${it.price}円`;

    const qEl = $('.js-q', card);
    qEl.textContent = String(s.qty || 0);

    $$('[data-act]', card).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === '-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
        if (act === '+') s.qty = Math.max(0, Number(s.qty || 0) + 1);
        qEl.textContent = String(s.qty || 0);
        rebuildOutput();
        applyCollapseAndSearch();
      }, { passive: false });
    });

    wrap.appendChild(card);
    return wrap;
  }

  /* ========= render ========= */
  function renderAll() {
    listDino.innerHTML = '';
    listItem.innerHTML = '';

    const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    const iList = sortByOrder(items.filter(i => !hidden.item.has(i.id)), 'item');

    dList.forEach(d => listDino.appendChild(buildDinoCard(d)));
    iList.forEach(it => listItem.appendChild(buildItemCard(it)));

    rebuildOutput();
    applyCollapseAndSearch();
  }

  /* ========= tabs ========= */
  function setTab(tab) {
    activeTab = tab;

    el.tabDinos.classList.toggle('isActive', tab === 'dino');
    el.tabItems.classList.toggle('isActive', tab === 'item');

    el.tabDinos.setAttribute('aria-selected', tab === 'dino' ? 'true' : 'false');
    el.tabItems.setAttribute('aria-selected', tab === 'item' ? 'true' : 'false');

    listDino.style.display = tab === 'dino' ? '' : 'none';
    listItem.style.display = tab === 'item' ? '' : 'none';

    applyCollapseAndSearch();
  }
  el.tabDinos.addEventListener('click', () => setTab('dino'));
  el.tabItems.addEventListener('click', () => setTab('item'));

  /* ========= search ========= */
  el.q.addEventListener('input', applyCollapseAndSearch);
  el.qClear.addEventListener('click', () => { el.q.value = ''; applyCollapseAndSearch(); });

  /* ========= delivery ========= */
  const savedDelivery = localStorage.getItem(LS.DELIVERY);
  if (savedDelivery) el.delivery.value = savedDelivery;
  el.delivery.addEventListener('change', () => {
    localStorage.setItem(LS.DELIVERY, el.delivery.value);
    rebuildOutput();
  });

  /* ========= copy ========= */
  el.copy.addEventListener('click', async () => {
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

  /* ========= manage UI ========= */
  function buildPricesPanel() {
    const box = document.createElement('div');

    const grid = document.createElement('div');
    grid.className = 'priceGrid';

    typeList.forEach(t => {
      const key = document.createElement('div');
      key.className = 'pKey';
      key.textContent = t;

      const val = document.createElement('div');
      val.className = 'pVal';
      val.innerHTML = `<input type="number" inputmode="numeric" value="${Number(prices[t] || 0)}" data-type="${t}">`;

      grid.appendChild(key);
      grid.appendChild(val);
    });

    const save = document.createElement('div');
    save.style.marginTop = '12px';
    save.innerHTML = `<button class="primary" type="button" data-act="savePrices">保存</button>`;

    box.appendChild(grid);
    box.appendChild(save);

    box.addEventListener('click', (e) => {
      if (e.target?.dataset?.act !== 'savePrices') return;
      $$('input[data-type]', box).forEach(inp => {
        const t = inp.dataset.type;
        prices[t] = Number(inp.value || 0);
      });
      saveJSON(LS.PRICES, prices);
      renderAll();
      closeManageModal();
    });

    return box;
  }

  function buildCatalogPanel(kind) {
    const box = document.createElement('div');

    // add
    const addBtn = document.createElement('button');
    addBtn.className = 'primary';
    addBtn.type = 'button';
    addBtn.textContent = '追加';
    addBtn.style.marginBottom = '12px';

    addBtn.addEventListener('click', () => openAdd(kind));
    box.appendChild(addBtn);

    // sort
    const kanaBtn = document.createElement('button');
    kanaBtn.className = 'ghost';
    kanaBtn.type = 'button';
    kanaBtn.textContent = '50音並び替え';
    kanaBtn.style.marginBottom = '12px';
    kanaBtn.addEventListener('click', () => {
      const list = kind === 'dino' ? dinos : items;
      const hset = kind === 'dino' ? hidden.dino : hidden.item;
      const visible = list.filter(x => !hset.has(x.id));
      visible.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      order[kind] = visible.map(x => x.id);
      saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, order[kind]);
      renderAll();
      openManage(); // 再描画
    });
    box.appendChild(kanaBtn);

    const rows = document.createElement('div');
    const currentList = (kind === 'dino')
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    currentList.forEach(obj => {
      const r = document.createElement('div');
      r.className = 'mRow';
      r.innerHTML = `
        <div class="mName">${obj.name}</div>
        <div class="mBtns">
          <button class="sBtn" type="button" data-act="up" data-id="${obj.id}">↑</button>
          <button class="sBtn" type="button" data-act="down" data-id="${obj.id}">↓</button>
          <button class="sBtn" type="button" data-act="edit" data-id="${obj.id}">編集</button>
          <button class="sBtn danger" type="button" data-act="del" data-id="${obj.id}">削除</button>
        </div>
      `;
      rows.appendChild(r);
    });

    rows.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      const id = e.target?.dataset?.id;
      if (!act || !id) return;

      if (act === 'up' || act === 'down') {
        const ord = (order[kind] || []).slice();
        const i = ord.indexOf(id);
        if (i === -1) return;
        const ni = act === 'up' ? i - 1 : i + 1;
        if (ni < 0 || ni >= ord.length) return;
        [ord[i], ord[ni]] = [ord[ni], ord[i]];
        order[kind] = ord;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
        renderAll();
        openManage();
        return;
      }

      if (act === 'del') {
        const list = kind === 'dino' ? dinos : items;
        const obj = list.find(x => x.id === id);
        const ok = await confirmDialog(`「${obj?.name || ''}」を削除しますか？`, '削除');
        if (!ok) return;

        (kind === 'dino' ? hidden.dino : hidden.item).add(id);
        saveJSON(kind === 'dino' ? LS.DINO_HIDDEN : LS.ITEM_HIDDEN,
          Array.from(kind === 'dino' ? hidden.dino : hidden.item)
        );

        renderAll();
        openManage();
        return;
      }

      if (act === 'edit') {
        openEdit(kind, id);
        return;
      }
    });

    box.appendChild(rows);
    return box;
  }

  function openAdd(kind) {
    const form = document.createElement('div');
    form.className = 'form';

    if (kind === 'dino') {
      form.innerHTML = `
        <div class="field">
          <label>名前</label>
          <input id="aName" type="text" placeholder="例：カルカロ">
        </div>
        <div class="field">
          <label>デフォルト</label>
          <select id="aDef">${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="formBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="primary" type="button" data-act="save">追加</button>
        </div>
      `;
    } else {
      form.innerHTML = `
        <div class="field">
          <label>名前</label>
          <input id="aName" type="text" placeholder="例：TEK天井">
        </div>
        <div class="field">
          <label>個数単位</label>
          <input id="aUnit" type="number" inputmode="numeric" placeholder="例：100">
        </div>
        <div class="field">
          <label>単価</label>
          <input id="aPrice" type="number" inputmode="numeric" placeholder="例：100">
        </div>
        <div class="formBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="primary" type="button" data-act="save">追加</button>
        </div>
      `;
    }

    form.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') { closeEditModal(); return; }

      if (act === 'save') {
        const name = ($('#aName', form)?.value || '').trim();
        if (!name) return;

        if (kind === 'dino') {
          const defType = $('#aDef', form).value;
          const id = 'd_c_' + uid();
          custom.dino.push({ id, name, defType });
          saveJSON(LS.DINO_CUSTOM, custom.dino);
        } else {
          const unit = Number($('#aUnit', form).value || 1);
          const price = Number($('#aPrice', form).value || 0);
          const id = 'i_c_' + uid();
          custom.item.push({ id, name, unit, price });
          saveJSON(LS.ITEM_CUSTOM, custom.item);
        }

        await init();
        closeEditModal();
        openManage(); // 管理画面再描画
      }
    });

    openEditModal(kind === 'dino' ? '恐竜を追加' : 'アイテムを追加', form);
  }

  function openEdit(kind, id) {
    const list = kind === 'dino' ? dinos : items;
    const obj = list.find(x => x.id === id);
    if (!obj) return;

    const form = document.createElement('div');
    form.className = 'form';

    if (kind === 'dino') {
      form.innerHTML = `
        <div class="field">
          <label>名前</label>
          <input id="eName" type="text" value="${obj.name}">
        </div>
        <div class="field">
          <label>デフォルト</label>
          <select id="eDef">${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="formBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="primary" type="button" data-act="save">保存</button>
        </div>
      `;
      $('#eDef', form).value = obj.defType || '受精卵';
    } else {
      form.innerHTML = `
        <div class="field">
          <label>名前</label>
          <input id="eName" type="text" value="${obj.name}">
        </div>
        <div class="field">
          <label>個数単位</label>
          <input id="eUnit" type="number" inputmode="numeric" value="${obj.unit}">
        </div>
        <div class="field">
          <label>単価</label>
          <input id="ePrice" type="number" inputmode="numeric" value="${obj.price}">
        </div>
        <div class="formBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="primary" type="button" data-act="save">保存</button>
        </div>
      `;
    }

    form.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') { closeEditModal(); return; }

      if (act === 'save') {
        const newName = $('#eName', form).value.trim();
        if (!newName) return;
        obj.name = newName;

        if (kind === 'dino') obj.defType = $('#eDef', form).value;
        else {
          obj.unit = Number($('#eUnit', form).value || 1);
          obj.price = Number($('#ePrice', form).value || 0);
        }

        if (kind === 'dino') {
          const c = custom.dino.find(x => x.id === id);
          if (c) { c.name = obj.name; c.defType = obj.defType; }
          else custom.dino.push({ id, name: obj.name, defType: obj.defType });
          saveJSON(LS.DINO_CUSTOM, custom.dino);
        } else {
          const c = custom.item.find(x => x.id === id);
          if (c) { c.name = obj.name; c.unit = obj.unit; c.price = obj.price; }
          else custom.item.push({ id, name: obj.name, unit: obj.unit, price: obj.price });
          saveJSON(LS.ITEM_CUSTOM, custom.item);
        }

        renderAll();
        closeEditModal();
        openManage();
      }
    });

    openEditModal('編集', form);
  }

  function openManage() {
    el.modalBody.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'mBar';
    // 管理は「現在のタブ」の一覧を出す
    // ただし価格は共通なので tab で切り替え可能
    el.modalBody.appendChild(bar);

    const panel = document.createElement('div');
    el.modalBody.appendChild(panel);

    function setManageTab(which) {
      el.mTabCatalog.classList.toggle('isActive', which === 'catalog');
      el.mTabPrices.classList.toggle('isActive', which === 'prices');

      panel.innerHTML = '';
      if (which === 'prices') panel.appendChild(buildPricesPanel());
      else panel.appendChild(buildCatalogPanel(activeTab));
    }

    el.mTabCatalog.onclick = () => setManageTab('catalog');
    el.mTabPrices.onclick = () => setManageTab('prices');

    setManageTab('catalog');
    openManageModal();
  }

  el.openManage.addEventListener('click', openManage);

  /* ========= init ========= */
  async function init() {
    const dText = await fetchTextSafe('./dinos.txt');
    const iText = await fetchTextSafe('./items.txt');

    const baseD = dText.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
    const baseI = iText.split(/\r?\n/).map(parseItemLine).filter(Boolean);

    dinos = baseD.concat(custom.dino.map(x => ({ id: x.id, name: x.name, defType: x.defType, kind: 'dino' })));
    items = baseI.concat(custom.item.map(x => ({ id: x.id, name: x.name, unit: x.unit, price: x.price, kind: 'item' })));

    ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');

    const savedDelivery2 = localStorage.getItem(LS.DELIVERY);
    if (savedDelivery2) el.delivery.value = savedDelivery2;

    renderAll();
    setTab(activeTab);
  }

  // 初期：管理系オーバーレイが開いたままにならないよう強制的に閉じる
  hideOverlay(el.modalOverlay);
  hideOverlay(el.confirmOverlay);
  hideOverlay(el.editOverlay);

  init();
})();