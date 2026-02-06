(() => {
  'use strict';

  /* =========================================================
   * utils
   * =======================================================*/
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
    return `${prefix}_${stableHash(norm(name))}`;
  }

  /* =========================================================
   * 丸数字（出力専用）
   * =======================================================*/
  function toCircled(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return String(n ?? '');
    if (x >= 1 && x <= 20) return String.fromCharCode(0x2460 + (x - 1));   // ①〜⑳
    if (x >= 21 && x <= 35) return String.fromCharCode(0x3251 + (x - 21)); // ㉑〜㉟
    if (x >= 36 && x <= 50) return String.fromCharCode(0x32B1 + (x - 36)); // ㊱〜㊿
    return `(${x})`;
  }

  /* =========================================================
   * localStorage keys
   * =======================================================*/
  const LS = {
    PRICES: 'prices_v1',
    DELIVERY: 'delivery_v1',

    // ガチャ（特殊）
    SPECIAL_CONF: 'special_conf_v1', // { dinoId: { max, price, allPrice } }
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

  /* =========================================================
   * prices
   * =======================================================*/
  const defaultPrices = {
    '受精卵': 30,
    '胚': 50,
    '幼体': 100,
    '成体': 500,
  };
  const prices = Object.assign({}, defaultPrices, loadJSON(LS.PRICES, {}));

  /* =========================================================
   * DOM
   * =======================================================*/
  const el = {
    q: $('#q'),
    qClear: $('#qClear'),
    delivery: $('#delivery'),
    copy: $('#copy'),
    total: $('#total'),
    out: $('#out'),
    list: $('#list'),
  };

  /* =========================================================
   * data
   * =======================================================*/
  let dinos = [
    // サンプル：ガチャ
    {
      id: stableId('d', 'ガチャ'),
      name: 'ガチャ',
      kind: 'dino',
      special: true, // ← 特殊
    },
  ];

  const inputState = new Map();

  // 特殊設定（恐竜追加画面から設定される想定）
  const specialConf = loadJSON(LS.SPECIAL_CONF, {
    // [dinoId]: { max: 16, price: 300, allPrice: 3000 }
  });

  /* =========================================================
   * special state
   * =======================================================*/
  function ensureSpecialState(key) {
    if (!inputState.has(key)) {
      inputState.set(key, {
        seq: [],       // 押された番号列 [1,2,3,...]
        all: false,    // 全種
      });
    }
    return inputState.get(key);
  }

  function specialSeqLabel(seq) {
    return (seq || []).map(n => toCircled(n)).join('');
  }

  /* =========================================================
   * output
   * =======================================================*/
  function rebuildOutput() {
    const lines = [];
    let sum = 0;
    let idx = 1;

    for (const d of dinos) {
      if (!d.special) continue;

      const s = ensureSpecialState(d.id);
      const conf = specialConf[d.id];
      if (!conf) continue;

      if (s.all) {
        const price = Number(conf.allPrice || 0);
        sum += price;
        lines.push(
          `${idx}. ${d.name}全種 = ${price.toLocaleString('ja-JP')}円`
        );
        idx++;
        continue;
      }

      if (s.seq.length > 0) {
        const qty = s.seq.length;
        const price = qty * Number(conf.price || 0);
        sum += price;
        lines.push(
          `${idx}. ${d.name}${specialSeqLabel(s.seq)} = ${price.toLocaleString('ja-JP')}円`
        );
        idx++;
      }
    }

    el.total.textContent = yen(sum);

    el.out.value =
`この度はご検討いただきありがとうございます！
ご希望内容は以下となります👇🏻

${lines.join('\n')}
ーーーーーーーーーーーーーーー
計：${sum.toLocaleString('ja-JP')}円
最短納品目安 : ${el.delivery?.value || ''}

ご希望内容、金額をご確認の上購入の方よろしくお願いします🙏🏻`;
  }

  /* =========================================================
   * cards（ガチャ専用）
   * =======================================================*/
  function buildGachaCard(d) {
    const conf = specialConf[d.id];
    if (!conf) return document.createElement('div');

    const s = ensureSpecialState(d.id);

    const card = document.createElement('div');
    card.className = 'card';

    const nums = [];
    for (let i = 1; i <= conf.max; i++) {
      nums.push(`<button class="btn" data-n="${i}">${i}</button>`);
    }

    card.innerHTML = `
      <div class="cardInner">
        <div class="name">${d.name}</div>

        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${nums.join('')}
        </div>

        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn" data-act="all">全種</button>
          <button class="btn" data-act="del">−</button>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const n = e.target?.dataset?.n;
      const act = e.target?.dataset?.act;

      if (n) {
        s.seq.push(Number(n));
        s.all = false;
        rebuildOutput();
      }
      if (act === 'del') {
        s.seq.pop();
        rebuildOutput();
      }
      if (act === 'all') {
        s.all = true;
        s.seq = [];
        rebuildOutput();
      }
    });

    return card;
  }

  /* =========================================================
   * render
   * =======================================================*/
  function renderList() {
    el.list.innerHTML = '';
    dinos.forEach(d => {
      if (d.special) el.list.appendChild(buildGachaCard(d));
    });
    rebuildOutput();
  }

  /* =========================================================
   * init
   * =======================================================*/
  function init() {
    // ガチャ初期設定（なければ作る）
    const gacha = dinos.find(d => d.name === 'ガチャ');
    if (gacha && !specialConf[gacha.id]) {
      specialConf[gacha.id] = {
        max: 16,
        price: 300,
        allPrice: 3000,
      };
      saveJSON(LS.SPECIAL_CONF, specialConf);
    }

    renderList();
  }

  init();
})();