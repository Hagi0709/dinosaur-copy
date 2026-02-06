(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
  const toHira = (s) => (s || '').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const norm = (s) => toHira(String(s || '').toLowerCase()).replace(/\s+/g, '');

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

  /* ========= IndexedDB (images) ========= */
  const IMG_DB = { name: 'dino_images_v1', store: 'images', version: 1 };

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IMG_DB.name, IMG_DB.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IMG_DB.store)) {
          db.createObjectStore(IMG_DB.store, { keyPath: 'id' }); // {id, blob, updatedAt}
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetImage(id) {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction(IMG_DB.store, 'readonly');
      const st = tx.objectStore(IMG_DB.store);
      const req = st.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => resolve(null);
    });
  }

  async function idbSetImage(id, blob) {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction(IMG_DB.store, 'readwrite');
      const st = tx.objectStore(IMG_DB.store);
      st.put({ id, blob, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async function idbDelImage(id) {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction(IMG_DB.store, 'readwrite');
      const st = tx.objectStore(IMG_DB.store);
      st.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  /* ========= DOM ========= */
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

    // manage modal
    modalOverlay: $('#modalOverlay'),
    closeManage: $('#closeManage'),
    modalBody: $('#modalBody'),
    mTabCatalog: $('#mTabCatalog'),
    mTabPrices: $('#mTabPrices'),
    mTabImages: $('#mTabImages'),

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

  /* ========= reset helper ========= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
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
  let manageTab = 'catalog'; // 'catalog' | 'prices' | 'images'

  // inputState: key -> {type,m,f} or {qty}
  const inputState = new Map();
  // duplicated cards are ephemeral
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

  /* ========= behavior rules ========= */
  function ensureDinoState(key, defType) {
    if (!inputState.has(key)) inputState.set(key, { type: defType || '受精卵', m: 0, f: 0 });
    return inputState.get(key);
  }
  function ensureItemState(key) {
    if (!inputState.has(key)) inputState.set(key, { qty: 0 });
    return inputState.get(key);
  }

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

  /* ========= search + collapse ========= */
  function applyCollapseAndSearch() {
    const q = norm(el.q.value);
    $$('[data-card="1"]', el.list).forEach(card => {
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

      const collapsed = q ? !show : (qty === 0);
      card.classList.toggle('isCollapsed', collapsed);
    });
  }

  /* ========= cards ========= */
  function buildDinoCard(d) {
    const key = d.id;
    const s = ensureDinoState(key, d.defType);

    const wrap = document.createElement('div');
    wrap.className = 'cardWrap';

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.key = key;
    card.dataset.name = d.name;

    card.innerHTML = `
      <div class="cardHead">
        <div class="name"></div>
        <div class="right">
          <select class="type"></select>
          <div class="unit"></div>
        </div>
      </div>

      <div class="controls">
        <div class="grid2" style="grid-template-columns:1fr 1fr 86px;">
          <div class="stepper" data-sex="m" style="border-color:rgba(120,190,255,.35); box-shadow:inset 0 0 0 1px rgba(120,190,255,.15);">
            <button class="btn" data-act="m-" type="button">−</button>
            <div class="val js-m">0</div>
            <button class="btn" data-act="m+" type="button">＋</button>
          </div>

          <div class="stepper" data-sex="f" style="border-color:rgba(255,130,210,.35); box-shadow:inset 0 0 0 1px rgba(255,130,210,.15);">
            <button class="btn" data-act="f-" type="button">−</button>
            <div class="val js-f">0</div>
            <button class="btn" data-act="f+" type="button">＋</button>
          </div>

          <button class="mini" data-act="dup" type="button" style="height:48px;border-radius:16px;">複製</button>
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

    // クリック判定：ヘッダ全体で折りたたみ/展開（ボタン類は除外）
    card.addEventListener('click', (e) => {
      const t = e.target;
      const act = t?.dataset?.act;

      // ボタン・セレクトは折りたたみトグル対象外
      if (t.closest('button') || t.closest('select') || t.closest('input')) {
        if (!act) return;
      } else {
        // ヘッダ〜カード領域をタップしたらトグル
        card.classList.toggle('isCollapsed');
        return;
      }

      if (act === 'm-') step('m', -1);
      if (act === 'm+') step('m', +1);
      if (act === 'f-') step('f', -1);
      if (act === 'f+') step('f', +1);

      if (act === 'dup') {
        const dupKey = `${key}__dup_${uid()}`;
        ephemeralKeys.add(dupKey);
        inputState.set(dupKey, { type: s.type, m: 0, f: 0 });

        const dupCard = buildDinoCard({ ...d, id: dupKey });
        dupCard.dataset.name = d.name;
        dupCard.dataset.key = dupKey;

        wrap.after(dupCard.closest('.cardWrap'));
        rebuildOutput();
        applyCollapseAndSearch();
      }
    });

    wrap.appendChild(card);
    return wrap;
  }

  function buildItemCard(it) {
    const s = ensureItemState(it.id);

    const wrap = document.createElement('div');
    wrap.className = 'cardWrap';

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
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

    card.addEventListener('click', (e) => {
      const t = e.target;
      const act = t?.dataset?.act;

      if (t.closest('button') || t.closest('select') || t.closest('input')) {
        if (!act) return;
      } else {
        card.classList.toggle('isCollapsed');
        return;
      }

      if (act === '-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
      if (act === '+') s.qty = Math.max(0, Number(s.qty || 0) + 1);
      qEl.textContent = String(s.qty || 0);
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
    el.tabDinos.setAttribute('aria-selected', tab === 'dino' ? 'true' : 'false');
    el.tabItems.setAttribute('aria-selected', tab === 'item' ? 'true' : 'false');
    renderList();
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

  /* ========= simple modals ========= */
  function showOverlay(node) {
    node.classList.remove('isHidden');
    node.setAttribute('aria-hidden', 'false');
  }
  function hideOverlay(node) {
    node.classList.add('isHidden');
    node.setAttribute('aria-hidden', 'true');
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      el.confirmText.textContent = message || '削除しますか？';
      showOverlay(el.confirmOverlay);

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
    });
  }

  function openEdit(title, bodyNode) {
    el.editTitle.textContent = title || '編集';
    el.editBody.innerHTML = '';
    el.editBody.appendChild(bodyNode);
    showOverlay(el.editOverlay);
  }
  function closeEdit() {
    hideOverlay(el.editOverlay);
    el.editBody.innerHTML = '';
  }
  el.editClose.addEventListener('click', closeEdit);

  /* ========= manage tab rendering ========= */
  function setManageTab(tab) {
    manageTab = tab;
    el.mTabCatalog.classList.toggle('isActive', tab === 'catalog');
    el.mTabPrices.classList.toggle('isActive', tab === 'prices');
    el.mTabImages.classList.toggle('isActive', tab === 'images');
    renderManageBody();
  }

  el.mTabCatalog.addEventListener('click', () => setManageTab('catalog'));
  el.mTabPrices.addEventListener('click', () => setManageTab('prices'));
  el.mTabImages.addEventListener('click', () => setManageTab('images'));

  function renderManageBody() {
    el.modalBody.innerHTML = '';

    if (manageTab === 'catalog') {
      el.modalBody.appendChild(buildManageCatalog());
      return;
    }
    if (manageTab === 'prices') {
      el.modalBody.appendChild(buildManagePrices());
      return;
    }
    if (manageTab === 'images') {
      el.modalBody.appendChild(buildManageImages());
      return;
    }
  }

  function buildManagePrices() {
    const box = document.createElement('div');
    box.className = 'card';

    const title = document.createElement('div');
    title.className = 'name';
    title.style.fontSize = '16px';
    title.style.marginBottom = '10px';
    title.textContent = '価格設定';
    box.appendChild(title);

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

    box.appendChild(grid);

    const btns = document.createElement('div');
    btns.style.marginTop = '12px';
    btns.innerHTML = `<button class="primary" type="button" id="savePrices">保存</button>`;
    box.appendChild(btns);

    btns.querySelector('#savePrices').addEventListener('click', () => {
      $$('input[data-type]', box).forEach(inp => {
        const t = inp.dataset.type;
        prices[t] = Number(inp.value || 0);
      });
      saveJSON(LS.PRICES, prices);
      renderList();
      hideManage();
    });

    return box;
  }

  function buildManageCatalog() {
    const frag = document.createDocumentFragment();

    // 上部：切替（恐竜/アイテム）
    const bar = document.createElement('div');
    bar.className = 'mBar';

    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const bD = document.createElement('button');
    bD.className = 'tab ' + (activeTab === 'dino' ? 'isActive' : '');
    bD.type = 'button';
    bD.textContent = '恐竜';
    const bI = document.createElement('button');
    bI.className = 'tab ' + (activeTab === 'item' ? 'isActive' : '');
    bI.type = 'button';
    bI.textContent = 'アイテム';

    bD.addEventListener('click', () => { activeTab = 'dino'; setTab('dino'); setManageTab('catalog'); });
    bI.addEventListener('click', () => { activeTab = 'item'; setTab('item'); setManageTab('catalog'); });

    tabs.appendChild(bD);
    tabs.appendChild(bI);

    const addBtn = document.createElement('button');
    addBtn.className = 'primary';
    addBtn.type = 'button';
    addBtn.textContent = '追加';

    bar.appendChild(tabs);
    bar.appendChild(addBtn);
    frag.appendChild(bar);

    // 並び替え
    const sortBtn = document.createElement('button');
    sortBtn.className = 'ghost';
    sortBtn.type = 'button';
    sortBtn.textContent = '50音並び替え';
    sortBtn.style.marginBottom = '12px';
    sortBtn.addEventListener('click', () => {
      if (activeTab === 'dino') {
        const visible = dinos.filter(x => !hidden.dino.has(x.id));
        visible.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        order.dino = visible.map(x => x.id);
        saveJSON(LS.DINO_ORDER, order.dino);
      } else {
        const visible = items.filter(x => !hidden.item.has(x.id));
        visible.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        order.item = visible.map(x => x.id);
        saveJSON(LS.ITEM_ORDER, order.item);
      }
      renderList();
      hideManage();
    });
    frag.appendChild(sortBtn);

    // 一覧
    const listWrap = document.createElement('div');
    const list = activeTab === 'dino'
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    list.forEach(obj => {
      const r = document.createElement('div');
      r.className = 'mRow';

      const name = document.createElement('div');
      name.className = 'mName';
      name.textContent = obj.name;

      const up = document.createElement('button');
      up.className = 'sBtn';
      up.type = 'button';
      up.textContent = '↑';

      const down = document.createElement('button');
      down.className = 'sBtn';
      down.type = 'button';
      down.textContent = '↓';

      const edit = document.createElement('button');
      edit.className = 'sBtn';
      edit.type = 'button';
      edit.textContent = '編集';

      const del = document.createElement('button');
      del.className = 'sBtn danger';
      del.type = 'button';
      del.textContent = '削除';

      up.addEventListener('click', () => moveOrder(activeTab, obj.id, -1));
      down.addEventListener('click', () => moveOrder(activeTab, obj.id, +1));
      edit.addEventListener('click', () => openEditItem(activeTab, obj.id));
      del.addEventListener('click', async () => {
        const ok = await confirmDialog(`「${obj.name}」を削除しますか？`);
        if (!ok) return;
        if (activeTab === 'dino') {
          hidden.dino.add(obj.id);
          saveJSON(LS.DINO_HIDDEN, Array.from(hidden.dino));
        } else {
          hidden.item.add(obj.id);
          saveJSON(LS.ITEM_HIDDEN, Array.from(hidden.item));
        }
        renderList();
        hideManage();
      });

      r.appendChild(name);
      r.appendChild(up);
      r.appendChild(down);
      r.appendChild(edit);
      r.appendChild(del);
      listWrap.appendChild(r);
    });

    frag.appendChild(listWrap);

    // 追加
    addBtn.addEventListener('click', () => openAdd(activeTab));

    const container = document.createElement('div');
    container.appendChild(frag);
    return container;
  }

  function moveOrder(kind, id, dir) {
    const key = kind === 'dino' ? 'dino' : 'item';
    const ord = (order[key] || []).slice();
    const i = ord.indexOf(id);
    if (i === -1) return;
    const ni = i + dir;
    if (ni < 0 || ni >= ord.length) return;
    [ord[i], ord[ni]] = [ord[ni], ord[i]];
    order[key] = ord;
    saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
    renderList();
    hideManage();
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
          <button class="primary" type="button" id="aSave">保存</button>
          <button class="ghost" type="button" id="aCancel">キャンセル</button>
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
          <button class="primary" type="button" id="aSave">保存</button>
          <button class="ghost" type="button" id="aCancel">キャンセル</button>
        </div>
      `;
    }

    $('#aCancel', form).addEventListener('click', closeEdit);
    $('#aSave', form).addEventListener('click', () => {
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

      init().then(() => { closeEdit(); hideManage(); });
    });

    openEdit('追加', form);
  }

  function openEditItem(kind, id) {
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
          <button class="primary" type="button" id="eSave">保存</button>
          <button class="ghost" type="button" id="eCancel">キャンセル</button>
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
          <button class="primary" type="button" id="eSave">保存</button>
          <button class="ghost" type="button" id="eCancel">キャンセル</button>
        </div>
      `;
    }

    $('#eCancel', form).addEventListener('click', closeEdit);
    $('#eSave', form).addEventListener('click', () => {
      const newName = ($('#eName', form).value || '').trim();
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

      renderList();
      closeEdit();
      hideManage();
    });

    openEdit('編集', form);
  }

  /* ========= images tab ========= */
  const objectUrlCache = new Map(); // id -> url

  function revokeUrl(id) {
    const u = objectUrlCache.get(id);
    if (u) URL.revokeObjectURL(u);
    objectUrlCache.delete(id);
  }

  function buildManageImages() {
    const wrap = document.createElement('div');

    const hint = document.createElement('div');
    hint.className = 'card';
    hint.innerHTML = `
      <div class="name" style="font-size:16px;margin-bottom:6px;">恐竜画像</div>
      <div style="color:rgba(255,255,255,.60);font-size:12px;line-height:1.5;">
        1体につき1枚。2枚目を選ぶと上書き。削除も可能。
      </div>
    `;
    wrap.appendChild(hint);

    const list = document.createElement('div');
    list.className = 'imgList';
    wrap.appendChild(list);

    // 「一覧」と同じ並び（order.dino）で表示
    const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');

    dList.forEach(d => {
      const row = document.createElement('div');
      row.className = 'imgRow';

      const thumb = document.createElement('div');
      thumb.className = 'imgThumb';
      thumb.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,.45);">No Image</div>`;

      const meta = document.createElement('div');
      meta.className = 'imgMeta';
      meta.innerHTML = `
        <div class="imgName"></div>
      `;
      $('.imgName', meta).textContent = d.name;

      const actions = document.createElement('div');
      actions.className = 'imgActions';

      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.style.display = 'none';

      const pick = document.createElement('button');
      pick.className = 'imgBtn';
      pick.type = 'button';
      pick.textContent = '選択';

      const del = document.createElement('button');
      del.className = 'imgBtn danger';
      del.type = 'button';
      del.textContent = '削除';

      pick.addEventListener('click', () => file.click());

      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;

        // 上書き：保存 → 表示更新
        await idbSetImage(d.id, f);
        await refreshThumb(d.id, thumb);
        file.value = '';
      });

      del.addEventListener('click', async () => {
        const ok = await confirmDialog(`「${d.name}」の画像を削除しますか？`);
        if (!ok) return;
        await idbDelImage(d.id);
        revokeUrl(d.id);
        thumb.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,.45);">No Image</div>`;
      });

      actions.appendChild(pick);
      actions.appendChild(del);

      row.appendChild(thumb);
      row.appendChild(meta);
      row.appendChild(actions);
      row.appendChild(file);

      list.appendChild(row);

      // 初期ロード時に表示
      refreshThumb(d.id, thumb);
    });

    return wrap;
  }

  async function refreshThumb(id, thumbEl) {
    const blob = await idbGetImage(id);
    if (!blob) {
      thumbEl.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,.45);">No Image</div>`;
      return;
    }
    revokeUrl(id);
    const url = URL.createObjectURL(blob);
    objectUrlCache.set(id, url);
    thumbEl.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    thumbEl.appendChild(img);
  }

  /* ========= manage open/close ========= */
  function showManage() {
    showOverlay(el.modalOverlay);
    setManageTab('catalog');
  }
  function hideManage() {
    hideOverlay(el.modalOverlay);
    // モーダル閉じたらURLメモリ掃除（必要に応じて）
    // ※表示を即復帰させたいなら消さない選択もあり
  }

  el.openManage.addEventListener('click', showManage);
  el.closeManage.addEventListener('click', hideManage);
  el.modalOverlay.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) hideManage();
  });

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

    const savedDelivery = localStorage.getItem(LS.DELIVERY);
    if (savedDelivery) el.delivery.value = savedDelivery;

    renderList();
  }

  init();
})();