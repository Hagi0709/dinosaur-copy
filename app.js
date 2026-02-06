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
    PRICES: 'prices_v1',
    DELIVERY: 'delivery_v1',

    DINO_CUSTOM: 'dino_custom_v1',
    ITEM_CUSTOM: 'item_custom_v1',

    DINO_HIDDEN: 'dino_hidden_v1',
    ITEM_HIDDEN: 'item_hidden_v1',

    DINO_ORDER: 'dino_order_v1',
    ITEM_ORDER: 'item_order_v1',

    DINO_IMAGES: 'dino_images_v1', // { [dinoId]: dataUrl }
  };

  const loadJSON = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ========= reset helper ========= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    location.replace(location.pathname);
    return;
  }

  /* ========= default prices ========= */
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
    closeManage: $('#closeManage'),
    modalBody: $('#modalBody'),
    mTabCatalog: $('#mTabCatalog'),
    mTabPrices: $('#mTabPrices'),
    mTabImages: $('#mTabImages'),

    confirmOverlay: $('#confirmOverlay'),
    confirmText: $('#confirmText'),
    confirmCancel: $('#confirmCancel'),
    confirmOk: $('#confirmOk'),

    editOverlay: $('#editOverlay'),
    editTitle: $('#editTitle'),
    editBody: $('#editBody'),
    editClose: $('#editClose'),

    imgOverlay: $('#imgOverlay'),
    imgViewerImg: $('#imgViewerImg'),
    imgClose: $('#imgClose'),
  };

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
  const dinoImages = loadJSON(LS.DINO_IMAGES, {}); // {id:dataUrl}

  let dinos = [];
  let items = [];
  let activeTab = 'dino';

  // key -> dinoState {type,m,f} / itemState {qty}
  const inputState = new Map();
  // duplicated keys are ephemeral (not persisted)
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

    // dinos
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

    // items
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
    const cards = $$('[data-card="1"]', el.list);

    cards.forEach(cardWrap => {
      const card = $('.card', cardWrap);
      const kind = cardWrap.dataset.kind;
      const name = cardWrap.dataset.name || '';
      const show = !q || norm(name).includes(q);
      cardWrap.style.display = show ? '' : 'none';

      const key = cardWrap.dataset.key;
      let qty = 0;

      if (kind === 'dino') {
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
    wrap.dataset.card = '1';
    wrap.dataset.kind = 'dino';
    wrap.dataset.key = key;
    wrap.dataset.name = d.name;

    wrap.innerHTML = `
      <div class="card ${Number(s.m||0)+Number(s.f||0)===0 ? 'isCollapsed':''}">
        <div class="cardHead">
          <div class="name"></div>
          <div class="right">
            <select class="type" data-no-collapse="1"></select>
            <div class="unit"></div>
          </div>
        </div>

        <div class="controls">
          <div class="sexRow">
            <div class="stepper male" data-sex="m">
              <button class="btn" type="button" data-act="m-" data-no-collapse="1">−</button>
              <div class="val js-m">0</div>
              <button class="btn" type="button" data-act="m+" data-no-collapse="1">＋</button>
            </div>

            <div class="stepper female" data-sex="f">
              <button class="btn" type="button" data-act="f-" data-no-collapse="1">−</button>
              <div class="val js-f">0</div>
              <button class="btn" type="button" data-act="f+" data-no-collapse="1">＋</button>
            </div>

            <button class="dupBtn" type="button" data-act="dup" data-no-collapse="1">複製</button>
          </div>
        </div>

        <div class="cardTap" data-act="toggle"></div>
      </div>
    `;

    const card = $('.card', wrap);
    $('.name', wrap).textContent = d.name;

    const sel = $('.type', wrap);
    sel.innerHTML = typeList.map(t => `<option value="${t}">${t}</option>`).join('');
    sel.value = s.type;

    const unit = $('.unit', wrap);
    unit.textContent = `単価${prices[s.type] || 0}円`;

    const mEl = $('.js-m', wrap);
    const fEl = $('.js-f', wrap);
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

    return wrap;
  }

  function buildItemCard(it) {
    const s = ensureItemState(it.id);

    const wrap = document.createElement('div');
    wrap.className = 'cardWrap';
    wrap.dataset.card = '1';
    wrap.dataset.kind = 'item';
    wrap.dataset.key = it.id;
    wrap.dataset.name = it.name;

    wrap.innerHTML = `
      <div class="card ${Number(s.qty||0)===0 ? 'isCollapsed':''}">
        <div class="cardHead">
          <div class="name"></div>
          <div class="right">
            <div class="unit"></div>
          </div>
        </div>

        <div class="controls">
          <div class="sexRow">
            <div class="stepper" style="border-color:rgba(255,255,255,.12);box-shadow:none;">
              <button class="btn" type="button" data-act="i-" data-no-collapse="1">−</button>
              <div class="val js-q">0</div>
              <button class="btn" type="button" data-act="i+" data-no-collapse="1">＋</button>
            </div>
          </div>
        </div>

        <div class="cardTap" data-act="toggle"></div>
      </div>
    `;

    $('.name', wrap).textContent = it.name;
    $('.unit', wrap).textContent = `単価${it.price}円`;

    $('.js-q', wrap).textContent = String(s.qty || 0);

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

  /* ========= list interactions (delegation) ========= */
  el.list.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;

    const act = t.dataset.act;
    const noCollapse = t.dataset.noCollapse === '1';

    const wrap = t.closest('.cardWrap');
    if (!wrap) return;

    const kind = wrap.dataset.kind;
    const key = wrap.dataset.key;

    const card = $('.card', wrap);

    if (act === 'toggle') {
      card.classList.toggle('isCollapsed');
      return;
    }

    if (noCollapse) e.stopPropagation();

    if (kind === 'dino') {
      const s = ensureDinoState(key);

      const sel = $('.type', wrap);
      const unit = $('.unit', wrap);
      const mEl = $('.js-m', wrap);
      const fEl = $('.js-f', wrap);

      const step = (sex, delta) => {
        if (sex === 'm') s.m = Math.max(0, Number(s.m || 0) + delta);
        if (sex === 'f') s.f = Math.max(0, Number(s.f || 0) + delta);
        autoSpecify(s);
        sel.value = s.type;
        unit.textContent = `単価${prices[s.type] || 0}円`;
        mEl.textContent = String(s.m || 0);
        fEl.textContent = String(s.f || 0);
        rebuildOutput();
        applyCollapseAndSearch();
      };

      if (act === 'm-') step('m', -1);
      if (act === 'm+') step('m', +1);
      if (act === 'f-') step('f', -1);
      if (act === 'f+') step('f', +1);

      if (act === 'dup') {
        const baseKey = key.includes('__dup_') ? key.split('__dup_')[0] : key;
        const baseState = inputState.get(baseKey) || s;

        const dupKey = `${baseKey}__dup_${uid()}`;
        ephemeralKeys.add(dupKey);
        inputState.set(dupKey, { type: baseState.type, m: 0, f: 0 });

        const base = dinos.find(x => x.id === baseKey) || dinos.find(x => x.id === key);
        if (!base) return;

        const dupWrap = buildDinoCard({ ...base, id: dupKey });
        wrap.after(dupWrap);

        rebuildOutput();
        applyCollapseAndSearch();
      }
    }

    if (kind === 'item') {
      const s = ensureItemState(key);
      const qEl = $('.js-q', wrap);

      if (act === 'i-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
      if (act === 'i+') s.qty = Math.max(0, Number(s.qty || 0) + 1);

      qEl.textContent = String(s.qty || 0);
      rebuildOutput();
      applyCollapseAndSearch();
    }
  });

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

  /* ========= confirm modal ========= */
  let confirmResolver = null;
  function openConfirm(message) {
    el.confirmText.textContent = message || '削除しますか？';
    el.confirmOverlay.classList.remove('isHidden');
    rememberScrollLock(true);
    return new Promise((resolve) => { confirmResolver = resolve; });
  }
  function closeConfirm(ans) {
    el.confirmOverlay.classList.add('isHidden');
    rememberScrollLock(false);
    if (confirmResolver) confirmResolver(!!ans);
    confirmResolver = null;
  }
  el.confirmCancel.addEventListener('click', () => closeConfirm(false));
  el.confirmOk.addEventListener('click', () => closeConfirm(true));
  el.confirmOverlay.addEventListener('click', (e) => { if (e.target === el.confirmOverlay) closeConfirm(false); });

  /* ========= scroll lock ========= */
  function rememberScrollLock(on) {
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

  /* ========= image viewer (tap to enlarge) ========= */
  function openImageViewer(src) {
    if (!src) return;
    el.imgViewerImg.src = src;
    el.imgOverlay.classList.remove('isHidden');
    el.imgOverlay.setAttribute('aria-hidden', 'false');
    rememberScrollLock(true);
  }
  function closeImageViewer() {
    el.imgOverlay.classList.add('isHidden');
    el.imgOverlay.setAttribute('aria-hidden', 'true');
    el.imgViewerImg.src = '';
    rememberScrollLock(false);
  }
  el.imgClose.addEventListener('click', closeImageViewer);
  el.imgOverlay.addEventListener('click', (e) => { if (e.target === el.imgOverlay) closeImageViewer(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.imgOverlay.classList.contains('isHidden')) closeImageViewer();
      if (!el.confirmOverlay.classList.contains('isHidden')) closeConfirm(false);
      if (!el.modalOverlay.classList.contains('isHidden')) closeManage();
      if (!el.editOverlay.classList.contains('isHidden')) closeEdit();
    }
  });

  /* ========= manage modal ========= */
  let manageTab = 'catalog'; // catalog | prices | images

  function setManageTab(tab) {
    manageTab = tab;
    el.mTabCatalog.classList.toggle('isActive', tab === 'catalog');
    el.mTabPrices.classList.toggle('isActive', tab === 'prices');
    el.mTabImages.classList.toggle('isActive', tab === 'images');
    renderManageBody();
  }

  function openManage() {
    el.modalOverlay.classList.remove('isHidden');
    el.modalOverlay.setAttribute('aria-hidden', 'false');
    rememberScrollLock(true);
    setManageTab('catalog');
  }

  function closeManage() {
    el.modalOverlay.classList.add('isHidden');
    el.modalOverlay.setAttribute('aria-hidden', 'true');
    el.modalBody.innerHTML = '';
    rememberScrollLock(false);
  }

  el.openManage.addEventListener('click', openManage);
  el.closeManage.addEventListener('click', closeManage);
  el.modalOverlay.addEventListener('click', (e) => { if (e.target === el.modalOverlay) closeManage(); });

  el.mTabCatalog.addEventListener('click', () => setManageTab('catalog'));
  el.mTabPrices.addEventListener('click', () => setManageTab('prices'));
  el.mTabImages.addEventListener('click', () => setManageTab('images'));

  function renderManageBody() {
    el.modalBody.innerHTML = '';

    if (manageTab === 'prices') {
      const wrap = document.createElement('div');

      const grid = document.createElement('div');
      grid.className = 'priceGrid';

      typeList.forEach(t => {
        const key = document.createElement('div');
        key.className = 'pKey';
        key.textContent = t;

        const val = document.createElement('div');
        val.className = 'pVal';
        val.innerHTML = `<input type="number" inputmode="numeric" value="${Number(prices[t] || 0)}" data-price-type="${t}">`;

        grid.appendChild(key);
        grid.appendChild(val);
      });

      const saveBtn = document.createElement('button');
      saveBtn.className = 'primary';
      saveBtn.type = 'button';
      saveBtn.textContent = '保存';

      saveBtn.addEventListener('click', () => {
        $$('input[data-price-type]', grid).forEach(inp => {
          const t = inp.dataset.priceType;
          prices[t] = Number(inp.value || 0);
        });
        saveJSON(LS.PRICES, prices);
        renderList();
        closeManage();
      });

      wrap.appendChild(grid);
      const spacer = document.createElement('div'); spacer.style.height = '12px';
      wrap.appendChild(spacer);
      wrap.appendChild(saveBtn);

      el.modalBody.appendChild(wrap);
      return;
    }

    if (manageTab === 'images') {
      const wrap = document.createElement('div');

      const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');

      dList.forEach(d => {
        const row = document.createElement('div');
        row.className = 'imgRow';

        const thumb = document.createElement('div');
        thumb.className = 'imgThumb';

        const src = dinoImages[d.id] || '';
        if (src) {
          const img = document.createElement('img');
          img.src = src;
          img.alt = d.name;
          thumb.appendChild(img);

          // タップで拡大
          thumb.addEventListener('click', () => openImageViewer(src));
        } else {
          thumb.style.display = 'flex';
          thumb.style.alignItems = 'center';
          thumb.style.justifyContent = 'center';
          thumb.style.color = 'rgba(255,255,255,.35)';
          thumb.style.fontWeight = '900';
          thumb.textContent = 'No Image';
        }

        const name = document.createElement('div');
        name.className = 'imgName';
        name.textContent = d.name;

        const btns = document.createElement('div');
        btns.className = 'imgBtns';

        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'primary';
        pick.textContent = '選択';

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'danger';
        del.textContent = '削除';

        const file = document.createElement('input');
        file.type = 'file';
        file.accept = 'image/*';
        file.style.display = 'none';

        pick.addEventListener('click', () => file.click());

        file.addEventListener('change', async () => {
          const f = file.files && file.files[0];
          if (!f) return;
          const dataUrl = await fileToDataUrl(f);
          dinoImages[d.id] = dataUrl;
          saveJSON(LS.DINO_IMAGES, dinoImages);
          renderManageBody();
        });

        del.addEventListener('click', async () => {
          if (!dinoImages[d.id]) return;
          const ok = await openConfirm(`「${d.name}」の画像を削除しますか？`);
          if (!ok) return;
          delete dinoImages[d.id];
          saveJSON(LS.DINO_IMAGES, dinoImages);
          renderManageBody();
        });

        btns.appendChild(pick);
        btns.appendChild(del);

        row.appendChild(thumb);
        row.appendChild(name);
        row.appendChild(btns);
        row.appendChild(file);

        wrap.appendChild(row);
      });

      el.modalBody.appendChild(wrap);
      return;
    }

    // catalog
    const kind = activeTab;
    const wrap = document.createElement('div');

    const addBtn = document.createElement('button');
    addBtn.className = 'primary';
    addBtn.type = 'button';
    addBtn.textContent = '追加';
    addBtn.addEventListener('click', () => openEdit({ mode: 'add', kind }));

    const sortBtn = document.createElement('button');
    sortBtn.className = 'primary';
    sortBtn.type = 'button';
    sortBtn.textContent = '50音並び替え';
    sortBtn.style.marginLeft = '10px';
    sortBtn.addEventListener('click', () => {
      if (kind === 'dino') {
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
      renderManageBody();
    });

    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.gap = '10px';
    bar.style.marginBottom = '12px';
    bar.appendChild(addBtn);
    bar.appendChild(sortBtn);
    wrap.appendChild(bar);

    const list = (kind === 'dino')
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    list.forEach(obj => {
      const r = document.createElement('div');
      r.className = 'mRow';

      const n = document.createElement('div');
      n.className = 'mName';
      n.textContent = obj.name;

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

      up.addEventListener('click', () => moveOrder(kind, obj.id, -1));
      down.addEventListener('click', () => moveOrder(kind, obj.id, +1));
      edit.addEventListener('click', () => openEdit({ mode: 'edit', kind, id: obj.id }));
      del.addEventListener('click', async () => {
        const ok = await openConfirm(`「${obj.name}」を削除しますか？`);
        if (!ok) return;

        if (kind === 'dino') {
          hidden.dino.add(obj.id);
          saveJSON(LS.DINO_HIDDEN, Array.from(hidden.dino));
        } else {
          hidden.item.add(obj.id);
          saveJSON(LS.ITEM_HIDDEN, Array.from(hidden.item));
        }
        renderList();
        renderManageBody();
      });

      r.appendChild(n);
      r.appendChild(up);
      r.appendChild(down);
      r.appendChild(edit);
      r.appendChild(del);
      wrap.appendChild(r);
    });

    el.modalBody.appendChild(wrap);
  }

  function moveOrder(kind, id, delta) {
    const ord = (order[kind] || []).slice();
    const i = ord.indexOf(id);
    if (i === -1) return;
    const ni = i + delta;
    if (ni < 0 || ni >= ord.length) return;
    [ord[i], ord[ni]] = [ord[ni], ord[i]];
    order[kind] = ord;
    saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
    renderList();
    renderManageBody();
  }

  /* ========= edit modal ========= */
  function openEdit({ mode, kind, id }) {
    el.editOverlay.classList.remove('isHidden');
    el.editOverlay.setAttribute('aria-hidden', 'false');
    rememberScrollLock(true);

    el.editBody.innerHTML = '';
    el.editTitle.textContent = mode === 'add' ? '追加' : '編集';

    const form = document.createElement('div');
    form.className = 'form';

    if (kind === 'dino') {
      const obj = mode === 'edit' ? dinos.find(x => x.id === id) : null;

      const f1 = document.createElement('div');
      f1.className = 'field';
      f1.innerHTML = `<label>名前</label><input id="eName" type="text" value="${obj?.name || ''}" placeholder="例：カルカロ">`;

      const f2 = document.createElement('div');
      f2.className = 'field';
      f2.innerHTML = `<label>デフォルト</label><select id="eDef">${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}</select>`;

      form.appendChild(f1);
      form.appendChild(f2);

      $('#eDef', form).value = obj?.defType || '受精卵';

      const btns = document.createElement('div');
      btns.className = 'formBtns';

      const save = document.createElement('button');
      save.className = 'primary';
      save.type = 'button';
      save.textContent = '保存';

      const cancel = document.createElement('button');
      cancel.className = 'ghost';
      cancel.type = 'button';
      cancel.textContent = 'キャンセル';

      save.addEventListener('click', () => {
        const name = $('#eName', form).value.trim();
        const defType = $('#eDef', form).value;
        if (!name) return;

        if (mode === 'add') {
          const newId = 'd_c_' + uid();
          custom.dino.push({ id: newId, name, defType });
          saveJSON(LS.DINO_CUSTOM, custom.dino);
        } else {
          if (!obj) return;
          obj.name = name;
          obj.defType = defType;

          const c = custom.dino.find(x => x.id === obj.id);
          if (c) { c.name = name; c.defType = defType; }
          else custom.dino.push({ id: obj.id, name, defType });
          saveJSON(LS.DINO_CUSTOM, custom.dino);
        }

        init().then(() => {
          closeEdit();
          renderManageBody();
        });
      });

      cancel.addEventListener('click', closeEdit);

      btns.appendChild(save);
      btns.appendChild(cancel);
      form.appendChild(btns);
    } else {
      const obj = mode === 'edit' ? items.find(x => x.id === id) : null;

      const f1 = document.createElement('div');
      f1.className = 'field';
      f1.innerHTML = `<label>名前</label><input id="eName" type="text" value="${obj?.name || ''}" placeholder="例：TEK天井">`;

      const f2 = document.createElement('div');
      f2.className = 'field';
      f2.innerHTML = `<label>個数単位</label><input id="eUnit" type="number" inputmode="numeric" value="${obj?.unit ?? ''}" placeholder="例：100">`;

      const f3 = document.createElement('div');
      f3.className = 'field';
      f3.innerHTML = `<label>単価</label><input id="ePrice" type="number" inputmode="numeric" value="${obj?.price ?? ''}" placeholder="例：100">`;

      form.appendChild(f1);
      form.appendChild(f2);
      form.appendChild(f3);

      const btns = document.createElement('div');
      btns.className = 'formBtns';

      const save = document.createElement('button');
      save.className = 'primary';
      save.type = 'button';
      save.textContent = '保存';

      const cancel = document.createElement('button');
      cancel.className = 'ghost';
      cancel.type = 'button';
      cancel.textContent = 'キャンセル';

      save.addEventListener('click', () => {
        const name = $('#eName', form).value.trim();
        const unit = Number($('#eUnit', form).value || 0);
        const price = Number($('#ePrice', form).value || 0);
        if (!name || !Number.isFinite(unit) || !Number.isFinite(price)) return;

        if (mode === 'add') {
          const newId = 'i_c_' + uid();
          custom.item.push({ id: newId, name, unit, price });
          saveJSON(LS.ITEM_CUSTOM, custom.item);
        } else {
          if (!obj) return;
          obj.name = name;
          obj.unit = unit;
          obj.price = price;

          const c = custom.item.find(x => x.id === obj.id);
          if (c) { c.name = name; c.unit = unit; c.price = price; }
          else custom.item.push({ id: obj.id, name, unit, price });
          saveJSON(LS.ITEM_CUSTOM, custom.item);
        }

        init().then(() => {
          closeEdit();
          renderManageBody();
        });
      });

      cancel.addEventListener('click', closeEdit);

      btns.appendChild(save);
      btns.appendChild(cancel);
      form.appendChild(btns);
    }

    el.editBody.appendChild(form);
  }

  function closeEdit() {
    el.editOverlay.classList.add('isHidden');
    el.editOverlay.setAttribute('aria-hidden', 'true');
    el.editBody.innerHTML = '';
    rememberScrollLock(false);
  }

  el.editClose.addEventListener('click', closeEdit);
  el.editOverlay.addEventListener('click', (e) => { if (e.target === el.editOverlay) closeEdit(); });

  /* ========= file -> dataURL ========= */
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  /* ========= init ========= */
  async function init() {
    // fetch base lists
    const dinoText = await fetchTextSafe('dinos.txt');
    const itemText = await fetchTextSafe('items.txt');

    const parsedDinos = dinoText.split('\n').map(parseDinoLine).filter(Boolean);
    const parsedItems = itemText.split('\n').map(parseItemLine).filter(Boolean);

    // merge with custom
    dinos = [
      ...parsedDinos,
      ...custom.dino.map(x => ({ id: x.id, name: x.name, defType: x.defType || '受精卵', kind: 'dino' })),
    ];
    items = [
      ...parsedItems,
      ...custom.item.map(x => ({ id: x.id, name: x.name, unit: x.unit, price: x.price, kind: 'item' })),
    ];

    ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');

    // ensure state maps for base (not for dup)
    dinos.forEach(d => ensureDinoState(d.id, d.defType));
    items.forEach(it => ensureItemState(it.id));

    renderList();
  }

  // start
  init();
})();