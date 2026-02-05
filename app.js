/* ======================
   Utilities
====================== */
function yen(n){ return Number(n||0).toLocaleString("ja-JP") + "円"; }

// カタカナ→ひらがな（検索安定化：かる で カルカロ が出る）
function kataToHira(str){
  return (str||"").replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
function norm(str){
  return kataToHira(String(str||""))
    .toLowerCase()
    .replace(/\s+/g,"")
    .trim();
}

/* ======================
   Pricing / Types
====================== */
const prices = {
  "受精卵":30, "受精卵(指定)":50,
  "胚":50,   "胚(指定)":100,
  "幼体":100,
  "成体":500,
  "クローン":500, "クローン(指定)":300
};

const hasSpecified = {
  "受精卵":"受精卵(指定)",
  "胚":"胚(指定)",
  "クローン":"クローン(指定)"
};
const baseFromSpecified = {
  "受精卵(指定)":"受精卵",
  "胚(指定)":"胚",
  "クローン(指定)":"クローン"
};

const pairTypes = new Set([
  "受精卵","受精卵(指定)",
  "胚","胚(指定)",
  "幼体","成体",
  "クローン","クローン(指定)"
]);

function displayType(t){
  return String(t||"").replace("(指定)","");
}

/* ======================
   Storage (A方式)
====================== */
const LS_KEY = "dinoList_v1_storage";

function loadStore(){
  try{
    const obj = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return {
      dinosAdded: Array.isArray(obj.dinosAdded) ? obj.dinosAdded : [],
      dinosDeleted: Array.isArray(obj.dinosDeleted) ? obj.dinosDeleted : [],
      itemsAdded: Array.isArray(obj.itemsAdded) ? obj.itemsAdded : [],
      itemsDeleted: Array.isArray(obj.itemsDeleted) ? obj.itemsDeleted : [],
      delivery: typeof obj.delivery === "string" ? obj.delivery : "即納品可能"
    };
  }catch{
    return { dinosAdded:[], dinosDeleted:[], itemsAdded:[], itemsDeleted:[], delivery:"即納品可能" };
  }
}
function saveStore(){
  const obj = {
    dinosAdded: store.dinosAdded,
    dinosDeleted: store.dinosDeleted,
    itemsAdded: store.itemsAdded,
    itemsDeleted: store.itemsDeleted,
    delivery: deliveryEl.value
  };
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

const store = loadStore();

/* ======================
   DOM
====================== */
const qEl = document.getElementById("q");
const qClear = document.getElementById("qClear");
const deliveryEl = document.getElementById("delivery");
const copyBtn = document.getElementById("copy");
const totalEl = document.getElementById("total");
const outEl = document.getElementById("out");

const tabDino = document.getElementById("tabDino");
const tabItem = document.getElementById("tabItem");
const secDino = document.getElementById("secDino");
const secItem = document.getElementById("secItem");

const addBtn = document.getElementById("add");
const manageBtn = document.getElementById("manage");

const modalBack = document.getElementById("modalBack");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalOk = document.getElementById("modalOk");
const modalCancel = document.getElementById("modalCancel");
const modalNote = document.getElementById("modalNote");
const modalX = document.getElementById("modalX");

/* ======================
   Data Models
====================== */
// dino: {name, defType, type, m, f, card, open, normName, autoSpecified:boolean}
// item: {name, unitCount, unitPrice, qty, card, open, normName}
const dinos = [];
const items = [];
const dinoState = new Map();
const itemState = new Map();

let activeTab = "dino"; // "dino" | "item"

/* ======================
   Base file parsers
====================== */
function parseDinoLine(line){
  line = (line||"").trim();
  if(!line) return null;
  if(line.startsWith("#")) return null;

  line = line.replace(/^・/,"").trim();
  if(!line) return null;

  const parts = line.split("|").map(s=>s.trim());
  const name = parts[0] || "";
  const rawType = parts[1] || "";
  if(!name) return null;

  const defType = (rawType && (rawType in prices)) ? rawType : "受精卵";
  return { name, defType };
}

function parseItemLine(line){
  line = (line||"").trim();
  if(!line) return null;
  if(line.startsWith("#")) return null;

  // 形式: 商品名 | 個数単位 | 値段
  const parts = line.split("|").map(s=>s.trim());
  if(parts.length < 3) return null;

  const name = parts[0];
  const unitCount = Number(parts[1]);
  const unitPrice = Number(parts[2]);

  if(!name) return null;
  if(!Number.isFinite(unitCount) || unitCount <= 0) return null;
  if(!Number.isFinite(unitPrice) || unitPrice < 0) return null;

  return { name, unitCount, unitPrice };
}

/* ======================
   Tabs
====================== */
function setTab(next){
  activeTab = next;
  tabDino.classList.toggle("active", next==="dino");
  tabItem.classList.toggle("active", next==="item");
  secDino.classList.toggle("active", next==="dino");
  secItem.classList.toggle("active", next==="item");
  applyFilter();
}
tabDino.onclick = ()=>setTab("dino");
tabItem.onclick = ()=>setTab("item");

/* ======================
   Search
====================== */
function applyFilter(){
  const q = norm(qEl.value);

  if(activeTab === "dino"){
    for(const name of dinos){
      const s = dinoState.get(name);
      const hit = !q || s.normName.includes(q);
      s.card.style.display = hit ? "" : "none";
      if(q && !hit){
        s.open = false;
        s.card.classList.add("collapsed");
      }
    }
  }else{
    for(const name of items){
      const s = itemState.get(name);
      const hit = !q || s.normName.includes(q);
      s.card.style.display = hit ? "" : "none";
      if(q && !hit){
        s.open = false;
        s.card.classList.add("collapsed");
      }
    }
  }
}
qEl.addEventListener("input", applyFilter);
qClear.onclick = ()=>{
  qEl.value = "";
  applyFilter();
};

/* ======================
   Copy + delivery immediate reflect
====================== */
copyBtn.onclick = ()=>{
  const t = outEl.value.trim();
  if(!t) return;

  navigator.clipboard.writeText(t).then(()=>{
    const prev = copyBtn.textContent;
    copyBtn.textContent = "コピー済み✓";
    copyBtn.disabled = true;
    setTimeout(()=>{
      copyBtn.textContent = prev;
      copyBtn.disabled = false;
    }, 1200);
  });
};

deliveryEl.value = store.delivery || "即納品可能";
deliveryEl.onchange = ()=>{
  saveStore();
  rebuildOutput();
};

/* ======================
   Auto collapse helpers
====================== */
function autoCollapseIfEmptyDino(s){
  const q = norm(qEl.value);
  const qty = (s.m||0) + (s.f||0);
  if(q) return;
  if(qty === 0 && !s