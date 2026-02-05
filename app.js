(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
  const toHira = (s) => (s || '').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
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

  /* ========= DOM ========= */
  const el = {
    q: $('#q'),
    qClear: $('#qClear'),
    delivery: $('#delivery'),
    copy: $('#copy'),
    total: $('#total'),
    out: $('#out'),
    tabDino: $('#tabDino'),
    tabItem: $('#tabItem'),
    listDino: $('#listDino'),
    listItem: $('#listItem'),
    manageBtn: $('#manageBtn'),
    modalRoot: $('#modalRoot'),
    modalTitle: $('#modalTitle'),
    modalBody: $('#modalBody'),
  };

  /* ========= reset helper ========= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    location.replace(location.pathname);
    return;
  }

  /* ========= modal (single, never persisted) ========= */
  const modal = (() => {
    let open = false;

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

    function show(title, node) {
      el.modalTitle.textContent = title || '管理';
      el.modalBody.innerHTML = '';
      if (node) el.modalBody.appendChild(node);
      el.modalRoot.classList.add('open');
      el.modalRoot.setAttribute('aria-hidden', 'false');
      open = true;
      lockScroll(true);
    }

    function hide() {
      el.modalRoot.classList.remove('open');
      el.modalRoot.setAttribute('aria-hidden', 'true');
      el.modalBody.innerHTML = '';
      open = false;
      lockScroll(false);
    }

    el.modalRoot.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.act === 'close') hide();
    });
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') hide(); });

    // always closed on boot
    hide();
    return { show, hide, get open() { return open; } };
  })();

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
    dino: loadJSON(LS.DINO_CUSTOM, []), // [{id,name,defType}]
    item: loadJSON(LS.ITEM_CUSTOM, []), // [{id,name,unit,price}]
  };

  let dinos = [];
  let items = [];
  let activeTab = 'dino';

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

  // ♀入力OK、両方>0なら(指定)へ。両方0なら(指定)解除。
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

    // dinos first
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

  /* ========= collapse & search ========= */
  function applyCollapseAndSearch() {
    const q = norm(el.q.value);
    const root = activeTab === 'dino' ? el.listDino : el.listItem;

    $$('[data-card="1"]', root).forEach(card => {
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

      // 通常: qty==0なら畳む / 検索中: ヒット以外畳む
      const collapsed = q ? !show : (qty === 0);
      card.classList.toggle('collapsed', collapsed);
    });
  }

  /* ========= cards ========= */
  function buildDinoCard(d) {
    const key = d.id;
    const s = ensureDinoState(key, d.defType);

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.card = '1';
    card.dataset.key = key;
    card.dataset.name = d.name;

    card.innerHTML = `
      <div class="head">
        <div class="name"></div>
        <div class="right">
          <select class="type"></select>
          <div class="unit"></div>
        </div>
      </div>
      <div class="controls">
        <div class="steppers">
          <div class="step">
            <div class="stepRow">
              <button class="btn" data-act="m-" type="button">−</button>
              <div class="val js-m">0</div>
              <button class="btn" data-act="m+" type="button">＋</button>
              <button class="dupBtn" data-act="dup" type="button">⎘</button>
            </div>
          </div>
          <div class="step">
            <div class="stepRow">
              <button class="btn" data-act="f-" type="button">−</button>
              <div class="val js-f">0</div>
              <button class="btn" data-act="f+" type="button">＋</button>
            </div>
          </div>
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

    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

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

        card.after(dupCard);
        rebuildOutput();
        applyCollapseAndSearch();
      }
    });

    return card;
  }

  function buildItemCard(it) {
    const s = ensureItemState(it.id);

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.card = '1';
    card.dataset.key = it.id;
    card.dataset.name = it.name;

    card.innerHTML = `
      <div class="head">
        <div class="name"></div>
        <div class="right">
          <div class="unit"></div>
        </div>
      </div>
      <div class="controls">
        <div class="steppers">
          <div class="step" style="flex:1">
            <div class="stepRow">
              <button class="btn" data-act="-" type="button">−</button>
              <div class="val js-q">0</div>
              <button class="btn" data-act="+" type="button">＋</button>
            </div>
          </div>
        </div>
      </div>
    `;

    $('.name', card).textContent = it.name;
    $('.unit', card).textContent = `単価${it.price}円`;

    const qEl = $('.js-q', card);
    qEl.textContent = String(s.qty || 0);

    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;
      if (act === '-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
      if (act === '+') s.qty = Math.max(0, Number(s.qty || 0) + 1);
      qEl.textContent = String(s.qty || 0);
      rebuildOutput();
      applyCollapseAndSearch();
    });

    return card;
  }

  /* ========= render ========= */
  function renderAll() {
    el.listDino.innerHTML = '';
    el.listItem.innerHTML = '';

    const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    const iList = sortByOrder(items.filter(i => !hidden.item.has(i.id)), 'item');

    dList.forEach(d => el.listDino.appendChild(buildDinoCard(d)));
    iList.forEach(it => el.listItem.appendChild(buildItemCard(it)));

    rebuildOutput();
    applyCollapseAndSearch();
  }

  /* ========= tabs ========= */
  function setTab(tab) {
    activeTab = tab;
    el.tabDino.classList.toggle('active', tab === 'dino');
    el.tabItem.classList.toggle('active', tab === 'item');
    el.listDino.style.display = tab === 'dino' ? '' : 'none';
    el.listItem.style.display = tab === 'item' ? '' : 'none';
    applyCollapseAndSearch();
  }
  el.tabDino.addEventListener('click', () => setTab('dino'));
  el.tabItem.addEventListener('click', () => setTab('item'));

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

  /* ========= manage ========= */
  function confirmDialog({ title = '確認', message = '', okText = '削除', cancelText = 'キャンセル' }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div style="font-weight:900;margin-bottom:10px;">${title}</div>
        <div style="color:rgba(255,255,255,.75);line-height:1.5;margin-bottom:12px;">${message}</div>
        <div class="mActions">
          <button type="button" data-act="cancel">${cancelText}</button>
          <button type="button" class="danger" data-act="ok">${okText}</button>
        </div>
      `;
      wrap.addEventListener('click', (e) => {
        const a = e.target?.dataset?.act;
        if (a === 'cancel') { modal.hide(); resolve(false); }
        if (a === 'ok') { modal.hide(); resolve(true); }
      });
      modal.show('確認', wrap);
    });
  }

  function openManage() {
    const kind = activeTab; // manage current tab

    const content = document.createElement('div');

    // price editor
    const priceBox = document.createElement('div');
    priceBox.className = 'card';
    priceBox.innerHTML = `<div class="name" style="font-size:16px;margin-bottom:10px;">価格設定</div>`;
    const grid = document.createElement('div');
    grid.className = 'mGrid';
    typeList.forEach(t => {
      const f = document.createElement('div');
      f.className = 'mField';
      f.innerHTML = `
        <label>${t}</label>
        <input type="number" inputmode="numeric" value="${prices[t] || 0}" data-type="${t}">
      `;
      grid.appendChild(f);
    });
    priceBox.appendChild(grid);
    const priceSave = document.createElement('div');
    priceSave.className = 'mActions';
    priceSave.innerHTML = `<button type="button" data-act="savePrices">保存</button>`;
    priceBox.appendChild(priceSave);
    content.appendChild(priceBox);

    // list manager
    const listBox = document.createElement('div');
    listBox.className = 'card';
    listBox.innerHTML = `<div class="name" style="font-size:16px;margin-bottom:10px;">${kind === 'dino' ? '恐竜' : 'アイテム'}管理</div>`;

    // add form (inside manage)
    const add = document.createElement('div');
    add.innerHTML = (kind === 'dino')
      ? `
        <div class="mGrid">
          <div class="mField">
            <label>名前</label>
            <input id="addName" type="text" placeholder="例：カルカロ">
          </div>
          <div class="mField">
            <label>デフォルト</label>
            <select id="addDef">
              ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="mActions"><button type="button" data-act="addOne">追加</button></div>
      `
      : `
        <div class="mGrid">
          <div class="mField">
            <label>名前</label>
            <input id="addName" type="text" placeholder="例：TEK天井">
          </div>
          <div class="mField">
            <label>個数単位</label>
            <input id="addUnit" type="number" inputmode="numeric" placeholder="例：100">
          </div>
        </div>
        <div class="mGrid" style="margin-top:10px;">
          <div class="mField" style="grid-column:1 / -1;">
            <label>単価</label>
            <input id="addPrice" type="number" inputmode="numeric" placeholder="例：100">
          </div>
        </div>
        <div class="mActions"><button type="button" data-act="addOne">追加</button></div>
      `;
    listBox.appendChild(add);

    const sortBar = document.createElement('div');
    sortBar.className = 'mActions';
    sortBar.innerHTML = `<button type="button" data-act="sortKana">50音並び替え</button>`;
    listBox.appendChild(sortBar);

    const rows = document.createElement('div');
    const currentList = (kind === 'dino')
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    currentList.forEach(obj => {
      const r = document.createElement('div');
      r.className = 'mRow';
      r.innerHTML = `
        <div class="mName">${obj.name}</div>
        <button class="mBtn" type="button" data-act="up" data-id="${obj.id}">↑</button>
        <button class="mBtn" type="button" data-act="down" data-id="${obj.id}">↓</button>
        <button class="mBtn" type="button" data-act="edit" data-id="${obj.id}">編集</button>
        <button class="mBtn danger" type="button" data-act="del" data-id="${obj.id}">削除</button>
      `;
      rows.appendChild(r);
    });

    listBox.appendChild(rows);
    content.appendChild(listBox);

    content.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'savePrices') {
        $$('input[data-type]', content).forEach(inp => {
          const t = inp.dataset.type;
          prices[t] = Number(inp.value || 0);
        });
        saveJSON(LS.PRICES, prices);
        renderAll();
        modal.hide();
        return;
      }

      if (act === 'sortKana') {
        const list = kind === 'dino' ? dinos : items;
        const hset = kind === 'dino' ? hidden.dino : hidden.item;
        const visible = list.filter(x => !hset.has(x.id));
        visible.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        order[kind] = visible.map(x => x.id);
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, order[kind]);
        renderAll();
        modal.hide();
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
        renderAll();
        modal.hide();
        return;
      }

      if (act === 'del') {
        const id = e.target.dataset.id;
        const list = kind === 'dino' ? dinos : items;
        const obj = list.find(x => x.id === id);
        const ok = await confirmDialog({ message: `「${obj?.name || ''}」を削除しますか？` });
        if (!ok) return;
        (kind === 'dino' ? hidden.dino : hidden.item).add(id);
        saveJSON(kind === 'dino' ? LS.DINO_HIDDEN : LS.ITEM_HIDDEN,
          Array.from(kind === 'dino' ? hidden.dino : hidden.item)
        );
        renderAll();
        modal.hide();
        return;
      }

      if (act === 'edit') {
        const id = e.target.dataset.id;
        const list = kind === 'dino' ? dinos : items;
        const obj = list.find(x => x.id === id);
        if (!obj) return;

        const form = document.createElement('div');
        if (kind === 'dino') {
          form.innerHTML = `
            <div class="mGrid">
              <div class="mField">
                <label>名前</label>
                <input id="eName" type="text" value="${obj.name}">
              </div>
              <div class="mField">
                <label>デフォルト</label>
                <select id="eDef">
                  ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="mActions"><button type="button" data-act="saveEdit">保存</button></div>
          `;
          $('#eDef', form).value = obj.defType || '受精卵';
        } else {
          form.innerHTML = `
            <div class="mGrid">
              <div class="mField">
                <label>名前</label>
                <input id="eName" type="text" value="${obj.name}">
              </div>
              <div class="mField">
                <label>個数単位</label>
                <input id="eUnit" type="number" inputmode="numeric" value="${obj.unit}">
              </div>
            </div>
            <div class="mGrid" style="margin-top:10px;">
              <div class="mField" style="grid-column:1 / -1;">
                <label>単価</label>
                <input id="ePrice" type="number" inputmode="numeric" value="${obj.price}">
              </div>
            </div>
            <div class="mActions"><button type="button" data-act="saveEdit">保存</button></div>
          `;
        }

        form.addEventListener('click', (ev) => {
          if (ev.target?.dataset?.act !== 'saveEdit') return;

          const newName = $('#eName', form).value.trim();
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

          renderAll();
          modal.hide();
        });

        modal.show('編集', form);
        return;
      }

      if (act === 'addOne') {
        const name = ($('#addName', content)?.value || '').trim();
        if (!name) return;

        if (kind === 'dino') {
          const defType = $('#addDef', content).value;
          const id = 'd_c_' + uid();
          custom.dino.push({ id, name, defType });
          saveJSON(LS.DINO_CUSTOM, custom.dino);
        } else {
          const unit = Number($('#addUnit', content).value || 1);
          const price = Number($('#addPrice', content).value || 0);
          const id = 'i_c_' + uid();
          custom.item.push({ id, name, unit, price });
          saveJSON(LS.ITEM_CUSTOM, custom.item);
        }

        init().then(() => modal.hide());
      }
    });

    modal.show('管理', content);
  }

  el.manageBtn.addEventListener('click', openManage);

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

    renderAll();
    setTab(activeTab);
  }

  init();
})();