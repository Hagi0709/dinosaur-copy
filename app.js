(() => {
  "use strict";

  /* ===== Utils ===== */
  const $ = (id) => document.getElementById(id);
  const yen = (n) => Number(n || 0).toLocaleString("ja-JP") + "円";

  // カタカナ→ひらがな（かる で カルカロ が出る）
  const kataToHira = (str) =>
    String(str || "").replace(/[\u30A1-\u30F6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );

  const norm = (str) =>
    kataToHira(String(str || ""))
      .toLowerCase()
      .replace(/\s+/g, "")
      .trim();

  /* ===== DOM ===== */
  const qEl = $("q");
  const qClear = $("qClear");
  const deliveryEl = $("delivery");
  const copyBtn = $("copy");
  const totalEl = $("total");
  const outEl = $("out");

  const tabDino = $("tabDino");
  const tabItem = $("tabItem");
  const secDino = $("secDino");
  const secItem = $("secItem");

  const addBtn = $("add");
  const manageBtn = $("manage");

  const modalBack = $("modalBack");
  const modalTitle = $("modalTitle");
  const modalBody = $("modalBody");
  const modalOk = $("modalOk");
  const modalCancel = $("modalCancel");
  const modalNote = $("modalNote");
  const modalX = $("modalX");

  /* ===== Guard: DOM must exist ===== */
  if (!qEl || !secDino || !secItem) {
    outEl.value = "【致命エラー】DOM が見つかりません。index.html を全置換してください。";
    return;
  }

  /* ===== Pricing ===== */
  const prices = {
    "受精卵": 30,
    "受精卵(指定)": 50,
    "胚": 50,
    "胚(指定)": 100,
    "幼体": 100,
    "成体": 500,
    "クローン": 500,
    "クローン(指定)": 300,
  };

  const pairTypes = new Set([
    "受精卵", "受精卵(指定)",
    "胚", "胚(指定)",
    "幼体", "成体",
    "クローン", "クローン(指定)",
  ]);

  const hasSpecified = { "受精卵": "受精卵(指定)", "胚": "胚(指定)", "クローン": "クローン(指定)" };
  const baseFromSpecified = { "受精卵(指定)": "受精卵", "胚(指定)": "胚", "クローン(指定)": "クローン" };
  const displayType = (t) => String(t || "").replace("(指定)", "");

  /* ===== Storage ===== */
  const LS_KEY = "dinoList_v1_storage";
  const store = (() => {
    try {
      const obj = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      return {
        dinosAdded: Array.isArray(obj.dinosAdded) ? obj.dinosAdded : [],
        dinosDeleted: Array.isArray(obj.dinosDeleted) ? obj.dinosDeleted : [],
        itemsAdded: Array.isArray(obj.itemsAdded) ? obj.itemsAdded : [],
        itemsDeleted: Array.isArray(obj.itemsDeleted) ? obj.itemsDeleted : [],
        delivery: typeof obj.delivery === "string" ? obj.delivery : "即納品可能",
      };
    } catch {
      return { dinosAdded: [], dinosDeleted: [], itemsAdded: [], itemsDeleted: [], delivery: "即納品可能" };
    }
  })();

  const saveStore = () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        dinosAdded: store.dinosAdded,
        dinosDeleted: store.dinosDeleted,
        itemsAdded: store.itemsAdded,
        itemsDeleted: store.itemsDeleted,
        delivery: deliveryEl.value,
      })
    );
  };

  deliveryEl.value = store.delivery || "即納品可能";

  /* ===== Data ===== */
  const dinos = [];
  const items = [];
  const dinoState = new Map(); // name -> state
  const itemState = new Map();

  let activeTab = "dino";

  /* ===== Parsers ===== */
  function parseDinoLine(line) {
    line = (line || "").trim();
    if (!line) return null;
    if (line.startsWith("#")) return null;
    line = line.replace(/^・/, "").trim();
    if (!line) return null;

    const parts = line.split("|").map((s) => s.trim());
    const name = parts[0] || "";
    const rawType = parts[1] || "";
    if (!name) return null;
    const defType = rawType && rawType in prices ? rawType : "受精卵";
    return { name, defType };
  }

  function parseItemLine(line) {
    line = (line || "").trim();
    if (!line) return null;
    if (line.startsWith("#")) return null;

    const parts = line.split("|").map((s) => s.trim());
    if (parts.length < 3) return null;

    const name = parts[0];
    const unitCount = Number(parts[1]);
    const unitPrice = Number(parts[2]);
    if (!name) return null;
    if (!Number.isFinite(unitCount) || unitCount <= 0) return null;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;

    return { name, unitCount, unitPrice };
  }

  /* ===== Merge base + local ===== */
  function mergeDinos(base) {
    const deleted = new Set(store.dinosDeleted || []);
    const added = store.dinosAdded || [];
    const map = new Map();

    for (const rec of base) {
      if (deleted.has(rec.name)) continue;
      map.set(rec.name, rec);
    }
    for (const rec of added) {
      if (!rec || !rec.name) continue;
      if (deleted.has(rec.name)) continue;
      const defType = rec.defType && rec.defType in prices ? rec.defType : "受精卵";
      map.set(rec.name, { name: rec.name, defType });
    }
    return Array.from(map.values());
  }

  function mergeItems(base) {
    const deleted = new Set(store.itemsDeleted || []);
    const added = store.itemsAdded || [];
    const map = new Map();

    for (const rec of base) {
      if (deleted.has(rec.name)) continue;
      map.set(rec.name, rec);
    }
    for (const rec of added) {
      if (!rec || !rec.name) continue;
      if (deleted.has(rec.name)) continue;
      const unitCount = Number(rec.unitCount);
      const unitPrice = Number(rec.unitPrice);
      if (!Number.isFinite(unitCount) || unitCount <= 0) continue;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
      map.set(rec.name, { name: rec.name, unitCount, unitPrice });
    }
    return Array.from(map.values());
  }

  /* ===== Tabs ===== */
  function setTab(next) {
    activeTab = next;
    tabDino.classList.toggle("active", next === "dino");
    tabItem.classList.toggle("active", next === "item");
    secDino.classList.toggle("active", next === "dino");
    secItem.classList.toggle("active", next === "item");
    applyFilter();
  }
  tabDino.onclick = () => setTab("dino");
  tabItem.onclick = () => setTab("item");

  /* ===== Filter ===== */
  function applyFilter() {
    const q = norm(qEl.value);

    if (activeTab === "dino") {
      for (const name of dinos) {
        const s = dinoState.get(name);
        if (!s) continue;
        const hit = !q || s.normName.includes(q);
        s.card.style.display = hit ? "" : "none";
        if (q && !hit) {
          s.open = false;
          s.card.classList.add("collapsed");
        }
      }
    } else {
      for (const name of items) {
        const s = itemState.get(name);
        if (!s) continue;
        const hit = !q || s.normName.includes(q);
        s.card.style.display = hit ? "" : "none";
        if (q && !hit) {
          s.open = false;
          s.card.classList.add("collapsed");
        }
      }
    }
  }
  qEl.addEventListener("input", applyFilter);
  qClear.onclick = () => {
    qEl.value = "";
    applyFilter();
  };

  /* ===== Copy & delivery reflect ===== */
  copyBtn.onclick = () => {
    const t = outEl.value.trim();
    if (!t) return;
    navigator.clipboard.writeText(t).then(() => {
      const prev = copyBtn.textContent;
      copyBtn.textContent = "コピー済み✓";
      copyBtn.disabled = true;
      setTimeout(() => {
        copyBtn.textContent = prev;
        copyBtn.disabled = false;
      }, 1200);
    });
  };

  deliveryEl.onchange = () => {
    saveStore();
    rebuildOutput();
  };

  /* ===== Auto 지정 logic ===== */
  function updateAutoSpecified(s) {
    const both = s.m > 0 && s.f > 0;
    const allZero = s.m === 0 && s.f === 0;
    const isSpecified = s.type.endsWith("(指定)");
    const base = baseFromSpecified[s.type];

    if (both) {
      const to = hasSpecified[s.type] || (base && hasSpecified[base]);
      if (to && !isSpecified) {
        s.type = to;
        s.autoSpecified = true;
      } else if (to && isSpecified) {
        s.type = to;
        s.autoSpecified = true;
      }
    } else if (allZero) {
      if (s.autoSpecified && isSpecified && base) {
        s.type = base;
        s.autoSpecified = false;
      }
    }
  }

  /* ===== Output ===== */
  function rebuildOutput() {
    let lines = [];
    let sum = 0;
    let idx = 1;

    // dinos first
    for (const name of dinos) {
      const s = dinoState.get(name);
      if (!s) continue;
      const qty = (s.m || 0) + (s.f || 0);
      if (qty === 0) continue;

      const price = (prices[s.type] || 0) * qty;
      sum += price;

      const t = displayType(s.type);
      let line = "";

      if (pairTypes.has(s.type) && s.m === s.f && s.m > 0) {
        line = `${name}${t}ペア${s.m > 1 ? "×" + s.m : ""} = ${yen(price)}`;
      } else if (pairTypes.has(s.type)) {
        const parts = [];
        if (s.m > 0) parts.push(`♂×${s.m}`);
        if (s.f > 0) parts.push(`♀×${s.f}`);
        line = `${name}${t} ${parts.join(" ")} = ${yen(price)}`.replace(/\s+ =/, " =");
      } else {
        line = `${name}${t}×${qty} = ${yen(price)}`;
      }

      lines.push(`${idx}. ${line}`);
      idx++;
    }

    // items next
    for (const name of items) {
      const s = itemState.get(name);
      if (!s) continue;
      const q = s.qty || 0;
      if (q === 0) continue;

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

  /* ===== Cards ===== */
  function makeDinoCard(name, defType) {
    const s = {
      name,
      defType,
      type: defType,
      m: 0,
      f: 0,
      open: false,
      autoSpecified: false,
      normName: norm(name),
      card: null,
    };

    const card = document.createElement("div");
    s.card = card;
    card.className = "card collapsed";

    card.innerHTML = `
      <div class="cardHeader">
        <div class="name">${name}</div>
        <div class="right">
          <select class="type">
            ${Object.keys(prices).map(t => `<option value="${t}">${t}</option>`).join("")}
          </select>
          <div class="unit">単価${prices[defType]}円</div>
        </div>
      </div>

      <div class="cardBody">
        <div class="stepRow">
          <div class="box">
            <div class="stepper">
              <button class="btn" data-sex="m" data-d="-1">−</button>
              <div class="val mc">0</div>
              <button class="btn" data-sex="m" data-d="1">＋</button>
            </div>
          </div>

          <div class="box">
            <div class="stepper">
              <button class="btn" data-sex="f" data-d="-1">−</button>
              <div class="val fc">0</div>
              <button class="btn" data-sex="f" data-d="1">＋</button>
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

    header.onclick = (e) => {
      if (e.target && (e.target.tagName === "SELECT" || e.target.closest("select"))) return;
      s.open = !s.open;
      card.classList.toggle("collapsed", !s.open);
    };

    sel.onchange = () => {
      s.type = sel.value;
      unit.textContent = `単価${prices[s.type]}円`;

      // 開いてる状態なら閉じない
      if (s.open) card.classList.remove("collapsed");

      updateAutoSpecified(s);
      sel.value = s.type;
      unit.textContent = `単価${prices[s.type]}円`;

      rebuildOutput();
      saveStore();
    };

    card.querySelectorAll(".btn").forEach((b) => {
      b.onclick = () => {
        const sex = b.dataset.sex;
        const d = Number(b.dataset.d);
        s[sex] = Math.max(0, (s[sex] || 0) + d);

        updateAutoSpecified(s);

        sel.value = s.type;
        unit.textContent = `単価${prices[s.type]}円`;
        mc.textContent = s.m;
        fc.textContent = s.f;

        rebuildOutput();
        saveStore();
      };
    });

    dinoState.set(name, s);
    secDino.appendChild(card);
    return s;
  }

  function makeItemCard(name, unitCount, unitPrice) {
    const s = {
      name,
      unitCount,
      unitPrice,
      qty: 0,
      open: false,
      normName: norm(name),
      card: null,
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
              <button class="btn" data-d="-1">−</button>
              <div class="val vc">0</div>
              <button class="btn" data-d="1">＋</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const header = card.querySelector(".cardHeader");
    const vc = card.querySelector(".vc");

    header.onclick = () => {
      s.open = !s.open;
      card.classList.toggle("collapsed", !s.open);
    };

    card.querySelectorAll(".btn").forEach((b) => {
      b.onclick = () => {
        const d = Number(b.dataset.d);
        s.qty = Math.max(0, (s.qty || 0) + d);
        vc.textContent = s.qty;
        rebuildOutput();
        saveStore();
      };
    });

    itemState.set(name, s);
    secItem.appendChild(card);
    return s;
  }

  /* ===== Modal minimal (今は閉じるだけ動けばOK) ===== */
  function showModal() {
    modalBack.classList.add("show");
    document.body.classList.add("modalOpen");
  }
  function hideModal() {
    modalBack.classList.remove("show");
    document.body.classList.remove("modalOpen");
    modalBody.innerHTML = "";
    modalNote.textContent = "";
  }
  modalCancel.onclick = hideModal;
  modalX.onclick = hideModal;
  modalBack.addEventListener("click", (e) => {
    if (e.target === modalBack) hideModal();
  });

  // 仮：ボタン反応確認（ここが反応しないなら JS が死んでる）
  addBtn.onclick = () => {
    modalTitle.textContent = "動作確認";
    modalOk.textContent = "閉じる";
    modalBody.innerHTML = `<div class="smallNote">JS は動作しています。次は追加UIを載せます。</div>`;
    modalNote.textContent = "";
    modalOk.onclick = hideModal;
    showModal();
  };
  manageBtn.onclick = addBtn.onclick;

  /* ===== Load files ===== */
  async function loadAll() {
    // ここに来てる時点で JS は生きてる
    outEl.value = "読み込み中…";

    const [dinoText, itemText] = await Promise.all([
      fetch("./dinos.txt?ts=" + Date.now()).then((r) => (r.ok ? r.text() : "")),
      fetch("./items.txt?ts=" + Date.now()).then((r) => (r.ok ? r.text() : "")),
    ]);

    const baseDinos = dinoText.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
    const baseItems = itemText.split(/\r?\n/).map(parseItemLine).filter(Boolean);

    const mergedDinos = mergeDinos(baseDinos);
    const mergedItems = mergeItems(baseItems);

    secDino.innerHTML = "";
    secItem.innerHTML = "";
    dinos.length = 0;
    items.length = 0;
    dinoState.clear();
    itemState.clear();

    mergedDinos.forEach(({ name, defType }) => {
      dinos.push(name);
      makeDinoCard(name, defType);
    });
    mergedItems.forEach(({ name, unitCount, unitPrice }) => {
      items.push(name);
      makeItemCard(name, unitCount, unitPrice);
    });

    applyFilter();
    rebuildOutput();

    if (dinos.length === 0 && items.length === 0) {
      outEl.value =
`【データが0件】
dinos.txt / items.txt が読み込めていない可能性があります。

確認:
- dinos.txt / items.txt が index.html と同じ階層
- GitHub Pages に反映されている
- ファイル名の大小文字一致`;
    }
  }

  // 起動
  try {
    loadAll();
  } catch (e) {
    outEl.value = "【起動エラー】" + (e && e.message ? e.message : String(e));
  }
})();