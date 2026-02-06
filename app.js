(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
  const toHira = (s) =>
    (s || '').replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
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

  const loadJSON = (k, fb) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fb;
    } catch {
      return fb;
    }
  };
  const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ========= prices ========= */
  const defaultPrices = {
    '受精卵': 30,
    '受精卵(指定)': 50,
    '胚': 50,
    '胚(指定)': 100,
    '幼体': 100,
    '成体': 500,
    'クローン': 500,
    'クローン(指定)': 300,
  };
  const prices = Object.assign({}, defaultPrices, loadJSON(LS.PRICES, {}));
  const typeList = Object.keys(defaultPrices);
  const specifiedMap = { '受精卵': '受精卵(指定)', '胚': '胚(指定)', 'クローン': 'クローン(指定)' };

  /* ========= DOM ========= */
  const el = {
    q: $('#q'),
    qClear: $('#qClear'),
    delivery: $('#delivery'),
    copy: $('#copy'),
    total: $('#total'),
    out: $('#out'),
    list: $('#list'),

    tabDinos: $('#tabDinos'),
    tabItems: $('#tabItems'),

    openManage: $('#openManage'),
    modalOverlay: $('#modalOverlay'),
    closeManage: $('#closeManage'),
    modalBody: $('#modalBody'),
    mTabCatalog: $('#mTabCatalog'),
    mTabPrices: $('#mTabPrices'),

    confirmOverlay: $('#confirmOverlay'),
    confirmText: $('#confirmText'),
    confirmCancel: $('#confirmCancel'),
    confirmOk: $('#confirmOk'),

    editOverlay: $('#editOverlay'),
    editTitle: $('#editTitle'),
    editClose: $('#editClose'),
    editBody: $('#editBody'),
  };

  /* ========= reset helper ========= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
    location.replace(location.pathname);
    return;
  }

  /* ========= state ========= */
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
  let activeTab = 'dino'; // 'dino' | 'item'
  let manageTab = 'catalog'; // 'catalog' | 'prices'

  // inputState: key -> {type,m,f} or {qty}
  const inputState = new Map();
  // duplicated cards are ephemeral (reset on reload)
  const ephemeralKeys = new Set();

  /* ========= fetch & parse ========= */
  async function fetchTextSafe(path) {
    try {
      const r = await fetch(path + '?ts=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return '';
      return await r.text();
    } catch {
      return '';
    }
  }

  function parseDinoLine(line) {
    line = (line || '').trim();
    if (!line || line.startsWith('#')) return null;
    line = line.replace(/^・/, '').trim();
    if (!line) return null;
    const [nameRaw, defRaw] = line.split('|').map((s) => (s || '').trim());
    if (!nameRaw) return null;
    const defType = defRaw && prices[defRaw] != null ? defRaw : '受精卵';
    return { id: 'd_' + uid(), name: nameRaw, defType, kind: 'dino' };
  }

  function parseItemLine(line) {
    line = (line || '').trim();
    if (!line || line.startsWith('#')) return null;
    const parts = line.split('|').map((s) => (s || '').trim());
    if (parts.length < 3) return null;
    const name = parts[0];
    const unit = Number(parts[1]);
    const price = Number(parts[2]);
    if (!name || !Number.isFinite(unit) || !Number.isFinite(price)) return null;
    return { id: 'i_' + uid(), name, unit, price, kind: 'item' };
  }

  /* ========= ordering ========= */
  function ensureOrderList(list, kind) {
    const ids = list.map((x) => x.id);
    const ord = (order[kind] || []).filter((id) => ids.includes(id));
    ids.forEach((id) => {
      if (!ord.includes(id)) ord.push(id);
    });
    order[kind] = ord;
    saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
  }

  function sortByOrder(list, kind) {
    const ord = order[kind] || [];
    const idx = new Map(ord.map((id, i) => [id, i]));
    return list
      .slice()
      .sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9) || a.name.localeCompare(b.name, 'ja'));
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

  // ♀入力OK、両方>0なら(指定)へ。両方0なら(指定)解除。
  function autoSpecify(s) {
    const m = Number(s.m || 0);
    const f = Number(s.f || 0);
    const base = String(s.type || '受精卵').replace('(指定)', '');
    const hasSpecified = /\(指定\)$/.test(String(s.type || ''));
    if (m > 0 && f > 0) {
      s.type = specifiedMap[base] || base + '(指定)';
      return;
    }
    if (m === 0 && f === 0 && hasSpecified) s.type = base;
  }

  /* ========= output ========= */
  function rebuildOutput() {
    const lines = [];
    let sum = 0;
    let idx = 1;

    // dinos first
    const dList = sortByOrder(dinos.filter((d) => !hidden.dino.has(d.id)), 'dino');
    for (const d of dList) {
      const baseKey = d.id;
      const keys = [baseKey, ...Array.from(ephemeralKeys).filter((k) => k.startsWith(baseKey + '__dup_'))];

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
        const isPair =
          /\(指定\)$/.test(type) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(type);

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
    const iList = sortByOrder(items.filter((it) => !hidden.item.has(it.id)), 'item');
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
    el.out.value = `この度はご検討いただきありがとうございます！
ご希望内容は以下となります👇🏻

${lines.join('\n')}
ーーーーーーーーーーーーーーー
計：${sum.toLocaleString('ja-JP')}円
最短納品目安 : ${el.delivery.value}

ご希望内容、金額をご確認の上購入の方よろしくお願いします🙏🏻

また、追加や変更などありましたら、お気軽にお申し付けください👍🏻`;
  }

  /* ========= search & collapse ========= */
  function applyCollapseAndSearch() {
    const q = norm(el.q.value);
    $$('[data-card="1"]', el.list).forEach((card) => {
      const name = card.dataset.name || '';
      const show = !q || norm(name).includes(q);
      card.style.display = show ? '' : 'none';

      const key = card.dataset.key;
      let qty = 0;

      if (card.dataset.kind === 'dino') {
        const s = inputState.get(key);
        qty = s ? Number(s.m || 0) + Number(s.f || 0) : 0;
      } else {
        const s = inputState.get(key);
        qty = s ? Number(s.qty || 0) : 0;
      }

      // 検索中: ヒット以外は畳む / 通常: qty==0なら畳む
      const collapsed = q ? !show : qty === 0;
      card.classList.toggle('isCollapsed', collapsed);
    });
  }

  /* ========= card builders ========= */
  function buildStepperBox({ kind, onMinus, onPlus, getValue, className = '' }) {
    // kind: 'm'|'f'|'item'
    const box = document.createElement('div');
    box.className = `stepper ${className}`.trim();
    box.innerHTML = `
      <button class="btn" type="button" data-act="${kind}-">−</button>
      <div class="val" data-val="${kind}">${getValue()}</div>
      <button class="btn" type="button" data-act="${kind}+">＋</button>
    `;
    return box;
  }

  function buildDinoCard(d, { isDup = false } = {}) {
    const key = d.id;
    const s = ensureDinoState(key, d.defType);

    const wrap = document.createElement('div');
    wrap.className = 'cardWrap';

    const card = document.createElement('div');
    card.className = 'card isCollapsed'; // ✅ 最初は折りたたみ
    card.dataset.card = '1';
    card.dataset.key = key;
    card.dataset.name = d.name;
    card.dataset.kind = 'dino';

    card.innerHTML = `
      <div class="cardHead">
        <div class="name"></div>
        <div class="right">
          <select class="type"></select>
          <div class="unit"></div>
        </div>
      </div>

      <div class="controls">
      <div class="grid2 dinoRow">
        <div class="js-mBox"></div>
        <div class="js-fBox"></div>
        <button class="mini js-dupBtn" type="button" data-act="dup">複製</button>
      </div>
    `;

    $('.name', card).textContent = d.name;

    const sel = $('.type', card);
    sel.innerHTML = typeList.map((t) => `<option value="${t}">${t}</option>`).join('');
    sel.value = s.type;

    const unit = $('.unit', card);
    unit.textContent = `単価${prices[s.type] || 0}円`;

    // steppers (横並び)
    const mBoxMount = $('.js-mBox', card);
    const fBoxMount = $('.js-fBox', card);

const mBox = buildStepperBox({
  kind: 'm',
  getValue: () => String(s.m || 0),
  className: 'sexBox male',
});
const fBox = buildStepperBox({
  kind: 'f',
  getValue: () => String(s.f || 0),
  className: 'sexBox female',
});

    mBoxMount.appendChild(mBox);
    fBoxMount.appendChild(fBox);

    function sync() {
      autoSpecify(s);
      sel.value = s.type;
      unit.textContent = `単価${prices[s.type] || 0}円`;
      $('[data-val="m"]', card).textContent = String(s.m || 0);
      $('[data-val="f"]', card).textContent = String(s.f || 0);
    }

    sel.addEventListener('change', () => {
      s.type = sel.value;
      sync();
      rebuildOutput();
      applyCollapseAndSearch();
    });

    function step(sex, delta) {
      if (sex === 'm') s.m = Math.max(0, Number(s.m || 0) + delta);
      if (sex === 'f') s.f = Math.max(0, Number(s.f || 0) + delta);
      sync();
      rebuildOutput();
      applyCollapseAndSearch();
    }

    // ✅ クリック判定を広げる（枠タップで折りたたみ/展開）
    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;

      if (!act) {
        // 操作部品は無視（誤爆防止）
        if (e.target.closest('button, select, input, textarea, a, label')) return;
        card.classList.toggle('isCollapsed');
        return;
      }

      if (act === 'm-') step('m', -1);
      if (act === 'm+') step('m', +1);
      if (act === 'f-') step('f', -1);
      if (act === 'f+') step('f', +1);

      if (act === 'dup') {
        const baseId = d.baseId || d.id; // baseIdを持ってたらそれをベースに
        const dupKey = `${baseId}__dup_${uid()}`;
        ephemeralKeys.add(dupKey);
        inputState.set(dupKey, { type: s.type, m: 0, f: 0 });

        const dup = { ...d, id: dupKey, baseId, name: d.name, defType: d.defType };
        const dupWrap = buildDinoCard(dup, { isDup: true });
        wrap.after(dupWrap);

        rebuildOutput();
        applyCollapseAndSearch();
      }
    });

    // dup card identification
    if (!d.baseId) d.baseId = d.id;

    wrap.appendChild(card);
    return wrap;
  }

  function buildItemCard(it) {
    const s = ensureItemState(it.id);

    const wrap = document.createElement('div');
    wrap.className = 'cardWrap';

    const card = document.createElement('div');
    card.className = 'card isCollapsed'; // ✅ 最初は折りたたみ
    card.dataset.card = '1';
    card.dataset.key = it.id;
    card.dataset.name = it.name;
    card.dataset.kind = 'item';

    card.innerHTML = `
      <div class="cardHead">
        <div class="name"></div>
        <div class="right">
          <div class="unit"></div>
        </div>
      </div>

      <div class="controls">
        <div class="stepper">
          <button class="btn" type="button" data-act="i-">−</button>
          <div class="val" data-val="i">${String(s.qty || 0)}</div>
          <button class="btn" type="button" data-act="i+">＋</button>
        </div>
      </div>
    `;

    $('.name', card).textContent = it.name;
    $('.unit', card).textContent = `単価${it.price}円`;

    function sync() {
      $('[data-val="i"]', card).textContent = String(s.qty || 0);
    }

    // ✅ クリック判定を広げる（枠タップで折りたたみ/展開）
    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;

      if (!act) {
        if (e.target.closest('button, select, input, textarea, a, label')) return;
        card.classList.toggle('isCollapsed');
        return;
      }

      if (act === 'i-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
      if (act === 'i+') s.qty = Math.max(0, Number(s.qty || 0) + 1);

      sync();
      rebuildOutput();
      applyCollapseAndSearch();
    });

    wrap.appendChild(card);
    return wrap;
  }

  /* ========= render ========= */
  function renderList() {
    el.list.innerHTML = '';

    if (activeTab === 'dino') {
      const dList = sortByOrder(dinos.filter((d) => !hidden.dino.has(d.id)), 'dino');
      dList.forEach((d) => el.list.appendChild(buildDinoCard(d)));
    } else {
      const iList = sortByOrder(items.filter((i) => !hidden.item.has(i.id)), 'item');
      iList.forEach((it) => el.list.appendChild(buildItemCard(it)));
    }

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
    renderList();
  }

  el.tabDinos.addEventListener('click', () => setTab('dino'));
  el.tabItems.addEventListener('click', () => setTab('item'));

  /* ========= search ========= */
  el.q.addEventListener('input', applyCollapseAndSearch);
  el.qClear.addEventListener('click', () => {
    el.q.value = '';
    applyCollapseAndSearch();
  });

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
      setTimeout(() => {
        el.copy.textContent = prev;
        el.copy.disabled = false;
      }, 1100);
    } catch {
      el.out.focus();
      el.out.select();
      document.execCommand('copy');
    }
  });

  /* ========= modal / overlays ========= */
  function lockBodyScroll(on) {
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

  function showOverlay(overlayEl) {
    overlayEl.classList.remove('isHidden');
    overlayEl.setAttribute('aria-hidden', 'false');
    lockBodyScroll(true);
  }
  function hideOverlay(overlayEl) {
    overlayEl.classList.add('isHidden');
    overlayEl.setAttribute('aria-hidden', 'true');
    lockBodyScroll(false);
  }

  // close when clicking backdrop
  el.modalOverlay.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) hideOverlay(el.modalOverlay);
  });
  el.confirmOverlay.addEventListener('click', (e) => {
    if (e.target === el.confirmOverlay) hideOverlay(el.confirmOverlay);
  });
  el.editOverlay.addEventListener('click', (e) => {
    if (e.target === el.editOverlay) hideOverlay(el.editOverlay);
  });

  el.closeManage.addEventListener('click', () => hideOverlay(el.modalOverlay));
  el.editClose.addEventListener('click', () => hideOverlay(el.editOverlay));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.editOverlay.classList.contains('isHidden')) hideOverlay(el.editOverlay);
    else if (!el.confirmOverlay.classList.contains('isHidden')) hideOverlay(el.confirmOverlay);
    else if (!el.modalOverlay.classList.contains('isHidden')) hideOverlay(el.modalOverlay);
  });

  /* ========= confirm ========= */
  let confirmResolve = null;
  function confirmDialog(message = '削除しますか？', okText = '削除', cancelText = 'キャンセル') {
    el.confirmText.textContent = message;
    el.confirmOk.textContent = okText;
    el.confirmCancel.textContent = cancelText;
    showOverlay(el.confirmOverlay);
    return new Promise((resolve) => {
      confirmResolve = resolve;
    });
  }
  el.confirmCancel.addEventListener('click', () => {
    hideOverlay(el.confirmOverlay);
    if (confirmResolve) confirmResolve(false);
    confirmResolve = null;
  });
  el.confirmOk.addEventListener('click', () => {
    hideOverlay(el.confirmOverlay);
    if (confirmResolve) confirmResolve(true);
    confirmResolve = null;
  });

  /* ========= manage UI builders ========= */
  function setManageTab(tab) {
    manageTab = tab;
    el.mTabCatalog.classList.toggle('isActive', tab === 'catalog');
    el.mTabPrices.classList.toggle('isActive', tab === 'prices');
    renderManageBody();
  }
  el.mTabCatalog.addEventListener('click', () => setManageTab('catalog'));
  el.mTabPrices.addEventListener('click', () => setManageTab('prices'));

  function renderManageBody() {
    el.modalBody.innerHTML = '';

    if (manageTab === 'prices') {
      const box = document.createElement('div');
      box.className = 'card';
      box.innerHTML = `<div class="name" style="font-size:16px;margin-bottom:10px;">価格設定</div>`;

      const grid = document.createElement('div');
      grid.className = 'priceGrid';

      typeList.forEach((t) => {
        const row = document.createElement('div');
        row.className = 'pRow';
        row.innerHTML = `
          <div class="pKey">${t}</div>
          <div class="pVal"><input type="number" inputmode="numeric" value="${Number(prices[t] || 0)}" data-type="${t}"></div>
        `;
        grid.appendChild(row);
      });

      const actions = document.createElement('div');
      actions.className = 'formBtns';
      actions.innerHTML = `<button class="primary" type="button" data-act="savePrices">保存</button>`;

      box.appendChild(grid);
      box.appendChild(actions);

      box.addEventListener('click', (e) => {
        if (e.target?.dataset?.act !== 'savePrices') return;
        $$('input[data-type]', box).forEach((inp) => {
          const t = inp.dataset.type;
          prices[t] = Number(inp.value || 0);
        });
        saveJSON(LS.PRICES, prices);
        rebuildOutput();
        renderList();
        hideOverlay(el.modalOverlay);
      });

      el.modalBody.appendChild(box);
      return;
    }

    // catalog (current activeTab)
    const kind = activeTab; // 'dino' | 'item'
    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = `<div class="name" style="font-size:16px;margin-bottom:10px;">${kind === 'dino' ? '恐竜' : 'アイテム'} 管理</div>`;

    // top action buttons
    const bar = document.createElement('div');
    bar.className = 'mBar';
    bar.innerHTML = `
      <button class="primary" type="button" data-act="add">追加</button>
      <button class="primary" type="button" data-act="sortKana">50音並び替え</button>
    `;
    box.appendChild(bar);

    const rows = document.createElement('div');

    const currentList =
      kind === 'dino'
        ? sortByOrder(dinos.filter((x) => !hidden.dino.has(x.id)), 'dino')
        : sortByOrder(items.filter((x) => !hidden.item.has(x.id)), 'item');

    currentList.forEach((obj) => {
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

    box.appendChild(rows);

    box.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'sortKana') {
        const list = kind === 'dino' ? dinos : items;
        const hset = kind === 'dino' ? hidden.dino : hidden.item;
        const visible = list.filter((x) => !hset.has(x.id));
        visible.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        order[kind] = visible.map((x) => x.id);
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, order[kind]);
        renderManageBody();
        renderList();
        return;
      }

      if (act === 'up' || act === 'down') {
        const id = e.target.dataset.id;
        const ord = (order[kind] || []).slice();
        const i = ord.indexOf(id);
        if (i === -1) return;
        const ni = act === 'up' ? i - 1 : i + 1;
        if (ni < 0 || ni >= ord.length) return;
        [ord[i], ord[ni]] = [ord[ni], ord[i]];
        order[kind] = ord;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
        renderManageBody();
        renderList();
        return;
      }

      if (act === 'del') {
        const id = e.target.dataset.id;
        const list = kind === 'dino' ? dinos : items;
        const obj = list.find((x) => x.id === id);
        const ok = await confirmDialog(`「${obj?.name || ''}」を削除しますか？`);
        if (!ok) return;

        (kind === 'dino' ? hidden.dino : hidden.item).add(id);
        saveJSON(kind === 'dino' ? LS.DINO_HIDDEN : LS.ITEM_HIDDEN, Array.from(kind === 'dino' ? hidden.dino : hidden.item));

        // 入力も消す（見えないのに残るとややこしい）
        inputState.delete(id);

        renderManageBody();
        renderList();
        return;
      }

      if (act === 'edit') {
        const id = e.target.dataset.id;
        const list = kind === 'dino' ? dinos : items;
        const obj = list.find((x) => x.id === id);
        if (!obj) return;
        openEdit(kind, obj);
        return;
      }

      if (act === 'add') {
        openAdd(kind);
        return;
      }
    });

    el.modalBody.appendChild(box);
  }

  /* ========= edit/add modal ========= */
  function openAdd(kind) {
    el.editBody.innerHTML = '';
    el.editTitle.textContent = kind === 'dino' ? '恐竜を追加' : 'アイテムを追加';

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
          <select id="aDef">${typeList.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="formBtns">
          <button class="primary" type="button" data-act="save">追加</button>
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
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
          <button class="primary" type="button" data-act="save">追加</button>
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
        </div>
      `;
    }

    form.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      if (act === 'cancel') {
        hideOverlay(el.editOverlay);
        return;
      }
      if (act !== 'save') return;

      const name = ($('#aName', form)?.value || '').trim();
      if (!name) return;

      if (kind === 'dino') {
        const defType = $('#aDef', form).value || '受精卵';
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
      hideOverlay(el.editOverlay);
      if (!el.modalOverlay.classList.contains('isHidden')) renderManageBody();
    });

    el.editBody.appendChild(form);
    showOverlay(el.editOverlay);
  }

  function openEdit(kind, obj) {
    el.editBody.innerHTML = '';
    el.editTitle.textContent = '編集';

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
          <select id="eDef">${typeList.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="formBtns">
          <button class="primary" type="button" data-act="save">保存</button>
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
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
          <input id="eUnit" type="number" inputmode="numeric" value="${Number(obj.unit || 1)}">
        </div>
        <div class="field">
          <label>単価</label>
          <input id="ePrice" type="number" inputmode="numeric" value="${Number(obj.price || 0)}">
        </div>
        <div class="formBtns">
          <button class="primary" type="button" data-act="save">保存</button>
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
        </div>
      `;
    }

    form.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (act === 'cancel') {
        hideOverlay(el.editOverlay);
        return;
      }
      if (act !== 'save') return;

      const newName = ($('#eName', form)?.value || '').trim();
      if (!newName) return;

      obj.name = newName;

      if (kind === 'dino') obj.defType = $('#eDef', form).value || '受精卵';
      else {
        obj.unit = Number($('#eUnit', form).value || 1);
        obj.price = Number($('#ePrice', form).value || 0);
      }

      // persist custom edits only for custom entries OR edited base entries (store override)
      if (kind === 'dino') {
        const c = custom.dino.find((x) => x.id === obj.id);
        if (c) {
          c.name = obj.name;
          c.defType = obj.defType;
        } else {
          custom.dino.push({ id: obj.id, name: obj.name, defType: obj.defType });
        }
        saveJSON(LS.DINO_CUSTOM, custom.dino);
      } else {
        const c = custom.item.find((x) => x.id === obj.id);
        if (c) {
          c.name = obj.name;
          c.unit = obj.unit;
          c.price = obj.price;
        } else {
          custom.item.push({ id: obj.id, name: obj.name, unit: obj.unit, price: obj.price });
        }
        saveJSON(LS.ITEM_CUSTOM, custom.item);
      }

      renderList();
      if (!el.modalOverlay.classList.contains('isHidden')) renderManageBody();
      hideOverlay(el.editOverlay);
    });

    el.editBody.appendChild(form);
    showOverlay(el.editOverlay);
  }

  /* ========= manage open ========= */
  function openManage() {
    showOverlay(el.modalOverlay);
    renderManageBody();
  }
  el.openManage.addEventListener('click', openManage);

  /* ========= init ========= */
  async function init() {
    const dText = await fetchTextSafe('./dinos.txt');
    const iText = await fetchTextSafe('./items.txt');

    const baseD = dText.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
    const baseI = iText.split(/\r?\n/).map(parseItemLine).filter(Boolean);

    // merge base + custom (custom includes overrides too)
    const customD = custom.dino.map((x) => ({ id: x.id, name: x.name, defType: x.defType, kind: 'dino' }));
    const customI = custom.item.map((x) => ({ id: x.id, name: x.name, unit: x.unit, price: x.price, kind: 'item' }));

    // base entries may be overridden by custom with same id (rare, but allow)
    const dMap = new Map();
    baseD.forEach((d) => dMap.set(d.id, d));
    customD.forEach((d) => dMap.set(d.id, d));
    dinos = Array.from(dMap.values());

    const iMap = new Map();
    baseI.forEach((i) => iMap.set(i.id, i));
    customI.forEach((i) => iMap.set(i.id, i));
    items = Array.from(iMap.values());

    ensureOrderList(dinos.filter((d) => !hidden.dino.has(d.id)), 'dino');
    ensureOrderList(items.filter((i) => !hidden.item.has(i.id)), 'item');

    const sd = localStorage.getItem(LS.DELIVERY);
    if (sd) el.delivery.value = sd;

    renderList();
  }

  /* ========= boot ========= */
  el.tabDinos.classList.add('isActive');
  el.tabItems.classList.remove('isActive');
  setManageTab('catalog');

  // ---- layout patch: dino stepper row (♂ / ♀ / 複製) ----
  const __patchStyle = document.createElement('style');
  __patchStyle.textContent = `
    .dinoRow{
      display:grid;
      grid-template-columns: 1fr 1fr 76px;
      gap:10px;
      align-items:center;
    }
    .dinoRow .js-dupBtn{
      width:76px;
      height:32px;
      justify-self:end;
      white-space:nowrap;
    }
  `;
  document.head.appendChild(__patchStyle);

  init();
})();