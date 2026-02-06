(() => {
  'use strict';

  /* ========= util ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';

  /* ========= state ========= */
  const prices = {
    '受精卵': 30,
    '受精卵(指定)': 50,
    '胚': 50,
    '胚(指定)': 100,
    '幼体': 100,
    '成体': 500,
    'クローン': 500,
    'クローン(指定)': 300,
  };

  const inputState = new Map(); // key -> { m,f,type }
  const duplicatedKeys = new Set();

  /* ========= dom ========= */
  const el = {
    list: $('#list'),
    out: $('#out'),
    total: $('#total'),
    delivery: $('#delivery'),
  };

  /* ========= style patch ========= */
  const style = document.createElement('style');
  style.textContent = `
  .dinoRowWrap{
    position:relative;
    padding-right:78px;
  }
  .dinoRow{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:10px;
  }
  .stepper{
    display:flex;
    align-items:center;
    gap:8px;
    padding:8px;
    border-radius:16px;
    border:1px solid rgba(255,255,255,.14);
  }
  .stepper.male{
    background:rgba(80,160,255,.15);
    border-color:rgba(80,160,255,.45);
  }
  .stepper.female{
    background:rgba(255,120,200,.15);
    border-color:rgba(255,120,200,.45);
  }
  .stepper .btn{
    width:36px;
    height:36px;
    border-radius:12px;
    font-size:18px;
    font-weight:900;
  }
  .stepper .val{
    min-width:24px;
    text-align:center;
    font-weight:900;
    font-size:16px;
  }
  .dupBtn{
    position:absolute;
    right:0;
    top:50%;
    transform:translateY(-50%);
    height:40px;
    width:68px;
    border-radius:16px;
    font-weight:900;
    background:#fff;
    color:#000;
  }
  .card{
    cursor:pointer;
  }
  .card.collapsed .controls{
    display:none;
  }
  `;
  document.head.appendChild(style);

  /* ========= data ========= */
  const dinos = [
    { id: 'd1', name: 'TEKギガノト', defType: '受精卵' },
    { id: 'd2', name: 'TEKケツァル', defType: '受精卵' },
    { id: 'd3', name: 'TEKティラノサウルス', defType: '受精卵' },
    { id: 'd4', name: 'アーケロン', defType: '受精卵' },
  ];

  /* ========= helpers ========= */
  function ensureState(key, defType) {
    if (!inputState.has(key)) {
      inputState.set(key, { m: 0, f: 0, type: defType });
    }
    return inputState.get(key);
  }

  function rebuildOutput() {
    let sum = 0;
    let idx = 1;
    const lines = [];

    dinos.forEach(d => {
      const keys = [d.id, ...[...duplicatedKeys].filter(k => k.startsWith(d.id + '__'))];
      keys.forEach(k => {
        const s = inputState.get(k);
        if (!s) return;
        const qty = s.m + s.f;
        if (qty === 0) return;
        const price = qty * prices[s.type];
        sum += price;
        lines.push(`${idx}. ${d.name}${s.type}×${qty} = ${price.toLocaleString()}円`);
        idx++;
      });
    });

    el.total.textContent = yen(sum);
    el.out.value =
`この度はご検討いただきありがとうございます！
ご希望内容は以下となります👇🏻

${lines.join('\n')}
ーーーーーーーーーーーーーーー
計：${sum.toLocaleString()}円
最短納品目安 : ${el.delivery.value}`;
  }

  /* ========= card ========= */
  function buildDinoCard(d) {
    const key = d.id;
    const s = ensureState(key, d.defType);

    const card = document.createElement('div');
    card.className = 'card collapsed';

    card.innerHTML = `
      <div class="cardHead">
        <div class="name">${d.name}</div>
        <div class="right">
          <select class="type">
            ${Object.keys(prices).map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
          <div class="unit">単価${prices[s.type]}円</div>
        </div>
      </div>

      <div class="controls">
        <div class="dinoRowWrap">
          <div class="dinoRow">
            <div class="stepper male">
              <button class="btn" data-act="m-">−</button>
              <div class="val js-m">${s.m}</div>
              <button class="btn" data-act="m+">＋</button>
            </div>
            <div class="stepper female">
              <button class="btn" data-act="f-">−</button>
              <div class="val js-f">${s.f}</div>
              <button class="btn" data-act="f+">＋</button>
            </div>
          </div>
          <button class="dupBtn" data-act="dup">複製</button>
        </div>
      </div>
    `;

    /* 折りたたみ判定をカード全体に */
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn, select, .dupBtn')) return;
      card.classList.toggle('collapsed');
    });

    card.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'm+') s.m++;
      if (act === 'm-') s.m = Math.max(0, s.m - 1);
      if (act === 'f+') s.f++;
      if (act === 'f-') s.f = Math.max(0, s.f - 1);

      if (act === 'dup') {
        const dupKey = `${key}__${uid()}`;
        duplicatedKeys.add(dupKey);
        inputState.set(dupKey, { m: 0, f: 0, type: s.type });
        card.after(buildDinoCard({ ...d, id: dupKey }));
      }

      $('.js-m', card).textContent = s.m;
      $('.js-f', card).textContent = s.f;
      rebuildOutput();
    });

    $('select', card).addEventListener('change', (e) => {
      s.type = e.target.value;
      $('.unit', card).textContent = `単価${prices[s.type]}円`;
      rebuildOutput();
    });

    return card;
  }

  /* ========= init ========= */
  function init() {
    el.list.innerHTML = '';
    dinos.forEach(d => el.list.appendChild(buildDinoCard(d)));
    rebuildOutput();
  }

  init();
})();