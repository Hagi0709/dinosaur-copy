(() => {
  'use strict';

  /* =======================
   * Utils
   * ======================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
  const toHira = (s) => (s || '').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const norm = (s) => toHira(String(s || '').toLowerCase()).replace(/\s+/g, '');

  /* =======================
   * Storage keys
   * ======================= */
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

  /* =======================
   * Prices
   * ======================= */
  const defaultPrices = {
    '受精卵': 30, '受精卵(指定)': 50,
    '胚': 50, '胚(指定)': 100,
    '幼体': 100,
    '成体': 500,
    'クローン': 500, 'クローン(指定)': 300,
  };
  const typeList = Object.keys(defaultPrices);
  const specifiedMap = { '受精卵': '受精卵(指定)', '胚': '胚(指定)', 'クローン': 'クローン(指定)' };

  const prices = Object.assign({}, defaultPrices, loadJSON(LS.PRICES, {}));

  /* =======================
   * DOM (index.html IDs)
   * ======================= */
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

    list: $('#list'),

    // Manage modal
    modalOverlay: $('#modalOverlay'),
    closeManage: $('#closeManage'),
    modalBody: $('#modalBody'),
    mTabCatalog: $('#mTabCatalog'),
    mTabPrices: $('#mTabPrices'),

    // Confirm modal
    confirmOverlay: $('#confirmOverlay'),
    confirmText: $('#confirmText'),
    confirmCancel: $('#confirmCancel'),
    confirmOk: $('#confirmOk'),

    // Edit modal
    editOverlay: $('#editOverlay'),
    editTitle: $('#editTitle'),
    editBody: $('#editBody'),
    editClose: $('#editClose'),
  };

  /* =======================
   * Safety: required elements
   * ======================= */
  const required = [
    'q','qClear','delivery','copy','total','out',
    'openManage','tabDinos','tabItems','list',
    'modalOverlay','closeManage','modalBody','mTabCatalog','mTabPrices',
    'confirmOverlay','confirmText','confirmCancel','confirmOk',
    'editOverlay','editTitle','editBody','editClose'
  ];
  for (const k of required) {
    if (!el[k]) {
      console.error('[恐竜リスト] Missing element:', k);
      // ここで落ちると「全部消える/ボタン効かない」になるので、あえてreturnして暴走を止める
      return;
    }
  }

  /* =======================
   * Optional reset
   * ======================= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    location.replace(location.pathname);
    return;
  }

  /* =======================
   * Global state
   * ======================= */
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

  // inputState: key -> dino {type,m,f} / item {qty}
  const inputState = new Map();

  // duplicates (ephemeral): baseId -> [{key}]
  const dupMap = new Map(); // baseId => array of dupKeys (in-memory only)

  /* =======================
   * Modal helpers
   * ======================= */
  function showOverlay(overlayEl) {
    overlayEl.classList.remove('isHidden');
    overlayEl.setAttribute('aria-hidden', 'false');
  }
  function hideOverlay(overlayEl) {
    overlayEl.classList.add('isHidden');
    overlayEl.setAttribute('aria-hidden', 'true');
  }
  function closeAllOverlays() {
    hideOverlay(el.modalOverlay);
    hideOverlay(el.confirmOverlay);
    hideOverlay(el.editOverlay);
  }

  // Prevent background scroll when modal open
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

  function openManageModal() {
    manageTab = 'catalog';
    el.mTabCatalog.classList.add('isActive');
    el.mTabPrices.classList.remove('isActive');
    renderManageBody();
    showOverlay(el.modalOverlay);
    lockScroll(true);
  }
  function closeManageModal() {
    hideOverlay(el.modalOverlay);
    el.modalBody.innerHTML = '';
    lockScroll(false);
  }

  // Confirm
  let confirmResolve = null;
  function openConfirm(message, okText = '削除') {
    el.confirmText.textContent = message || '削除しますか？';
    el.confirmOk.textContent = okText;
    showOverlay(el.confirmOverlay);
    lockScroll(true);
    return new Promise(res => { confirmResolve = res; });
  }
  function closeConfirm(result) {
    hideOverlay(el.confirmOverlay);
    lockScroll(false);
    if (confirmResolve) {
      const r = confirmResolve;
      confirmResolve = null;
      r(!!result);
    }
  }

  // Edit/Add
  function openEditModal(title, node) {
    el.editTitle.textContent = title || '追加 / 編集';
    el.editBody.innerHTML = '';
    if (node) el.editBody.appendChild(node);
    showOverlay(el.editOverlay);
    lockScroll(true);
  }
  function closeEditModal() {
    hideOverlay(el.editOverlay);
    el.editBody.innerHTML = '';
    lockScroll(false);
  }

  // Overlay click close (only when clicking background)
  el.modalOverlay.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closeManageModal();
  });
  el.confirmOverlay.addEventListener('click', (e) => {
    if (e.target === el.confirmOverlay) closeConfirm(false);
  });
  el.editOverlay.addEventListener('click', (e) => {
    if (e.target === el.editOverlay) closeEditModal();
  });

  el.closeManage.addEventListener('click', closeManageModal);
  el.confirmCancel.addEventListener('click', () => closeConfirm(false));
  el.confirmOk.addEventListener('click', () => closeConfirm(true));
  el.editClose.addEventListener('click', closeEditModal);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.editOverlay.classList.contains('isHidden')) return closeEditModal();
    if (!el.confirmOverlay.classList.contains('isHidden')) return closeConfirm(false);
    if (!el.modalOverlay.classList.contains('isHidden')) return closeManageModal();
  });

  /* =======================
   * Fetch & parse
   * ======================= */
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

  /* =======================
   * Ordering
   * ======================= */
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

  /* =======================
   * Input state helpers
   * ======================= */
  function ensureDinoState(key, defType) {
    if (!inputState.has(key)) inputState.set(key, { type: defType || '受精卵', m: 0, f: 0 });
    return inputState.get(key);
  }
  function ensureItemState(key) {
    if (!inputState.has(key)) inputState.set(key, { qty: 0 });
    return inputState.get(key);
  }

  // ♀入力OK、両方>0なら(指定)、両方0なら(指定)解除
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

  /* =======================
   * Output builder
   * ======================= */
  function rebuildOutput() {
    const lines = [];
    let sum = 0;
    let idx = 1;

    // dinos first
    const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');

    for (const d of dList) {
      const baseKey = d.id;

      // base + duplicates (ephemeral)
      const dupKeys = dupMap.get(baseKey) || [];
      const keys = [baseKey, ...dupKeys];

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

  /* =======================
   * Collapse & search
   *  - 初期は畳む（qty==0で畳む）
   * ======================= */
  function applyCollapseAndSearch() {
    const q = norm(el.q.value);

    $$('[data-card="1"]', el.list).forEach(card => {
      const name = card.dataset.name || '';
      const show = !q || norm(name).includes(q);
      card.style.display = show ? '' : 'none';

      const key = card.dataset.key || '';
      let qty = 0;

      if (card.dataset.kind === 'dino') {
        const s = inputState.get(key);
        qty = s ? (Number(s.m || 0) + Number(s.f || 0)) : 0;
      } else {
        const s = inputState.get(key);
        qty = s ? Number(s.qty || 0) : 0;
      }

      // 検索中はヒットだけ開く。それ以外は畳む
      // 非検索時は qty==0 を畳む（初期は全部畳まれる）
      const collapsed = q ? !show : (qty === 0);

      card.classList.toggle('isCollapsed', collapsed);
    });
  }

  /* =======================
   * Cards
   * ======================= */
  function buildDinoCard(d, keyOverride = null) {
    const key = keyOverride || d.id;
    const s = ensureDinoState(key, d.defType);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.kind = 'dino';
    card.dataset.key = key;
    card.dataset.name = d.name;

    // NOTE:
    // - ♂/♀ を色で分ける → CSS側で .btn.male / .btn.female を色付け想定
    // - 複製ボタンは外に出して右端
    card.innerHTML = `
      <div class="cardHead">
        <div class="name"></div>
        <div class="right">
          <select class="type"></select>
          <div class="unit"></div>
        </div>
      </div>

      <div class="controls">
        <div class="grid2">
          <div class="stepper">
            <button class="btn male" data-act="m-" type="button">−</button>
            <div class="val js-m">0</div>
            <button class="btn male" data-act="m+" type="button">＋</button>
          </div>

          <div class="stepper">
            <button class="btn female" data-act="f-" type="button">−</button>
            <div class="val js-f">0</div>
            <button class="btn female" data-act="f+" type="button">＋</button>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:8px;">
          <button class="mini" data-act="dup" type="button">複製</button>
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

    // 折りたたみタップ（コントロール以外）
    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      const isControl = !!act || e.target?.closest('select');
      if (isControl) return;

      card.classList.toggle('isCollapsed');
    });

    sel.addEventListener('change', () => {
      s.type = sel.value;
      autoSpecify(s);
      sel.value = s.type;
      unit.textContent = `単価${prices[s.type] || 0}円`;
      rebuildOutput();
      applyCollapseAndSearch();
    });

    function step(sex, delta) {
      if (sex === 'm') s.m = Math.max(0, Number(s.m || 0) + delta);
      if (sex === 'f') s.f = Math.max(0, Number(s.f || 0) + delta);
      autoSpecify(s);

      sel.value = s.type;
      unit.textContent = `単価${prices[s.type] || 0}円`;
      mEl.textContent = String(s.m || 0);
      fEl.textContent = String(s.f || 0);

      rebuildOutput();
      applyCollapseAndSearch();
    }

    // delegate
    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      e.preventDefault();
      e.stopPropagation();

      if (act === 'm-') return step('m', -1);
      if (act === 'm+') return step('m', +1);
      if (act === 'f-') return step('f', -1);
      if (act === 'f+') return step('f', +1);

      if (act === 'dup') {
        const baseId = d.id;
        const dupKey = `${baseId}__dup_${uid()}`;
        const list = dupMap.get(baseId) || [];
        list.push(dupKey);
        dupMap.set(baseId, list);

        // dup state (same type, qty 0)
        inputState.set(dupKey, { type: s.type, m: 0, f: 0 });

        // re-render to keep consistent order/filters
        renderAll();
        return;
      }
    });

    return card;
  }

  function buildItemCard(it) {
    const s = ensureItemState(it.id);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.kind = 'item';
    card.dataset.key = it.id;
    card.dataset.name = it.name;

    card.innerHTML = `
      <div class="cardHead">
        <div class="name"></div>
        <div class="right">
          <div class="unit"></div>
        </div>
      </div>

      <div class="controls">
        <div class="stepper">
          <button class="btn" data-act="-" type="button">−</button>
          <div class="val js-q">0</div>
          <button class="btn" data-act="+" type="button">＋</button>
        </div>
      </div>
    `;

    $('.name', card).textContent = it.name;
    $('.unit', card).textContent = `単価${it.price}円`;

    const qEl = $('.js-q', card);
    qEl.textContent = String(s.qty || 0);

    // 折りたたみタップ（コントロール以外）
    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      const isControl = !!act;
      if (isControl) return;
      card.classList.toggle('isCollapsed');
    });

    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      e.preventDefault();
      e.stopPropagation();

      if (act === '-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
      if (act === '+') s.qty = Math.max(0, Number(s.qty || 0) + 1);

      qEl.textContent = String(s.qty || 0);
      rebuildOutput();
      applyCollapseAndSearch();
    });

    return card;
  }

  /* =======================
   * Render
   * ======================= */
  function renderAll() {
    el.list.innerHTML = '';

    if (activeTab === 'dino') {
      const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');

      for (const d of dList) {
        // base
        el.list.appendChild(buildDinoCard(d, d.id));

        // duplicates (ephemeral)
        const dupKeys = dupMap.get(d.id) || [];
        for (const k of dupKeys) {
          el.list.appendChild(buildDinoCard(d, k));
        }
      }
    } else {
      const iList = sortByOrder(items.filter(i => !hidden.item.has(i.id)), 'item');
      iList.forEach(it => el.list.appendChild(buildItemCard(it)));
    }

    rebuildOutput();
    applyCollapseAndSearch();
  }

  /* =======================
   * Tabs
   * ======================= */
  function setTab(tab) {
    activeTab = tab;

    // UI
    el.tabDinos.classList.toggle('isActive', tab === 'dino');
    el.tabItems.classList.toggle('isActive', tab === 'item');

    el.tabDinos.setAttribute('aria-selected', tab === 'dino' ? 'true' : 'false');
    el.tabItems.setAttribute('aria-selected', tab === 'item' ? 'true' : 'false');

    renderAll();
  }

  el.tabDinos.addEventListener('click', () => setTab('dino'));
  el.tabItems.addEventListener('click', () => setTab('item'));

  /* =======================
   * Search
   * ======================= */
  el.q.addEventListener('input', applyCollapseAndSearch);
  el.qClear.addEventListener('click', () => {
    el.q.value = '';
    applyCollapseAndSearch();
  });

  /* =======================
   * Delivery
   * ======================= */
  const savedDelivery = localStorage.getItem(LS.DELIVERY);
  if (savedDelivery) el.delivery.value = savedDelivery;

  el.delivery.addEventListener('change', () => {
    localStorage.setItem(LS.DELIVERY, el.delivery.value);
    rebuildOutput();
  });

  /* =======================
   * Copy
   * ======================= */
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

  /* =======================
   * Manage UI rendering
   * ======================= */
  function renderManageBody() {
    el.modalBody.innerHTML = '';

    // tab buttons
    el.mTabCatalog.classList.toggle('isActive', manageTab === 'catalog');
    el.mTabPrices.classList.toggle('isActive', manageTab === 'prices');

    if (manageTab === 'prices') {
      el.modalBody.appendChild(buildManagePrices());
      return;
    }
    el.modalBody.appendChild(buildManageCatalog());
  }

  el.mTabCatalog.addEventListener('click', () => {
    manageTab = 'catalog';
    renderManageBody();
  });
  el.mTabPrices.addEventListener('click', () => {
    manageTab = 'prices';
    renderManageBody();
  });

  function buildManagePrices() {
    const wrap = document.createElement('div');

    const grid = document.createElement('div');
    grid.className = 'priceGrid';

    for (const t of typeList) {
      const key = document.createElement('div');
      key.className = 'pKey';
      key.textContent = t;

      const val = document.createElement('div');
      val.className = 'pVal';
      val.innerHTML = `<input type="number" inputmode="numeric" value="${Number(prices[t] || 0)}" data-type="${t}">`;

      grid.appendChild(key);
      grid.appendChild(val);
    }

    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '12px';
    btnRow.innerHTML = `<button class="primary" type="button" data-act="savePrices">保存</button>`;

    wrap.appendChild(grid);
    wrap.appendChild(btnRow);

    wrap.addEventListener('click', (e) => {
      if (e.target?.dataset?.act !== 'savePrices') return;

      $$('input[data-type]', wrap).forEach(inp => {
        const t = inp.dataset.type;
        prices[t] = Number(inp.value || 0);
      });
      saveJSON(LS.PRICES, prices);

      renderAll();
      // 価格保存後は閉じない（作業継続しやすく）
    });

    return wrap;
  }

  function buildManageCatalog() {
    const kind = activeTab; // dino/item を管理対象にする

    const wrap = document.createElement('div');

    // Add button (open edit modal)
    const bar = document.createElement('div');
    bar.className = 'mBar';
    bar.innerHTML = `
      <button class="primary" type="button" data-act="add">追加</button>
      <button class="primary" type="button" data-act="sortKana">50音並び替え</button>
    `;
    wrap.appendChild(bar);

    const list = document.createElement('div');

    const currentList = (kind === 'dino')
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    currentList.forEach(obj => {
      const row = document.createElement('div');
      row.className = 'mRow';
      row.innerHTML = `
        <div class="mName">${obj.name}</div>
        <div class="mBtns">
          <button class="sBtn" type="button" data-act="up" data-id="${obj.id}">↑</button>
          <button class="sBtn" type="button" data-act="down" data-id="${obj.id}">↓</button>
          <button class="sBtn" type="button" data-act="edit" data-id="${obj.id}">編集</button>
          <button class="sBtn danger" type="button" data-act="del" data-id="${obj.id}">削除</button>
        </div>
      `;
      list.appendChild(row);
    });

    wrap.appendChild(list);

    wrap.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      const id = e.target?.dataset?.id;

      if (act === 'add') {
        openAddForm(kind);
        return;
      }

      if (act === 'sortKana') {
        const baseList = kind === 'dino' ? dinos : items;
        const hset = kind === 'dino' ? hidden.dino : hidden.item;
        const visible = baseList.filter(x => !hset.has(x.id));

        visible.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        order[kind] = visible.map(x => x.id);
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, order[kind]);

        renderAll();
        renderManageBody();
        return;
      }

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
        renderManageBody();
        return;
      }

      if (act === 'del') {
        const baseList = kind === 'dino' ? dinos : items;
        const obj = baseList.find(x => x.id === id);
        const ok = await openConfirm(`「${obj?.name || ''}」を削除しますか？`, '削除');
        closeConfirm(false); // overlay is managed by button too; ensure closed
        if (!ok) return;

        if (kind === 'dino') {
          hidden.dino.add(id);
          saveJSON(LS.DINO_HIDDEN, Array.from(hidden.dino));
        } else {
          hidden.item.add(id);
          saveJSON(LS.ITEM_HIDDEN, Array.from(hidden.item));
        }

        renderAll();
        renderManageBody();
        return;
      }

      if (act === 'edit') {
        openEditForm(kind, id);
        return;
      }
    });

    return wrap;
  }

  function openAddForm(kind) {
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
          <select id="aDef">
            ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
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

    form.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') {
        closeEditModal();
        return;
      }

      if (act === 'save') {
        const name = ($('#aName', form).value || '').trim();
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

        closeEditModal();
        init(); // reload base + custom and re-render
      }
    });

    openEditModal(kind === 'dino' ? '恐竜を追加' : 'アイテムを追加', form);
  }

  function openEditForm(kind, id) {
    const baseList = kind === 'dino' ? dinos : items;
    const obj = baseList.find(x => x.id === id);
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
          <select id="eDef">
            ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
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
          <input id="eUnit" type="number" inputmode="numeric" value="${Number(obj.unit || 1)}">
        </div>
        <div class="field">
          <label>単価</label>
          <input id="ePrice" type="number" inputmode="numeric" value="${Number(obj.price || 0)}">
        </div>
        <div class="formBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="primary" type="button" data-act="save">保存</button>
        </div>
      `;
    }

    form.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') {
        closeEditModal();
        return;
      }

      if (act === 'save') {
        const newName = ($('#eName', form).value || '').trim();
        if (!newName) return;

        obj.name = newName;

        if (kind === 'dino') {
          obj.defType = $('#eDef', form).value;

          const c = custom.dino.find(x => x.id === id);
          if (c) { c.name = obj.name; c.defType = obj.defType; }
          else custom.dino.push({ id, name: obj.name, defType: obj.defType });

          saveJSON(LS.DINO_CUSTOM, custom.dino);
        } else {
          obj.unit = Number($('#eUnit', form).value || 1);
          obj.price = Number($('#ePrice', form).value || 0);

          const c = custom.item.find(x => x.id === id);
          if (c) { c.name = obj.name; c.unit = obj.unit; c.price = obj.price; }
          else custom.item.push({ id, name: obj.name, unit: obj.unit, price: obj.price });

          saveJSON(LS.ITEM_CUSTOM, custom.item);
        }

        closeEditModal();
        renderAll();
        renderManageBody();
      }
    });

    openEditModal('編集', form);
  }

  /* =======================
   * Manage button
   * ======================= */
  el.openManage.addEventListener('click', openManageModal);

  /* =======================
   * Init
   * ======================= */
  async function init() {
    // Always close overlays on boot (「リロードしたらモーダルから始まる」防止)
    closeAllOverlays();
    lockScroll(false);

    const dText = await fetchTextSafe('./dinos.txt');
    const iText = await fetchTextSafe('./items.txt');

    const baseD = dText.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
    const baseI = iText.split(/\r?\n/).map(parseItemLine).filter(Boolean);

    dinos = baseD.concat(custom.dino.map(x => ({ id: x.id, name: x.name, defType: x.defType, kind: 'dino' })));
    items = baseI.concat(custom.item.map(x => ({ id: x.id, name: x.name, unit: x.unit, price: x.price, kind: 'item' })));

    ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');

    const savedDelivery = localStorage.getItem(LS.DELIVERY);
    if (savedDelivery) el.delivery.value = savedDelivery;

    // default tab
    setTab(activeTab);
  }

  init();
})();