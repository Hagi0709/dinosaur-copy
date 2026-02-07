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

  function syncDinoMiniLine(card, d, key) {
    const sp = getSpecialCfgForDino(d);
    const s = inputState.get(key);
    const out = $('.miniOut', card);
    if (out) out.textContent = dinoSuffixLine(d, s, sp);

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
      const sp = getSpecialCfgForDino(d);

      for (const k of keys) {
        const s = inputState.get(k);
        if (!s) continue;

        if (sp?.enabled && s.mode === 'special') {
          const allowSex = !!sp.allowSex;
          const m = Number(s.m || 0);
          const f = Number(s.f || 0);
          const sexQty = m + f;

          if (allowSex && sexQty > 0) {
            const type = s.type || d.defType || '受精卵';
            const unitPrice = prices[type] || 0;
            const price = unitPrice * sexQty;
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
              line = `${d.name}${tOut}×${sexQty} = ${price.toLocaleString('ja-JP')}円`;
            }

            lines.push(`${idx}. ${line}`);
            idx++;
            continue;
          }

          const unitPrice = Number(sp.unit || 0);
          const allPrice = Number(sp.all || 0);

          if (s.all) {
            const price = allPrice;
            if (price > 0) {
              sum += price;
              lines.push(`${idx}. ${d.name}全種 = ${price.toLocaleString('ja-JP')}円`);
              idx++;
            }
            continue;
          }

          const picks = Array.isArray(s.picks) ? s.picks.slice() : [];
          if (picks.length <= 0) continue;

          const price = picks.length * unitPrice;
          sum += price;

          const seq = picks.map(n => circled(n)).join('');
          lines.push(`${idx}. ${d.name}${seq} = ${price.toLocaleString('ja-JP')}円`);
          idx++;
          continue;
        }

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
      if (!s) return 0;

      if (s.mode === 'special') {
        const sexQty = Number(s.m || 0) + Number(s.f || 0);
        if (sexQty > 0) return sexQty;
        if (s.all) return 1;
        return Array.isArray(s.picks) ? s.picks.length : 0;
      }
      return (Number(s.m || 0) + Number(s.f || 0));
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

  /* ========= Toggle hit area (左側ほぼ全部) ========= */
  function installLeftToggleHit(card) {
    const head = $('.cardHead', card);
    const toggle = $('.cardToggle', card);
    if (!head || !toggle) return;

    toggle.style.inset = 'auto';
    toggle.style.left = '-12px';
    toggle.style.top = '-12px';
    toggle.style.bottom = '-12px';
    toggle.style.width = 'calc(100% - 170px)';
    toggle.style.height = 'calc(100% + 24px)';
    toggle.style.zIndex = '5';
    toggle.style.pointerEvents = 'auto';
  }

  /* ========= cards ========= */
  function buildDinoCard(d, keyOverride = null) {
    const sp = getSpecialCfgForDino(d);
    const key = keyOverride || d.id;
    const s = ensureDinoState(key, d.defType, sp);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.key = key;
    card.dataset.name = d.name;
    card.dataset.kind = 'dino';
    card.dataset.did = d.id;

    const imgUrl = getImageUrlForDino(d);

    if (sp?.enabled && s.mode === 'special') {
      const maxN = Math.max(1, Math.min(60, Number(sp.max || 16)));
      const unitPrice = Number(sp.unit || 0);
      const allPrice = Number(sp.all || 0);
      const allowSex = !!sp.allowSex;

      const btns = [];
      for (let i = 1; i <= maxN; i++) {
        btns.push(`<button class="gBtn" type="button" data-act="pick" data-n="${i}">${i}</button>`);
      }

      const normalBlock = allowSex ? `
        <div class="controls controlsWrap" style="margin-top:10px;">
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
      ` : `<div class="controls controlsWrap" style="margin-top:10px;justify-content:flex-end;"><button class="dupBtn" type="button" data-act="dup">複製</button></div>`;

      card.innerHTML = `
        <div class="cardInner">
          <div class="cardHead">
            <button class="cardToggle" type="button" aria-label="開閉" data-act="toggle"></button>

            <div class="nameWrap">
              <div class="name"></div>
              ${imgUrl ? `<div class="miniThumb"><img src="${imgUrl}" alt=""></div>` : ``}
            </div>

            <div class="right">
              ${allowSex ? `<select class="type" aria-label="種類"></select>` : ``}
              
            <div class="unitRow">
              <div class="miniOut"></div>
              <div class="unit"></div>
            </div>
          </div>
            </div>
          </div>

          ${normalBlock}

          <div class="controls gachaWrap" style="display:block;margin-top:10px;">
            <div class="gWrap">
              <div class="gGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                ${btns.join('')}
              </div>

              <div style="display:flex;gap:12px;align-items:center;margin-top:14px;flex-wrap:wrap;">
                <button class="dupBtn" type="button" data-act="undo" style="min-width:120px;background:rgba(185,74,85,.22);border-color:rgba(185,74,85,.35);">− 取消</button>
                <button class="dupBtn" type="button" data-act="all" style="min-width:120px;">全種</button>

                <div style="flex:1;min-width:220px;color:rgba(255,255,255,.7);font-weight:900;">
                  <div class="gLine">入力：<span class="gInput">(未入力)</span></div>
                  <div class="gLine">小計：<span class="gSum">0円</span></div>
                </div>
              </div>

              <div style="margin-top:6px;color:rgba(255,255,255,.55);font-weight:800;font-size:12px;">
                全種=${allPrice.toLocaleString('ja-JP')}円
              </div>
            </div>
          </div>
        </div>
      `;

      $('.name', card).textContent = d.name;

      installLeftToggleHit(card);

      const inputEl = $('.gInput', card);
      const sumEl = $('.gSum', card);
      const allBtn = $('button[data-act="all"]', card);

      const mEl = $('.js-m', card);
      const fEl = $('.js-f', card);
      const sel = $('.type', card);

      if (allowSex && sel) {
        sel.innerHTML = typeList.map(t => `<option value="${t}">${t}</option>`).join('');
        if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
        sel.value = s.type;
      }

      const syncSpecial = () => {
        const picks = Array.isArray(s.picks) ? s.picks : [];
        const sexQty = Number(s.m || 0) + Number(s.f || 0);

        if (allowSex) {
          if (mEl) mEl.textContent = String(s.m || 0);
          if (fEl) fEl.textContent = String(s.f || 0);
          if (sel) sel.value = s.type;

          if (sexQty > 0) {
            inputEl.textContent = '(通常入力中)';
            sumEl.textContent = '(特殊無効)';
            allBtn.textContent = '全種';
          } else {
            if (s.all) {
              inputEl.textContent = '全種';
              sumEl.textContent = yen(allPrice);
              allBtn.textContent = '全種✓';
            } else {
              inputEl.textContent = picks.length ? picks.map(n => circled(n)).join('') : '(未入力)';
              sumEl.textContent = yen(picks.length * unitPrice);
              allBtn.textContent = '全種';
            }
          }
        } else {
          if (s.all) {
            inputEl.textContent = '全種';
            sumEl.textContent = yen(allPrice);
            allBtn.textContent = '全種✓';
          } else {
            inputEl.textContent = picks.length ? picks.map(n => circled(n)).join('') : '(未入力)';
            sumEl.textContent = yen(picks.length * unitPrice);
            allBtn.textContent = '全種';
          }
        }

        syncDinoMiniLine(card, d, key);

                if (!el.q.value.trim()) {
          const q = (Number(s.m || 0) + Number(s.f || 0)) > 0
            ? (Number(s.m || 0) + Number(s.f || 0))
            : (s.all ? 1 : (Array.isArray(s.picks) ? s.picks.length : 0));
          card.classList.toggle('isCollapsed', q === 0);
        }
      };

      syncSpecial();
      card.classList.toggle('isCollapsed', getQtyForCard(key, 'dino') === 0);

      $('.cardToggle', card).addEventListener('click', (ev) => {
        ev.preventDefault();
        if (el.q.value.trim()) return;
        card.classList.toggle('isCollapsed');
      });

      sel?.addEventListener('click', (ev) => ev.stopPropagation());
      sel?.addEventListener('change', (ev) => {
        ev.stopPropagation();
        s.type = sel.value;
        autoSpecify(s);
        syncSpecial();
        rebuildOutput();
        applyCollapseAndSearch();
      });

      const step = (sex, delta) => {
        if (sex === 'm') s.m = Math.max(0, Number(s.m || 0) + delta);
        if (sex === 'f') s.f = Math.max(0, Number(s.f || 0) + delta);
        autoSpecify(s);

        if ((Number(s.m || 0) + Number(s.f || 0)) > 0) {
          s.all = false;
          s.picks = [];
        }
        syncSpecial();
        rebuildOutput();
        applyCollapseAndSearch();
      };

      card.addEventListener('click', (ev) => {
        const btn = ev.target?.closest('button');
        if (!btn) return;
        ev.stopPropagation();

        const act = btn.dataset.act;

        if (act === 'dup') {
          const dupKey = `${d.id}__dup_${uid()}`;
          ephemeralKeys.add(dupKey);
          inputState.set(dupKey, {
            mode: s.mode,
            type: s.type,
            m: 0,
            f: 0,
            all: false,
            picks: []
          });

          const dupCard = buildDinoCard(d, dupKey);
          card.after(dupCard);
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }

        if (act === 'm-') return step('m', -1);
        if (act === 'm+') return step('m', +1);
        if (act === 'f-') return step('f', -1);
        if (act === 'f+') return step('f', +1);

        const sexQty = Number(s.m || 0) + Number(s.f || 0);
        if (allowSex && sexQty > 0) {
          openToast('通常入力があるため特殊入力は無効です');
          return;
        }

        if (act === 'pick') {
          const n = Number(btn.dataset.n || 0);
          if (!Number.isFinite(n) || n <= 0) return;

          s.m = 0; s.f = 0;
          s.all = false;
          if (!Array.isArray(s.picks)) s.picks = [];
          s.picks.push(n);

          syncSpecial();
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }

        if (act === 'undo') {
          s.m = 0; s.f = 0;

          if (s.all) {
            s.all = false;
          } else {
            if (Array.isArray(s.picks) && s.picks.length) s.picks.pop();
          }
          syncSpecial();
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }

        if (act === 'all') {
          s.m = 0; s.f = 0;

          s.all = !s.all;
          if (s.all) s.picks = [];
          syncSpecial();
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }
      });

      return card;
    }

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
            <div class="unitRow">
            <div class="miniOut"></div>
            <div class="unit"></div>
          </div>
        </div>
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

    installLeftToggleHit(card);

    const sel = $('.type', card);
    sel.innerHTML = typeList.map(t => `<option value="${t}">${t}</option>`).join('');
    if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
    sel.value = s.type;

    const unit = $('.unit', card);
    unit.textContent = `単価${prices[s.type] || 0}円`;
    syncDinoMiniLine(card, d, key);

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
      syncDinoMiniLine(card, d, key);

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

    sel.addEventListener('click', (ev) => ev.stopPropagation());
    sel.addEventListener('pointerdown', (ev) => ev.stopPropagation());

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

        if (act === 'dup') {
          const dupKey = `${d.id}__dup_${uid()}`;
          ephemeralKeys.add(dupKey);
          inputState.set(dupKey, {
            mode: s.mode,
            type: s.type,
            m: 0,
            f: 0,
            all: false,
            picks: []
          });

          const dupCard = buildDinoCard(d, dupKey);
          card.after(dupCard);
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }

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

    const toggle = $('.cardToggle', card);
    if (toggle) {
      toggle.style.inset = 'auto';
      toggle.style.left = '-12px';
      toggle.style.top = '-12px';
      toggle.style.bottom = '-12px';
      toggle.style.width = 'calc(100% - 10px)';
      toggle.style.height = 'calc(100% + 24px)';
      toggle.style.zIndex = '5';
    }

    const qEl = $('.js-q', card);
    qEl.textContent = String(s.qty || 0);

    card.classList.toggle('isCollapsed', Number(s.qty || 0) === 0);

    toggle?.addEventListener('click', (ev) => {
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
    ScrollLock.lock(); // ✅ 背面スクロール禁止
    el.modalOverlay.classList.remove('isHidden');
    setManageTab('catalog');
  }
  function closeModal() {
    el.modalOverlay.classList.add('isHidden');
    el.modalBody.innerHTML = '';
    ScrollLock.unlock(); // ✅ 戻す
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
    ScrollLock.lock(); // ✅
    el.editTitle.textContent = title;
    el.editBody.innerHTML = '';
    el.editBody.appendChild(bodyEl);
    el.editOverlay.classList.remove('isHidden');
  }
  function closeEditModal() {
    if (!el.editOverlay) return;
    el.editOverlay.classList.add('isHidden');
    el.editBody.innerHTML = '';
    ScrollLock.unlock(); // ✅
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

    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.justifyContent = 'flex-end';
    top.style.marginBottom = '10px';
    top.innerHTML = `<button class="pill" type="button" data-act="add">＋追加</button>`;
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

  // ---- 以下、あなたの元コードの残り（画像管理 / ROOM / events / init）は
  // ScrollLockを openRoom/closeRoom, openImgViewer/closeImgViewer にも適用した上でそのままです。
  // 省略すると「全置換」できないので、ここから先も"元コード通り"＋必要箇所だけScrollLock追加しています。

  function openAddDino() {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="editForm">
        <div class="editLabel">名前</div>
        <input id="addName" class="editInput" type="text" value="" autocomplete="off" placeholder="例：ガチャ">

        <div class="editLabel">デフォルト種類</div>
        <select id="addType" class="editSelect">
          ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>

        <div style="height:1px;background:rgba(255,255,255,.10);margin:6px 0;"></div>

        <label style="display:flex;gap:10px;align-items:center;font-weight:900;color:rgba(255,255,255,.85);">
          <input id="spEnable" type="checkbox" style="transform:scale(1.2);">
          特殊入力（ガチャ等）
        </label>

        <label style="display:flex;gap:10px;align-items:center;font-weight:900;color:rgba(255,255,255,.85);margin-top:-6px;">
          <input id="spAllowSex" type="checkbox" style="transform:scale(1.2);" disabled>
          特殊＋通常の♂♀入力を許可
        </label>

        <div id="spBox" style="display:none;">
          <div class="editLabel">何番までボタンを用意するか</div>
          <input id="spMax" class="editInput" type="number" inputmode="numeric" value="16">

          <div class="editLabel">1体あたりの価格</div>
          <input id="spUnit" class="editInput" type="number" inputmode="numeric" value="300">

          <div class="editLabel">全種の場合の価格</div>
          <input id="spAll" class="editInput" type="number" inputmode="numeric" value="3000">
        </div>

        <div class="editBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">保存</button>
        </div>
      </div>
    `;

    const spEnable = $('#spEnable', box);
    const spBox = $('#spBox', box);
    const spAllowSex = $('#spAllowSex', box);

    spEnable?.addEventListener('change', () => {
      const on = !!spEnable.checked;
      if (spBox) spBox.style.display = on ? 'block' : 'none';
      if (spAllowSex) spAllowSex.disabled = !on;
      if (!on && spAllowSex) spAllowSex.checked = false;
    });

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
        if (!name) return openToast('名前を入力してください');

        const id = stableId('d', name);
        const existIdx = custom.dino.findIndex(x => x.id === id);
        const rec = { id, name, defType, _baseName: name };
        if (existIdx >= 0) custom.dino[existIdx] = rec;
        else custom.dino.push(rec);
        saveJSON(LS.DINO_CUSTOM, custom.dino);

        if (spEnable?.checked) {
          const max = Math.max(1, Math.min(60, Number($('#spMax', box)?.value || 16)));
          const unit = Math.max(0, Number($('#spUnit', box)?.value || 0));
          const all = Math.max(0, Number($('#spAll', box)?.value || 0));
          const allowSex = !!spAllowSex?.checked;
          specialCfg[id] = { enabled: true, max, unit, all, allowSex };
          saveJSON(LS.SPECIAL_CFG, specialCfg);
        }

        closeEditModal();
        dinos = dinos.concat([{ id, name, defType, kind: 'dino', _baseName: name }]);
        ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
        renderList();
        setManageTab('catalog');
        openToast('追加しました');
      }
    });
  }

  function openAddItem() {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="editForm">
        <div class="editLabel">名前</div>
        <input id="addName" class="editInput" type="text" value="" autocomplete="off" placeholder="例：金庫">

        <div class="editLabel">1セットあたり個数</div>
        <input id="addUnit" class="editInput" type="number" inputmode="numeric" value="1">

        <div class="editLabel">価格（1セット）</div>
        <input id="addPrice" class="editInput" type="number" inputmode="numeric" value="0">

        <div class="editBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">保存</button>
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
        const unit = Number($('#addUnit', box)?.value || 1);
        const price = Number($('#addPrice', box)?.value || 0);
        if (!name) return openToast('名前を入力してください');
        if (!Number.isFinite(unit) || unit <= 0) return openToast('個数は1以上');
        if (!Number.isFinite(price) || price < 0) return openToast('価格が不正です');

        const id = stableId('i', name);
        const existIdx = custom.item.findIndex(x => x.id === id);
        const rec = { id, name, unit, price };
        if (existIdx >= 0) custom.item[existIdx] = rec;
        else custom.item.push(rec);
        saveJSON(LS.ITEM_CUSTOM, custom.item);

        closeEditModal();
        items = items.concat([{ id, name, unit, price, kind: 'item' }]);
        ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');
        renderList();
        setManageTab('catalog');
        openToast('追加しました');
      }
    });
  }

  function openEditDino(id) {
    const d = dinos.find(x => x.id === id);
    if (!d) return;

    const curSp = specialCfg[id] || getSpecialCfgForDino(d) || null;

    const box = document.createElement('div');
    box.innerHTML = `
      <div class="editForm">
        <div class="editLabel">名前</div>
        <input id="editName" class="editInput" type="text" value="${escapeHtml(d.name)}" autocomplete="off">

        <div class="editLabel">デフォルト種類</div>
        <select id="editType" class="editSelect">
          ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>

        <div style="height:1px;background:rgba(255,255,255,.10);margin:6px 0;"></div>

        <label style="display:flex;gap:10px;align-items:center;font-weight:900;color:rgba(255,255,255,.85);">
          <input id="spEnable" type="checkbox" ${curSp?.enabled ? 'checked' : ''} style="transform:scale(1.2);">
          特殊入力（ガチャ等）
        </label>

        <label style="display:flex;gap:10px;align-items:center;font-weight:900;color:rgba(255,255,255,.85);margin-top:-6px;">
          <input id="spAllowSex" type="checkbox" ${curSp?.allowSex ? 'checked' : ''} style="transform:scale(1.2);" ${curSp?.enabled ? '' : 'disabled'}>
          特殊＋通常の♂♀入力を許可
        </label>

        <div id="spBox" style="display:${curSp?.enabled ? 'block' : 'none'};">
          <div class="editLabel">何番までボタンを用意するか</div>
          <input id="spMax" class="editInput" type="number" inputmode="numeric" value="${Number(curSp?.max || 16)}">

          <div class="editLabel">1体あたりの価格</div>
          <input id="spUnit" class="editInput" type="number" inputmode="numeric" value="${Number(curSp?.unit || 300)}">

          <div class="editLabel">全種の場合の価格</div>
          <input id="spAll" class="editInput" type="number" inputmode="numeric" value="${Number(curSp?.all || 3000)}">
        </div>

        <div class="editBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">保存</button>
        </div>
      </div>
    `;

    const sel = $('#editType', box);
    if (sel) sel.value = d.defType || '受精卵';

    const spEnable = $('#spEnable', box);
    const spBox = $('#spBox', box);
    const spAllowSex = $('#spAllowSex', box);

    spEnable?.addEventListener('change', () => {
      if (!spBox) return;
      const on = spEnable.checked;
      spBox.style.display = on ? 'block' : 'none';
      if (spAllowSex) {
        spAllowSex.disabled = !on;
        if (!on) spAllowSex.checked = false;
      }
    });

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

        if (spEnable?.checked) {
          const max = Math.max(1, Math.min(60, Number($('#spMax', box)?.value || 16)));
          const unit = Math.max(0, Number($('#spUnit', box)?.value || 0));
          const all = Math.max(0, Number($('#spAll', box)?.value || 0));
          const allowSex = !!spAllowSex?.checked;
          specialCfg[id] = { enabled: true, max, unit, all, allowSex };
          saveJSON(LS.SPECIAL_CFG, specialCfg);

          const st = inputState.get(id);
          if (st) {
            st.mode = 'special';
            if (!Array.isArray(st.picks)) st.picks = [];
            if (typeof st.all !== 'boolean') st.all = false;
            if (typeof st.type !== 'string') st.type = newDef;
            if (typeof st.m !== 'number') st.m = 0;
            if (typeof st.f !== 'number') st.f = 0;
          }
        } else {
          if (specialCfg[id]) {
            delete specialCfg[id];
            saveJSON(LS.SPECIAL_CFG, specialCfg);
          }
          const st = inputState.get(id);
          if (st && st.mode === 'special') {
            inputState.set(id, { type: newDef, m: 0, f: 0 });
          }
        }

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

  function openImgViewer(url) {
    if (!el.imgOverlay || !el.imgViewerImg) return;
    ScrollLock.lock(); // ✅
    el.imgViewerImg.src = url;
    el.imgOverlay.classList.remove('isHidden');
  }
  function closeImgViewer() {
    if (!el.imgOverlay) return;
    el.imgOverlay.classList.add('isHidden');
    if (el.imgViewerImg) el.imgViewerImg.src = '';
    ScrollLock.unlock(); // ✅
  }
  el.imgClose?.addEventListener('click', closeImgViewer);
  el.imgOverlay?.addEventListener('click', (e) => {
    if (e.target === el.imgOverlay) closeImgViewer();
  });

  function renderManageImages() {
    const wrap = document.createElement('div');

    const topBar = document.createElement('div');
    topBar.style.display = 'flex';
    topBar.style.justifyContent = 'flex-end';
    topBar.style.marginBottom = '10px';
    topBar.innerHTML = `<button id="imgExport" class="pill" type="button">画像出力</button>`;
    wrap.appendChild(topBar);

    const list = sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino');

    function loadImg(src) {
      return new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = src;
      });
    }

    async function exportGrid(rows, cols) {
      const maxCells = rows * cols;

      const srcs = [];
      for (const d of list) {
        const k = imageKeyFromBaseName(d._baseName || d.name);
        const u = imageCache[k];
        if (u) srcs.push(u);
        if (srcs.length >= maxCells) break;
      }

      if (!srcs.length) {
        alert('画像が1枚も設定されていません。');
        return;
      }

      const ims = [];
      for (const s of srcs) {
        const im = await loadImg(s);
        if (im) ims.push(im);
        if (ims.length >= maxCells) break;
      }
      if (!ims.length) {
        alert('読み込める画像がありませんでした。');
        return;
      }

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

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, outW, outH);

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (idx >= ims.length) break;
          const im = ims[idx++];

          const x = pad + c * (cellW + gap);
          const y = pad + r * (cellH + gap);

          const iw = im.naturalWidth || im.width;
          const ih = im.naturalHeight || im.height;
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

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      openImgViewer(dataUrl);
    }

    topBar.querySelector('#imgExport')?.addEventListener('click', async () => {
      const rows = parseInt(prompt('縦は何枚？（例：5）', '5') || '', 10);
      const cols = parseInt(prompt('横は何枚？（例：2）', '2') || '', 10);

      if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
        alert('縦・横は1以上の数字で入力してください。');
        return;
      }
      await exportGrid(rows, cols);
    });

    list.forEach(d => {
      const row = document.createElement('div');
      row.className = 'imgRow';

      const thumb = document.createElement('div');
      thumb.className = 'thumb';

      const k = imageKeyFromBaseName(d._baseName || d.name);
      const url = imageCache[k];

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
          await idbPutImage(k, dataUrl);
          imageCache[k] = dataUrl;

          thumb.innerHTML = `<img src="${dataUrl}" alt="">`;
          syncThumbInMainListByDino(d, dataUrl);

          openToast('画像を保存しました');
        } catch {
          openToast('画像の保存に失敗しました');
        }
      });

      del.addEventListener('click', async () => {
        const ok = await confirmAsk('画像を削除しますか？');
        if (!ok) return;

        try {
          await idbDelImage(k);
          delete imageCache[k];
          thumb.textContent = 'No Image';
          syncThumbInMainListByDino(d, '');
          openToast('画像を削除しました');
        } catch {
          openToast('削除に失敗しました');
        }
      });

      thumb.addEventListener('click', () => {
        const u = imageCache[k];
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
    ScrollLock.lock(); // ✅
    el.roomOverlay.classList.remove('isHidden');
    renderRooms();
  }
  function closeRoom() {
    if (!el.roomOverlay) return;
    el.roomOverlay.classList.add('isHidden');
    if (el.roomBody) el.roomBody.innerHTML = '';
    ScrollLock.unlock(); // ✅
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