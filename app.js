(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
  const toHira = (s) =>
    (s || '').replace(/[\u30a1-\u30f6]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  const norm = (s) =>
    toHira(String(s || '').toLowerCase()).replace(/\s+/g, '');

  /* ========= 安定ID ========= */
  function stableHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  function stableId(prefix, name) {
    return `${prefix}_${stableHash(norm(name))}`;
  }

  /* ========= confirm ========= */
  function openConfirm(message, onOk) {
    const ov = $('#confirmOverlay');
    const tx = $('#confirmText');
    const ok = $('#confirmOk');
    const cancel = $('#confirmCancel');

    tx.textContent = message;
    ov.classList.remove('isHidden');

    const cleanup = () => {
      ov.classList.add('isHidden');
      ok.onclick = null;
      cancel.onclick = null;
    };

    cancel.onclick = cleanup;
    ov.onclick = (e) => { if (e.target === ov) cleanup(); };
    ok.onclick = () => { cleanup(); onOk && onOk(); };
  }

  /* ========= storage ========= */
  const LS = {
    DINO_CUSTOM: 'dino_custom_v1',
    DINO_ORDER: 'dino_order_v1',
    DINO_HIDDEN: 'dino_hidden_v1',
    DINO_IMAGES: 'dino_images_v1',
    DINO_OVERRIDE: 'dino_override_v1',
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
  const specifiedMap = {
    '受精卵': '受精卵(指定)',
    '胚': '胚(指定)',
    'クローン': 'クローン(指定)',
  };

  /* ========= data ========= */
  const dinoImages = loadJSON(LS.DINO_IMAGES, {});
  const dinoOverride = loadJSON(LS.DINO_OVERRIDE, {});
  const customDinos = loadJSON(LS.DINO_CUSTOM, []);
  const hidden = new Set(loadJSON(LS.DINO_HIDDEN, []));
  const order = loadJSON(LS.DINO_ORDER, []);

  let dinos = [];
  const inputState = new Map();
  const dupKeys = new Set();

  /* ========= DOM ========= */
  const el = {
    q: $('#q'),
    qClear: $('#qClear'),
    delivery: $('#delivery'),
    copy: $('#copy'),
    total: $('#total'),
    out: $('#out'),
    list: $('#list'),

    openManage: $('#openManage'),
    modalOverlay: $('#modalOverlay'),
    modalBody: $('#modalBody'),

    mTabCatalog: $('#mTabCatalog'),
    mTabPrices: $('#mTabPrices'),
    mTabImages: $('#mTabImages'),

    editOverlay: $('#editOverlay'),
    editBody: $('#editBody'),
    editTitle: $('#editTitle'),

    imgOverlay: $('#imgOverlay'),
    imgViewerImg: $('#imgViewerImg'),
  };

  /* ========= fetch ========= */
  async function fetchTextSafe(path) {
    try {
      const r = await fetch(path + '?ts=' + Date.now(), { cache: 'no-store' });
      return r.ok ? r.text() : '';
    } catch {
      return '';
    }
  }

  function parseDinoLine(line) {
    line = (line || '').trim();
    if (!line || line.startsWith('#')) return null;
    line = line.replace(/^・/, '').trim();

    const [nameRaw, defRaw] = line.split('|').map(s => s.trim());
    if (!nameRaw) return null;

    const id = stableId('d', nameRaw);
    const ov = dinoOverride[id];

    return {
      id,
      name: ov?.name || nameRaw,
      defType: ov?.defType || defRaw || '受精卵',
    };
  }

  /* ========= order ========= */
  function ensureOrder(list) {
    list.forEach(d => { if (!order.includes(d.id)) order.push(d.id); });
    saveJSON(LS.DINO_ORDER, order);
  }

  function sortByOrder(list) {
    const idx = new Map(order.map((id, i) => [id, i]));
    return list.slice().sort((a, b) =>
      (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9)
    );
  }

  /* ========= state ========= */
  function ensureState(key, defType) {
    if (!inputState.has(key)) {
      inputState.set(key, { type: defType, m: 0, f: 0 });
    }
    return inputState.get(key);
  }

  function autoSpecify(s) {
    const m = s.m || 0;
    const f = s.f || 0;
    const base = s.type.replace('(指定)', '');
    if (m > 0 && f > 0) s.type = specifiedMap[base] || base + '(指定)';
    if (m === 0 && f === 0) s.type = base;
  }

  /* ========= output ========= */
  function rebuildOutput() {
    let sum = 0;
    let lines = [];
    let idx = 1;

    sortByOrder(dinos.filter(d => !hidden.has(d.id))).forEach(d => {
      const keys = [d.id, ...[...dupKeys].filter(k => k.startsWith(d.id))];
      keys.forEach(k => {
        const s = inputState.get(k);
        if (!s) return;
        const qty = (s.m || 0) + (s.f || 0);
        if (!qty) return;

        const price = qty * (prices[s.type] || 0);
        sum += price;

        lines.push(`${idx}. ${d.name}${s.type}×${qty} = ${price.toLocaleString()}円`);
        idx++;
      });
    });

    el.total.textContent = yen(sum);
    el.out.value = lines.join('\n');
  }

  /* ========= cards ========= */
  function buildCard(d, keyOverride = null) {
    const key = keyOverride || d.id;
    const s = ensureState(key, d.defType);

    const img = dinoImages[d.id];

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="cardHead">
        <div class="nameWrap">
          <div class="name">${d.name}</div>
          ${img ? `<div class="miniThumb"><img src="${img}"></div>` : ''}
        </div>
        <select class="type">
          ${typeList.map(t => `<option>${t}</option>`).join('')}
        </select>
      </div>
      <div class="controls">
        <div class="stepper male">
          <button data-act="m-">−</button><div>${s.m}</div><button data-act="m+">＋</button>
        </div>
        <div class="stepper female">
          <button data-act="f-">−</button><div>${s.f}</div><button data-act="f+">＋</button>
        </div>
        <button data-act="dup">複製</button>
      </div>
    `;

    card.querySelector('.type').value = s.type;

    card.onclick = (e) => {
      const act = e.target.dataset.act;
      if (!act) return;

      if (act === 'm+') s.m++;
      if (act === 'm-') s.m = Math.max(0, s.m - 1);
      if (act === 'f+') s.f++;
      if (act === 'f-') s.f = Math.max(0, s.f - 1);

      if (act === 'dup') {
        const dk = `${d.id}__dup_${uid()}`;
        dupKeys.add(dk);
        inputState.set(dk, { type: s.type, m: 0, f: 0 });
        card.after(buildCard(d, dk));
      }

      autoSpecify(s);
      rebuild();
    };

    return card;
  }

  function rebuild() {
    el.list.innerHTML = '';
    sortByOrder(dinos.filter(d => !hidden.has(d.id))).forEach(d => {
      el.list.appendChild(buildCard(d));
    });
    rebuildOutput();
  }

  /* ========= manage ========= */
  function openManage() {
    el.modalOverlay.classList.remove('isHidden');
    renderCatalog();
  }

  function renderCatalog() {
    el.modalBody.innerHTML = '';

    const btn = document.createElement('button');
    btn.textContent = '五十音で並び替え';
    btn.onclick = () => {
      openConfirm('五十音順で並び替えますか？', () => {
        order.splice(0, order.length,
          ...dinos.map(d => d.id).sort((a, b) => a.localeCompare(b, 'ja'))
        );
        saveJSON(LS.DINO_ORDER, order);
        renderCatalog();
        rebuild();
      });
    };
    el.modalBody.appendChild(btn);

    sortByOrder(dinos).forEach(d => {
      const r = document.createElement('div');
      r.textContent = d.name;
      el.modalBody.appendChild(r);
    });
  }

  /* ========= events ========= */
  el.openManage.onclick = openManage;
  el.qClear.onclick = () => { el.q.value = ''; rebuild(); };
  el.q.oninput = rebuild;

  el.copy.onclick = async () => {
    await navigator.clipboard.writeText(el.out.value);
  };

  /* ========= init ========= */
  (async function init() {
    const text = await fetchTextSafe('./dinos.txt');
    const base = text.split(/\r?\n/).map(parseDinoLine).filter(Boolean);

    dinos = base.concat(customDinos);
    ensureOrder(dinos);

    rebuild();
  })();

})();