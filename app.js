(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP');

  function stableHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  function toHira(s) {
    s = String(s || '');
    return s.replace(/[ァ-ン]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }
  function norm(s) {
    s = toHira(String(s || '')).toLowerCase();
    return s.replace(/\s+/g, '').replace(/　+/g, '');
  }
  function stableId(prefix, name) {
    const key = norm(name);
    return `${prefix}_${stableHash(key)}`;
  }

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

  const loadJSON = (k, fallback) => {
    try {
      const v = localStorage.getItem(k);
      if (!v) return fallback;
      return JSON.parse(v);
    } catch { return fallback; }
  };
  const saveJSON = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };

  /* ========= error overlay ========= */
  function showErr(msg) {
    console.error(msg);
    const out = $('#out');
    if (!out) return;
    out.textContent = `[error]\n${msg}`;
  }
  window.addEventListener('error', (e) => showErr(e?.message || String(e?.error || e)));
  window.addEventListener('unhandledrejection', (e) => showErr(String(e?.reason || e)));

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

  /* ========= special cfg ========= */
  const specialCfg = Object.assign({}, loadJSON(LS.SPECIAL_CFG, {}));
  function getSpecialCfgForDino(d) {
    return specialCfg[d.id] || null;
  }
  void getSpecialCfgForDino; // silence unused for now (future restore)

  /* ========= state ========= */
  let dinos = [];
  let items = [];
  let activeTab = 'dino';
  const inputState = new Map();   // key -> {type,m,f}
  const dupBase = new Map();      // dupKey -> baseId
  const order = {
    dino: loadJSON(LS.DINO_ORDER, []),
    item: loadJSON(LS.ITEM_ORDER, []),
  };

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

    return {
      id: stableId('d', nameRaw),
      name: nameRaw,
      defType,
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

  /* ========= ordering (with TEK-ignore fallback) ========= */
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
    const sortName = (name) => {
      if (!name) return '';
      return name.startsWith('TEK') ? name.slice(3).trim() : name;
    };
    return list.slice().sort((a, b) => {
      const ai = idx.has(a.id) ? idx.get(a.id) : 1e9;
      const bi = idx.has(b.id) ? idx.get(b.id) : 1e9;
      if (ai !== bi) return ai - bi;
      return sortName(a.name).localeCompare(sortName(b.name), 'ja');
    });
  }

  /* ========= helpers ========= */
  function ensureDinoState(key, defType) {
    if (!inputState.has(key)) inputState.set(key, { type: defType || '受精卵', m: 0, f: 0 });
  }

  function getTypeUnitPrice(type) {
    return Number(prices[type] || 0);
  }

  function dinoSuffixLine(d, s) {
    const type = (s?.type || d.defType || '受精卵');
    const m = Number(s?.m || 0);
    const f = Number(s?.f || 0);
    const qty = m + f;
    if (qty <= 0) return '';
    const unitPrice = getTypeUnitPrice(type);
    const price = unitPrice * qty;

    const tOut = String(type).replace('(指定)', '');
    const isPair = /\(指定\)$/.test(type) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(type);

    if (isPair) {
      if (m === f) {
        return `${tOut}ペア${m > 1 ? '×' + m : ''} = ${yen(price)}円`;
      }
      const p = [];
      if (m > 0) p.push(`♂×${m}`);
      if (f > 0) p.push(`♀×${f}`);
      return `${tOut} ${p.join(' ')} = ${yen(price)}円`;
    }

    if (m > 0 && f > 0) return `${tOut} ♂×${m} ♀×${f} = ${yen(price)}円`;
    if (m > 0) return `${tOut} ♂×${m} = ${yen(price)}円`;
    return `${tOut} ♀×${f} = ${yen(price)}円`;
  }

  function escapeHtml(s){
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }
  function miniLineToHtml(line){
    const s = String(line ?? '');
    if (!s.trim()) return '&nbsp;';
    let t = escapeHtml(s);
    t = t.replace(/♂×(\d+)/g, '<span class="male">オス×$1</span>');
    t = t.replace(/♀×(\d+)/g, '<span class="female">メス×$1</span>');
    t = t.replace(/♂/g, '<span class="male">オス</span>');
    t = t.replace(/♀/g, '<span class="female">メス</span>');
    return t;
  }

  /* ========= render ========= */
  function buildStepper(kind, key) {
    const wrap = document.createElement('div');
    wrap.className = `stepper ${kind === 'm' ? 'male' : 'female'}`;

    const minus = document.createElement('button');
    minus.className = 'stepBtn';
    minus.type = 'button';
    minus.textContent = '−';

    const val = document.createElement('div');
    val.className = 'stepVal';
    val.textContent = '0';

    const plus = document.createElement('button');
    plus.className = 'stepBtn';
    plus.type = 'button';
    plus.textContent = '+';

    const bump = (delta) => {
      const s = inputState.get(key);
      const k = kind === 'm' ? 'm' : 'f';
      s[k] = Math.max(0, Number(s[k] || 0) + delta);
      val.textContent = String(s[k] || 0);
      syncAll();
    };

    minus.addEventListener('click', () => bump(-1));
    plus.addEventListener('click', () => bump(+1));

    wrap.append(minus, val, plus);
    return { wrap, val };
  }

  function buildTypeSelect(d, key) {
    const div = document.createElement('div');
    div.className = 'type';

    const sel = document.createElement('select');
    sel.className = 'typeSel';
    for (const t of typeList) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    }
    const s = inputState.get(key);
    sel.value = s.type || d.defType || '受精卵';

    sel.addEventListener('change', () => {
      const st = inputState.get(key);
      st.type = sel.value;
      syncAll();
    });

    div.appendChild(sel);
    return { div, sel };
  }

  function buildDupButton(d, key) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill dupPill';
    btn.textContent = '複製';
    btn.addEventListener('click', () => {
      const baseId = dupBase.get(key) || d.id;
      const newKey = `${baseId}__dup_${uid()}`;
      const cur = inputState.get(key);
      inputState.set(newKey, JSON.parse(JSON.stringify(cur)));
      dupBase.set(newKey, baseId);
      renderList();
      syncAll();
    });
    return btn;
  }

  function buildDinoCard(d, key) {
    ensureDinoState(key, d.defType);

    const card = document.createElement('div');
    card.className = 'card';

    const head = document.createElement('div');
    head.className = 'cardHead';
    head.style.padding = '12px';

    const left = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'name';
    title.textContent = d.name;

    const thumb = document.createElement('div');
    thumb.className = 'miniThumb';
    // 画像は将来復旧（今は空のままでもUIは動く）
    left.append(title, thumb);

    const right = document.createElement('div');
    right.style.display = 'grid';
    right.style.gap = '6px';
    right.style.justifyItems = 'end';

    const dupBtn = buildDupButton(d, key);
    const { div: typeDiv, sel: typeSel } = buildTypeSelect(d, key);

    const miniOut = document.createElement('div');
    miniOut.className = 'miniOut';
    miniOut.innerHTML = '&nbsp;';

    const unit = document.createElement('div');
    unit.className = 'unit';
    unit.textContent = `単価${getTypeUnitPrice(inputState.get(key).type)}円`;

    right.append(dupBtn, typeDiv, miniOut, unit);

    head.append(left, right);
    card.appendChild(head);

    const ctrls = document.createElement('div');
    ctrls.className = 'controls';
    ctrls.style.padding = '0 12px 12px';

    const stM = buildStepper('m', key);
    const stF = buildStepper('f', key);

    ctrls.append(stM.wrap, stF.wrap);
    card.appendChild(ctrls);

    card.__refs = { unit, miniOut, stM: stM.val, stF: stF.val, typeSel };
    card.__meta = { id: d.id, key };
    return card;
  }

  function buildItemCard(it) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px';

    const row = document.createElement('div');
    row.className = 'cardHead';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = it.name;

    const unit = document.createElement('div');
    unit.className = 'unit';
    unit.textContent = `${it.unit}個 = ${yen(it.price)}円`;

    row.append(name, unit);
    card.appendChild(row);
    return card;
  }

  function currentDupKeysForBase(baseId) {
    return Array.from(inputState.keys()).filter(k => dupBase.get(k) === baseId);
  }

  function renderList() {
    const root = $('#list');
    if (!root) return;
    root.innerHTML = '';

    const q = norm($('#q')?.value || '');
    if (activeTab === 'item') {
      const show = sortByOrder(items, 'item').filter(it => !q || norm(it.name).includes(q));
      show.forEach(it => root.appendChild(buildItemCard(it)));
      return;
    }

    const sorted = sortByOrder(dinos, 'dino').filter(d => !q || norm(d.name).includes(q));
    for (const d of sorted) {
      root.appendChild(buildDinoCard(d, d.id));
      for (const dk of currentDupKeysForBase(d.id)) {
        root.appendChild(buildDinoCard(d, dk));
      }
    }
  }

  function syncCard(card) {
    const { id, key } = card.__meta || {};
    const d = dinos.find(x => x.id === id);
    if (!d) return;
    const refs = card.__refs;
    const s = inputState.get(key) || { type: d.defType || '受精卵', m: 0, f: 0 };

    refs.stM.textContent = String(s.m || 0);
    refs.stF.textContent = String(s.f || 0);
    refs.typeSel.value = s.type || d.defType || '受精卵';

    const line = dinoSuffixLine(d, s);
    refs.miniOut.innerHTML = miniLineToHtml(line);
    refs.unit.textContent = `単価${getTypeUnitPrice(s.type)}円`;
  }

  function rebuildOutput() {
    const out = $('#out');
    const total = $('#total');
    if (!out || !total) return;

    const lines = [];
    let sum = 0;

    const sorted = sortByOrder(dinos, 'dino');
    for (const d of sorted) {
      const keys = [d.id, ...currentDupKeysForBase(d.id)];
      for (const key of keys) {
        const s = inputState.get(key);
        const line = dinoSuffixLine(d, s);
        if (!line) continue;
        const m = line.match(/=\s*([\d,]+)円$/);
        if (m) sum += Number(String(m[1]).replace(/,/g, '')) || 0;
        lines.push(`${d.name}${line}`);
      }
    }

    out.textContent =
`この度はご検討いただきありがとうございます！
ご希望内容は以下となります👇

${lines.length ? lines.map((l,i)=>`${i+1}. ${l}`).join('\n') : ''}

——————————————
計：${yen(sum)}円`;
    total.textContent = `${yen(sum)}円`;
  }

  function syncAll() {
    if (activeTab === 'dino') {
      $$('#list .card').forEach(syncCard);
    }
    rebuildOutput();
  }

  /* ========= wire UI ========= */
  function wire() {
    $('#tabDinos')?.addEventListener('click', () => {
      activeTab = 'dino';
      $('#tabDinos')?.classList.add('isActive');
      $('#tabItems')?.classList.remove('isActive');
      renderList();
      syncAll();
    });
    $('#tabItems')?.addEventListener('click', () => {
      activeTab = 'item';
      $('#tabItems')?.classList.add('isActive');
      $('#tabDinos')?.classList.remove('isActive');
      renderList();
      syncAll();
    });

    $('#q')?.addEventListener('input', () => { renderList(); syncAll(); });
    $('#qClear')?.addEventListener('click', () => { const q = $('#q'); if (q) q.value=''; renderList(); syncAll(); });

    $('#copy')?.addEventListener('click', async () => {
      const txt = $('#out')?.textContent || '';
      try {
        await navigator.clipboard.writeText(txt);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    });
  }

  async function boot() {
    wire();

    const dTxt = await fetchTextSafe('dinos.txt');
    const iTxt = await fetchTextSafe('items.txt');

    dinos = dTxt.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
    items = iTxt.split(/\r?\n/).map(parseItemLine).filter(Boolean);

    ensureOrderList(dinos, 'dino');
    ensureOrderList(items, 'item');

    $('#tabDinos')?.classList.add('isActive');

    renderList();
    syncAll();
  }

  boot().catch(err => showErr(String(err && err.stack || err)));
})();