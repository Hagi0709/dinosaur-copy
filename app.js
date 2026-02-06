(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
  const toHira = (s) => (s || '').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const norm = (s) => toHira(String(s || '').toLowerCase()).replace(/\s+/g, '');

  function stableHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  function stableId(prefix, name) {
    const key = norm(name);
    return `${prefix}_${stableHash(key)}`;
  }
  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /* ========= localStorage keys ========= */
  const LS = {
    DINO_CUSTOM: 'dino_custom_v1',
    ITEM_CUSTOM: 'item_custom_v1',
    DINO_HIDDEN: 'dino_hidden_v1',
    ITEM_HIDDEN: 'item_hidden_v1',
    DINO_ORDER: 'dino_order_v1',
    ITEM_ORDER: 'item_order_v1',
    PRICES: 'prices_v1',
    DELIVERY: 'delivery_v1',

    // 旧：画像(localStorage)
    DINO_IMAGES_OLD: 'dino_images_v1',

    DINO_OVERRIDE: 'dino_override_v1',

    // ROOM
    ROOM_ENTRY_PW: 'room_entry_pw_v1',
    ROOM_PW: 'room_pw_v1',
  };

  const loadJSON = (k, fb) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fb;
    } catch {
      return fb;
    }
  };

  function saveJSON(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      openToast('保存に失敗しました（容量オーバー等）');
      return false;
    }
  }

  /* ========= toast ========= */
  let toastTimer = null;
  function openToast(text) {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.position = 'fixed';
      t.style.left = '50%';
      t.style.bottom = '18px';
      t.style.transform = 'translateX(-50%)';
      t.style.zIndex = '9999';
      t.style.padding = '10px 12px';
      t.style.borderRadius = '14px';
      t.style.border = '1px solid rgba(255,255,255,.14)';
      t.style.background = 'rgba(0,0,0,.55)';
      t.style.backdropFilter = 'blur(10px)';
      t.style.color = '#fff';
      t.style.fontWeight = '800';
      t.style.fontSize = '13px';
      t.style.maxWidth = '92vw';
      t.style.textAlign = 'center';
      t.style.whiteSpace = 'pre-wrap';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 1700);
  }

  /* ========= confirm modal ========= */
  let confirmResolve = null;
  function confirmAsk(text) {
    return new Promise((resolve) => {
      const ov = $('#confirmOverlay');
      const tx = $('#confirmText');
      if (!ov || !tx) return resolve(false);
      confirmResolve = resolve;
      tx.textContent = text || 'よろしいですか？';
      ov.classList.remove('isHidden');
    });
  }
  function confirmClose(val) {
    const ov = $('#confirmOverlay');
    if (!ov) return;
    ov.classList.add('isHidden');
    if (confirmResolve) {
      const r = confirmResolve;
      confirmResolve = null;
      r(!!val);
    }
  }
  $('#confirmCancel')?.addEventListener('click', () => confirmClose(false));
  $('#confirmOk')?.addEventListener('click', () => confirmClose(true));
  $('#confirmOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('#confirmOverlay')) confirmClose(false);
  });

  /* ========= IndexedDB (images) ========= */
  // ✅ 画像保存キーを「恐竜元名（dinos.txtの名前）由来」に固定する
  //    → app更新/編集/並び替えでも消えない
  const IDB = {
    DB_NAME: 'dino_list_db_v3',
    DB_VER: 1,
    STORE_IMAGES: 'images', // key: imageKey, value: dataUrl
  };

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB.DB_NAME, IDB.DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB.STORE_IMAGES)) {
          db.createObjectStore(IDB.STORE_IMAGES);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function idbGetAllImages() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB.STORE_IMAGES, 'readonly');
      const st = tx.objectStore(IDB.STORE_IMAGES);
      const out = {};
      const cur = st.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return resolve(out);
        out[c.key] = c.value;
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
  }

  async function idbPutImage(key, dataUrl) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB.STORE_IMAGES, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(IDB.STORE_IMAGES).put(dataUrl, key);
    });
  }

  async function idbDelImage(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB.STORE_IMAGES, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(IDB.STORE_IMAGES).delete(key);
    });
  }

  // ✅ 旧 localStorage の画像を IDBへ移行（1回だけ）
  async function migrateOldImagesIfAny() {
    const old = loadJSON(LS.DINO_IMAGES_OLD, null);
    if (!old || typeof old !== 'object') return;

    const keys = Object.keys(old);
    if (keys.length === 0) {
      localStorage.removeItem(LS.DINO_IMAGES_OLD);
      return;
    }

    // 旧形式は dinoId → dataURL なので、移行先キーが分からない
    // → ここでは「旧dinoId」をそのまま key として格納（互換枠）
    //    ※新形式の key と別物なので、旧データは“使えない可能性がある”が
    //      localStorage容量爆死の原因を消すのが目的
    try {
      for (const k of keys) {
        const v = old[k];
        if (typeof v === 'string' && v.startsWith('data:')) {
          await idbPutImage(`legacy_${k}`, v);
        }
      }
      localStorage.removeItem(LS.DINO_IMAGES_OLD);
      openToast('旧画像データを退避しました');
    } catch {
      openToast('旧画像の移行に失敗しました');
    }
  }

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
  // ✅ IDBロード後のキャッシュ（keyは imageKey）
  const imageCache = {}; // { [imageKey]: dataURL }
  const dinoOverride = Object.assign({}, loadJSON(LS.DINO_OVERRIDE, {}));

  // ✅ 画像キー：dinos.txtの元名（nameRaw）から作る
  function imageKeyFromBaseName(baseName) {
    return `img_${stableHash(norm(baseName))}`;
  }

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
    mTabImages: $('#mTabImages'),

    openRoom: $('#openRoom'),
    roomOverlay: $('#roomOverlay'),
    roomBody: $('#roomBody'),
    closeRoom: $('#closeRoom'),

    editOverlay: $('#editOverlay'),
    editBody: $('#editBody'),
    editTitle: $('#editTitle'),

    imgOverlay: $('#imgOverlay'),
    imgClose: $('#imgClose'),
    imgViewerImg: $('#imgViewerImg'),
  };

  /* ========= sanity (reset) ========= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    indexedDB.deleteDatabase(IDB.DB_NAME);
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
    dino: loadJSON(LS.DINO_CUSTOM, []),
    item: loadJSON(LS.ITEM_CUSTOM, []),
  };

  let dinos = [];
  let items = [];
  let activeTab = 'dino';

  const inputState = new Map();
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

    const id = stableId('d', nameRaw);
    const ov = dinoOverride[id];

    return {
      id,
      name: ov?.name || nameRaw,
      defType: ov?.defType || defType,
      kind: 'dino',
      _baseName: nameRaw, // ✅ 画像キーの元
    };
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

  // ✅ 幼体/成体には(指定)を付けない
  function autoSpecify(s) {
    const m = Number(s.m || 0), f = Number(s.f || 0);
    const base = String(s.type || '受精卵').replace('(指定)', '');
    const hasSpecified = /\(指定\)$/.test(String(s.type || ''));

    if (m > 0 && f > 0) {
      if (specifiedMap[base]) s.type = specifiedMap[base];
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

  /* ========= image DOM sync ========= */
  function getImageUrlForDino(d) {
    const k = imageKeyFromBaseName(d._baseName || d.name);
    return imageCache[k] || '';
  }
  function syncThumbInMainListByDino(d, dataUrl) {
    // メインの恐竜カードのサムネを“その場で”差し替える（再レンダリング依存を捨てる）
    const cards = $$(`[data-kind="dino"][data-did="${CSS.escape(d.id)}"]`, el.list);
    cards.forEach(card => {
      let wrap = $('.miniThumb', card);
      if (!wrap) {
        const nw = document.createElement('div');
        nw.className = 'miniThumb';
        nw.innerHTML = `<img alt="">`;
        $('.nameWrap', card)?.appendChild(nw);
        wrap = nw;
      }
      const im = $('img', wrap);
      if (im) im.src = dataUrl;
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
    card.dataset.did = d.id;

    const imgUrl = getImageUrlForDino(d);

    card.innerHTML = `
      <div class="cardInner">
        <div class="cardHead">
          <button class="cardToggle" type="button" aria-label="開閉" data-act="toggle"></button>

          <div class="nameWrap">
            <div class="name"></div>
            ${imgUrl ? `<div class="miniThumb"><img src="${imgUrl}" alt=""></div>` : ``}
          </div>

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
    if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
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
      if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
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

          <div class="nameWrap">
            <div class="name"></div>
          </div>

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
    el.mTabImages?.classList.toggle('isActive', kind === 'images');

    el.modalBody.innerHTML = '';
    if (kind === 'catalog') el.modalBody.appendChild(renderManageCatalog());
    if (kind === 'prices') el.modalBody.appendChild(renderManagePrices());
    if (kind === 'images') el.modalBody.appendChild(renderManageImages());
  }

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
      setManageTab('prices');
    });

    return box;
  }

  /* ========= manage: catalog ========= */
  function renderManageCatalog() {
    const wrap = document.createElement('div');

    const list = (activeTab === 'dino')
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    list.forEach(obj => {
      const r = document.createElement('div');
      r.className = 'mRow';
      r.innerHTML = `
        <div class="mName">${obj.name}</div>
        ${activeTab === 'dino' ? `<button class="sBtn" type="button" data-act="edit" data-id="${obj.id}">✎</button>` : ``}
        <button class="sBtn" type="button" data-act="up" data-id="${obj.id}">↑</button>
        <button class="sBtn" type="button" data-act="down" data-id="${obj.id}">↓</button>
        <button class="sBtn danger" type="button" data-act="del" data-id="${obj.id}">削除</button>
      `;
      wrap.appendChild(r);
    });

    wrap.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      const id = e.target?.dataset?.id;
      if (!act || !id) return;

      const kind = activeTab;
      const ord = (order[kind] || []).slice();
      const i = ord.indexOf(id);

      if (act === 'up' && i > 0) {
        [ord[i], ord[i - 1]] = [ord[i - 1], ord[i]];
        order[kind] = ord;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
        renderList();
        setManageTab('catalog');
        return;
      }

      if (act === 'down' && i !== -1 && i < ord.length - 1) {
        [ord[i], ord[i + 1]] = [ord[i + 1], ord[i]];
        order[kind] = ord;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
        renderList();
        setManageTab('catalog');
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
        setManageTab('catalog');
        return;
      }

      if (act === 'edit' && kind === 'dino') {
        openEditDino(id);
        return;
      }
    });

    return wrap;
  }

  function openEditDino(id) {
    const d = dinos.find(x => x.id === id);
    if (!d) return;

    const box = document.createElement('div');
    box.innerHTML = `
      <div class="editForm">
        <div class="editLabel">名前</div>
        <input id="editName" class="editInput" type="text" value="${escapeHtml(d.name)}" autocomplete="off">
        <div class="editLabel">デフォルト種類</div>
        <select id="editType" class="editSelect">
          ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <div class="editBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">保存</button>
        </div>
      </div>
    `;

    const sel = $('#editType', box);
    if (sel) sel.value = d.defType || '受精卵';

    openEditModal('追加 / 編集', box);

    box.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') {
        closeEditModal();
        return;
      }

      if (act === 'save') {
        const newName = ($('#editName', box)?.value || '').trim();
        const newDef = ($('#editType', box)?.value || '受精卵');
        if (!newName) return;

        const cIdx = custom.dino.findIndex(x => x.id === id);
        if (cIdx >= 0) {
          custom.dino[cIdx] = { id, name: newName, defType: newDef, _baseName: custom.dino[cIdx]._baseName || newName };
          saveJSON(LS.DINO_CUSTOM, custom.dino);
        } else {
          dinoOverride[id] = { name: newName, defType: newDef };
          saveJSON(LS.DINO_OVERRIDE, dinoOverride);
        }

        const di = dinos.findIndex(x => x.id === id);
        if (di >= 0) dinos[di] = Object.assign({}, dinos[di], { name: newName, defType: newDef });

        closeEditModal();
        renderList();
        setManageTab('catalog');
      }
    });
  }

  /* ========= Images tab (IndexedDB) ========= */
  async function fileToDataURLCompressed(file, maxW = 900, quality = 0.78) {
    const img = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = String(r.result || '');
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    const w0 = img.naturalWidth || img.width || 1;
    const h0 = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, maxW / w0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    return canvas.toDataURL('image/jpeg', quality);
  }

function renderManageImages() {
  const wrap = document.createElement('div');

  // ✅ 上部バー（画像出力ボタン）
  const topBar = document.createElement('div');
  topBar.style.display = 'flex';
  topBar.style.justifyContent = 'space-between';
  topBar.style.alignItems = 'center';
  topBar.style.gap = '10px';
  topBar.style.marginBottom = '12px';
  topBar.innerHTML = `
    <div style="font-weight:900;color:rgba(255,255,255,.85);">画像管理</div>
    <div style="display:flex;gap:10px;align-items:center;">
      <button id="imgExportAll" class="pill" type="button">画像出力</button>
    </div>
  `;
  wrap.appendChild(topBar);

  // 対象リスト（表示順）
  const list = sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino');

  // ========= Export gallery (生成結果をまとめて確認) =========
  function ensureExportOverlay() {
    let ov = document.getElementById('exportOverlay');
    if (ov) return ov;

    ov = document.createElement('div');
    ov.id = 'exportOverlay';
    ov.className = 'modalOverlay isHidden';
    ov.setAttribute('aria-hidden', 'true');

    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="画像出力結果">
        <div class="modalHead">
          <div class="modalTitle">画像出力（結果）</div>
          <button id="exportClose" class="iconBtn" type="button" aria-label="閉じる">×</button>
        </div>

        <div style="padding:0 14px 12px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
          <button id="exportSaveAll" class="pill" type="button">一括保存</button>
          <button id="exportClear" class="pill danger" type="button">クリア</button>
        </div>

        <div class="modalBody" id="exportBody" style="padding-top:0;">
          <!-- injected -->
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    // close
    ov.querySelector('#exportClose')?.addEventListener('click', () => closeExportOverlay());
    ov.addEventListener('click', (e) => {
      if (e.target === ov) closeExportOverlay();
    });

    // clear
    ov.querySelector('#exportClear')?.addEventListener('click', () => {
      exportResults.length = 0;
      renderExportResults();
      openToast('出力結果をクリアしました');
    });

    // bulk save
    ov.querySelector('#exportSaveAll')?.addEventListener('click', async () => {
      if (!exportResults.length) {
        openToast('保存する画像がありません');
        return;
      }
      // ⚠️ iOS Safariは連続ダウンロードをブロックすることがある
      // できるだけユーザー操作1回の流れで順番に保存を試みる
      const ok = confirm(`全${exportResults.length}枚を順番に保存します。\n※端末によっては複数保存がブロックされる場合があります。`);
      if (!ok) return;

      for (let i = 0; i < exportResults.length; i++) {
        const it = exportResults[i];
        downloadDataUrl(it.dataUrl, it.filename);
        // 少し間隔を空ける（ブロック回避）
        await new Promise(r => setTimeout(r, 450));
      }
      openToast('一括保存を開始しました');
    });

    return ov;
  }

  function openExportOverlay() {
    const ov = ensureExportOverlay();
    ov.classList.remove('isHidden');
  }
  function closeExportOverlay() {
    const ov = document.getElementById('exportOverlay');
    if (!ov) return;
    ov.classList.add('isHidden');
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename || 'export.png';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // 生成結果を保持（複数枚）
  const exportResults = []; // { dataUrl, filename, label }

  function renderExportResults() {
    const body = document.getElementById('exportBody');
    if (!body) return;

    body.innerHTML = '';

    if (!exportResults.length) {
      const empty = document.createElement('div');
      empty.style.color = 'rgba(255,255,255,.65)';
      empty.style.fontWeight = '800';
      empty.textContent = 'まだ出力がありません。「画像出力」から生成してください。';
      body.appendChild(empty);
      return;
    }

    // グリッド（見やすいサムネ一覧）
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gap = '12px';

    exportResults.forEach((it, idx) => {
      const card = document.createElement('div');
      card.style.border = '1px solid rgba(255,255,255,.12)';
      card.style.borderRadius = '18px';
      card.style.background = 'rgba(0,0,0,.18)';
      card.style.overflow = 'hidden';

      card.innerHTML = `
        <div style="padding:12px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
          <div style="font-weight:950;">${escapeHtml(it.label || `出力 ${idx + 1}`)}</div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="pill" type="button" data-act="save" data-idx="${idx}">保存</button>
            <button class="pill" type="button" data-act="view" data-idx="${idx}">拡大</button>
          </div>
        </div>
        <div style="padding:0 12px 12px;">
          <img src="${it.dataUrl}" alt="" style="width:100%;height:auto;display:block;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:#000;">
        </div>
      `;
      grid.appendChild(card);
    });

    grid.addEventListener('click', (e) => {
      const btn = e.target?.closest('button');
      const act = btn?.dataset?.act;
      const idx = Number(btn?.dataset?.idx);
      if (!act || !Number.isFinite(idx)) return;
      const it = exportResults[idx];
      if (!it) return;

      if (act === 'save') {
        downloadDataUrl(it.dataUrl, it.filename);
        openToast('保存を開始しました');
      }
      if (act === 'view') {
        openImgViewer(it.dataUrl);
      }
    });

    body.appendChild(grid);
  }

  // ========= dataURL画像読み込み =========
  function loadImg(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }

  // ✅ 画像合成（黒背景・縦横指定・上から順に詰める・未設定はスキップ）
  async function buildGridDataUrl(srcs, rows, cols) {
    const ims = [];
    for (const s of srcs) {
      const im = await loadImg(s);
      if (im) ims.push(im);
      if (ims.length >= rows * cols) break;
    }
    if (!ims.length) return '';

    // セルサイズ（2:1）
    const cellW = 640;
    const cellH = 320;
    const gap = 8;
    const pad = 8;

    const outW = cols * cellW + (cols - 1) * gap + pad * 2;
    const outH = rows * cellH + (rows - 1) * gap + pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    // 背景黒
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);

    // 左→右、上→下
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (idx >= ims.length) break;
        const im = ims[idx++];

        const x = pad + c * (cellW + gap);
        const y = pad + r * (cellH + gap);

        // cover
        const iw = im.naturalWidth || im.width || 1;
        const ih = im.naturalHeight || im.height || 1;
        const targetRatio = cellW / cellH;
        const imgRatio = iw / ih;

        let sx = 0, sy = 0, sw = iw, sh = ih;
        if (imgRatio > targetRatio) {
          sw = ih * targetRatio;
          sx = (iw - sw) / 2;
        } else {
          sh = iw / targetRatio;
          sy = (ih - sh) / 2;
        }

        ctx.drawImage(im, sx, sy, sw, sh, x, y, cellW, cellH);
      }
    }

    return canvas.toDataURL('image/png', 1.0);
  }

  // ✅ 全画像が尽きるまでページ生成（複数生成に対応）
  async function exportAllPages(rows, cols) {
    const perPage = rows * cols;

    // 全画像srcを上から順に集める（未設定はスキップ）
    const allSrcs = [];
    for (const d of list) {
      const u = getImageUrlForDino(d);
      if (u) allSrcs.push(u);
    }

    if (!allSrcs.length) {
      alert('画像が1枚も設定されていません。');
      return;
    }

    // ページ分割して生成
    const pages = [];
    for (let i = 0; i < allSrcs.length; i += perPage) {
      pages.push(allSrcs.slice(i, i + perPage));
    }

    exportResults.length = 0;

    openToast(`生成中…（${pages.length}枚）`);

    for (let p = 0; p < pages.length; p++) {
      const dataUrl = await buildGridDataUrl(pages[p], rows, cols);
      if (!dataUrl) continue;

      const pageNo = String(p + 1).padStart(2, '0');
      const filename = `dino_export_${rows}x${cols}_p${pageNo}.png`;
      exportResults.push({
        dataUrl,
        filename,
        label: `${rows}×${cols} 出力 ${p + 1} / ${pages.length}`,
      });
    }

    openExportOverlay();
    renderExportResults();
    openToast(`生成完了：${exportResults.length}枚`);
  }

  // ✅ 出力ボタン
  topBar.querySelector('#imgExportAll')?.addEventListener('click', async () => {
    const rows = parseInt(prompt('縦は何枚？（例：5）', '5') || '', 10);
    const cols = parseInt(prompt('横は何枚？（例：2）', '2') || '', 10);

    if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
      alert('縦・横は1以上の数字で入力してください。');
      return;
    }
    await exportAllPages(rows, cols);
  });

  // ========= 画像一覧（IndexedDB） =========
  list.forEach(d => {
    const row = document.createElement('div');
    row.className = 'imgRow';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    const key = imageKeyFromBaseName(d._baseName || d.name);
    const url = imageCache[key] || '';
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

      try {
        const dataUrl = await fileToDataURLCompressed(f, 900, 0.78);
        imageCache[key] = dataUrl;
        await idbPutImage(key, dataUrl);

        thumb.innerHTML = `<img src="${dataUrl}" alt="">`;

        // ✅ メインにも即反映
        syncThumbInMainListByDino(d, dataUrl);

        openToast('画像を保存しました');
      } catch {
        openToast('画像の保存に失敗しました');
      } finally {
        file.value = '';
      }
    });

    del.addEventListener('click', async () => {
      const ok = await confirmAsk('画像を削除しますか？');
      if (!ok) return;

      try {
        delete imageCache[key];
        await idbDelImage(key);
        thumb.textContent = 'No Image';

        // メインは確実に再描画
        renderList();

        openToast('画像を削除しました');
      } catch {
        openToast('削除に失敗しました');
      }
    });

    thumb.addEventListener('click', () => {
      const u = imageCache[key];
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

  /* ========= ROOM ========= */
  function hasEggOrEmbryoSelected() {
    const targets = new Set(['受精卵', '受精卵(指定)', '胚', '胚(指定)']);
    for (const s of inputState.values()) {
      if (!s || typeof s !== 'object') continue;
      if (!('m' in s) || !('f' in s) || !('type' in s)) continue;

      const qty = Number(s.m || 0) + Number(s.f || 0);
      if (qty <= 0) continue;

      const t = String(s.type || '').trim();
      if (targets.has(t)) return true;
    }
    return false;
  }

  let entryPw = loadJSON(LS.ROOM_ENTRY_PW, '2580');
  let roomPw = loadJSON(LS.ROOM_PW, {
    ROOM1: '5412',
    ROOM2: '0000',
    ROOM3: '0000',
    ROOM4: '0000',
    ROOM5: '0000',
    ROOM6: '0000',
    ROOM7: '0000',
    ROOM8: '0000',
    ROOM9: '0000',
  });

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function roomLabelForSentence(room) {
    const n = Number(String(room).replace('ROOM', '')) || 0;
    if (n >= 5) return `2階${room}`;
    return room;
  }

  function buildCopyText(room) {
    const warn = hasEggOrEmbryoSelected()
      ? `

⚠️受精卵はサバイバーのインベントリに入れての転送をしないと消えてしまうバグがあるためご注意してください！`
      : '';

    const roomText = roomLabelForSentence(room);

    return `納品が完了しましたのでご連絡させて頂きます。以下の場所まで受け取りよろしくお願いします🙏🏻

サーバー番号 : 5041 (アイランド)
座標 : 87 / 16 (西部2、赤オベ付近)
入口パスワード【${entryPw}】
${roomText}の方にパスワード【${roomPw[room]}】で入室をして頂き、冷蔵庫より受け取りお願いします。${warn}`;
  }

  function renderRooms() {
    if (!el.roomBody) return;
    el.roomBody.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '12px';

    const entry = document.createElement('div');
    entry.className = 'mRow';
    entry.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-weight:950;margin-bottom:6px;">入口パスワード（全ルーム共通）</div>
        <input id="entryPw" value="${escapeHtml(entryPw)}"
          style="width:100%;height:44px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;padding:0 12px;font-weight:900;">
      </div>
      <button id="saveEntry" class="pill" type="button" style="height:44px;align-self:center;">保存</button>
    `;
    wrap.appendChild(entry);

    entry.querySelector('#saveEntry').onclick = () => {
      entryPw = (entry.querySelector('#entryPw').value || '').trim() || entryPw;
      saveJSON(LS.ROOM_ENTRY_PW, entryPw);
      openToast('入口パスワードを保存しました');
    };

    Object.keys(roomPw).forEach(room => {
      const row = document.createElement('div');
      row.className = 'mRow';
      row.innerHTML = `
        <div class="mName">${room}</div>
        <div style="display:flex;gap:10px;align-items:center;flex:0 0 auto;">
          <button class="pill" style="width:110px;height:40px;" data-act="copy" data-room="${room}" type="button">コピー</button>
          <button class="pill" style="width:110px;height:40px;" data-act="pw" data-room="${room}" type="button">PW変更</button>
        </div>
      `;
      wrap.appendChild(row);
    });

    wrap.addEventListener('click', async (e) => {
      const btn = e.target?.closest('button');
      const act = btn?.dataset?.act;
      const room = btn?.dataset?.room;
      if (!act || !room) return;

      if (act === 'copy') {
        await copyText(buildCopyText(room));
        const prev = btn.textContent;
        btn.textContent = 'コピー済';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 900);
      }

      if (act === 'pw') {
        const npw = prompt(`${room} のパスワードを入力`, roomPw[room]);
        if (!npw) return;
        roomPw[room] = npw;
        saveJSON(LS.ROOM_PW, roomPw);
        openToast(`${room} のPWを保存しました`);
      }
    });

    el.roomBody.appendChild(wrap);
  }

  function openRoom() {
    if (!el.roomOverlay) return;
    el.roomOverlay.classList.remove('isHidden');
    renderRooms();
  }
  function closeRoom() {
    if (!el.roomOverlay) return;
    el.roomOverlay.classList.add('isHidden');
    if (el.roomBody) el.roomBody.innerHTML = '';
  }

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
  el.mTabImages?.addEventListener('click', () => setManageTab('images'));

  el.openRoom?.addEventListener('click', openRoom);
  el.closeRoom?.addEventListener('click', closeRoom);
  el.roomOverlay?.addEventListener('click', (e) => {
    if (e.target === el.roomOverlay) closeRoom();
  });

  /* ========= init ========= */
  async function init() {
    await migrateOldImagesIfAny();

    // ✅ IDB画像ロード
    try {
      const all = await idbGetAllImages();
      Object.keys(all).forEach(k => { imageCache[k] = all[k]; });
    } catch {
      openToast('画像DBの読み込みに失敗しました');
    }

    const dText = await fetchTextSafe('./dinos.txt');
    const iText = await fetchTextSafe('./items.txt');

    const baseD = dText.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
    const baseI = iText.split(/\r?\n/).map(parseItemLine).filter(Boolean);

    // customは _baseName を持てない場合があるので name を仮ベースに
    dinos = baseD.concat(custom.dino.map(x => ({
      id: x.id,
      name: x.name,
      defType: x.defType,
      kind: 'dino',
      _baseName: x._baseName || x.name,
    })));

    items = baseI.concat(custom.item.map(x => ({ id: x.id, name: x.name, unit: x.unit, price: x.price, kind: 'item' })));

    ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');

    setTab('dino');
  }

  init();
})();