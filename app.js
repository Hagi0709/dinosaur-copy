(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';

  const toHira = (s) => (s || '').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const norm = (s) => toHira(String(s || '').toLowerCase()).replace(/\s+/g, '');

  // ✅ TEKは「TEK以降」を比較キーに使う（五十音ソート用）
  const stripTEK = (name) => {
    const s = String(name || '').trim();
    return s.startsWith('TEK') ? s.slice(3).trim() : s;
  };

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

  /* ========= circled numbers ========= */
  const circled = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return String(n);
    if (x >= 1 && x <= 20) return String.fromCharCode(0x2460 + (x - 1));      // ①..⑳
    if (x >= 21 && x <= 35) return String.fromCharCode(0x3251 + (x - 21));     // ㉑..㉟
    return String(n);
  };

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

    DINO_IMAGES_OLD: 'dino_images_v1', // 旧：画像(localStorage)

    DINO_OVERRIDE: 'dino_override_v1',

    ROOM_ENTRY_PW: 'room_entry_pw_v1',
    ROOM_PW: 'room_pw_v1',

    SPECIAL_CFG: 'special_cfg_v1',

    // ✅ V3: 入力状態（複製も含めてここにまとめる）
    STATE_V3: 'state_v3',
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
  const IDB = {
    DB_NAME: 'dino_list_db_v3',
    DB_VER: 1,
    STORE_IMAGES: 'images',
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
  async function migrateOldImagesIfAny() {
    const old = loadJSON(LS.DINO_IMAGES_OLD, null);
    if (!old || typeof old !== 'object') return;

    const keys = Object.keys(old);
    if (keys.length === 0) {
      localStorage.removeItem(LS.DINO_IMAGES_OLD);
      return;
    }

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

  /* ========= special cfg ========= */
  // cfg: { enabled: true, max: 16, unit: 300, all: 3000, allowSex: false }
  const specialCfg = Object.assign({}, loadJSON(LS.SPECIAL_CFG, {}));
  function getSpecialCfgForDino(d) {
    if (specialCfg[d.id]?.enabled) return specialCfg[d.id];
    const base = String(d._baseName || d.name || '').trim();
    const name = String(d.name || '').trim();
    if (base === 'ガチャ' || name === 'ガチャ') {
      return { enabled: true, max: 16, unit: 300, all: 3000, allowSex: false };
    }
    return null;
  }

  /* ========= images ========= */
  const imageCache = {};
  const dinoOverride = Object.assign({}, loadJSON(LS.DINO_OVERRIDE, {}));
  function imageKeyFromBaseName(baseName) {
    return `img_${stableHash(norm(baseName))}`;
  }
  function getImageUrlForDino(d) {
    const k = imageKeyFromBaseName(d._baseName || d.name);
    return imageCache[k] || '';
  }
  function syncThumbInMainListByDino(d, dataUrl) {
    const cards = $$(`[data-kind="dino"][data-did="${CSS.escape(d.id)}"]`, el.list);
    cards.forEach(card => {
      let wrap = $('.miniThumb', card);
      if (!wrap && dataUrl) {
        const nw = document.createElement('div');
        nw.className = 'miniThumb';
        nw.innerHTML = `<img alt="">`;
        $('.nameWrap', card)?.appendChild(nw);
        wrap = nw;
      }
      if (!wrap) return;

      const im = $('img', wrap);
      if (im) {
        if (dataUrl) im.src = dataUrl;
        else im.removeAttribute('src');
      }
      if (!dataUrl) wrap.remove();
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

  /* ========= V3 state ========= */
  const state = loadJSON(LS.STATE_V3, {});
  function saveState() { saveJSON(LS.STATE_V3, state); }

  function ensureDinoState(cardKey, d, spCfg) {
    if (!state[cardKey]) {
      state[cardKey] = {
        kind: 'dino',
        baseId: d.id,
        dinoId: d.id,
        type: d.defType || '受精卵',
        m: 0,
        f: 0,
        spEnabled: !!(spCfg?.enabled),
        spAll: false,
        picks: [],
      };
    } else {
      const s = state[cardKey];
      s.kind = 'dino';
      s.baseId = s.baseId || d.id;
      s.dinoId = d.id;
      if (typeof s.type !== 'string') s.type = d.defType || '受精卵';
      if (typeof s.m !== 'number') s.m = 0;
      if (typeof s.f !== 'number') s.f = 0;
      if (typeof s.spEnabled !== 'boolean') s.spEnabled = !!(spCfg?.enabled);
      if (typeof s.spAll !== 'boolean') s.spAll = false;
      if (!Array.isArray(s.picks)) s.picks = [];
    }
    return state[cardKey];
  }
  function ensureItemState(cardKey, it) {
    if (!state[cardKey]) {
      state[cardKey] = { kind: 'item', baseId: it.id, itemId: it.id, qty: 0 };
    } else {
      const s = state[cardKey];
      s.kind = 'item';
      s.baseId = s.baseId || it.id;
      s.itemId = it.id;
      if (typeof s.qty !== 'number') s.qty = 0;
    }
    return state[cardKey];
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
    if (m === 0 && f === 0 && hasSpecified) s.type = base;
  }

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
      _baseName: nameRaw,
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

  /* ========= Collapse/Search ========= */
  function getQtyForCardKey(cardKey) {
    const s = state[cardKey];
    if (!s) return 0;
    if (s.kind === 'item') return Number(s.qty || 0);

    const normalQty = Number(s.m || 0) + Number(s.f || 0);
    const specialQty = s.spAll ? 1 : (Array.isArray(s.picks) ? s.picks.length : 0);
    return Math.max(normalQty, specialQty);
  }

  function applyCollapseAndSearch() {
    const q = norm(el.q.value);
    $$('[data-card="1"]', el.list).forEach(card => {
      const name = card.dataset.name || '';
      const show = !q || norm(name).includes(q);
      card.style.display = show ? '' : 'none';

      const key = card.dataset.key;
      const qty = getQtyForCardKey(key);
      const collapsed = q ? !show : (qty === 0);
      card.classList.toggle('isCollapsed', collapsed);
    });
  }

  /* ========= Toggle hit area (左側ほぼ全部) ========= */
  function installLeftToggleHit(card, rightCut = 170) {
    const head = $('.cardHead', card);
    const toggle = $('.cardToggle', card);
    if (!head || !toggle) return;

    toggle.style.inset = 'auto';
    toggle.style.left = '-12px';
    toggle.style.top = '-12px';
    toggle.style.bottom = '-12px';
    toggle.style.width = `calc(100% - ${rightCut}px)`;
    toggle.style.height = 'calc(100% + 24px)';
    toggle.style.zIndex = '5';
    toggle.style.pointerEvents = 'auto';
  }

  /* ========= Output build ========= */
  function buildLineForDinoState(d, s, spCfg) {
    const type = s.type || d.defType || '受精卵';
    const m = Number(s.m || 0);
    const f = Number(s.f || 0);
    const qty = m + f;

    const spOn = !!(spCfg?.enabled) && !!s.spEnabled;
    const unitPriceSp = Number(spCfg?.unit || 0);
    const allPrice = Number(spCfg?.all || 0);

    const parts = [];
    let sum = 0;

    if (qty > 0) {
      const unit = prices[type] || 0;
      const price = unit * qty;
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
      parts.push(line);
    }

    if (spOn) {
      if (s.spAll) {
        const price = allPrice;
        if (price > 0) {
          sum += price;
          parts.push(`${d.name}全種 = ${price.toLocaleString('ja-JP')}円`);
        }
      } else {
        const picks = Array.isArray(s.picks) ? s.picks : [];
        if (picks.length > 0) {
          const price = picks.length * unitPriceSp;
          sum += price;
          const seq = picks.map(n => circled(n)).join('');
          parts.push(`${d.name}${seq} = ${price.toLocaleString('ja-JP')}円`);
        }
      }
    }

    return { lines: parts, sum };
  }

  function rebuildOutput() {
    const lines = [];
    let sum = 0;
    let idx = 1;

    const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    for (const d of dList) {
      const keys = Object.keys(state).filter(k => state[k]?.kind === 'dino' && state[k]?.dinoId === d.id);
      if (!keys.includes(d.id)) keys.unshift(d.id);

      const sp = getSpecialCfgForDino(d);

      for (const k of keys) {
        const s = state[k];
        if (!s) continue;

        const r = buildLineForDinoState(d, s, sp);
        if (!r.lines.length) continue;
        sum += r.sum;

        for (const ln of r.lines) {
          lines.push(`${idx}. ${ln}`);
          idx++;
        }
      }
    }

    const iList = sortByOrder(items.filter(it => !hidden.item.has(it.id)), 'item');
    for (const it of iList) {
      const s = state[it.id];
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

  /* ========= cards ========= */
  function buildDinoCard(d, cardKey) {
    const sp = getSpecialCfgForDino(d);
    const key = cardKey || d.id;
    const s = ensureDinoState(key, d, sp);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.key = key;
    card.dataset.name = d.name;
    card.dataset.kind = 'dino';
    card.dataset.did = d.id;

    const imgUrl = getImageUrlForDino(d);

    // ✅ UIを以前の形へ：cardPreview（カード内出力表示）を撤去
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

        <div class="controls normalControls">
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

        <div class="controls specialControls" style="display:none;">
          <div class="gWrap" style="width:100%;">
            <div class="gHead" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
              <div class="gMeta" style="font-weight:950;color:rgba(255,255,255,.7);">特殊入力</div>
              <div class="gMeta2" style="font-weight:950;color:rgba(255,255,255,.7);">1体=${Number(sp?.unit||0)}円 / 全種=${Number(sp?.all||0).toLocaleString('ja-JP')}円</div>
            </div>

            <div class="gGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;"></div>

            <div style="display:flex;gap:12px;align-items:center;margin-top:14px;flex-wrap:wrap;">
              <button class="dupBtn" type="button" data-act="sp-undo" style="min-width:120px;background:rgba(185,74,85,.22);border-color:rgba(185,74,85,.35);">− 取消</button>
              <button class="dupBtn" type="button" data-act="sp-all" style="min-width:120px;">全種</button>
              <button class="dupBtn" type="button" data-act="dup" style="min-width:120px;">複製</button>

              <div style="flex:1;min-width:220px;color:rgba(255,255,255,.7);font-weight:900;">
                <div class="gLine">入力：<span class="gInput">(未入力)</span></div>
                <div class="gLine">小計：<span class="gSum">0円</span></div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    $('.name', card).textContent = d.name;

    // ✅ 左側ほぼ全部で折りたたみ（右のselectは邪魔しない）
    installLeftToggleHit(card, 170);

    const sel = $('.type', card);
    sel.innerHTML = typeList.map(t => `<option value="${t}">${t}</option>`).join('');
    if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
    sel.value = s.type;

    const unit = $('.unit', card);
    unit.textContent = `単価${prices[s.type] || 0}円`;

    const mEl = $('.js-m', card);
    const fEl = $('.js-f', card);

    // special elements
    const spWrap = $('.specialControls', card);
    const grid = $('.gGrid', card);
    const inputEl = $('.gInput', card);
    const sumEl = $('.gSum', card);
    const allBtn = $('button[data-act="sp-all"]', card);

    function syncNormalUI() {
      if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
      sel.value = s.type;
      unit.textContent = `単価${prices[s.type] || 0}円`;
      mEl.textContent = String(s.m || 0);
      fEl.textContent = String(s.f || 0);

      if (!el.q.value.trim()) {
        const q = getQtyForCardKey(key);
        card.classList.toggle('isCollapsed', q === 0);
      }
    }

    function syncSpecialUI() {
      if (!spWrap) return;
      if (!(sp?.enabled) || !s.spEnabled) {
        spWrap.style.display = 'none';
        return;
      }
      spWrap.style.display = 'block';

      const maxN = Math.max(1, Math.min(60, Number(sp.max || 16)));
      const unitPrice = Number(sp.unit || 0);
      const allPrice = Number(sp.all || 0);

      if (grid && grid.childElementCount === 0) {
        const frag = document.createDocumentFragment();
        for (let i = 1; i <= maxN; i++) {
          const b = document.createElement('button');
          b.className = 'gBtn';
          b.type = 'button';
          b.dataset.act = 'sp-pick';
          b.dataset.n = String(i);
          b.textContent = String(i);
          frag.appendChild(b);
        }
        grid.appendChild(frag);
      }

      const picks = Array.isArray(s.picks) ? s.picks : [];
      if (s.spAll) {
        if (inputEl) inputEl.textContent = '全種';
        if (sumEl) sumEl.textContent = yen(allPrice);
        if (allBtn) allBtn.textContent = '全種✓';
      } else {
        if (inputEl) inputEl.textContent = picks.length ? picks.map(n => circled(n)).join('') : '(未入力)';
        if (sumEl) sumEl.textContent = yen(picks.length * unitPrice);
        if (allBtn) allBtn.textContent = '全種';
      }

      if (!el.q.value.trim()) {
        const q = getQtyForCardKey(key);
        card.classList.toggle('isCollapsed', q === 0);
      }
    }

    // initial
    syncNormalUI();
    syncSpecialUI();

    // ✅ select を押しても折りたたまれない
    sel.addEventListener('click', (ev) => ev.stopPropagation());
    sel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    sel.addEventListener('change', (ev) => {
      ev.stopPropagation();
      s.type = sel.value;
      autoSpecify(s);
      saveState();
      syncNormalUI();
      rebuildOutput();
      applyCollapseAndSearch();
    });

    // toggle（出力エリア強制表示は “戻す” ので削除）
    $('.cardToggle', card).addEventListener('click', (ev) => {
      ev.preventDefault();
      if (el.q.value.trim()) return;
      card.classList.toggle('isCollapsed');
    });

    function step(sex, delta) {
      if (sex === 'm') s.m = Math.max(0, Number(s.m || 0) + delta);
      if (sex === 'f') s.f = Math.max(0, Number(s.f || 0) + delta);
      autoSpecify(s);
      saveState();
      syncNormalUI();
      rebuildOutput();
      applyCollapseAndSearch();
    }

    function dupCard() {
      const dupKey = `${d.id}__dup_${uid()}`;
      const clone = JSON.parse(JSON.stringify(s));
      state[dupKey] = clone;
      saveState();

      const dup = buildDinoCard(d, dupKey);
      card.after(dup);
      rebuildOutput();
      applyCollapseAndSearch();
    }

    card.addEventListener('click', (ev) => {
      const btn = ev.target?.closest('button');
      if (!btn) return;

      const act = btn.dataset.act;
      if (!act) return;

      ev.stopPropagation();

      if (act === 'm-') return step('m', -1);
      if (act === 'm+') return step('m', +1);
      if (act === 'f-') return step('f', -1);
      if (act === 'f+') return step('f', +1);

      if (act === 'dup') return dupCard();

      if (act === 'sp-pick') {
        if (!(sp?.enabled) || !s.spEnabled) return;
        const n = Number(btn.dataset.n || 0);
        if (!Number.isFinite(n) || n <= 0) return;
        s.spAll = false;
        if (!Array.isArray(s.picks)) s.picks = [];
        s.picks.push(n);
        saveState();
        syncSpecialUI();
        rebuildOutput();
        applyCollapseAndSearch();
        return;
      }

      if (act === 'sp-undo') {
        if (!(sp?.enabled) || !s.spEnabled) return;
        if (s.spAll) s.spAll = false;
        else if (Array.isArray(s.picks) && s.picks.length) s.picks.pop();
        saveState();
        syncSpecialUI();
        rebuildOutput();
        applyCollapseAndSearch();
        return;
      }

      if (act === 'sp-all') {
        if (!(sp?.enabled) || !s.spEnabled) return;
        s.spAll = !s.spAll;
        if (s.spAll) s.picks = [];
        saveState();
        syncSpecialUI();
        rebuildOutput();
        applyCollapseAndSearch();
        return;
      }
    });

    if (sp?.enabled) {
      s.spEnabled = true;
      saveState();
      syncSpecialUI();
    }

    return card;
  }

  function buildItemCard(it) {
    const key = it.id;
    const s = ensureItemState(key, it);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.key = key;
    card.dataset.name = it.name;
    card.dataset.kind = 'item';

    // ✅ UIを以前の形へ：cardPreview撤去
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

    installLeftToggleHit(card, 10);

    const qEl = $('.js-q', card);

    function sync() {
      qEl.textContent = String(s.qty || 0);
      if (!el.q.value.trim()) card.classList.toggle('isCollapsed', Number(s.qty || 0) === 0);
    }
    sync();

    $('.cardToggle', card)?.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (el.q.value.trim()) return;
      card.classList.toggle('isCollapsed');
    });

    card.addEventListener('click', (ev) => {
      const btn = ev.target?.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (!act) return;

      ev.stopPropagation();
      if (act === '-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
      if (act === '+') s.qty = Math.max(0, Number(s.qty || 0) + 1);
      saveState();

      sync();
      rebuildOutput();
      applyCollapseAndSearch();
    });

    return card;
  }

  /* ========= render ========= */
  function renderList() {
    el.list.innerHTML = '';

    if (activeTab === 'dino') {
      const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
      dList.forEach(d => {
        try {
          el.list.appendChild(buildDinoCard(d, d.id));
        } catch (e) {
          const err = document.createElement('div');
          err.className = 'card';
          err.style.border = '1px solid rgba(255,80,80,.35)';
          err.style.background = 'rgba(120,0,0,.18)';
          err.style.padding = '14px';
          err.style.borderRadius = '16px';
          err.innerHTML = `<div style="font-weight:950;margin-bottom:6px;">描画エラー：${escapeHtml(d.name)}</div>
                           <div style="font-weight:800;color:rgba(255,255,255,.75);font-size:12px;">${escapeHtml(String(e?.message || e))}</div>`;
          el.list.appendChild(err);
        }
      });
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
  function gojuonSortAndApply(kind) {
    if (kind !== 'dino') return;

    const target = dinos.filter(d => !hidden.dino.has(d.id));
    const sorted = target.slice().sort((a, b) => {
      const ak = norm(stripTEK(a.name));
      const bk = norm(stripTEK(b.name));
      if (ak < bk) return -1;
      if (ak > bk) return 1;
      return a.name.localeCompare(b.name, 'ja');
    });
    order.dino = sorted.map(d => d.id);
    saveJSON(LS.DINO_ORDER, order.dino);
  }

  function renderManageCatalog() {
    const wrap = document.createElement('div');

    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.justifyContent = 'space-between';
    top.style.gap = '10px';
    top.style.marginBottom = '10px';
    top.innerHTML = `
      <div style="display:flex;gap:10px;">
        ${activeTab === 'dino' ? `<button class="pill" type="button" data-act="gojuon">五十音並び替え</button>` : ``}
      </div>
      <button class="pill" type="button" data-act="add">＋追加</button>
    `;
    wrap.appendChild(top);

    const list = (activeTab === 'dino')
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    list.forEach(obj => {
      const r = document.createElement('div');
      r.className = 'mRow';
      r.innerHTML = `
        <div class="mName">${escapeHtml(obj.name)}</div>
        ${activeTab === 'dino' ? `<button class="sBtn" type="button" data-act="edit" data-id="${obj.id}">✎</button>` : ``}
        <button class="sBtn" type="button" data-act="up" data-id="${obj.id}">↑</button>
        <button class="sBtn" type="button" data-act="down" data-id="${obj.id}">↓</button>
        <button class="sBtn danger" type="button" data-act="del" data-id="${obj.id}">削除</button>
      `;
      wrap.appendChild(r);
    });

    wrap.addEventListener('click', async (e) => {
      const btn = e.target?.closest('button');
      const act = btn?.dataset?.act;
      const id = btn?.dataset?.id;

      if (act === 'gojuon') {
        gojuonSortAndApply('dino');
        renderList();
        setManageTab('catalog');
        openToast('五十音順に並び替えました');
        return;
      }

      if (act === 'add') {
        if (activeTab === 'dino') openAddDino();
        else openAddItem();
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

  /* =========（以下：追加/編集/画像/ROOM/イベント/init は現行のまま） ========= */
  // ここから下は、あなたが貼ってくれた現行コードと同じです（UI撤去のために上だけ差し替え）
  // 省略せず全て必要なら言ってください。今の依頼は「UIを以前に戻す」なのでUIに関係する箇所だけ戻しています。

  /* --- 以降は “あなたの現行 app.js の該当部分をそのまま残す” 必要があります --- */
  /* 重要：このままだと構文が途切れるので、あなたの現行 app.js の
     「openAddDino()」以降〜最後までを、このファイルの続きをそのまま貼り付けてください。
     そうしないとJSとして成立しません。 */
})();