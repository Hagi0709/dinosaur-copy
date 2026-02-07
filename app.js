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

  /* ========= circled numbers ========= */
  const circled = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return String(n);
    if (x >= 1 && x <= 20) return String.fromCharCode(0x2460 + (x - 1));
    if (x >= 21 && x <= 35) return String.fromCharCode(0x3251 + (x - 21));
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
    DINO_IMAGES_OLD: 'dino_images_v1',
    DINO_OVERRIDE: 'dino_override_v1',
    ROOM_ENTRY_PW: 'room_entry_pw_v1',
    ROOM_PW: 'room_pw_v1',
    SPECIAL_CFG: 'special_cfg_v1',
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

  /* ========= ✅ scroll lock (modal/overlay) ========= */
  // 目的：
  // - モーダル表示中に「背面のbody」がスクロールしないようにする（iOS含む）
  // - 前面要素のスクロールだけ有効にする
  const ScrollLock = (() => {
    let lockCount = 0;
    let savedY = 0;
    let savedX = 0;

    const lock = () => {
      lockCount++;
      if (lockCount !== 1) return;

      savedY = window.scrollY || 0;
      savedX = window.scrollX || 0;

      // iOS対策: bodyをfixedにして位置を固定
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedY}px`;
      document.body.style.left = `-${savedX}px`;
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    };

    const unlock = () => {
      if (lockCount <= 0) return;
      lockCount--;
      if (lockCount !== 0) return;

      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.touchAction = '';

      window.scrollTo(savedX, savedY);
    };

    return { lock, unlock };
  })();

  function installOverlayScrollGuard(overlayEl, scrollBodyEl) {
    if (!overlayEl) return;

    // オーバーレイ自身(背景)でのスクロール/ドラッグは無効化して「背面へ抜ける」を防ぐ
    const stopIfBackdrop = (e) => {
      // 背景を触ってる時だけ止める（body側でスクロールさせない）
      if (e.target === overlayEl) {
        e.preventDefault();
      }
    };

    overlayEl.addEventListener('wheel', stopIfBackdrop, { passive: false });
    overlayEl.addEventListener('touchmove', stopIfBackdrop, { passive: false });

    // 前面のスクロール領域からさらに外へ「スクロールが伝播」するのを抑制
    if (scrollBodyEl) {
      scrollBodyEl.style.overscrollBehavior = 'contain';
      // iOS向け: 慣性スクロール
      scrollBodyEl.style.webkitOverflowScrolling = 'touch';
    }
  }

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

  /* ========= special cfg (ガチャ等) ========= */
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

  // ✅ オーバーレイのスクロールガード（前面だけ）
  installOverlayScrollGuard(el.modalOverlay, el.modalBody);
  installOverlayScrollGuard(el.roomOverlay, el.roomBody);
  installOverlayScrollGuard(el.editOverlay, el.editBody);
  installOverlayScrollGuard(el.imgOverlay, el.imgOverlay); // 画像ビューは全体OK

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

  // ✅ ソート用名称を生成（TEKは除外）
  const sortName = (name) => {
    if (!name) return '';
    return name.startsWith('TEK')
      ? name.slice(3).trim()
      : name;
  };

  return list.slice().sort((a, b) => {
    const ai = idx.has(a.id) ? idx.get(a.id) : 1e9;
    const bi = idx.has(b.id) ? idx.get(b.id) : 1e9;
    if (ai !== bi) return ai - bi;

    const an = sortName(a.name);
    const bn = sortName(b.name);

    return an.localeCompare(bn, 'ja');
  });
}

  /* ========= behavior rules ========= */
  function ensureDinoState(key, defType, spCfg = null) {
    if (!inputState.has(key)) {
      if (spCfg?.enabled) {
        inputState.set(key, {
          mode: 'special',
          picks: [],
          all: false,
          type: defType || '受精卵',
          m: 0,
          f: 0,
        });
      } else {
        inputState.set(key, { type: defType || '受精卵', m: 0, f: 0 });
      }
    } else {
      const s = inputState.get(key);
      if (spCfg?.enabled) {
        if (s.mode !== 'special') s.mode = 'special';
        if (!Array.isArray(s.picks)) s.picks = [];
        if (typeof s.all !== 'boolean') s.all = false;
        if (typeof s.type !== 'string') s.type = defType || '受精卵';
        if (typeof s.m !== 'number') s.m = 0;
        if (typeof s.f !== 'number') s.f = 0;
      }
    }
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
      if (specifiedMap[base]) s.type = specifiedMap[base];
      return;
    }
    if (m === 0 && f === 0 && hasSpecified) {
      s.type = base;
    }
  }

  /* ========= image DOM sync ========= */
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


  function dinoSuffixLine(d, s, sp) {
    if (!s) return '';

    // special mode output (ガチャ等)
    if (sp?.enabled && s.mode === 'special') {
      const allowSex = !!sp.allowSex;
      const m = Number(s.m || 0);
      const f = Number(s.f || 0);
      const sexQty = m + f;

      if (allowSex && sexQty > 0) {
        const type = s.type || d.defType || '受精卵';
        const unitPrice = prices[type] || 0;
        const price = unitPrice * sexQty;

        const tOut = String(type).replace('(指定)', '');
        const isPair = /\(指定\)$/.test(type) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(type);

        if (isPair) {
          if (m === f) {
            return `${tOut}ペア${m > 1 ? '×' + m : ''} = ${price.toLocaleString('ja-JP')}円`;
          }
          const p = [];
          if (m > 0) p.push(`♂×${m}`);
          if (f > 0) p.push(`♀×${f}`);
          return `${tOut} ${p.join(' ')} = ${price.toLocaleString('ja-JP')}円`;
        }

        return `${tOut}×${sexQty} = ${price.toLocaleString('ja-JP')}円`;
      }

      const unitPrice = Number(sp.unit || 0);
      const allPrice = Number(sp.all || 0);

      if (s.all) {
        return `全種 = ${allPrice.toLocaleString('ja-JP')}円`;
      }

      const picks = Array.isArray(s.picks) ? s.picks.slice() : [];
      if (picks.length <= 0) return '';

      const price = picks.length * unitPrice;
      const seq = picks.map(n => circled(n)).join('');
      return `${seq} = ${price.toLocaleString('ja-JP')}円`;
    }

    // normal mode output
    const type = s.type || d.defType || '受精卵';
    const m = Number(s.m || 0);
    const f = Number(s.f || 0);
    const qty = m + f;
    if (qty <= 0) return '';

    const unitPrice = prices[type] || 0;
    const price = unitPrice * qty;

    const tOut = String(type).replace('(指定)', '');
    const isPair = /\(指定\)$/.test(type) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(type);

    if (isPair) {
      if (m === f) {
        return `${tOut}ペア${m > 1 ? '×' + m : ''} = ${price.toLocaleString('ja-JP')}円`;
      }
      const p = [];
      if (m > 0) p.push(`♂×${m}`);
      if (f > 0) p.push(`♀×${f}`);
      return `${tOut} ${p.join(' ')} = ${price.toLocaleString('ja-JP')}円`;
    }

    return `${tOut}×${qty} = ${price.toLocaleString('ja-JP')}円`;
  }

  function escapeHtml(s){
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function miniLineToHtml(line){
  const s = String(line ?? '');
  if (!s.trim()) return '&nbsp;'; // 未入力時は空白1文字
  let t = escapeHtml(s);

  // 表示価格では ♂♀ を オス/メス に置換し色付け
  t = t.replace(/♂×(\d+)/g, '<span class="male">オス×$1</span>');
  t = t.replace(/♀×(\d+)/g, '<span class="female">メス×$1</span>');
  // 念のため単体記号も置換
  t = t.replace(/♂/g, '<span class="male">オス</span>');
  t = t.replace(/♀/g, '<span class="female">メス</span>');

  return t;
}

function syncDinoMiniLine(card, d, key) {
  const sp = getSpecialCfgForDino(d);
  const s = inputState.get(key);
  const out = $('.miniOut', card);
  if (out) out.innerHTML = miniLineToHtml(dinoSuffixLine(d, s, sp));

  const unit = $('.unit', card);
  if (unit) {
    // 特殊+オスメス（通常入力）は通常単価を表示
    if (sp?.enabled && s?.mode === 'special' && sp.allowSex) {
      unit.textContent = `単価${prices[s.type] || 0}円`;
    } else if (sp?.enabled && s?.mode === 'special') {
      unit.textContent = `1体=${Number(sp.unit || 0)}円`;
    } else {
      unit.textContent = `単価${prices[s?.type] || 0}円`;
    }
  }
})();