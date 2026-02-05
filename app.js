/* =========================
   恐竜リスト / app.js
   - dinos.txt / items.txt から初期読込
   - 追加/編集/削除/並び替え/価格変更は localStorage 永続
   - カード複製は一時（リロードで消える）
   - 検索は「ひらがな/カタカナ」を揃えて部分一致（例: かる -> カルカロ）
========================= */

const LS_KEY = "dinoList_v1_store";

/* ===== price types ===== */
const DEFAULT_PRICES = {
  "受精卵": 30, "受精卵(指定)": 50,
  "胚": 50, "胚(指定)": 100,
  "幼体": 100,
  "成体": 500,
  "クローン": 500, "クローン(指定)": 300,
};

const SPEC_MAP = {
  "受精卵": "受精卵(指定)",
  "胚": "胚(指定)",
  "クローン": "クローン(指定)",
};
const UNSPEC_MAP = {
  "受精卵(指定)": "受精卵",
  "胚(指定)": "胚",
  "クローン(指定)": "クローン",
};
// ♂♀入力で「ペア/♂♀表記」するタイプ（今までの仕様を踏襲）
const PAIR_TYPES = new Set([
  "受精卵(指定)", "胚(指定)", "幼体", "成体", "クローン", "クローン(指定)",
]);
// ♂♀どちらも入力を許可（常に許可）
const SEX_TYPES = new Set(Object.keys(DEFAULT_PRICES)); // ここは「常に♀も入力可」方針のため全部許可

/* ===== DOM ===== */
const listDinoEl = document.getElementById("listDino");
const listItemEl = document.getElementById("listItem");
const outEl = document.getElementById("out");
const totalEl = document.getElementById("total");
const qEl = document.getElementById("q");
const qClear = document.getElementById("qClear");
const deliveryEl = document.getElementById("delivery");
const copyBtn = document.getElementById("copy");

const tabDino = document.getElementById("tabDino");
const tabItem = document.getElementById("tabItem");

const openManage = document.getElementById("openManage");
const closeManage = document.getElementById("closeManage");
const manageModal = document.getElementById("manageModal");
const modalBackdrop = document.getElementById("modalBackdrop");

const mTabDino = document.getElementById("mTabDino");
const mTabItem = document.getElementById("mTabItem");
const sortKanaBtn = document.getElementById("sortKana");
const manageListEl = document.getElementById("manageList");
const priceGridEl = document.getElementById("priceGrid");
const openAdd = document.getElementById("openAdd");

const editModal = document.getElementById("editModal");
const closeEdit = document.getElementById("closeEdit");
const editTitle = document.getElementById("editTitle");
const editName = document.getElementById("editName");
const editDefault = document.getElementById("editDefault");
const editDefaultWrap = document.getElementById("editDefaultWrap");
const editItemWrap = document.getElementById("editItemWrap");
const editUnit = document.getElementById("editUnit");
const editPrice = document.getElementById("editPrice");
const saveEdit = document.getElementById("saveEdit");

const confirmModal = document.getElementById("confirmModal");
const closeConfirm = document.getElementById("closeConfirm");
const confirmText = document.getElementById("confirmText");
const confirmNo = document.getElementById("confirmNo");
const confirmYes = document.getElementById("confirmYes");

/* ===== helpers ===== */
const uid = () => Math.random().toString(36).slice(2, 10);

function yen(n) {
  return Number(n || 0).toLocaleString("ja-JP") + "円";
}

function clampInt(v) {
  const n = Number(String(v || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* かな検索安定化：カタカナ→ひらがな + 正規化 */
function toHiragana(str) {
  return (str || "").replace(/[ァ-ヶ]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}
function normalizeKey(str) {
  return toHiragana(String(str || ""))
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[　]/g, "")
    .replace(/[・]/g, "");
}

/* ===== store ===== */
let store = null;
/*
store = {
  prices: {type:price...},
  dinos: [{id,name,defType}],
  items: [{id,name,unit,price}],
  order: { dinos:[id..], items:[id..] }
}
*/
function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // seed missing
      s.prices ||= { ...DEFAULT_PRICES };
      s.dinos ||= [];
      s.items ||= [];
      s.order ||= { dinos: s.dinos.map(x => x.id), items: s.items.map(x => x.id) };
      if (!s.order.dinos) s.order.dinos = s.dinos.map(x => x.id);
      if (!s.order.items) s.order.items = s.items.map(x => x.id);
      return s;
    }
  } catch (e) { }
  return null;
}
function saveStore() {
  localStorage.setItem(LS_KEY, JSON.stringify(store));
}

/* ===== parse txt ===== */
function parseDinoLine(line) {
  line = (line || "").trim();
  if (!line || line.startsWith("#")) return null;
  line = line.replace(/^・/, "").trim();
  if (!line) return null;

  // format: name | defType
  const parts = line.split("|").map(s => s.trim());
  const name = parts[0] || "";
  const rawType = parts[1] || "";
  const defType = (rawType && store.prices[rawType] != null) ? rawType : "受精卵";
  return { name, defType };
}

function parseItemLine(line) {
  line = (line || "").trim();
  if (!line || line.startsWith("#")) return null;

  // format: name | unit | price
  const parts = line.split("|").map(s => s.trim());
  if (parts.length < 3) return null;
  const name = parts[0] || "";
  const unit = clampInt(parts[1]);
  const price = clampInt(parts[2]);
  if (!name) return null;
  return { name, unit: unit || 1, price: price || 0 };
}

/* ===== runtime state ===== */
let activeTab = "dino"; // dino | item
let manageTab = "dino";

const dinoInstances = new Map(); // instanceId -> { baseId, type, m, f, open, autoSpecified }
const itemStates = new Map();    // itemId -> { qty, open }

let transientClones = []; // [{instanceId, baseId}]

/* ===== init ===== */
async function init() {
  store = loadStore();
  if (!store) {
    store = {
      prices: { ...DEFAULT_PRICES },
      dinos: [],
      items: [],
      order: { dinos: [], items: [] }
    };

    const [dinoText, itemText] = await Promise.all([
      fetch("dinos.txt?ts=" + Date.now()).then(r => r.text()).catch(() => ""),
      fetch("items.txt?ts=" + Date.now()).then(r => r.text()).catch(() => "")
    ]);

    dinoText.split(/\r?\n/).map(parseDinoLine).filter(Boolean).forEach(({ name, defType }) => {
      const id = uid();
      store.dinos.push({ id, name, defType });
      store.order.dinos.push(id);
    });

    itemText.split(/\r?\n/).map(parseItemLine).filter(Boolean).forEach(({ name, unit, price }) => {
      const id = uid();
      store.items.push({ id, name, unit, price });
      store.order.items.push(id);
    });

    saveStore();
  }

  bindTop();
  bindTabs();
  bindManage();
  renderAll();
  rebuildOutput(); // initial
}

function bindTop() {
  qEl.oninput = () => applySearch();
  qClear.onclick = () => { qEl.value = ""; applySearch(); };

  deliveryEl.onchange = () => rebuildOutput(); // ← 変更即反映

  copyBtn.onclick = async () => {
    const text = outEl.value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const prev = copyBtn.textContent;
      copyBtn.textContent = "コピー済み✓";
      copyBtn.disabled = true;
      setTimeout(() => {
        copyBtn.textContent = prev;
        copyBtn.disabled = false;
      }, 1200);
    } catch (e) {
      // fallback
      outEl.focus();
      outEl.select();
      document.execCommand("copy");
    }
  };
}

function bindTabs() {
  tabDino.onclick = () => setActiveTab("dino");
  tabItem.onclick = () => setActiveTab("item");
}

function setActiveTab(tab) {
  activeTab = tab;
  tabDino.classList.toggle("is-active", tab === "dino");
  tabItem.classList.toggle("is-active", tab === "item");
  tabDino.setAttribute("aria-selected", tab === "dino" ? "true" : "false");
  tabItem.setAttribute("aria-selected", tab === "item" ? "true" : "false");
  listDinoEl.style.display = tab === "dino" ? "" : "none";
  listItemEl.style.display = tab === "item" ? "" : "none";
  applySearch();
}

function bindManage() {
  openManage.onclick = () => openManageModal();
  closeManage.onclick = () => closeManageModal();

  modalBackdrop.onclick = () => {
    // どれか開いてたら閉じる（優先: confirm > edit > manage）
    if (!confirmModal.hidden) closeConfirmModal();
    else if (!editModal.hidden) closeEditModal();
    else if (!manageModal.hidden) closeManageModal();
  };

  mTabDino.onclick = () => { manageTab = "dino"; renderManage(); };
  mTabItem.onclick = () => { manageTab = "item"; renderManage(); };

  sortKanaBtn.onclick = () => sortKana();

  openAdd.onclick = () => openAddModal();

  closeEdit.onclick = () => closeEditModal();
  closeConfirm.onclick = () => closeConfirmModal();
  confirmNo.onclick = () => closeConfirmModal();

  // 背面スクロール停止（iOS対策）
  document.addEventListener("touchmove", (e) => {
    if (!modalBackdrop.hidden) {
      // モーダル外のスクロールを止める
      if (!e.target.closest(".modalBody")) e.preventDefault();
    }
  }, { passive: false });
}

/* ===== render ===== */
function orderedDinos() {
  const map = new Map(store.dinos.map(x => [x.id, x]));
  return store.order.dinos.map(id => map.get(id)).filter(Boolean);
}
function orderedItems() {
  const map = new Map(store.items.map(x => [x.id, x]));
  return store.order.items.map(id => map.get(id)).filter(Boolean);
}

function renderAll() {
  renderDinoList();
  renderItemList();
  renderManage();
  renderPriceGrid();
  applySearch();
}

function renderDinoList() {
  listDinoEl.innerHTML = "";
  transientClones = []; // リロードで消える前提だが、再描画時も消す

  orderedDinos().forEach(d => {
    const instanceId = makeOrGetDinoInstance(d.id, false);
    const card = buildDinoCard(d, instanceId, false);
    listDinoEl.appendChild(card);
  });
}

function renderItemList() {
  listItemEl.innerHTML = "";
  orderedItems().forEach(it => {
    if (!itemStates.has(it.id)) {
      itemStates.set(it.id, { qty: 0, open: false });
    }
    const card = buildItemCard(it);
    listItemEl.appendChild(card);
  });
}

/* ===== Dino instances ===== */
function makeOrGetDinoInstance(baseId, isClone) {
  // base instanceId is baseId itself, clones get a new id
  if (!isClone) {
    const id = baseId;
    if (!dinoInstances.has(id)) {
      const base = store.dinos.find(x => x.id === baseId);
      dinoInstances.set(id, {
        baseId,
        type: base?.defType || "受精卵",
        m: 0, f: 0,
        open: false,
        autoSpecified: false
      });
    }
    return id;
  } else {
    const cloneId = "c_" + uid();
    const base = store.dinos.find(x => x.id === baseId);
    dinoInstances.set(cloneId, {
      baseId,
      type: base?.defType || "受精卵",
      m: 0, f: 0,
      open: true,
      autoSpecified: false
    });
    transientClones.push({ instanceId: cloneId, baseId });
    return cloneId;
  }
}

function buildDinoCard(d, instanceId, isClone) {
  const s = dinoInstances.get(instanceId);

  const card = document.createElement("div");
  card.className = "card collapsed";
  card.dataset.kind = "dino";
  card.dataset.baseId = d.id;
  card.dataset.instanceId = instanceId;
  card.dataset.search = normalizeKey(d.name);

  const typeOptions = Object.keys(store.prices)
    .map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
    .join("");

  card.innerHTML = `
    <div class="head">
      <div class="name">${escapeHtml(d.name)}${isClone ? " (複製)" : ""}</div>
      <div class="right">
        <select class="typeSelect">${typeOptions}</select>
        <div class="unit">単価${yen(store.prices[s.type] || 0)}</div>
      </div>
    </div>

    <div class="body">
      <div class="steppers">
        <div class="step m">
          <div class="stepRow">
            <button class="btn decM" type="button">−</button>
            <div class="val valM">${s.m}</div>
            <button class="btn incM" type="button">＋</button>
            <button class="cloneBtn" type="button">複製</button>
          </div>
        </div>

        <div class="step f">
          <div class="stepRow" style="grid-template-columns:48px 1fr 48px;">
            <button class="btn decF" type="button">−</button>
            <div class="val valF">${s.f}</div>
            <button class="btn incF" type="button">＋</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const sel = card.querySelector(".typeSelect");
  const unit = card.querySelector(".unit");
  sel.value = s.type;

  // open/collapse rule
  syncCollapsed(card, s);

  // tap header toggles open
  card.querySelector(".head").onclick = () => {
    s.open = !s.open;
    syncCollapsed(card, s);
  };

  // type change: keep open state (ここが「変更で勝手に閉じる」防止)
  sel.onchange = () => {
    s.type = sel.value;
    unit.textContent = `単価${yen(store.prices[s.type] || 0)}`;
    // autoSpecified リセットはしない（手動選択の意図を尊重）
    rebuildOutput();
  };

  // quantity buttons
  const valM = card.querySelector(".valM");
  const valF = card.querySelector(".valF");

  card.querySelector(".incM").onclick = () => {
    s.m++;
    onSexInputChanged(s, sel, unit);
    valM.textContent = s.m;
    rebuildOutput();
    syncCollapsed(card, s);
  };
  card.querySelector(".decM").onclick = () => {
    s.m = Math.max(0, s.m - 1);
    onSexInputChanged(s, sel, unit);
    valM.textContent = s.m;
    rebuildOutput();
    syncCollapsed(card, s);
  };
  card.querySelector(".incF").onclick = () => {
    s.f++;
    onSexInputChanged(s, sel, unit);
    valF.textContent = s.f;
    rebuildOutput();
    syncCollapsed(card, s);
  };
  card.querySelector(".decF").onclick = () => {
    s.f = Math.max(0, s.f - 1);
    onSexInputChanged(s, sel, unit);
    valF.textContent = s.f;
    rebuildOutput();
    syncCollapsed(card, s);
  };

  // clone: clone base card only
  card.querySelector(".cloneBtn").onclick = () => {
    const cloneId = makeOrGetDinoInstance(d.id, true);
    const cloneCard = buildDinoCard(d, cloneId, true);
    // insert right after this card
    card.insertAdjacentElement("afterend", cloneCard);
    applySearch();
  };

  return card;
}

function syncCollapsed(card, s) {
  const qty = s.m + s.f;
  const shouldCollapse = (qty === 0 && !s.open);
  card.classList.toggle("collapsed", shouldCollapse);
}

function onSexInputChanged(s, sel, unit) {
  // 「両方入力されたら自動で指定に」
  const both = s.m > 0 && s.f > 0;
  const none = s.m === 0 && s.f === 0;

  const current = s.type;
  const base = UNSPEC_MAP[current] || current; // unspec base name
  const hasSpec = SPEC_MAP[base] != null;

  if (both && hasSpec) {
    const spec = SPEC_MAP[base];
    if (current !== spec) {
      s.type = spec;
      s.autoSpecified = true;
      sel.value = s.type;
      unit.textContent = `単価${yen(store.prices[s.type] || 0)}`;
    }
  }

  // 「自動で指定に変わった後、両方0になったら指定解除」
  if (none && s.autoSpecified) {
    const unspec = UNSPEC_MAP[s.type] || s.type;
    s.type = unspec;
    s.autoSpecified = false;
    sel.value = s.type;
    unit.textContent = `単価${yen(store.prices[s.type] || 0)}`;
  }
}

/* ===== Item card ===== */
function buildItemCard(it) {
  const s = itemStates.get(it.id);

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.kind = "item";
  card.dataset.itemId = it.id;
  card.dataset.search = normalizeKey(it.name);

  card.innerHTML = `
    <div class="head">
      <div class="name">${escapeHtml(it.name)}</div>
      <div class="right">
        <div class="unit">単価${yen(it.price)}</div>
      </div>
    </div>

    <div class="body">
      <div class="step" style="background:rgba(255,255,255,.05)">
        <div class="itemStepRow">
          <button class="btn dec" type="button">−</button>
          <div class="val v">${s.qty}</div>
          <button class="btn inc" type="button">＋</button>
        </div>
        <div class="itemInfo">
          <div>個数単位×${it.unit}</div>
          <div id="shown-${it.id}">×${it.unit * s.qty}</div>
        </div>
      </div>
    </div>
  `;

  const v = card.querySelector(".v");
  const shown = card.querySelector(`#shown-${CSS.escape(it.id)}`);

  const sync = () => {
    v.textContent = s.qty;
    shown.textContent = `×${it.unit * s.qty}`;
  };

  card.querySelector(".inc").onclick = () => { s.qty++; sync(); rebuildOutput(); };
  card.querySelector(".dec").onclick = () => { s.qty = Math.max(0, s.qty - 1); sync(); rebuildOutput(); };

  return card;
}

/* ===== Search ===== */
function applySearch() {
  const qRaw = qEl.value || "";
  const q = normalizeKey(qRaw);

  const apply = (rootEl) => {
    Array.from(rootEl.children).forEach(card => {
      const key = card.dataset.search || "";
      const ok = !q || key.includes(q);
      card.style.display = ok ? "" : "none";
      // 表示/非表示以外は触らない（ここで collapse をいじらない）
    });
  };

  if (activeTab === "dino") apply(listDinoEl);
  else apply(listItemEl);
}

/* ===== Output ===== */
function rebuildOutput() {
  const lines = [];
  let sum = 0;
  let idx = 1;

  // dinos: DOM順で拾う（複製も含む）
  const dinoCards = Array.from(listDinoEl.querySelectorAll(".card"));
  dinoCards.forEach(card => {
    const instanceId = card.dataset.instanceId;
    const s = dinoInstances.get(instanceId);
    if (!s) return;

    const baseId = card.dataset.baseId;
    const d = store.dinos.find(x => x.id === baseId);
    if (!d) return;

    const qty = s.m + s.f;
    if (qty === 0) return;

    const type = s.type;
    const unitPrice = store.prices[type] || 0;
    const price = unitPrice * qty;
    sum += price;

    const t = type.replace("(指定)", "");
    let line = "";

    if (PAIR_TYPES.has(type)) {
      if (s.m === s.f) {
        // ペア
        line = `${d.name}${t}ペア${s.m > 1 ? "×" + s.m : ""} = ${yen(price)}`;
      } else {
        const parts = [];
        if (s.m > 0) parts.push(`♂×${s.m}`);
        if (s.f > 0) parts.push(`♀×${s.f}`);
        line = `${d.name}${t}${parts.length ? " " + parts.join(" ") : ""} = ${yen(price)}`;
      }
    } else {
      line = `${d.name}${t}×${qty} = ${yen(price)}`;
    }

    lines.push(`${idx}. ${line}`);
    idx++;
  });

  // items
  orderedItems().forEach(it => {
    const s = itemStates.get(it.id);
    if (!s || s.qty === 0) return;

    const shownQty = it.unit * s.qty;
    const price = it.price * s.qty;
    sum += price;

    const line = `${it.name}×${shownQty} = ${yen(price)}`;
    lines.push(`${idx}. ${line}`);
    idx++;
  });

  totalEl.textContent = yen(sum);

  outEl.value =
`この度はご検討いただきありがとうございます！
ご希望内容は以下となります👇🏻

${lines.join("\n")}
ーーーーーーーーーーーーーーー
計：${yen(sum)}
最短納品目安 : ${deliveryEl.value}

ご希望内容、金額をご確認の上購入の方よろしくお願いします🙏🏻

また、追加や変更などありましたら、お気軽にお申し付けください👍🏻`;
}

/* ===== Manage modal ===== */
function openManageModal() {
  modalBackdrop.hidden = false;
  manageModal.hidden = false;
  document.body.style.overflow = "hidden";
  renderManage();
  renderPriceGrid();
}
function closeManageModal() {
  manageModal.hidden = true;
  if (editModal.hidden && confirmModal.hidden) {
    modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }
}
function openEditModal() {
  modalBackdrop.hidden = false;
  editModal.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeEditModal() {
  editModal.hidden = true;
  if (manageModal.hidden && confirmModal.hidden) {
    modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }
}
function openConfirmModal() {
  modalBackdrop.hidden = false;
  confirmModal.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeConfirmModal() {
  confirmModal.hidden = true;
  if (manageModal.hidden && editModal.hidden) {
    modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }
}

function renderManage() {
  mTabDino.classList.toggle("is-active", manageTab === "dino");
  mTabItem.classList.toggle("is-active", manageTab === "item");

  manageListEl.innerHTML = "";

  const rows = (manageTab === "dino") ? orderedDinos() : orderedItems();

  rows.forEach((x, i) => {
    const row = document.createElement("div");
    row.className = "manageRow";

    row.innerHTML = `
      <div class="mName">${escapeHtml(x.name)}</div>
      <button class="iconBtn up" type="button">↑</button>
      <button class="iconBtn down" type="button">↓</button>
      <button class="smallBtn edit" type="button">編集</button>
      <button class="smallBtn d del" type="button">削除</button>
    `;

    row.querySelector(".up").onclick = () => moveRow(i, -1);
    row.querySelector(".down").onclick = () => moveRow(i, +1);
    row.querySelector(".edit").onclick = () => startEdit(x);
    row.querySelector(".del").onclick = () => confirmDelete(x);

    manageListEl.appendChild(row);
  });
}

function moveRow(index, delta) {
  const key = manageTab === "dino" ? "dinos" : "items";
  const arr = store.order[key];
  const j = index + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[index], arr[j]] = [arr[j], arr[index]];
  saveStore();
  renderAll();
}

function sortKana() {
  const key = manageTab === "dino" ? "dinos" : "items";
  const list = (manageTab === "dino") ? store.dinos : store.items;
  const map = new Map(list.map(x => [x.id, x]));
  const ids = store.order[key].slice().filter(id => map.has(id));

  ids.sort((a, b) => {
    const A = normalizeKey(map.get(a).name);
    const B = normalizeKey(map.get(b).name);
    return A.localeCompare(B, "ja");
  });

  store.order[key] = ids;
  saveStore();
  renderAll();
}

function renderPriceGrid() {
  priceGridEl.innerHTML = "";
  const keys = Object.keys(store.prices);

  keys.forEach(k => {
    const n = document.createElement("div");
    n.className = "pName";
    n.textContent = k;

    const inp = document.createElement("input");
    inp.value = String(store.prices[k] ?? 0);
    inp.inputMode = "numeric";
    inp.onchange = () => {
      store.prices[k] = clampInt(inp.value);
      saveStore();
      renderAll(); // 単価表示/計算反映
    };

    priceGridEl.appendChild(n);
    priceGridEl.appendChild(inp);
  });
}

/* ===== Add/Edit ===== */
let editMode = null; // {kind:'dino'|'item', id:null|existingId}

function openAddModal() {
  editMode = { kind: manageTab, id: null };
  editTitle.textContent = (manageTab === "dino") ? "恐竜を追加" : "アイテムを追加";
  editName.value = "";

  if (manageTab === "dino") {
    editDefaultWrap.hidden = false;
    editItemWrap.hidden = true;
    fillDefaultSelect();
    editDefault.value = "受精卵";
  } else {
    editDefaultWrap.hidden = true;
    editItemWrap.hidden = false;
    editUnit.value = "1";
    editPrice.value = "0";
  }

  saveEdit.onclick = () => saveEditAction();
  openEditModal();
}

function startEdit(x) {
  editMode = { kind: manageTab, id: x.id };
  editTitle.textContent = "編集";

  editName.value = x.name;

  if (manageTab === "dino") {
    editDefaultWrap.hidden = false;
    editItemWrap.hidden = true;
    fillDefaultSelect();
    editDefault.value = x.defType || "受精卵";
  } else {
    editDefaultWrap.hidden = true;
    editItemWrap.hidden = false;
    editUnit.value = String(x.unit || 1);
    editPrice.value = String(x.price || 0);
  }

  saveEdit.onclick = () => saveEditAction();
  openEditModal();
}

function fillDefaultSelect() {
  editDefault.innerHTML = Object.keys(store.prices)
    .map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
    .join("");
}

function saveEditAction() {
  const name = (editName.value || "").trim();
  if (!name) {
    editName.focus();
    return;
  }

  if (editMode.kind === "dino") {
    const defType = editDefault.value || "受精卵";

    if (editMode.id) {
      const d = store.dinos.find(x => x.id === editMode.id);
      if (!d) return;
      d.name = name;
      d.defType = defType;
    } else {
      const id = uid();
      store.dinos.push({ id, name, defType });
      store.order.dinos.push(id);
    }
  } else {
    const unit = clampInt(editUnit.value) || 1;
    const price = clampInt(editPrice.value) || 0;

    if (editMode.id) {
      const it = store.items.find(x => x.id === editMode.id);
      if (!it) return;
      it.name = name;
      it.unit = unit;
      it.price = price;
    } else {
      const id = uid();
      store.items.push({ id, name, unit, price });
      store.order.items.push(id);
    }
  }

  saveStore();
  closeEditModal();
  renderAll();
}

/* ===== Delete confirm ===== */
let pendingDelete = null;

function confirmDelete(x) {
  pendingDelete = { kind: manageTab, id: x.id };
  confirmText.textContent = `「${x.name}」を削除しますか？`;
  confirmYes.onclick = () => doDelete();
  openConfirmModal();
}
function doDelete() {
  if (!pendingDelete) return;

  if (pendingDelete.kind === "dino") {
    store.dinos = store.dinos.filter(x => x.id !== pendingDelete.id);
    store.order.dinos = store.order.dinos.filter(id => id !== pendingDelete.id);
    // base instance cleanup
    dinoInstances.delete(pendingDelete.id);
  } else {
    store.items = store.items.filter(x => x.id !== pendingDelete.id);
    store.order.items = store.order.items.filter(id => id !== pendingDelete.id);
    itemStates.delete(pendingDelete.id);
  }

  saveStore();
  pendingDelete = null;
  closeConfirmModal();
  renderAll();
}

/* ===== escape ===== */
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ===== boot ===== */
init().catch(err => {
  console.error(err);
  outEl.value = "初期化に失敗しました。dinos.txt / items.txt の場所と内容を確認してください。";
});