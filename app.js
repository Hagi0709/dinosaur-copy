/* ======================
   Utils
====================== */
function yen(n){ return Number(n||0).toLocaleString("ja-JP") + "円"; }

// カタカナ→ひらがな（検索安定：かる → カルカロ）
function kataToHira(str){
  return (str||"").replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
function normHira(str){
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

const SPEC_FOR_BASE = {
  "受精卵":"受精卵(指定)",
  "胚":"胚(指定)",
  "クローン":"クローン(指定)"
};
const BASE_FOR_SPEC = {
  "受精卵(指定)":"受精卵",
  "胚(指定)":"胚",
  "クローン(指定)":"クローン"
};

// ペア表記対象（同数時のみ）
const pairTypes = new Set([
  "受精卵(指定)","胚(指定)","幼体","成体","クローン","クローン(指定)"
]);

function displayType(t){
  return String(t||"").replace("(指定)","");
}

/* ======================
   Storage
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
const store = loadStore();

function saveStore(){
  localStorage.setItem(LS_KEY, JSON.stringify({
    dinosAdded: store.dinosAdded,
    dinosDeleted: store.dinosDeleted,
    itemsAdded: store.itemsAdded,
    itemsDeleted: store.itemsDeleted,
    delivery: deliveryEl.value
  }));
}

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

const manageBtn = document.getElementById("manage");

const modalBack = document.getElementById("modalBack");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalOk = document.getElementById("modalOk");
const modalNote = document.getElementById("modalNote");

/* ======================
   Models
====================== */
// dino: {name, defType, type, m, f, card, open, normName, autoSpecified:boolean, userChangedType:boolean}
// item: {name, unitCount, unitPrice, qty, card, open, normName}
const dinos = [];
const items = [];
const dinoState = new Map();
const itemState = new Map();
let activeTab = "dino";

/* ======================
   Parsers
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
   Merge base + local
====================== */
function mergeDinos(base){
  const deleted = new Set(store.dinosDeleted || []);
  const added = store.dinosAdded || [];
  const map = new Map();

  for(const rec of base){
    if(deleted.has(rec.name)) continue;
    map.set(rec.name, rec);
  }
  for(const rec of added){
    if(!rec || !rec.name) continue;
    if(deleted.has(rec.name)) continue;
    const defType = (rec.defType && (rec.defType in prices)) ? rec.defType : "受精卵";
    map.set(rec.name, { name: rec.name, defType });
  }
  return Array.from(map.values());
}

function mergeItems(base){
  const deleted = new Set(store.itemsDeleted || []);
  const added = store.itemsAdded || [];
  const map = new Map();

  for(const rec of base){
    if(deleted.has(rec.name)) continue;
    map.set(rec.name, rec);
  }
  for(const rec of added){
    if(!rec || !rec.name) continue;
    if(deleted.has(rec.name)) continue;

    const unitCount = Number(rec.unitCount);
    const unitPrice = Number(rec.unitPrice);
    if(!Number.isFinite(unitCount) || unitCount<=0) continue;
    if(!Number.isFinite(unitPrice) || unitPrice<0) continue;

    map.set(rec.name, { name: rec.name, unitCount, unitPrice });
  }
  return Array.from(map.values());
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
  const q = normHira(qEl.value);

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
   Copy + delivery immediate
====================== */
deliveryEl.value = store.delivery || "即納品可能";
deliveryEl.onchange = ()=>{
  saveStore();
  rebuildOutput();
};

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

/* ======================
   Modal helpers (scroll lock)
====================== */
function showModal(){
  modalBack.classList.add("show");
  document.body.classList.add("modalOpen");
}
function hideModal(){
  modalBack.classList.remove("show");
  document.body.classList.remove("modalOpen");
  modalBody.innerHTML = "";
  modalNote.textContent = "";
  // modalOk の onclick は都度上書きするので念のため解除
  modalOk.onclick = null;
}
modalOk.onclick = hideModal;
modalBack.addEventListener("click", (e)=>{
  if(e.target === modalBack) hideModal();
});

/* ======================
   Auto (指定)
====================== */
function applyAutoSpecified(s){
  const both = (s.m > 0 && s.f > 0);
  const allZero = (s.m === 0 && s.f === 0);

  const isSpecified = s.type.endsWith("(指定)");
  const base = isSpecified ? (BASE_FOR_SPEC[s.type] || s.type) : s.type;

  if(both){
    const to = SPEC_FOR_BASE[base];
    if(to && s.type !== to){
      s.type = to;
      s.autoSpecified = true;
    }
  }

  if(allZero){
    if(s.autoSpecified && isSpecified){
      const back = BASE_FOR_SPEC[s.type];
      if(back){
        s.type = back;
        s.autoSpecified = false;
      }
    }
  }
}

/* ======================
   Output (shared)
====================== */
function rebuildOutput(){
  let lines = [];
  let sum = 0;
  let idx = 1;

  // dinos first
  for(const name of dinos){
    const s = dinoState.get(name);
    const qty = (s.m||0) + (s.f||0);
    if(qty === 0) continue;

    const price = (prices[s.type]||0) * qty;
    sum += price;

    const t = displayType(s.type);
    let line = "";

    if(pairTypes.has(s.type) && s.m === s.f && s.m > 0){
      line = `${name}${t}ペア${s.m>1 ? "×"+s.m : ""} = ${yen(price)}`;
    }else if(pairTypes.has(s.type)){
      const parts = [];
      if(s.m>0) parts.push(`♂×${s.m}`);
      if(s.f>0) parts.push(`♀×${s.f}`);
      line = `${name}${t} ${parts.join(" ")} = ${yen(price)}`.replace(/\s+ =/," =");
    }else{
      line = `${name}${t}×${qty} = ${yen(price)}`;
    }

    lines.push(`${idx}. ${line}`);
    idx++;
  }

  // items next
  for(const name of items){
    const s = itemState.get(name);
    const q = s.qty || 0;
    if(q === 0) continue;

    const totalCount = q * s.unitCount;
    const price = q * s.unitPrice;
    sum += price;

    lines.push(`${idx}. ${name} × ${totalCount} = ${yen(price)}`);
    idx++;
  }

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

/* ======================
   Card builders
====================== */
function makeDinoCard(name, defType){
  const s = {
    name,
    defType,
    type: defType,
    m:0,
    f:0,
    open:false,
    autoSpecified:false,
    userChangedType:false,
    normName: normHira(name),
    card:null
  };

  const card = document.createElement("div");
  s.card = card;
  card.className = "card collapsed";

  card.innerHTML = `
    <div class="cardHeader">
      <div class="name">${name}</div>
      <div class="right">
        <select class="type">
          ${Object.keys(prices).map(t=>`<option value="${t}">${t}</option>`).join("")}
        </select>
        <div class="unit">単価${prices[defType]}円</div>
      </div>
    </div>

    <div class="cardBody">
      <div class="stepRow">
        <div class="box m">
          <div class="stepper">
            <button class="btn" data-sex="m" data-d="-1" type="button">−</button>
            <div class="val mc">0</div>
            <button class="btn" data-sex="m" data-d="1" type="button">＋</button>
          </div>
        </div>

        <div class="box f">
          <div class="stepper">
            <button class="btn" data-sex="f" data-d="-1" type="button">−</button>
            <div class="val fc">0</div>
            <button class="btn" data-sex="f" data-d="1" type="button">＋</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const header = card.querySelector(".cardHeader");
  const sel = card.querySelector("select.type");
  const unit = card.querySelector(".unit");
  const mc = card.querySelector(".mc");
  const fc = card.querySelector(".fc");

  sel.value = s.type;
  unit.textContent = `単価${prices[s.type]}円`;

  header.onclick = (e)=>{
    if(e.target && (e.target.tagName === "SELECT" || e.target.closest("select"))) return;
    s.open = !s.open;
    card.classList.toggle("collapsed", !s.open);
  };

  sel.onchange = ()=>{
    s.type = sel.value;
    s.userChangedType = true;
    s.autoSpecified = false;
    unit.textContent = `単価${prices[s.type]}円`;

    if(s.open) card.classList.remove("collapsed");

    rebuildOutput();
    saveStore();
  };

  card.querySelectorAll(".btn").forEach(b=>{
    b.onclick = ()=>{
      const sex = b.dataset.sex;
      const d = Number(b.dataset.d);

      s[sex] = Math.max(0, (s[sex]||0) + d);

      applyAutoSpecified(s);

      sel.value = s.type;
      unit.textContent = `単価${prices[s.type]}円`;
      mc.textContent = s.m;
      fc.textContent = s.f;

      if((s.m+s.f) === 0){
        s.open = false;
        card.classList.add("collapsed");
      }

      rebuildOutput();
      saveStore();
    };
  });

  dinoState.set(name, s);
  secDino.appendChild(card);
  return s;
}

function makeItemCard(name, unitCount, unitPrice){
  const s = {
    name,
    unitCount,
    unitPrice,
    qty:0,
    open:false,
    normName: normHira(name),
    card:null
  };

  const card = document.createElement("div");
  s.card = card;
  card.className = "card collapsed";

  card.innerHTML = `
    <div class="cardHeader">
      <div class="name">${name}</div>
      <div class="right">
        <div class="unit">単位${unitCount} / 単価${unitPrice}円</div>
      </div>
    </div>

    <div class="cardBody">
      <div class="stepRow">
        <div class="box item">
          <div class="stepper">
            <button class="btn" data-d="-1" type="button">−</button>
            <div class="val vc">0</div>
            <button class="btn" data-d="1" type="button">＋</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const header = card.querySelector(".cardHeader");
  const vc = card.querySelector(".vc");

  header.onclick = ()=>{
    s.open = !s.open;
    card.classList.toggle("collapsed", !s.open);
  };

  card.querySelectorAll(".btn").forEach(b=>{
    b.onclick = ()=>{
      const d = Number(b.dataset.d);
      s.qty = Math.max(0, (s.qty||0) + d);
      vc.textContent = s.qty;

      if(s.qty === 0){
        s.open = false;
        card.classList.add("collapsed");
      }

      rebuildOutput();
      saveStore();
    };
  });

  itemState.set(name, s);
  secItem.appendChild(card);
  return s;
}

/* ======================
   Add / Manage (ADD is inside Manage)
====================== */
manageBtn.onclick = ()=> openManage();

function openManage(){
  modalTitle.textContent = "管理";
  modalOk.textContent = "閉じる";

  // 追加ボタンを管理画面内へ
  const addLabel = (activeTab==="dino") ? "＋恐竜を追加" : "＋アイテムを追加";

  const list = (activeTab==="dino") ? dinos : items;

  const rows = list.map(name=>{
    return `
      <div class="mRow">
        <div class="mName">${name}</div>
        <div class="mBtns">
          <button class="delBtn" data-name="${name}" type="button">削除</button>
        </div>
      </div>
    `;
  }).join("");

  modalBody.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:10px;">
      <button id="mAdd" class="addBtn" type="button" style="flex:1;">${addLabel}</button>
    </div>
    <div class="form" style="gap:10px;">
      ${rows || `<div class="smallNote">一覧がありません</div>`}
    </div>
  `;

  modalNote.textContent = "削除はこの端末での表示/保存から外します（後で再追加できます）";

  // 削除は確認
  modalBody.querySelectorAll(".delBtn").forEach(btn=>{
    btn.onclick = ()=>{
      const name = btn.dataset.name;
      if(!confirm(`「${name}」を削除しますか？`)) return;

      if(activeTab==="dino") deleteDino(name);
      else deleteItem(name);

      // 再描画
      openManage();
    };
  });

  // 追加
  const addBtnIn = document.getElementById("mAdd");
  addBtnIn.onclick = ()=>{
    if(activeTab==="dino") openAddDino();
    else openAddItem();
  };

  showModal();
  modalOk.onclick = hideModal;
}

function openAddDino(){
  modalTitle.textContent = "恐竜を追加";
  modalOk.textContent = "追加";
  modalNote.textContent = "※追加はこの端末に保存されます（リロードしても残ります）";

  modalBody.innerHTML = `
    <div class="form">
      <div class="field">
        <label>名前</label>
        <input id="newName" placeholder="例：カルカロ" />
      </div>
      <div class="field">
        <label>デフォルト</label>
        <select id="newType">
          ${Object.keys(prices).map(t=>`<option value="${t}">${t}</option>`).join("")}
        </select>
      </div>
    </div>
  `;

  showModal();

  modalOk.onclick = ()=>{
    const name = (document.getElementById("newName").value || "").trim();
    const defType = document.getElementById("newType").value;
    if(!name) return;

    store.dinosDeleted = (store.dinosDeleted||[]).filter(n=>n!==name);

    const added = store.dinosAdded || [];
    const i = added.findIndex(r=>r && r.name===name);
    const rec = { name, defType };
    if(i >= 0) added[i] = rec;
    else added.push(rec);
    store.dinosAdded = added;

    saveStore();

    if(!dinos.includes(name)){
      dinos.push(name);
      makeDinoCard(name, (defType in prices) ? defType : "受精卵");
      applyFilter();
      rebuildOutput();
    }

    hideModal();
    // 追加後は管理に戻す
    openManage();
  };
}

function openAddItem(){
  modalTitle.textContent = "アイテムを追加";
  modalOk.textContent = "追加";
  modalNote.textContent = "形式：商品名 | 個数単位 | 値段（例：TEK天井 / 100 / 100）";

  modalBody.innerHTML = `
    <div class="form">
      <div class="field">
        <label>商品名</label>
        <input id="newItemName" placeholder="例：TEK天井" />
      </div>
      <div class="field">
        <label>個数単位</label>
        <input id="newUnitCount" inputmode="numeric" placeholder="例：100" />
      </div>
      <div class="field">
        <label>値段</label>
        <input id="newUnitPrice" inputmode="numeric" placeholder="例：100" />
      </div>
    </div>
  `;

  showModal();

  modalOk.onclick = ()=>{
    const name = (document.getElementById("newItemName").value || "").trim();
    const unitCount = Number((document.getElementById("newUnitCount").value || "").trim());
    const unitPrice = Number((document.getElementById("newUnitPrice").value || "").trim());

    if(!name) return;
    if(!Number.isFinite(unitCount) || unitCount<=0) return;
    if(!Number.isFinite(unitPrice) || unitPrice<0) return;

    store.itemsDeleted = (store.itemsDeleted||[]).filter(n=>n!==name);

    const added = store.itemsAdded || [];
    const i = added.findIndex(r=>r && r.name===name);
    const rec = { name, unitCount, unitPrice };
    if(i >= 0) added[i] = rec;
    else added.push(rec);
    store.itemsAdded = added;

    saveStore();

    if(!items.includes(name)){
      items.push(name);
      makeItemCard(name, unitCount, unitPrice);
      applyFilter();
      rebuildOutput();
    }

    hideModal();
    openManage();
  };
}

function deleteDino(name){
  const s = dinoState.get(name);
  if(s && s.card) s.card.remove();
  dinoState.delete(name);

  store.dinosAdded = (store.dinosAdded||[]).filter(r=>r && r.name!==name);
  if(!(store.dinosDeleted||[]).includes(name)){
    store.dinosDeleted = [...(store.dinosDeleted||[]), name];
  }
  saveStore();

  const i = dinos.indexOf(name);
  if(i>=0) dinos.splice(i,1);

  rebuildOutput();
  applyFilter();
}

function deleteItem(name){
  const s = itemState.get(name);
  if(s && s.card) s.card.remove();
  itemState.delete(name);

  store.itemsAdded = (store.itemsAdded||[]).filter(r=>r && r.name!==name);
  if(!(store.itemsDeleted||[]).includes(name)){
    store.itemsDeleted = [...(store.itemsDeleted||[]), name];
  }
  saveStore();

  const i = items.indexOf(name);
  if(i>=0) items.splice(i,1);

  rebuildOutput();
  applyFilter();
}

/* ======================
   Load base files + build
====================== */
async function loadAll(){
  const [dinoText, itemText] = await Promise.all([
    fetch("./dinos.txt?ts="+Date.now()).then(r=>r.ok ? r.text() : ""),
    fetch("./items.txt?ts="+Date.now()).then(r=>r.ok ? r.text() : "")
  ]);

  const baseDinos = dinoText.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
  const baseItems = itemText.split(/\r?\n/).map(parseItemLine).filter(Boolean);

  const mergedDinos = mergeDinos(baseDinos);
  const mergedItems = mergeItems(baseItems);

  mergedDinos.forEach(({name, defType})=>{
    dinos.push(name);
    makeDinoCard(name, defType);
  });

  mergedItems.forEach(({name, unitCount, unitPrice})=>{
    items.push(name);
    makeItemCard(name, unitCount, unitPrice);
  });

  applyFilter();
  rebuildOutput();
}

loadAll();