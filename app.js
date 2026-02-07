(() => {
'use strict';

/* =========================================================
   utils
========================================================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const yen = n => (Number(n) || 0).toLocaleString('ja-JP') + '円';

const hira = s =>
  String(s || '')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

/* =========================================================
   五十音ソート（TEK対応）
========================================================= */
function kanaKey(name) {
  if (!name) return '';
  if (name.startsWith('TEK')) {
    return hira(name.slice(3));
  }
  return hira(name);
}

/* =========================================================
   circled numbers
========================================================= */
function circled(n) {
  if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
  if (n >= 21 && n <= 35) return String.fromCharCode(0x3251 + n - 21);
  return n;
}

/* =========================================================
   state
========================================================= */
const state = new Map();

/* =========================================================
   safe setter
========================================================= */
function safeText(el, text) {
  if (!el) return;
  el.textContent = text;
}

/* =========================================================
   rebuild output text
========================================================= */
function rebuildOutput() {
  const lines = [];
  let sum = 0;
  let idx = 1;

  state.forEach((s, key) => {
    if (!s) return;

    // SPECIAL
    if (s.mode === 'special') {
      if (s.all) {
        sum += s.allPrice;
        lines.push(`${idx}. ${s.name} 全種 = ${yen(s.allPrice)}`);
        idx++;
        return;
      }
      if (Array.isArray(s.picks) && s.picks.length) {
        const price = s.picks.length * s.unitPrice;
        sum += price;
        lines.push(
          `${idx}. ${s.name}${s.picks.map(circled).join('')} = ${yen(price)}`
        );
        idx++;
      }
      return;
    }

    // NORMAL
    const qty = (s.m || 0) + (s.f || 0);
    if (qty <= 0) return;

    const price = qty * s.unitPrice;
    sum += price;
    lines.push(`${idx}. ${s.name} ×${qty} = ${yen(price)}`);
    idx++;
  });

  $('#total').textContent = yen(sum);
  $('#out').value =
`この度はご検討いただきありがとうございます！
ご希望内容は以下となります👇🏻

${lines.join('\n')}
ーーーーーーーーーーーーーーー
計：${yen(sum)}`;
}

/* =========================================================
   card builder
========================================================= */
function buildCard(d) {
  const card = document.createElement('div');
  card.className = 'card';

  const s = {
    name: d.name,
    unitPrice: d.unitPrice || 0,
    mode: d.special ? 'special' : 'normal',
    picks: [],
    all: false,
    allPrice: d.allPrice || 0,
    m: 0,
    f: 0
  };

  state.set(d.id, s);

  card.innerHTML = `
    <div class="cardHead">
      <div class="name">${d.name}</div>
    </div>

    <div class="cardBody">
      <div class="cardOutput"></div>
    </div>
  `;

  const outputEl = $('.cardOutput', card);

  function syncCardOutput() {
    try {
      if (s.mode === 'special') {
        if (s.all) {
          safeText(outputEl, `全種 = ${yen(s.allPrice)}`);
        } else if (s.picks.length) {
          safeText(
            outputEl,
            `${s.picks.map(circled).join('')} = ${yen(s.picks.length * s.unitPrice)}`
          );
        } else {
          safeText(outputEl, '未入力');
        }
      } else {
        const q = s.m + s.f;
        safeText(
          outputEl,
          q > 0 ? `×${q} = ${yen(q * s.unitPrice)}` : '未入力'
        );
      }
    } catch (e) {
      safeText(outputEl, '描画エラー');
      console.error('card output error:', d.name, e);
    }
  }

  syncCardOutput();

  card.addEventListener('click', () => {
    card.classList.toggle('open');
    syncCardOutput();
  });

  return card;
}

/* =========================================================
   render list
========================================================= */
function renderList(list) {
  const root = $('#list');
  root.innerHTML = '';

  list
    .slice()
    .sort((a, b) => kanaKey(a.name).localeCompare(kanaKey(b.name), 'ja'))
    .forEach(d => {
      try {
        root.appendChild(buildCard(d));
      } catch (e) {
        console.error('render error:', d.name, e);
      }
    });

  rebuildOutput();
}

/* =========================================================
   dummy data (example)
========================================================= */
const dinos = [
  { id: 'kamakiri', name: 'カマキリ', unitPrice: 30 },
  { id: 'karukaro', name: 'カルカロ', special: true, unitPrice: 500, allPrice: 10000 },
  { id: 'tekrex', name: 'TEKティラノサウルス', unitPrice: 30 }
];

/* =========================================================
   init
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  renderList(dinos);
});

})();