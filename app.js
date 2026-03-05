(() => {
'use strict';


const BUILD_VERSION = '2026-02-11 23:30';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';

  // ✅ 合計金額：桁数が増えても下に落ちないように、幅に収まるまでフォントを自動調整
  function fitTotalText() {
    const elTotal = document.getElementById('total');
    if (!elTotal) return;

    // 一旦リセット（CSSの基準値へ）
    elTotal.style.fontSize = '';

    // 表示幅（CSSのmax-widthと実寸の小さい方）
    const maxW = Math.min(120, elTotal.getBoundingClientRect().width || 120);

    // まずは短い金額は少し大きく
    const txtLen = (elTotal.textContent || '').length;
    let size = (txtLen <= 5) ? 16 : 14;

    // 収まるまで段階的に縮小
    for (let i = 0; i < 8; i++) {
      elTotal.style.fontSize = size + 'px';
      if ((elTotal.scrollWidth || 0) <= maxW) break;
      size -= 1;
      if (size <= 10) break;
    }
  }
  const toHira = (s) => (s || '').replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const norm = (s) => toHira(String(s || '').toLowerCase()).replace(/\s+/g, '');

  // ✅ 五十音順ソート用：TEKは接頭辞を無視（TEK以降で比較）
  function sortName(name) {
    const raw = String(name || '').trim();
    const base = raw.startsWith('TEK') ? raw.slice(3).trim() : raw;
    // カタカナ→ひらがな、空白除去して比較キー化
    return toHira(base).replace(/\s+/g, '');
  }

  function stableHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  function stableId(prefix, name) {
    const key = norm(name);
    return `${prefix}_${stableHash(key)}`;
  }
  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /* ========= circled numbers ========= */
  const circled = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return String(n);
    if (x >= 1 && x <= 20) return String.fromCharCode(0x2460 + (x - 1));
    if (x >= 21 && x <= 35) return String.fromCharCode(0x3251 + (x - 21));
    return String(n);
  };

  // special label formatting (ガチャ①② など)
function formatSpecialLabel(name) {
  const s = String(name || '').trim();
  if (!s) return s;
  // "ガチャ 1 2", "ガチャ12", "ガチャ①②" を "ガチャ①②" に寄せる
  if (s.startsWith('ガチャ')) {
    const digits = s.replace(/^ガチャ\s*/,'').replace(/[^\d]/g,'');
    if (digits) {
      const out = digits.split('').map(d => circled(Number(d))).join('');
      return `ガチャ${out}`;
    }
  }
  return s;
}

/* ========= localStorage keys ========= */
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
    ROOM_USER: 'room_user_v1',
    ROOM_COPY_CFG: 'room_copy_cfg_v1',
    ROOM_TEMPLATES: 'room_templates_v1',

    SPECIAL_CFG: 'special_cfg_v1',
    POS_SALES: 'pos_sales_v1',
    POS_STOCK: 'pos_stock_v1',

  };

  const loadJSON = (k, fb) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fb;
    } catch {
      return fb;
    }
  };

  function saveJSON(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      openToast('保存に失敗しました（容量オーバー等）');
      return false;
    }
  }

  // ========= file helpers =========
  function readFileAsDataURL(file) {
    return new Promise((resolve) => {
      if (!file) return resolve('');
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(file);
    });
  }

  /* ========= toast ========= */
  let toastTimer = null;
  function openToast(text) {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.position = 'fixed';
      t.style.left = '50%';
      t.style.bottom = '18px';
      t.style.transform = 'translateX(-50%)';
      t.style.zIndex = '12500';
      t.style.padding = '10px 12px';
      t.style.borderRadius = '14px';
      t.style.border = '1px solid rgba(255,255,255,.14)';
      t.style.background = 'rgba(0,0,0,.55)';
      t.style.backdropFilter = 'blur(10px)';
      t.style.color = '#fff';
      t.style.fontWeight = '800';
      t.style.fontSize = '13px';
      t.style.maxWidth = '92vw';
      t.style.textAlign = 'center';
      t.style.whiteSpace = 'pre-wrap';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 1700);
  }

  // ルーム：コピー内容を5秒間プレビュー表示（×で閉じる）
  let roomCopyPreviewTimer = null;
  function showRoomCopyPreview(copyText, titleText = 'コピー完了✨️') {
    const id = 'roomCopyPreviewOverlay';
    let ov = document.getElementById(id);
    if (!ov) {
      ov = document.createElement('div');
      ov.id = id;
      ov.style.position = 'fixed';
      ov.style.inset = '0';
      // ✅ ルーム画面のモーダル等より常に前面に出す（背面回り込み防止）
      ov.style.zIndex = '14000';
      ov.style.display = 'none';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';
      ov.style.padding = '16px';
      ov.style.background = 'rgba(0,0,0,.35)';
      ov.style.backdropFilter = 'blur(6px)';

      const panel = document.createElement('div');
      panel.style.width = 'min(560px, 92vw)';
      panel.style.maxHeight = '72vh';
      panel.style.overflow = 'hidden';
      panel.style.borderRadius = '18px';
      panel.style.border = '1px solid rgba(255,255,255,.14)';
      panel.style.background = 'rgba(20,20,20,.78)';
      panel.style.backdropFilter = 'blur(12px)';
      panel.style.boxShadow = '0 20px 60px rgba(0,0,0,.45)';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';

      const head = document.createElement('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.justifyContent = 'space-between';
      head.style.gap = '10px';
      head.style.padding = '12px 12px 8px 14px';

      const title = document.createElement('div');
      title.id = 'roomCopyPreviewTitle';
      title.textContent = String(titleText ?? '');
      title.style.fontWeight = '900';
      title.style.fontSize = '14px';
      title.style.color = '#fff';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', '閉じる');
      closeBtn.style.width = '38px';
      closeBtn.style.height = '32px';
      closeBtn.style.borderRadius = '12px';
      closeBtn.style.border = '1px solid rgba(255,255,255,.14)';
      closeBtn.style.background = 'rgba(255,255,255,.08)';
      closeBtn.style.color = '#fff';
      closeBtn.style.fontWeight = '900';
      closeBtn.style.cursor = 'pointer';

      const body = document.createElement('div');
      body.style.padding = '10px 14px 14px';
      body.style.overflow = 'auto';

      const pre = document.createElement('pre');
      pre.id = 'roomCopyPreviewText';
      pre.style.margin = '0';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      pre.style.fontSize = '12px';
      pre.style.lineHeight = '1.35';
      pre.style.color = 'rgba(255,255,255,.92)';

      body.appendChild(pre);
      head.appendChild(title);
      head.appendChild(closeBtn);
      panel.appendChild(head);
      panel.appendChild(body);
      ov.appendChild(panel);
      document.body.appendChild(ov);

      const hide = () => {
        ov.style.display = 'none';
        clearTimeout(roomCopyPreviewTimer);
        roomCopyPreviewTimer = null;
      };
      closeBtn.addEventListener('click', hide);
      ov.addEventListener('click', (e) => { if (e.target === ov) hide(); });
    }

    const titleEl = document.getElementById('roomCopyPreviewTitle');
    if (titleEl) titleEl.textContent = String(titleText ?? '');

    const pre = document.getElementById('roomCopyPreviewText');
    if (pre) pre.textContent = String(copyText ?? '');
    ov.style.display = 'flex';

    clearTimeout(roomCopyPreviewTimer);
    roomCopyPreviewTimer = setTimeout(() => { ov.style.display = 'none'; }, 5000);
  }

  // ✅ テンプレの確認用（タイトルは「内容確認」）
  function showTemplatePreview(text) {
    // ✅ テンプレ確認は「内容確認」
    showRoomCopyPreview(text, '確認画面');
  }  // ✅ 画像出力：配置画像を1枚生成（長押しでカメラロールに保存）
  let imageExportCloseFn = null;
  function openImageExportGallery(dList) {
    const id = 'imageExportOverlay';
    let ov = document.getElementById(id);
    if (!ov) {
      ov = document.createElement('div');
      ov.id = id;
      ov.style.position = 'fixed';
      ov.style.inset = '0';
      ov.style.zIndex = '14000';
      ov.style.display = 'none';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';
      ov.style.padding = '16px';
      ov.style.background = 'rgba(0,0,0,.35)';
      ov.style.backdropFilter = 'blur(6px)';

      const panel = document.createElement('div');
      panel.className = 'exportGalleryPanel';

      const head = document.createElement('div');
      head.className = 'exportGalleryHead';

      const title = document.createElement('div');
      title.textContent = '画像出力';
      title.className = 'exportGalleryTitle';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', '閉じる');
      closeBtn.className = 'iconBtn';

      const body = document.createElement('div');
      body.className = 'exportGalleryBody';

      head.appendChild(title);
      head.appendChild(closeBtn);
      panel.appendChild(head);
      panel.appendChild(body);
      ov.appendChild(panel);
      document.body.appendChild(ov);

      const hide = () => {
        ov.style.display = 'none';
        try { ScrollLock.unlock(); } catch {}
      };
      imageExportCloseFn = hide;

      closeBtn.addEventListener('click', hide);
      ov.addEventListener('click', (e) => { if (e.target === ov) hide(); });

      installOverlayScrollGuard(ov, body);

      // イベント委譲（削除/在庫入力/並び替え）
      body.addEventListener('click', async (e) => {
        const delBtn = e.target && e.target.closest ? e.target.closest('[data-pos-del-id]') : null;
        if (delBtn) {
          const id = String(delBtn.getAttribute('data-pos-del-id') || '');
          if (!id) return;
          const s = (Array.isArray(pos.sales) ? pos.sales : []).find(x => String(x.id||'') === id);
          if (!s) return;

          const parts = posDisplayParts(s);
          // ✅ 「削除しますか？」→次行から注文内容を改行で表示
          const msg = `削除しますか？\n${parts.title}${parts.sub ? `\n${parts.sub}` : ''}\n${fmtMD(s.ts)} / ${yen(s.amount)}`;
          const ok = await confirmAsk(msg);
          if (!ok) return;

          const idx = (Array.isArray(pos.sales) ? pos.sales : []).findIndex(x => String(x.id||'') === id);
          if (idx >= 0) {
            pos.sales.splice(idx, 1);
            posSave();
            openToast('削除しました');
            try {
              const month = String(document.getElementById('posMonthSel')?.value || monthKeyFromTs(Date.now()));
              (ov.__renderPosReport || (()=>{}))(month);
            } catch {}
          }
          return;
        }

        const stockBtn = e.target && e.target.closest ? e.target.closest('[data-stock-id]') : null;
        if (stockBtn) {
          const key = String(stockBtn.getAttribute('data-stock-id') || '');
          if (!key) return;
          const cur = stockGet(key);
          const curTxt = (cur.m === null || cur.f === null) ? '' : `${cur.m}/${cur.f}`;
          const v = prompt('在庫を入力（オス/メス）\n例: 4/5\n空欄で未入力(-)に戻す', curTxt);
          if (v === null) return;
          const s = String(v).trim();
          if (!s) {
            stockSet(key, null, null);
          } else {
            const mm = s.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
            if (!mm) {
              openToast('形式が正しくありません（例: 4/5）');
              return;
            }
            stockSet(key, Number(mm[1]), Number(mm[2]));
          }
          try {
            const month = String(document.getElementById('posMonthSel')?.value || monthKeyFromTs(Date.now()));
            (ov.__renderPosReport || (()=>{}))(month);
          } catch {}
          return;
        }

        const sortTh = e.target && e.target.closest ? e.target.closest('[data-pos-sort]') : null;
        if (sortTh) {
          const key = String(sortTh.getAttribute('data-pos-sort') || '');
          if (!key) return;
          const cur = (ov.__dinoSort) ? ov.__dinoSort : { key: 'totalAmt', dir: 'desc' };
          let dir = cur.dir || 'desc';
          if (cur.key === key) dir = (dir === 'asc') ? 'desc' : 'asc';
          else dir = (key === 'name') ? 'asc' : 'desc';
          ov.__dinoSort = { key, dir };
          try {
            const month = String(document.getElementById('posMonthSel')?.value || monthKeyFromTs(Date.now()));
            (ov.__renderPosReport || (()=>{}))(month);
          } catch {}
        }
      });
    }

    const body = ov.querySelector('.exportGalleryBody');
    if (body) {
      body.innerHTML = '';

      const ctrl = document.createElement('div');
      ctrl.className = 'exportGridCtrl';
      ctrl.innerHTML = `
        <div class="exportGridInputs">
          <div class="exportGridLabel">縦</div>
          <input class="exportGridInput" id="exportRows" type="text" inputmode="numeric" min="1" value="6">
          <div class="exportGridLabel">横</div>
          <input class="exportGridInput" id="exportCols" type="text" inputmode="numeric" min="1" value="2">
        </div>
        <button class="pill exportGridBtn" type="button" id="exportMake">生成</button>
      `;
      body.appendChild(ctrl);

      const outWrap = document.createElement('div');
      outWrap.className = 'exportGridOutWrap';
      outWrap.innerHTML = `<div id="exportGridImgs" class="exportPages"></div>`;
      body.appendChild(outWrap);

      const btn = ctrl.querySelector('#exportMake');
      btn?.addEventListener('click', async () => {
        try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch {}

        const rowsEl = ctrl.querySelector('#exportRows');
        const colsEl = ctrl.querySelector('#exportCols');
        let rows = Math.max(1, Math.min(50, Number(rowsEl?.value || 1)));
        let cols = Math.max(1, Math.min(20, Number(colsEl?.value || 1)));

        // 画像URLをリスト順に集める
        const urls = [];
        for (const d of (dList || [])) {
          const k = imageKeyFromBaseName(d._baseName || d.name);
          const url = imageCache[k];
          if (url) urls.push(url);
        }
        if (!urls.length) { openToast('画像がありません'); return; }

        const loadImg = (src) => new Promise((res, rej) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => res(im);
          im.onerror = () => rej(new Error('img load failed'));
          im.src = src;
        });

        let imgs = [];
        try {
          imgs = await Promise.all(urls.map(u => loadImg(u)));
        } catch (e) {
          openToast('画像の読み込みに失敗しました');
          console.error(e);
          return;
        }
// セルサイズは最大値に合わせる（カード画像が混在しても欠けない）
const cellW = Math.max(...imgs.map(im => im.naturalWidth || im.width || 0), 1);
const cellH = Math.max(...imgs.map(im => im.naturalHeight || im.height || 0), 1);

// ✅ 画像間の隙間（px）
const gap = 12;

const cap = rows * cols;
const pages = Math.max(1, Math.ceil(imgs.length / cap));

const imgsBox = body.querySelector('#exportGridImgs');
if (imgsBox) imgsBox.innerHTML = ''; 

for (let p = 0; p < pages; p++) {
  const slice = imgs.slice(p * cap, (p + 1) * cap);

  const canvas = document.createElement('canvas');
  canvas.width = cellW * cols + gap * (cols - 1);
  canvas.height = cellH * rows + gap * (rows - 1);

  const ctx = canvas.getContext('2d');
  // 背景を黒に
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < slice.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (r >= rows) break;
    const x = c * (cellW + gap);
    const y = r * (cellH + gap);

    // セルに収まるようにcontain描画
    const im = slice[i];
    const iw = im.naturalWidth || im.width;
    const ih = im.naturalHeight || im.height;
    const s = Math.min(cellW / iw, cellH / ih);
    const dw = iw * s;
    const dh = ih * s;
    const dx = x + (cellW - dw) / 2;
    const dy = y + (cellH - dh) / 2;
    ctx.drawImage(im, dx, dy, dw, dh);
  }

  const dataUrl = canvas.toDataURL('image/png', 1.0);

  if (imgsBox) {
    const wrap = document.createElement('div');
    wrap.className = 'exportPage';

    const capEl = document.createElement('div');
    capEl.className = 'exportPageNo';
    capEl.textContent = circled(p + 1);

    const out = document.createElement('img');
    out.className = 'exportPageImg';
    out.alt = `配置画像 ${p + 1}/${pages}`;
    out.src = dataUrl;

    wrap.appendChild(capEl);
    wrap.appendChild(out);
    imgsBox.appendChild(wrap);
  }
}
      });
    }

    try { ScrollLock.lock(); } catch {}
    ov.style.display = 'flex';
  }


/* ========= template editor ========= */
  let templateEditorResolve = null;
  function openTemplateEditor(tpl) {
    return new Promise((resolve) => {
      templateEditorResolve = resolve;

      const id = 'templateEditorOverlay';
      let ov = document.getElementById(id);
      if (!ov) {
        ov = document.createElement('div');
        ov.id = id;
        ov.style.position = 'fixed';
        ov.style.inset = '0';
        ov.style.zIndex = '14000';
        ov.style.display = 'none';
        ov.style.alignItems = 'center';
        ov.style.justifyContent = 'center';
        ov.style.padding = '16px';
        ov.style.background = 'rgba(0,0,0,.35)';
        ov.style.backdropFilter = 'blur(6px)';

        const panel = document.createElement('div');
        panel.style.width = 'min(560px, 92vw)';
        panel.style.maxHeight = '78vh';
        panel.style.overflow = 'hidden';
        panel.style.borderRadius = '18px';
        panel.style.border = '1px solid rgba(255,255,255,.14)';
        panel.style.background = 'rgba(20,20,20,.78)';
        panel.style.backdropFilter = 'blur(12px)';
        panel.style.boxShadow = '0 20px 60px rgba(0,0,0,.45)';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';

        const head = document.createElement('div');
        head.style.display = 'flex';
        head.style.alignItems = 'center';
        head.style.justifyContent = 'space-between';
        head.style.gap = '10px';
        head.style.padding = '12px 12px 8px 14px';

        const title = document.createElement('div');
        title.textContent = 'テンプレ編集';
        title.style.fontWeight = '900';
        title.style.fontSize = '14px';
        title.style.color = '#fff';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', '閉じる');
        closeBtn.style.width = '38px';
        closeBtn.style.height = '32px';
        closeBtn.style.borderRadius = '12px';
        closeBtn.style.border = '1px solid rgba(255,255,255,.14)';
        closeBtn.style.background = 'rgba(255,255,255,.08)';
        closeBtn.style.color = '#fff';
        closeBtn.style.fontWeight = '900';
        closeBtn.style.cursor = 'pointer';

        const body = document.createElement('div');
        body.style.padding = '10px 14px 14px';
        body.style.overflow = 'auto';
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.gap = '10px';

        const titleLabel = document.createElement('div');
        titleLabel.textContent = 'タイトル';
        titleLabel.style.fontSize = '12px';
        titleLabel.style.fontWeight = '900';
        titleLabel.style.opacity = '.9';

        const titleInput = document.createElement('input');
        titleInput.id = 'tplTitleInput';
        titleInput.style.width = '100%';
        titleInput.style.height = '44px';
        titleInput.style.borderRadius = '16px';
        titleInput.style.border = '1px solid rgba(255,255,255,.14)';
        titleInput.style.background = 'rgba(0,0,0,.18)';
        titleInput.style.color = '#fff';
        titleInput.style.padding = '0 12px';
        titleInput.style.fontWeight = '900';

        const textLabel = document.createElement('div');
        textLabel.textContent = '本文';
        textLabel.style.fontSize = '12px';
        textLabel.style.fontWeight = '900';
        textLabel.style.opacity = '.9';

        const ta = document.createElement('textarea');
        ta.id = 'tplTextInput';
        ta.style.width = '100%';
        ta.style.minHeight = '220px';
        ta.style.resize = 'vertical';
        ta.style.borderRadius = '16px';
        ta.style.border = '1px solid rgba(255,255,255,.14)';
        ta.style.background = 'rgba(0,0,0,.18)';
        ta.style.color = 'rgba(255,255,255,.92)';
        ta.style.padding = '12px';
        ta.style.fontSize = '12px';
        ta.style.lineHeight = '1.35';
        ta.style.fontWeight = '700';
        ta.style.whiteSpace = 'pre-wrap';

        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '10px';
        btns.style.justifyContent = 'flex-end';
        btns.style.paddingTop = '4px';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'pill';
        cancelBtn.textContent = 'キャンセル';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'pill';
        saveBtn.textContent = '保存';

        btns.appendChild(cancelBtn);
        btns.appendChild(saveBtn);

        body.appendChild(titleLabel);
        body.appendChild(titleInput);
        body.appendChild(textLabel);
        body.appendChild(ta);
        body.appendChild(btns);

        head.appendChild(title);
        head.appendChild(closeBtn);

        panel.appendChild(head);
        panel.appendChild(body);
        ov.appendChild(panel);
        document.body.appendChild(ov);

        const hide = (result) => {
          ov.style.display = 'none';
          const r = templateEditorResolve;
          templateEditorResolve = null;
          if (r) r(result);
        };

        closeBtn.addEventListener('click', () => hide(null));
        cancelBtn.addEventListener('click', () => hide(null));
        ov.addEventListener('click', (e) => { if (e.target === ov) hide(null); });

        saveBtn.addEventListener('click', () => {
          const t = document.getElementById('tplTitleInput')?.value ?? '';
          const x = document.getElementById('tplTextInput')?.value ?? '';
          hide({ title: String(t), text: String(x) });
        });
      }

      // set values
      const titleInput = document.getElementById('tplTitleInput');
      const ta = document.getElementById('tplTextInput');
      if (titleInput) titleInput.value = String(tpl?.title ?? '');
      if (ta) ta.value = String(tpl?.text ?? '');

      ov.style.display = 'flex';
      requestAnimationFrame(() => { try { titleInput?.focus(); } catch {} });
    });
  }
  /* ========= confirm modal ========= */
  let confirmResolve = null;
  function confirmAsk(text) {
    return new Promise((resolve) => {
      const ov = $('#confirmOverlay');
      const tx = $('#confirmText');
      if (!ov || !tx) return resolve(false);
      confirmResolve = resolve;
      tx.textContent = text || 'よろしいですか？';
      ov.classList.remove('isHidden');
    });
  }
  function confirmClose(val) {
    const ov = $('#confirmOverlay');
    if (!ov) return;
    ov.classList.add('isHidden');
    if (confirmResolve) {
      const r = confirmResolve;
      confirmResolve = null;
      r(!!val);
    }
  }
  $('#confirmCancel')?.addEventListener('click', () => confirmClose(false));
  $('#confirmOk')?.addEventListener('click', () => confirmClose(true));
  $('#confirmOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('#confirmOverlay')) confirmClose(false);
  });

  /* ========= ✅ scroll lock (modal/overlay) ========= */
  // 目的：
  // - モーダル表示中に「背面のbody」がスクロールしないようにする（iOS含む）
  // - 前面要素のスクロールだけ有効にする
  const ScrollLock = (() => {
    let lockCount = 0;
    let savedY = 0;
    let savedX = 0;

    const lock = () => {
      lockCount++;
      if (lockCount !== 1) return;

      savedY = window.scrollY || 0;
      savedX = window.scrollX || 0;

      // iOS対策: bodyをfixedにして位置を固定
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedY}px`;
      document.body.style.left = `-${savedX}px`;
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    };

    const unlock = () => {
      if (lockCount <= 0) return;
      lockCount--;
      if (lockCount !== 0) return;

      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.touchAction = '';

      window.scrollTo(savedX, savedY);
    };

    return { lock, unlock };
  })();

  function installOverlayScrollGuard(overlayEl, scrollBodyEl) {
    if (!overlayEl) return;

    // オーバーレイ自身(背景)でのスクロール/ドラッグは無効化して「背面へ抜ける」を防ぐ
    const stopIfBackdrop = (e) => {
      // 背景を触ってる時だけ止める（body側でスクロールさせない）
      if (e.target === overlayEl) {
        e.preventDefault();
      }
    };

    overlayEl.addEventListener('wheel', stopIfBackdrop, { passive: false });
    overlayEl.addEventListener('touchmove', stopIfBackdrop, { passive: false });

    // 前面のスクロール領域からさらに外へ「スクロールが伝播」するのを抑制
    if (scrollBodyEl) {
      scrollBodyEl.style.overscrollBehavior = 'contain';
      // iOS向け: 慣性スクロール
      scrollBodyEl.style.webkitOverflowScrolling = 'touch';
    }
  }

  /* ========= IndexedDB (images) ========= */
  const IDB = {
    DB_NAME: 'dino_list_db_v3',
    DB_VER: 1,
    STORE_IMAGES: 'images',
  };

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB.DB_NAME, IDB.DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB.STORE_IMAGES)) {
          db.createObjectStore(IDB.STORE_IMAGES);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function idbGetAllImages() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB.STORE_IMAGES, 'readonly');
      const st = tx.objectStore(IDB.STORE_IMAGES);
      const out = {};
      const cur = st.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return resolve(out);
        out[c.key] = c.value;
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
  }

  async function idbPutImage(key, dataUrl) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB.STORE_IMAGES, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(IDB.STORE_IMAGES).put(dataUrl, key);
    });
  }

  async function idbDelImage(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB.STORE_IMAGES, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(IDB.STORE_IMAGES).delete(key);
    });
  }

  async function migrateOldImagesIfAny() {
    const old = loadJSON(LS.DINO_IMAGES_OLD, null);
    if (!old || typeof old !== 'object') return;

    const keys = Object.keys(old);
    if (keys.length === 0) {
      localStorage.removeItem(LS.DINO_IMAGES_OLD);
      return;
    }

    try {
      for (const k of keys) {
        const v = old[k];
        if (typeof v === 'string' && v.startsWith('data:')) {
          await idbPutImage(`legacy_${k}`, v);
        }
      }
      localStorage.removeItem(LS.DINO_IMAGES_OLD);
      openToast('旧画像データを退避しました');
    } catch {
      openToast('旧画像の移行に失敗しました');
    }
  }

  /* ========= prices ========= */
  const defaultPrices = {
    '受精卵': 30, '受精卵(指定)': 50,
    '胚': 50, '胚(指定)': 100,
    '幼体': 100,
    '成体': 500,
    'クローン': 500, 'クローン(指定)': 300,
  };
  const prices = Object.assign({}, defaultPrices, loadJSON(LS.PRICES, {}));
  const typeList = Object.keys(defaultPrices).filter(t => t !== 'クローン(指定)');
  const specifiedMap = { '受精卵': '受精卵(指定)', '胚': '胚(指定)' };

  /* ========= special cfg (ガチャ等) ========= */
  const specialCfg = Object.assign({}, loadJSON(LS.SPECIAL_CFG, {}));

  function getSpecialCfgForDino(d) {
    if (specialCfg[d.id]?.enabled) return specialCfg[d.id];
    const base = String(d._baseName || d.name || '').trim();
    const name = String(d.name || '').trim();
    if (base === 'ガチャ' || name === 'ガチャ') {
      return { enabled: true, max: 16, unit: 300, all: 3000, allowSex: false };
    }
    return null;
  }

  /* ========= images ========= */
  const imageCache = {};
  const dinoOverride = Object.assign({}, loadJSON(LS.DINO_OVERRIDE, {}));
  function imageKeyFromBaseName(baseName) {
    return `img_${stableHash(norm(baseName))}`;
  }

  /* ========= DOM ========= */
  const el = {
    q: $('#q'),
    qClear: $('#qClear'),
    delivery: $('#delivery'),
    copy: $('#copy'),
    pos: $('#pos'),
    total: $('#total'),
    out: $('#out'),

    tabDinos: $('#tabDinos'),
    tabItems: $('#tabItems'),
    list: $('#list'),

    openManage: $('#openManage'),
    modalOverlay: $('#modalOverlay'),
    modalBody: $('#modalBody'),
    closeManage: $('#closeManage'),
    mTabCatalog: $('#mTabCatalog'),
    mTabPrices: $('#mTabPrices'),
    mTabImages: $('#mTabImages'),
    versionText: $('#versionText'),

    openRoom: $('#openRoom'),
    roomOverlay: $('#roomOverlay'),
    roomBody: $('#roomBody'),
    closeRoom: $('#closeRoom'),

    editOverlay: $('#editOverlay'),
    editBody: $('#editBody'),
    editTitle: $('#editTitle'),

    imgOverlay: $('#imgOverlay'),
    imgClose: $('#imgClose'),
    imgViewerImg: $('#imgViewerImg'),
  };
  if (el.versionText) el.versionText.textContent = `Version: ${BUILD_VERSION}`;

/* ========= top bar auto-fit ========= */
const topEl = document.querySelector('header.top');
const topRow = document.querySelector('header.top .row');
function fitTopRow() {
  if (!topEl || !topRow) return;

  // まずは等倍で戻す（縮小済みのまま戻らない問題を防ぐ）
  topEl.style.setProperty('--topScale', '1');

  // 1行に収まるまで段階的に縮小
  let scale = 1;
  for (let i = 0; i < 12; i++) {
    if (topRow.scrollWidth <= topRow.clientWidth + 1) break;
    scale = Math.max(0.72, scale - 0.05);
    topEl.style.setProperty('--topScale', String(scale.toFixed(2)));
    if (scale <= 0.72) break;
  }
}
window.addEventListener('resize', () => requestAnimationFrame(fitTopRow));

  // ✅ オーバーレイのスクロールガード（前面だけ）
  installOverlayScrollGuard(el.modalOverlay, el.modalBody);
  installOverlayScrollGuard(el.roomOverlay, el.roomBody);
  installOverlayScrollGuard(el.editOverlay, el.editBody);
  installOverlayScrollGuard(el.imgOverlay, el.imgOverlay); // 画像ビューは全体OK

  /* ========= sanity (reset) ========= */
  if (new URL(location.href).searchParams.get('reset') === '1') {
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    indexedDB.deleteDatabase(IDB.DB_NAME);
    location.replace(location.pathname);
    return;
  }

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
    dino: loadJSON(LS.DINO_CUSTOM, []),
    item: loadJSON(LS.ITEM_CUSTOM, []),
  };

  let dinos = [];
  let items = [];
  let activeTab = 'dino';

  const inputState = new Map();
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

    const id = stableId('d', nameRaw);
    const ov = dinoOverride[id];

    return {
      id,
      name: ov?.name || nameRaw,
      defType: ov?.defType || defType,
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

  // ✅ ソート用名称を生成（TEKは除外）
  const sortName = (name) => {
    if (!name) return '';
    return name.startsWith('TEK')
      ? name.slice(3).trim()
      : name;
  };

  return list.slice().sort((a, b) => {
    const ai = idx.has(a.id) ? idx.get(a.id) : 1e9;
    const bi = idx.has(b.id) ? idx.get(b.id) : 1e9;
    if (ai !== bi) return ai - bi;

    const an = sortName(a.name);
    const bn = sortName(b.name);

    return an.localeCompare(bn, 'ja');
  });
}

  /* ========= behavior rules ========= */
  function ensureDinoState(key, defType, spCfg = null) {
    if (!inputState.has(key)) {
      if (spCfg?.enabled) {
        inputState.set(key, {
          mode: 'special',
          picks: [],
          all: false,
          type: defType || '受精卵',
          m: 0,
          f: 0,
        });
      } else {
        inputState.set(key, { type: defType || '受精卵', m: 0, f: 0 });
      }
    } else {
      const s = inputState.get(key);
      if (spCfg?.enabled) {
        if (s.mode !== 'special') s.mode = 'special';
        if (!Array.isArray(s.picks)) s.picks = [];
        if (typeof s.all !== 'boolean') s.all = false;
        if (typeof s.type !== 'string') s.type = defType || '受精卵';
        if (typeof s.m !== 'number') s.m = 0;
        if (typeof s.f !== 'number') s.f = 0;
      }
    }
    return inputState.get(key);
  }
  function ensureItemState(key) {
    if (!inputState.has(key)) inputState.set(key, { qty: 0 });
    return inputState.get(key);
  }

  function autoSpecify(s) {
    const m = Number(s.m || 0), f = Number(s.f || 0);
    const base = String(s.type || '受精卵').replace('(指定)', '');
    const hasSpecified = /\(指定\)$/.test(String(s.type || ''));

    if (m > 0 && f > 0) {
      if (specifiedMap[base]) s.type = specifiedMap[base];
      return;
    }
    if (m === 0 && f === 0 && hasSpecified) {
      s.type = base;
    }
  }

  /* ========= image DOM sync ========= */
  function getImageUrlForDino(d) {
    const k = imageKeyFromBaseName(d._baseName || d.name);
    return imageCache[k] || '';
  }
  function syncThumbInMainListByDino(d, dataUrl) {
    const cards = $$(`[data-kind="dino"][data-did="${CSS.escape(d.id)}"]`, el.list);
    cards.forEach(card => {
      let wrap = $('.miniThumb', card);
      if (!wrap && dataUrl) {
        const nw = document.createElement('div');
        nw.className = 'miniThumb';
        nw.innerHTML = `<img alt="">`;
        $('.nameWrap', card)?.appendChild(nw);
        wrap = nw;
      }
      if (!wrap) return;

      const im = $('img', wrap);
      if (im) {
        if (dataUrl) im.src = dataUrl;
        else im.removeAttribute('src');
      }
      if (!dataUrl) wrap.remove();
    });
  }

  
  // ✅ 管理用の並び替え接頭辞（"A:名前"）を表示では除外
  function displayName(raw) {
    const s = String(raw ?? '');
    const i = s.indexOf(':');
    if (i >= 0) return s.slice(i + 1).trim();
    return s;
  }

/* ========= output ========= */
  function rebuildOutput() {
    const lines = [];
    let sum = 0;
    let idx = 1;

    const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');

    for (const d of dList) {
      const baseKey = d.id;
      const keys = [baseKey, ...Array.from(ephemeralKeys).filter(k => k.startsWith(baseKey + '__dup'))];
      const sp = getSpecialCfgForDino(d);

      for (const k of keys) {
        const s = inputState.get(k);
        if (!s) continue;

        if (sp?.enabled && s.mode === 'special') {
          const allowSex = !!sp.allowSex;
          const m = Number(s.m || 0);
          const f = Number(s.f || 0);
          const sexQty = m + f;

          if (allowSex && sexQty > 0) {
            const type = s.type || d.defType || '受精卵';
            const unitPrice = prices[type] || 0;
            const price = unitPrice * sexQty;
            sum += price;

            const tOut = String(type).replace('(指定)', '');
            const isPair = /\(指定\)$/.test(type) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(type);

            let line = '';
            if (isPair) {
              if (m === f) {
                line = `${displayName(d.name)}${tOut}ペア${m > 1 ? '×' + m : ''} = ${price.toLocaleString('ja-JP')}円`;
              } else {
                const p = [];
                if (m > 0) p.push(`♂︎×${m}`);
                if (f > 0) p.push(`♀︎×${f}`);
                line = `${displayName(d.name)}${tOut} ${p.join(' ')} = ${price.toLocaleString('ja-JP')}円`;
              }
            } else {
              line = `${displayName(d.name)}${tOut}×${sexQty} = ${price.toLocaleString('ja-JP')}円`;
            }

            lines.push(`${idx}. ${line}`);
            idx++;
            continue;
          }

          const unitPrice = Number(sp.unit || 0);
          const allPrice = Number(sp.all || 0);

          if (s.all) {
            const price = allPrice;
            if (price > 0) {
              sum += price;
              lines.push(`${idx}. ${displayName(d.name)}全種 = ${price.toLocaleString('ja-JP')}円`);
              idx++;
            }
            continue;
          }

          const picks = Array.isArray(s.picks) ? s.picks.slice() : [];
          if (picks.length <= 0) continue;

          const price = picks.length * unitPrice;
          sum += price;

          const seq = picks.map(n => circled(n)).join('');
          lines.push(`${idx}. ${displayName(d.name)}${seq} = ${price.toLocaleString('ja-JP')}円`);
          idx++;
          continue;
        }

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
            line = `${displayName(d.name)}${tOut}ペア${m > 1 ? '×' + m : ''} = ${price.toLocaleString('ja-JP')}円`;
          } else {
            const p = [];
            if (m > 0) p.push(`♂︎×${m}`);
            if (f > 0) p.push(`♀︎×${f}`);
            line = `${displayName(d.name)}${tOut} ${p.join(' ')} = ${price.toLocaleString('ja-JP')}円`;
          }
        } else {
          line = `${displayName(d.name)}${tOut}×${qty} = ${price.toLocaleString('ja-JP')}円`;
        }

        lines.push(`${idx}. ${line}`);
        idx++;
      }
    }

        const iList = sortByOrder(items.filter(it => !hidden.item.has(it.id)), 'item');
    for (const it of iList) {
      const s = inputState.get(it.id);
      if (!s) continue;
      const qty = Number(s.qty || 0);
      if (qty <= 0) continue;

      const totalCount = qty * Number(it.unit || 1);
      const price = qty * Number(it.price || 0);
      sum += price;

      lines.push(`${idx}. ${displayName(it.name)} × ${totalCount} = ${price.toLocaleString('ja-JP')}円`);
      idx++;
    }

    el.total.textContent = yen(sum);
    fitTotalText();

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
  function getQtyForCard(key, kind) {
    if (kind === 'dino') {
      const s = inputState.get(key);
      if (!s) return 0;

      if (s.mode === 'special') {
        const sexQty = Number(s.m || 0) + Number(s.f || 0);
        if (sexQty > 0) return sexQty;
        if (s.all) return 1;
        return Array.isArray(s.picks) ? s.picks.length : 0;
      }
      return (Number(s.m || 0) + Number(s.f || 0));
    } else {
      const s = inputState.get(key);
      return s ? Number(s.qty || 0) : 0;
    }
  }

function applyCollapseAndSearch() {
    const q = norm(el.q.value);

    $$('[data-card="1"]', el.list).forEach(card => {
      const name = card.dataset.name || '';
      const show = !q || norm(name).includes(q);
      card.style.display = show ? '' : 'none';

      const key = card.dataset.key;
      const kind = card.dataset.kind;
      const qty = getQtyForCard(key, kind);

      // ✅ 検索中：一致しないカードは畳む（従来通り）
      if (q) {
        card.classList.toggle('isCollapsed', !show);
        return;
      }

      // ✅ 通常時：未入力(0)だけ自動で畳む。
      // それ以外は「いまの折りたたみ状態」を維持して、他カードが勝手に開くのを防ぐ。
      if (qty === 0) {
        card.classList.add('isCollapsed');
      }
    });
  }
  /* ========= Toggle hit area (左側ほぼ全部) ========= */
function installLeftToggleHit(card) {
  const toggle = $('.cardToggle', card);
  const wrap = $('.nameWrap', card);
  if (!toggle || !wrap) return;

  // ✅ 重要：DOMに未挿入だと offsetWidth/Height が 0 になり、
  // 折りたたみボタンが「押せないサイズ」になることがある（特にiOS/Safari）
  // → 次フレームで再計算して復旧
  if (wrap.offsetWidth === 0 || wrap.offsetHeight === 0) {
    requestAnimationFrame(() => installLeftToggleHit(card));
    return;
  }

  // 折りたたみの押し判定は「恐竜名＋画像」範囲だけに限定
  const pad = 12;

  toggle.style.inset = 'auto';
  toggle.style.right = 'auto';
  toggle.style.bottom = 'auto';

  toggle.style.left = `${wrap.offsetLeft - pad}px`;
  toggle.style.top = `${wrap.offsetTop - pad}px`;
  toggle.style.width = `${wrap.offsetWidth + pad * 2}px`;
  toggle.style.height = `${wrap.offsetHeight + pad * 2}px`;

  toggle.style.zIndex = '5';
  toggle.style.pointerEvents = 'auto';
}

  /* ========= cards ========= */

  function getMemoForDinoId(id) {
    const c = custom.dino.find(x => x.id === id);
    if (c && typeof c.memo === 'string') return c.memo;

    const o = dinoOverride[id];
    if (o && typeof o.memo === 'string') return o.memo;

    return '';
  }

  function getMemoImgForDinoId(id) {
    const c = custom.dino.find(x => x.id === id);
    if (c && typeof c.memoImg === 'string') return c.memoImg;

    const o = dinoOverride[id];
    if (o && typeof o.memoImg === 'string') return o.memoImg;

    return '';
  }

  function setMemoImgForDinoId(id, memoImg) {
    const cIdx = custom.dino.findIndex(x => x.id === id);
    if (cIdx >= 0) {
      custom.dino[cIdx] = { ...custom.dino[cIdx], memoImg: String(memoImg || '') };
      saveJSON(LS.DINO_CUSTOM, custom.dino);
      return;
    }

    const o = dinoOverride[id] || {};
    dinoOverride[id] = { ...o, memoImg: String(memoImg || '') };
    saveJSON(LS.DINO_OVERRIDE, dinoOverride);
  }

  function applyMemoToCard(card, did) {
    const memo = String(getMemoForDinoId(did) || '').trim();
    const memoImg = String(getMemoImgForDinoId(did) || '').trim();
    const memoEl = $('.js-memo', card);
    if (!memoEl) return;

    // メモ欄からの画像「追加/削除」操作は廃止（管理画面の追加/編集で行う）
    if (!memoEl.dataset.built) {
      memoEl.dataset.built = '1';
      memoEl.innerHTML = `
        <div class="memoRow">
          <div class="memoText js-memoText"></div>
        </div>
        <div class="memoThumb js-memoThumb" style="display:none;">
          <img class="memoThumbImg js-memoThumbImg" alt="">
        </div>
      `;

      const thumbImg = $('.js-memoThumbImg', memoEl);
      thumbImg?.addEventListener('click', () => {
        const url = String(getMemoImgForDinoId(did) || '').trim();
        if (url) openImgViewer(url);
      });
    }

    const textEl = $('.js-memoText', memoEl);
    if (textEl) textEl.textContent = memo;

    const thumb = $('.js-memoThumb', memoEl);
    const thumbImg = $('.js-memoThumbImg', memoEl);

    if (thumb && thumbImg) {
      if (memoImg) {
        thumbImg.src = memoImg;
        thumb.style.display = 'block';
      } else {
        thumbImg.removeAttribute('src');
        thumb.style.display = 'none';
      }
    }

    memoEl.style.display = (memo || memoImg) ? 'block' : 'none';
  }

  function buildDinoCard(d, keyOverride = null) {
    const sp = getSpecialCfgForDino(d);
    const key = keyOverride || d.id;
    const s = ensureDinoState(key, d.defType, sp);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.key = key;
    card.dataset.name = d.name;
    card.dataset.kind = 'dino';
    card.dataset.did = d.id;

    const imgUrl = getImageUrlForDino(d);

    if (sp?.enabled && s.mode === 'special') {
      const maxN = Math.max(1, Math.min(60, Number(sp.max || 16)));
      const unitPrice = Number(sp.unit || 0);
      const allPrice = Number(sp.all || 0);
      const allowSex = !!sp.allowSex;

      const btns = [];
      for (let i = 1; i <= maxN; i++) {
        btns.push(`<button class="gBtn" type="button" data-act="pick" data-n="${i}">${i}</button>`);
      }

const normalBlock = allowSex ? `
  <div class="controls controlsWrap" style="margin-top:10px;">
    <div class="stepper male">
      <button class="btn" type="button" data-act="m-">−</button>
      <div class="val js-m">0</div>
      <button class="btn" type="button" data-act="m+">＋</button>
    </div>

    <div class="stepper female">
      <button class="btn" type="button" data-act="f-">−</button>
      <div class="val js-f">0</div>
      <button class="btn" type="button" data-act="f+">＋</button>
    </div>
  </div>
` : ``;

card.innerHTML = `
  <div class="cardInner">
    <div class="cardHead">
      <button class="cardToggle" type="button" aria-label="開閉" data-act="toggle"></button>

      <div class="nameWrap">
        <div class="name"></div>
        ${imgUrl ? `<div class="miniThumb"><img src="${imgUrl}" alt=""></div>` : ``}
      </div>

      <div class="right">
        <div class="typeRow">
          <button class="dupMini" type="button" data-act="dup">複製</button>
          ${allowSex ? `<select class="type" aria-label="種類"></select>` : ``}
        </div>
        <div class="unit">
              <div class="unitLine">1体=${unitPrice}円</div>
              <div class="dispLine js-price"></div>
            </div>
            
      </div>
    </div>

    ${normalBlock}

    <div class="controls gachaWrap">
      <div class="gWrap">
        <div class="gGrid">
          ${btns.join('')}
        </div>

        <div class="gLineWrap">
          <button class="gAct gUndo" type="button" data-act="undo">− 取消</button>
          <button class="gAct" type="button" data-act="all">全種</button>
        </div>
      </div>
    </div>
    <div class="memo js-memo" style="display:none;"></div>
  </div>
`;


// ✅ 念のため：何かの置換で nameWrap が消えても復旧できるようにする
let nameWrap = $('.nameWrap', card);
if (!nameWrap) {
  const head = $('.cardHead', card);
  const toggle = $('.cardToggle', card);

  if (head) {
    nameWrap = document.createElement('div');
    nameWrap.className = 'nameWrap';
    nameWrap.innerHTML = `
      <div class="name"></div>
      ${imgUrl ? `<div class="miniThumb"><img src="${imgUrl}" alt=""></div>` : ``}
    `;

    // toggle の直後に挿入（toggleが無ければ先頭）
    if (toggle && toggle.parentNode === head) {
      head.insertBefore(nameWrap, toggle.nextSibling);
    } else {
      head.insertBefore(nameWrap, head.firstChild);
    }
  }
}

const nameEl = $('.name', card);
if (nameEl) nameEl.textContent = displayName(d.name);
    applyMemoToCard(card, d.id);

// ✅ DOM挿入後のサイズ確定を待ってから「折りたたみ範囲」を確実にセット
requestAnimationFrame(() => installLeftToggleHit(card));

      const allBtn = $('button[data-act="all"]', card);
      const undoBtn = $('button[data-act="undo"]', card);
      const priceEl = $('.js-price', card);

      const mEl = $('.js-m', card);
      const fEl = $('.js-f', card);
      const sel = $('.type', card);
      
      if (allowSex && sel) {
        sel.innerHTML = typeList.map(t => `<option value="${t}">${t}</option>`).join('');
        if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
        sel.value = s.type;
      }

      const syncSpecial = () => {
        const picks = Array.isArray(s.picks) ? s.picks : [];
        const m = Number(s.m || 0);
        const f = Number(s.f || 0);
        const sexQty = m + f;

        // 番号ボタン：統一表示（押下状態＆無効制御）
        $$('.gBtn', card).forEach(btn => {
          const n = Number(btn.dataset.n || 0);
          btn.classList.toggle('isOn', picks.includes(n));
          btn.disabled = (allowSex && sexQty > 0) || !!s.all;
        });

        if (allowSex) {
          if (mEl) mEl.textContent = String(m);
          if (fEl) fEl.textContent = String(f);
          if (sel) sel.value = s.type;

          // 通常入力が入ったら特殊（番号/全種）は無効化
          const lock = sexQty > 0;
          if (allBtn) {
            allBtn.textContent = s.all ? '全種✓' : '全種';
            allBtn.classList.toggle('isOn', !!s.all);
            allBtn.disabled = lock;
          }
          if (undoBtn) undoBtn.disabled = lock || (!s.all && picks.length === 0);
        } else {
          if (allBtn) {
            allBtn.textContent = s.all ? '全種✓' : '全種';
            allBtn.classList.toggle('isOn', !!s.all);
            allBtn.disabled = false;
          }
          if (undoBtn) undoBtn.disabled = (!s.all && picks.length === 0);
        }

// 価格（単価の下）
        if (priceEl) {
          const hasInput = (allowSex && sexQty > 0) || !!s.all || picks.length > 0;

          if (!hasInput) {
            // ✅ 未入力時は「空白1文字」
            priceEl.textContent = ' ';
          } else {
            let price = 0;

            if (allowSex && sexQty > 0) {
              const type = s.type || d.defType || '受精卵';
              price = (prices[type] || 0) * sexQty;

         const tOut = String(type).replace('(指定)', '');
              const parts = [];
              if (m > 0) parts.push(`<span class="maleTxt">オス</span>×${m}`);
              if (f > 0) parts.push(`<span class="femaleTxt">メス</span>×${f}`);
              priceEl.innerHTML = `${tOut} ${parts.join(' ')} = ${yen(price)}`;

            } else if (s.all) {
              price = allPrice;
              priceEl.textContent = `全種= ${yen(price)}`;
            } else {
              price = picks.length * unitPrice;
              const nums = picks.map(n => circled(n)).join('');
              priceEl.textContent = nums ? `${nums} = ${yen(price)}` : ' ';
            }
          }
        }

  

        if (!el.q.value.trim()) {
          const q = (sexQty > 0) ? sexQty : (s.all ? 1 : picks.length);
          card.classList.toggle('isCollapsed', q === 0);
        }
      };

      syncSpecial();
      card.classList.toggle('isCollapsed', getQtyForCard(key, 'dino') === 0);

      $('.cardToggle', card).addEventListener('click', (ev) => {
        ev.preventDefault();
        if (el.q.value.trim()) return;
        el._touched = true;
    card.classList.toggle('isCollapsed');
      });

      sel?.addEventListener('click', (ev) => ev.stopPropagation());
      sel?.addEventListener('change', (ev) => {
        ev.stopPropagation();
        s.type = sel.value;
        autoSpecify(s);
        syncSpecial();
        rebuildOutput();
        applyCollapseAndSearch();
      });

      const step = (sex, delta) => {
        if (sex === 'm') s.m = Math.max(0, Number(s.m || 0) + delta);
        if (sex === 'f') s.f = Math.max(0, Number(s.f || 0) + delta);
        autoSpecify(s);

        if ((Number(s.m || 0) + Number(s.f || 0)) > 0) {
          s.all = false;
          s.picks = [];
        }
        syncSpecial();
        rebuildOutput();
        applyCollapseAndSearch();
      };

      card.addEventListener('click', (ev) => {
        const btn = ev.target?.closest('button');
        if (!btn) return;
        ev.stopPropagation();

        const act = btn.dataset.act;

if (act === 'dup') {
  const dupKey = `${d.id}__dup_${uid()}`;
  ephemeralKeys.add(dupKey);

  inputState.set(dupKey, {
    mode: 'special',
    picks: [],
    all: false,
    type: (s.type || d.defType || '受精卵'),
    m: 0,
    f: 0
  });

  const dupCard = buildDinoCard(d, dupKey);
  card.after(dupCard);

  rebuildOutput();
  applyCollapseAndSearch();
  return;
}

        if (act === 'm-') return step('m', -1);
        if (act === 'm+') return step('m', +1);
        if (act === 'f-') return step('f', -1);
        if (act === 'f+') return step('f', +1);

        const sexQty = Number(s.m || 0) + Number(s.f || 0);
        if (allowSex && sexQty > 0) {
          openToast('通常入力があるため特殊入力は無効です');
          return;
        }

        if (act === 'pick') {
          const n = Number(btn.dataset.n || 0);
          if (!Number.isFinite(n) || n <= 0) return;

          s.m = 0; s.f = 0;
          s.all = false;
          if (!Array.isArray(s.picks)) s.picks = [];
          s.picks.push(n);

          syncSpecial();
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }

        if (act === 'undo') {
          s.m = 0; s.f = 0;

          if (s.all) {
            s.all = false;
          } else {
            if (Array.isArray(s.picks) && s.picks.length) s.picks.pop();
          }
          syncSpecial();
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }

        if (act === 'all') {
          s.m = 0; s.f = 0;

          s.all = !s.all;
          if (s.all) s.picks = [];
          syncSpecial();
          rebuildOutput();
          applyCollapseAndSearch();
          return;
        }
      });

      return card;
    }

    card.innerHTML = `
      <div class="cardInner">
        <div class="cardHead">
          <button class="cardToggle" type="button" aria-label="開閉" data-act="toggle"></button>

          <div class="nameWrap">
            <div class="name"></div>
            ${imgUrl ? `<div class="miniThumb"><img src="${imgUrl}" alt=""></div>` : ``}
          </div>

<div class="right">
  <div class="typeRow">
    <button class="dupMini" type="button" data-act="dup">複製</button>
    <select class="type" aria-label="種類"></select>
  </div>
  <div class="unit"></div>
</div>
</div>

<div class="controls">
  <div class="stepper male">
    <button class="btn" type="button" data-act="m-">−</button>
    <div class="val js-m">0</div>
    <button class="btn" type="button" data-act="m+">＋</button>
  </div>

  <div class="stepper female">
    <button class="btn" type="button" data-act="f-">−</button>
    <div class="val js-f">0</div>
    <button class="btn" type="button" data-act="f+">＋</button>
  </div>
</div>
        <div class="memo js-memo" style="display:none;"></div>
      </div>
    `;

// ✅ 念のため：何かの置換で nameWrap が消えても復旧できるようにする
let nameWrap = $('.nameWrap', card);
if (!nameWrap) {
  const head = $('.cardHead', card);
  const toggle = $('.cardToggle', card);

  if (head) {
    nameWrap = document.createElement('div');
    nameWrap.className = 'nameWrap';
    nameWrap.innerHTML = `
      <div class="name"></div>
      ${imgUrl ? `<div class="miniThumb"><img src="${imgUrl}" alt=""></div>` : ``}
    `;

    // toggle の直後に挿入（toggleが無ければ先頭）
    if (toggle && toggle.parentNode === head) {
      head.insertBefore(nameWrap, toggle.nextSibling);
    } else {
      head.insertBefore(nameWrap, head.firstChild);
    }
  }
}

const nameEl = $('.name', card);
if (nameEl) nameEl.textContent = displayName(d.name);
    applyMemoToCard(card, d.id);

// ✅ DOM挿入後のサイズ確定を待ってから「折りたたみ範囲」を確実にセット
requestAnimationFrame(() => installLeftToggleHit(card));

    const sel = $('.type', card);
    sel.innerHTML = typeList.map(t => `<option value="${t}">${t}</option>`).join('');
    if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
    sel.value = s.type;

    const unit = $('.unit', card);
    // 単価 + カード内の価格表示（単価の直下）を同じ枠内にまとめる
      unit.innerHTML = `<div class="unitLine">単価${prices[s.type] || 0}円</div>`;
      let priceEl = $('.js-price', unit);
      if (!priceEl) {
        priceEl = document.createElement('div');
        priceEl.className = 'dispLine js-price';
        unit.appendChild(priceEl);
      }

      const type = s.type || d.defType || '受精卵';
      const m = Number(s.m || 0);
      const f = Number(s.f || 0);
      const qty = m + f;

      if (qty <= 0) {
        // ✅ 未入力時は「空白1文字」
        priceEl.textContent = ' ';
      } else {
        const unitPrice = prices[type] || 0;
        const price = unitPrice * qty;

        // カード内は「恐竜名より後ろの文言」だけ表示（例：受精卵×1 = 30円）
const tOut = String(type).replace('(指定)', '');
        const baseType = tOut; // (指定)を外した表示名
        const hideSex = (baseType === '受精卵' || baseType === '胚') && !/\(指定\)$/.test(type);
        const isPair = /\(指定\)$/.test(type) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(type);

        if (hideSex) {
          // ✅ 受精卵・胚はオスメス表記を出さない
          priceEl.textContent = `${tOut}×${qty} = ${price.toLocaleString('ja-JP')}円`;
        } else {
          const parts = [];
          if (m > 0) parts.push(`<span class="maleTxt">オス</span>×${m}`);
          if (f > 0) parts.push(`<span class="femaleTxt">メス</span>×${f}`);

          if (isPair && m === f && m > 0) {
            priceEl.textContent = `${tOut}ペア${m > 1 ? '×' + m : ''} = ${price.toLocaleString('ja-JP')}円`;
          } else if (parts.length) {
            priceEl.innerHTML = `${tOut} ${parts.join(' ')} = ${price.toLocaleString('ja-JP')}円`;
          } else {
            priceEl.textContent = `${tOut}×${qty} = ${price.toLocaleString('ja-JP')}円`;
          }
        }
      }

    const mEl = $('.js-m', card);
    const fEl = $('.js-f', card);
    mEl.textContent = String(s.m || 0);
    fEl.textContent = String(s.f || 0);

    const initialQty = Number(s.m || 0) + Number(s.f || 0);
    card.classList.toggle('isCollapsed', initialQty === 0);

    function syncUI() {
      if (!typeList.includes(s.type)) s.type = d.defType || '受精卵';
      sel.value = s.type;
      // 単価 + カード内の価格表示（単価の直下）を同じ枠内にまとめる
      unit.innerHTML = `<div class="unitLine">単価${prices[s.type] || 0}円</div>`;
      let priceEl = $('.js-price', unit);
      if (!priceEl) {
        priceEl = document.createElement('div');
        priceEl.className = 'dispLine js-price';
        unit.appendChild(priceEl);
      }

      const type = s.type || d.defType || '受精卵';
      const m = Number(s.m || 0);
      const f = Number(s.f || 0);
      const qty = m + f;

      if (qty <= 0) {
        // ✅ 未入力時は「空白1文字」
        priceEl.textContent = ' ';
      } else {
        const unitPrice = prices[type] || 0;
        const price = unitPrice * qty;

        // カード内は「恐竜名より後ろの文言」だけ表示（例：受精卵×1 = 30円）
const tOut = String(type).replace('(指定)', '');
        const baseType = tOut; // (指定)を外した表示名
        const hideSex = (baseType === '受精卵' || baseType === '胚') && !/\(指定\)$/.test(type);
        const isPair = /\(指定\)$/.test(type) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(type);

        if (hideSex) {
          // ✅ 受精卵・胚はオスメス表記を出さない
          priceEl.textContent = `${tOut}×${qty} = ${price.toLocaleString('ja-JP')}円`;
        } else {
          const parts = [];
          if (m > 0) parts.push(`<span class="maleTxt">オス</span>×${m}`);
          if (f > 0) parts.push(`<span class="femaleTxt">メス</span>×${f}`);

          if (isPair && m === f && m > 0) {
            priceEl.textContent = `${tOut}ペア${m > 1 ? '×' + m : ''} = ${price.toLocaleString('ja-JP')}円`;
          } else if (parts.length) {
            priceEl.innerHTML = `${tOut} ${parts.join(' ')} = ${price.toLocaleString('ja-JP')}円`;
          } else {
            priceEl.textContent = `${tOut}×${qty} = ${price.toLocaleString('ja-JP')}円`;
          }
        }
      }
      mEl.textContent = String(s.m || 0);
      fEl.textContent = String(s.f || 0);

      if (!el.q.value.trim()) {
        const q = (Number(s.m || 0) + Number(s.f || 0));
        card.classList.toggle('isCollapsed', q === 0);
      }
    }

    function step(sex, delta) {
      if (sex === 'm') s.m = Math.max(0, Number(s.m || 0) + delta);
      if (sex === 'f') s.f = Math.max(0, Number(s.f || 0) + delta);
      autoSpecify(s);
      syncUI();
      rebuildOutput();
      applyCollapseAndSearch();
    }

    sel.addEventListener('click', (ev) => ev.stopPropagation());
    sel.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    sel.addEventListener('change', (ev) => {
      ev.stopPropagation();
      s.type = sel.value;
      autoSpecify(s);
      syncUI();
      rebuildOutput();
      applyCollapseAndSearch();
    });

    $('.cardToggle', card).addEventListener('click', (ev) => {
      ev.preventDefault();
      if (el.q.value.trim()) return;
      card.classList.toggle('isCollapsed');
    });

    $$('button[data-act]', card).forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.act;

        if (act === 'm-') step('m', -1);
        if (act === 'm+') step('m', +1);
        if (act === 'f-') step('f', -1);
        if (act === 'f+') step('f', +1);

        if (act === 'dup') {
          const dupKey = `${d.id}__dup_${uid()}`;
          ephemeralKeys.add(dupKey);
          inputState.set(dupKey, { type: s.type, m: 0, f: 0 });

          const dupCard = buildDinoCard(d, dupKey);
          card.after(dupCard);
          rebuildOutput();
          applyCollapseAndSearch();
        }
      });
    });

    return card;
  }

  function getMemoForItemId(id) {
    const c = custom.item.find(x => x.id === id);
    if (c && typeof c.memo === 'string') return c.memo;
    return '';
  }

  function getMemoImgForItemId(id) {
    const c = custom.item.find(x => x.id === id);
    if (c && typeof c.memoImg === 'string') return c.memoImg;
    return '';
  }

  function setMemoImgForItemId(id, memoImg) {
    const idx = custom.item.findIndex(x => x.id === id);
    if (idx >= 0) {
      custom.item[idx] = { ...custom.item[idx], memoImg: String(memoImg || '') };
      saveJSON(LS.ITEM_CUSTOM, custom.item);
      return;
    }

    const base = items.find(x => x.id === id) || null;
    custom.item.push({
      id,
      name: base?.name || '',
      unit: Number(base?.unit || 1),
      price: Number(base?.price || 0),
      memo: '',
      memoImg: String(memoImg || ''),
    });
    saveJSON(LS.ITEM_CUSTOM, custom.item);
  }

  function applyMemoToItemCard(card, iid) {
    const memo = String(getMemoForItemId(iid) || '').trim();
    const memoImg = String(getMemoImgForItemId(iid) || '').trim();
    const memoEl = $('.js-memo', card);
    if (!memoEl) return;

    // メモ欄からの画像「追加/削除」操作は廃止（管理画面の追加/編集で行う）
    if (!memoEl.dataset.built) {
      memoEl.dataset.built = '1';
      memoEl.innerHTML = `
        <div class="memoRow">
          <div class="memoText js-memoText"></div>
        </div>
        <div class="memoThumb js-memoThumb" style="display:none;">
          <img class="memoThumbImg js-memoThumbImg" alt="">
        </div>
      `;

      const thumbImg = $('.js-memoThumbImg', memoEl);
      thumbImg?.addEventListener('click', () => {
        const url = String(getMemoImgForItemId(iid) || '').trim();
        if (url) openImgViewer(url);
      });
    }

    const textEl = $('.js-memoText', memoEl);
    if (textEl) textEl.textContent = memo;

    const thumb = $('.js-memoThumb', memoEl);
    const thumbImg = $('.js-memoThumbImg', memoEl);

    if (thumb && thumbImg) {
      if (memoImg) {
        thumbImg.src = memoImg;
        thumb.style.display = 'block';
      } else {
        thumbImg.removeAttribute('src');
        thumb.style.display = 'none';
      }
    }

    memoEl.style.display = (memo || memoImg) ? 'block' : 'none';
  }

  function buildItemCard(it) {
    const s = ensureItemState(it.id);

    const card = document.createElement('div');
    card.className = 'card isCollapsed';
    card.dataset.card = '1';
    card.dataset.key = it.id;
    card.dataset.name = it.name;
    card.dataset.kind = 'item';

    card.innerHTML = `
      <div class="cardInner">
        <div class="cardHead">
          <button class="cardToggle" type="button" aria-label="開閉" data-act="toggle"></button>

          <div class="nameWrap">
            <div class="name"></div>
          </div>

          <div class="right">
            <div class="unit"></div>
          </div>
        </div>

        <div class="controls">
          <div class="stepper" data-flex="1">
            <button class="btn" type="button" data-act="-">−</button>
            <div class="val js-q">0</div>
            <button class="btn" type="button" data-act="+">＋</button>
          </div>
        </div>

        <div class="memo js-memo" style="display:none;"></div>
      </div>
    `;

    $('.name', card).textContent = displayName(it.name);
    $('.unit', card).textContent = `${it.unit}個/単価${it.price}円`;
    applyMemoToItemCard(card, it.id);

    const toggle = $('.cardToggle', card);

    // ✅ アイテムカードは「右いっぱい」まで開閉の当たり判定を広げる（ヘッダー全体）
    requestAnimationFrame(() => {
      const tg = $('.cardToggle', card);
      if (!tg) return;

      tg.style.inset = 'auto';
      tg.style.left = '-12px';
      tg.style.right = '-12px';
      tg.style.top = '-12px';
      tg.style.bottom = 'auto';
      tg.style.width = 'auto';
      tg.style.height = 'calc(100% + 24px)'; // cardHead基準
    });

    const controls = $('.controls', card);
    if (controls) {
      controls.style.position = 'relative';
      controls.style.zIndex = '6';
    }

    const qEl = $('.js-q', card);
    qEl.textContent = String(s.qty || 0);

    card.classList.toggle('isCollapsed', Number(s.qty || 0) === 0);

    toggle?.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (el.q.value.trim()) return;
      card.classList.toggle('isCollapsed');
    });

    $$('button[data-act]', card).forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.act;

        // ✅ itemカードのトグル(開閉)は「数量更新ロジック」に巻き込まない
        if (act === 'toggle') return;

        if (act === '-') s.qty = Math.max(0, Number(s.qty || 0) - 1);
        if (act === '+') s.qty = Math.max(0, Number(s.qty || 0) + 1);

        qEl.textContent = String(s.qty || 0);

        if (!el.q.value.trim()) card.classList.toggle('isCollapsed', Number(s.qty || 0) === 0);

        rebuildOutput();
        applyCollapseAndSearch();
      });
    });

    return card;
  }

  /* ========= render ========= */
  function renderList() {
    el.list.innerHTML = '';

    if (activeTab === 'dino') {
      const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
      dList.forEach(d => el.list.appendChild(buildDinoCard(d)));
    } else {
      const iList = sortByOrder(items.filter(i => !hidden.item.has(i.id)), 'item');
      iList.forEach(it => el.list.appendChild(buildItemCard(it)));
    }

    rebuildOutput();
    applyCollapseAndSearch();
  }

  function setTab(tab) {
    activeTab = tab;
    el.tabDinos.classList.toggle('isActive', tab === 'dino');
    el.tabItems.classList.toggle('isActive', tab === 'item');
    renderList();
  }

  /* ========= manage modal ========= */
  function openModal() {
    ScrollLock.lock(); // ✅ 背面スクロール禁止
    el.modalOverlay.classList.remove('isHidden');
    setManageTab('catalog');
  }
  function closeModal() {
    el.modalOverlay.classList.add('isHidden');
    el.modalBody.innerHTML = '';
    ScrollLock.unlock(); // ✅ 戻す
  }

  function setManageTab(kind) {
    el.mTabCatalog.classList.toggle('isActive', kind === 'catalog');
    el.mTabPrices.classList.toggle('isActive', kind === 'prices');
    el.mTabImages?.classList.toggle('isActive', kind === 'images');

    el.modalBody.innerHTML = '';
    if (kind === 'catalog') el.modalBody.appendChild(renderManageCatalog());
    if (kind === 'prices') el.modalBody.appendChild(renderManagePrices());
    if (kind === 'images') el.modalBody.appendChild(renderManageImages());
  }

  /* ========= edit/add modal ========= */
  function openEditModal(title, bodyEl) {
    if (!el.editOverlay) return;
    ScrollLock.lock(); // ✅
    el.editTitle.textContent = title;
    el.editBody.innerHTML = '';
    el.editBody.appendChild(bodyEl);
    el.editOverlay.classList.remove('isHidden');
  }
  function closeEditModal() {
    if (!el.editOverlay) return;
    el.editOverlay.classList.add('isHidden');
    el.editBody.innerHTML = '';
    ScrollLock.unlock(); // ✅
  }
  el.editOverlay?.addEventListener('click', (e) => {
    if (e.target === el.editOverlay) closeEditModal();
  });

  /* ========= manage: prices ========= */
  function renderManagePrices() {
    const box = document.createElement('div');

    const grid = document.createElement('div');
    grid.className = 'priceGrid';

    typeList.forEach(t => {
      const key = document.createElement('div');
      key.className = 'pKey';
      key.textContent = t;

      const val = document.createElement('div');
      val.className = 'pVal';
      val.innerHTML = `<input type="text" inputmode="numeric" value="${prices[t] || 0}" data-type="${t}">`;

      grid.appendChild(key);
      grid.appendChild(val);
    });

    const save = document.createElement('div');
    save.style.marginTop = '12px';
    save.innerHTML = `<button class="pill" type="button" data-act="savePrices">保存</button>`;

    box.appendChild(grid);
    box.appendChild(save);

    box.addEventListener('click', (e) => {
      if (e.target?.dataset?.act !== 'savePrices') return;
      $$('input[data-type]', box).forEach(inp => {
        const t = inp.dataset.type;
        prices[t] = Number(inp.value || 0);
      });
      saveJSON(LS.PRICES, prices);
      renderList();
      setManageTab('prices');
    });

    return box;
  }

  /* ========= manage: catalog ========= */
  function renderManageCatalog() {
    const wrap = document.createElement('div');

const top = document.createElement('div');
    top.className = 'mTopBar';

    // ✅ 管理画面：登録されている恐竜数を表示（「XX種」のみ）
    const dinoCount = dinos.filter(x => !hidden.dino.has(x.id)).length;

    top.innerHTML = `
      <div class="mCountText">${dinoCount}種</div>
      <button class="pill" type="button" data-act="gojuon">五十音順</button>
      <button class="pill" type="button" data-act="add">＋追加</button>
    `;
    wrap.appendChild(top);

    const list = (activeTab === 'dino')
      ? sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino')
      : sortByOrder(items.filter(x => !hidden.item.has(x.id)), 'item');

    list.forEach(obj => {
      const r = document.createElement('div');
      r.className = 'mRow';
      r.innerHTML = `
        <div class="mName">${escapeHtml(obj.name)}</div>
        ${activeTab === 'dino' ? `<button class="sBtn" type="button" data-act="edit" data-id="${obj.id}">✎</button>` : ``}
        <button class="sBtn" type="button" data-act="up" data-id="${obj.id}">↑</button>
        <button class="sBtn" type="button" data-act="down" data-id="${obj.id}">↓</button>
        <button class="sBtn danger" type="button" data-act="del" data-id="${obj.id}">削除</button>
      `;
      wrap.appendChild(r);
    });

    wrap.addEventListener('click', async (e) => {
      const btn = e.target?.closest('button');
      if (!btn) {
        // ✅ テンプレカード本体タップで内容確認
        const tRow = e.target?.closest('#templateWrap .mRow');
        const tid2 = tRow?.dataset?.tid;
        if (tid2) {
          const t = roomTemplates.find(x => x.id === tid2);
          if (t) {
            const text = String(t.text ?? '').trim();
            if (!text) { openToast('テンプレ本文が空です'); return; }
            showTemplatePreview(text);
}
        }
        return;
      }
      const act = btn?.dataset?.act;
      const id = btn?.dataset?.id;

if (act === 'gojuon') {
        const kind = activeTab;
        const visible = (kind === 'dino')
          ? dinos.filter(x => !hidden.dino.has(x.id))
          : items.filter(x => !hidden.item.has(x.id));

        const sortedIds = visible
          .slice()
          .sort((a, b) => sortName(a.name).localeCompare(sortName(b.name), 'ja') || String(a.id).localeCompare(String(b.id)))
          .map(x => x.id);

        const current = (order[kind] || []).slice();
        const rest = current.filter(x => !sortedIds.includes(x));
        const next = [...sortedIds, ...rest];

        order[kind] = next;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, next);

        renderList();
        setManageTab('catalog');
        return;
      }

      if (act === 'add') {
        if (activeTab === 'dino') openAddDino();
        else openAddItem();
        return;
      }

      if (!act || !id) return;

      const kind = activeTab;
      const ord = (order[kind] || []).slice();
      const i = ord.indexOf(id);

      if (act === 'up' && i > 0) {
        [ord[i], ord[i - 1]] = [ord[i - 1], ord[i]];
        order[kind] = ord;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
        renderList();
        setManageTab('catalog');
        return;
      }

      if (act === 'down' && i !== -1 && i < ord.length - 1) {
        [ord[i], ord[i + 1]] = [ord[i + 1], ord[i]];
        order[kind] = ord;
        saveJSON(kind === 'dino' ? LS.DINO_ORDER : LS.ITEM_ORDER, ord);
        renderList();
        setManageTab('catalog');
        return;
      }

      if (act === 'del') {
        const ok = await confirmAsk('削除しますか？');
        if (!ok) return;

        if (kind === 'dino') {
          hidden.dino.add(id);
          saveJSON(LS.DINO_HIDDEN, Array.from(hidden.dino));
        } else {
          hidden.item.add(id);
          saveJSON(LS.ITEM_HIDDEN, Array.from(hidden.item));
        }
        renderList();
        setManageTab('catalog');
        return;
      }

      if (act === 'edit') {
        if (kind === 'dino') openEditDino(id);
        else openEditItem(id);
        return;
      }
    });

    return wrap;
  }

  // ---- 以下、あなたの元コードの残り（画像管理 / ROOM / events / init）は
  // ScrollLockを openRoom/closeRoom, openImgViewer/closeImgViewer にも適用した上でそのままです。
  // 省略すると「全置換」できないので、ここから先も"元コード通り"＋必要箇所だけScrollLock追加しています。

  function openAddDino() {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="editForm">
        <div class="editLabel">名前</div>
        <input id="addName" class="editInput" type="text" value="" autocomplete="off" placeholder="例：ガチャ">

        <div class="editLabel">デフォルト種類</div>
        <select id="addType" class="editSelect">
          ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>

        <div class="editLabel">メモ</div>
        <textarea id="addMemo" class="editTextarea" placeholder="例：在庫少 / 予約あり / 取り置き不可"></textarea>

        <div class="editLabel">メモ画像</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label class="memoImgBtn" title="画像を追加">
            <input id="addMemoImg" class="memoImgInput" type="file" accept="image/*">
            画像
          </label>
          <button id="addMemoImgClear" class="memoImgClear" type="button">×</button>
        </div>
        <div class="memoThumb js-editMemoThumb" style="display:none;">
          <img class="memoThumbImg js-editMemoThumbImg" alt="">
        </div>

        <div style="height:1px;background:rgba(255,255,255,.10);margin:6px 0;"></div>

        <label style="display:flex;gap:10px;align-items:center;font-weight:900;color:rgba(255,255,255,.85);">
          <input id="spEnable" type="checkbox" style="transform:scale(1.2);">
          特殊入力（ガチャ等）
        </label>

        <label style="display:flex;gap:10px;align-items:center;font-weight:900;color:rgba(255,255,255,.85);margin-top:-6px;">
          <input id="spAllowSex" type="checkbox" style="transform:scale(1.2);" disabled>
          特殊＋通常の♂♀入力を許可
        </label>

        <div id="spBox" style="display:none;">
          <div class="editLabel">何番までボタンを用意するか</div>
          <input id="spMax" class="editInput" type="text" inputmode="numeric" value="16">

          <div class="editLabel">1体あたりの価格</div>
          <input id="spUnit" class="editInput" type="text" inputmode="numeric" value="300">

          <div class="editLabel">全種の場合の価格</div>
          <input id="spAll" class="editInput" type="text" inputmode="numeric" value="3000">
        </div>

        <div class="editBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">保存</button>
        </div>
      </div>
    `;

    const spEnable = $('#spEnable', box);
    const spBox = $('#spBox', box);
    const spAllowSex = $('#spAllowSex', box);

    spEnable?.addEventListener('change', () => {
      const on = !!spEnable.checked;
      if (spBox) spBox.style.display = on ? 'block' : 'none';
      if (spAllowSex) spAllowSex.disabled = !on;
      if (!on && spAllowSex) spAllowSex.checked = false;
    });

    openEditModal('追加 / 編集', box);

    // メモ画像（追加画面）
    let memoImgData = '';
    const imgInp = $('#addMemoImg', box);
    const imgClr = $('#addMemoImgClear', box);
    const thumb = $('.js-editMemoThumb', box);
    const thumbImg = $('.js-editMemoThumbImg', box);

    const syncMemoImgUI = () => {
      if (thumb && thumbImg) {
        if (memoImgData) {
          thumbImg.src = memoImgData;
          thumb.style.display = 'block';
        } else {
          thumbImg.removeAttribute('src');
          thumb.style.display = 'none';
        }
      }
      if (imgClr) imgClr.style.display = memoImgData ? 'inline-flex' : 'none';
    };

    syncMemoImgUI();

    imgInp?.addEventListener('change', async (ev) => {
      const file = ev.target?.files?.[0];
      if (!file) return;
      const url = await readFileAsDataURL(file);
      if (!url) return openToast('画像の読み込みに失敗しました');
      memoImgData = url;
      syncMemoImgUI();
      openToast('画像を設定しました');
      ev.target.value = '';
    });

    imgClr?.addEventListener('click', (ev) => {
      ev.preventDefault();
      memoImgData = '';
      syncMemoImgUI();
      openToast('画像を削除しました');
    });

    thumbImg?.addEventListener('click', () => {
      if (memoImgData) openImgViewer(memoImgData);
    });

    box.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') {
        closeEditModal();
        return;
      }

      if (act === 'save') {
        const name = ($('#addName', box)?.value || '').trim();
        const defType = ($('#addType', box)?.value || '受精卵');
        const memo = ($('#addMemo', box)?.value || '').trim();
        if (!name) return openToast('名前を入力してください');

        const id = stableId('d', name);
        const existIdx = custom.dino.findIndex(x => x.id === id);
        const rec = { id, name, defType, memo, memoImg: String(memoImgData || ''), _baseName: name };
        if (existIdx >= 0) custom.dino[existIdx] = rec;
        else custom.dino.push(rec);
        saveJSON(LS.DINO_CUSTOM, custom.dino);

        if (spEnable?.checked) {
          const max = Math.max(1, Math.min(60, Number($('#spMax', box)?.value || 16)));
          const unit = Math.max(0, Number($('#spUnit', box)?.value || 0));
          const all = Math.max(0, Number($('#spAll', box)?.value || 0));
          const allowSex = !!spAllowSex?.checked;
          specialCfg[id] = { enabled: true, max, unit, all, allowSex };
          saveJSON(LS.SPECIAL_CFG, specialCfg);
        }

        closeEditModal();
        dinos = dinos.concat([{ id, name, defType, kind: 'dino', _baseName: name }]);
        ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
        renderList();
        setManageTab('catalog');
        openToast('追加しました');
      }
    });
  }

  function openAddItem() {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="editForm">
        <div class="editLabel">名前</div>
        <input id="addName" class="editInput" type="text" value="" autocomplete="off" placeholder="例：金庫">

        <div class="editLabel">1セットあたり個数</div>
        <input id="addUnit" class="editInput" type="text" inputmode="numeric" value="1">

        <div class="editLabel">価格（1セット）</div>
        <input id="addPrice" class="editInput" type="text" inputmode="numeric" value="0">

        <div class="editLabel">メモ</div>
        <textarea id="addMemo" class="editTextarea" placeholder="例：在庫少 / 取り置き不可"></textarea>

        <div class="editLabel">メモ画像</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label class="memoImgBtn" title="画像を追加">
            <input id="addMemoImg" class="memoImgInput" type="file" accept="image/*">
            画像
          </label>
          <button id="addMemoImgClear" class="memoImgClear" type="button">×</button>
        </div>
        <div class="memoThumb js-editMemoThumb" style="display:none;">
          <img class="memoThumbImg js-editMemoThumbImg" alt="">
        </div>

        <div class="editBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">保存</button>
        </div>
      </div>
    `;

    openEditModal('追加 / 編集', box);

    // メモ画像（追加画面）
    let memoImgData = '';
    const imgInp = $('#addMemoImg', box);
    const imgClr = $('#addMemoImgClear', box);
    const thumb = $('.js-editMemoThumb', box);
    const thumbImg = $('.js-editMemoThumbImg', box);

    const syncMemoImgUI = () => {
      if (thumb && thumbImg) {
        if (memoImgData) {
          thumbImg.src = memoImgData;
          thumb.style.display = 'block';
        } else {
          thumbImg.removeAttribute('src');
          thumb.style.display = 'none';
        }
      }
      if (imgClr) imgClr.style.display = memoImgData ? 'inline-flex' : 'none';
    };

    syncMemoImgUI();

    imgInp?.addEventListener('change', async (ev) => {
      const file = ev.target?.files?.[0];
      if (!file) return;
      const url = await readFileAsDataURL(file);
      if (!url) return openToast('画像の読み込みに失敗しました');
      memoImgData = url;
      syncMemoImgUI();
      openToast('画像を設定しました');
      ev.target.value = '';
    });

    imgClr?.addEventListener('click', (ev) => {
      ev.preventDefault();
      memoImgData = '';
      syncMemoImgUI();
      openToast('画像を削除しました');
    });

    thumbImg?.addEventListener('click', () => {
      if (memoImgData) openImgViewer(memoImgData);
    });

    box.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') {
        closeEditModal();
        return;
      }

      if (act === 'save') {
        const name = ($('#addName', box)?.value || '').trim();
        const unit = Number($('#addUnit', box)?.value || 1);
        const price = Number($('#addPrice', box)?.value || 0);
        const memo = ($('#addMemo', box)?.value || '').trim();
        if (!name) return openToast('名前を入力してください');
        if (!Number.isFinite(unit) || unit <= 0) return openToast('個数は1以上');
        if (!Number.isFinite(price) || price < 0) return openToast('価格が不正です');

        const id = stableId('i', name);
        const existIdx = custom.item.findIndex(x => x.id === id);
        const rec = { id, name, unit, price, memo, memoImg: String(memoImgData || '') };
        if (existIdx >= 0) custom.item[existIdx] = rec;
        else custom.item.push(rec);
        saveJSON(LS.ITEM_CUSTOM, custom.item);

        closeEditModal();
        items = items.concat([{ id, name, unit, price, kind: 'item' }]);
        ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');
        renderList();
        setManageTab('catalog');
        openToast('追加しました');
      }
    });
  }

  function openEditDino(id) {
    const d = dinos.find(x => x.id === id);
    if (!d) return;

    const curSp = specialCfg[id] || getSpecialCfgForDino(d) || null;
    const curMemo = getMemoForDinoId(id);

    const box = document.createElement('div');
    box.innerHTML = `
      <div class="editForm">
        <div class="editLabel">名前</div>
        <input id="editName" class="editInput" type="text" value="${escapeHtml(d.name)}" autocomplete="off">

        <div class="editLabel">デフォルト種類</div>
        <select id="editType" class="editSelect">
          ${typeList.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>

        <div class="editLabel">メモ</div>
        <textarea id="editMemo" class="editTextarea" placeholder="例：在庫少 / 予約あり / 取り置き不可">${escapeHtml(curMemo || '')}</textarea>

        <div class="editLabel">メモ画像</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label class="memoImgBtn" title="画像を追加">
            <input id="editMemoImg" class="memoImgInput" type="file" accept="image/*">
            画像
          </label>
          <button id="editMemoImgClear" class="memoImgClear" type="button">×</button>
        </div>
        <div class="memoThumb js-editMemoThumb" style="display:none;">
          <img class="memoThumbImg js-editMemoThumbImg" alt="">
        </div>

        <div style="height:1px;background:rgba(255,255,255,.10);margin:6px 0;"></div>

        <label style="display:flex;gap:10px;align-items:center;font-weight:900;color:rgba(255,255,255,.85);">
          <input id="spEnable" type="checkbox" ${curSp?.enabled ? 'checked' : ''} style="transform:scale(1.2);">
          特殊入力（ガチャ等）
        </label>

        <label style="display:flex;gap:10px;align-items:center;font-weight:900;color:rgba(255,255,255,.85);margin-top:-6px;">
          <input id="spAllowSex" type="checkbox" ${curSp?.allowSex ? 'checked' : ''} style="transform:scale(1.2);" ${curSp?.enabled ? '' : 'disabled'}>
          特殊＋通常の♂♀入力を許可
        </label>

        <div id="spBox" style="display:${curSp?.enabled ? 'block' : 'none'};">
          <div class="editLabel">何番までボタンを用意するか</div>
          <input id="spMax" class="editInput" type="text" inputmode="numeric" value="${Number(curSp?.max || 16)}">

          <div class="editLabel">1体あたりの価格</div>
          <input id="spUnit" class="editInput" type="text" inputmode="numeric" value="${Number(curSp?.unit || 300)}">

          <div class="editLabel">全種の場合の価格</div>
          <input id="spAll" class="editInput" type="text" inputmode="numeric" value="${Number(curSp?.all || 3000)}">
        </div>

        <div class="editBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">保存</button>
        </div>
      </div>
    `;

    const sel = $('#editType', box);
    if (sel) sel.value = d.defType || '受精卵';

    const spEnable = $('#spEnable', box);
    const spBox = $('#spBox', box);
    const spAllowSex = $('#spAllowSex', box);

    spEnable?.addEventListener('change', () => {
      if (!spBox) return;
      const on = spEnable.checked;
      spBox.style.display = on ? 'block' : 'none';
      if (spAllowSex) {
        spAllowSex.disabled = !on;
        if (!on) spAllowSex.checked = false;
      }
    });

    openEditModal('追加 / 編集', box);

    // メモ画像（編集画面）
    let memoImgData = String(getMemoImgForDinoId(id) || '').trim();
    const imgInp = $('#editMemoImg', box);
    const imgClr = $('#editMemoImgClear', box);
    const thumb = $('.js-editMemoThumb', box);
    const thumbImg = $('.js-editMemoThumbImg', box);

    const syncMemoImgUI = () => {
      if (thumb && thumbImg) {
        if (memoImgData) {
          thumbImg.src = memoImgData;
          thumb.style.display = 'block';
        } else {
          thumbImg.removeAttribute('src');
          thumb.style.display = 'none';
        }
      }
      if (imgClr) imgClr.style.display = memoImgData ? 'inline-flex' : 'none';
    };

    syncMemoImgUI();

    imgInp?.addEventListener('change', async (ev) => {
      const file = ev.target?.files?.[0];
      if (!file) return;
      const url = await readFileAsDataURL(file);
      if (!url) return openToast('画像の読み込みに失敗しました');
      memoImgData = url;
      syncMemoImgUI();
      openToast('画像を設定しました');
      ev.target.value = '';
    });

    imgClr?.addEventListener('click', (ev) => {
      ev.preventDefault();
      memoImgData = '';
      syncMemoImgUI();
      openToast('画像を削除しました');
    });

    thumbImg?.addEventListener('click', () => {
      if (memoImgData) openImgViewer(memoImgData);
    });

    box.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') {
        closeEditModal();
        return;
      }

      if (act === 'save') {
        const newName = ($('#editName', box)?.value || '').trim();
        const newDef = ($('#editType', box)?.value || '受精卵');
        const memo = ($('#editMemo', box)?.value || '').trim();
        if (!newName) return;

        const cIdx = custom.dino.findIndex(x => x.id === id);
        if (cIdx >= 0) {
          custom.dino[cIdx] = {
            id,
            name: newName,
            defType: newDef,
            memo,
            memoImg: String(memoImgData || ''),
            _baseName: custom.dino[cIdx]._baseName || newName,
          };
          saveJSON(LS.DINO_CUSTOM, custom.dino);
        } else {
          dinoOverride[id] = {
            ...(dinoOverride[id] || {}),
            name: newName,
            defType: newDef,
            memo,
            memoImg: String(memoImgData || ''),
          };
          saveJSON(LS.DINO_OVERRIDE, dinoOverride);
        }

        const di = dinos.findIndex(x => x.id === id);
        if (di >= 0) dinos[di] = Object.assign({}, dinos[di], { name: newName, defType: newDef });

        if (spEnable?.checked) {
          const max = Math.max(1, Math.min(60, Number($('#spMax', box)?.value || 16)));
          const unit = Math.max(0, Number($('#spUnit', box)?.value || 0));
          const all = Math.max(0, Number($('#spAll', box)?.value || 0));
          const allowSex = !!spAllowSex?.checked;
          specialCfg[id] = { enabled: true, max, unit, all, allowSex };
          saveJSON(LS.SPECIAL_CFG, specialCfg);

          const st = inputState.get(id);
          if (st) {
            st.mode = 'special';
            if (!Array.isArray(st.picks)) st.picks = [];
            if (typeof st.all !== 'boolean') st.all = false;
            if (typeof st.type !== 'string') st.type = newDef;
            if (typeof st.m !== 'number') st.m = 0;
            if (typeof st.f !== 'number') st.f = 0;
          }
        } else {
          if (specialCfg[id]) {
            delete specialCfg[id];
            saveJSON(LS.SPECIAL_CFG, specialCfg);
          }
          const st = inputState.get(id);
          if (st && st.mode === 'special') {
            inputState.set(id, { type: newDef, m: 0, f: 0 });
          }
        }

        closeEditModal();
        renderList();
        setManageTab('catalog');
      }
    });
  }

  /* ========= Images tab (IndexedDB) ========= */
  async function fileToDataURLCompressed(file, maxW = 900, quality = 0.78) {
    const img = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = String(r.result || '');
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    const w0 = img.naturalWidth || img.width || 1;
    const h0 = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, maxW / w0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    return canvas.toDataURL('image/jpeg', quality);
  }

  function openImgViewer(url) {
    if (!el.imgOverlay || !el.imgViewerImg) return;
    ScrollLock.lock(); // ✅
    el.imgViewerImg.src = url;
    el.imgOverlay.classList.remove('isHidden');
  }
  function closeImgViewer() {
    if (!el.imgOverlay) return;
    el.imgOverlay.classList.add('isHidden');
    if (el.imgViewerImg) el.imgViewerImg.src = '';
    ScrollLock.unlock(); // ✅
  }
  el.imgClose?.addEventListener('click', closeImgViewer);
  el.imgOverlay?.addEventListener('click', (e) => {
    if (e.target === el.imgOverlay) closeImgViewer();
  });

  function renderManageImages() {
    const wrap = document.createElement('div');

    const topBar = document.createElement('div');
    topBar.style.display = 'flex';
    topBar.style.justifyContent = 'flex-end';
    topBar.style.marginBottom = '10px';
    topBar.innerHTML = `<button id="imgExport" class="pill" type="button">画像出力</button>`;
    wrap.appendChild(topBar);

    const list = sortByOrder(dinos.filter(x => !hidden.dino.has(x.id)), 'dino');

    function loadImg(src) {
      return new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = src;
      });
    }

    async function exportGrid(rows, cols) {
      const maxCells = rows * cols;

      const srcs = [];
      for (const d of list) {
        const k = imageKeyFromBaseName(d._baseName || d.name);
        const u = imageCache[k];
        if (u) srcs.push(u);
        if (srcs.length >= maxCells) break;
      }

      if (!srcs.length) {
        alert('画像が1枚も設定されていません。');
        return;
      }

      const ims = [];
      for (const s of srcs) {
        const im = await loadImg(s);
        if (im) ims.push(im);
        if (ims.length >= maxCells) break;
      }
      if (!ims.length) {
        alert('読み込める画像がありませんでした。');
        return;
      }

      const cellW = 640;
      const cellH = 320;
      const gap = 8;
      const pad = 8;

      const outW = cols * cellW + (cols - 1) * gap + pad * 2;
      const outH = rows * cellH + (rows - 1) * gap + pad * 2;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, outW, outH);

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (idx >= ims.length) break;
          const im = ims[idx++];

          const x = pad + c * (cellW + gap);
          const y = pad + r * (cellH + gap);

          const iw = im.naturalWidth || im.width;
          const ih = im.naturalHeight || im.height;
          const targetRatio = cellW / cellH;
          const imgRatio = iw / ih;

          let sx = 0, sy = 0, sw = iw, sh = ih;
          if (imgRatio > targetRatio) {
            sw = ih * targetRatio;
            sx = (iw - sw) / 2;
          } else {
            sh = iw / targetRatio;
            sy = (ih - sh) / 2;
          }

          ctx.drawImage(im, sx, sy, sw, sh, x, y, cellW, cellH);
        }
      }

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      openImgViewer(dataUrl);
    }

    topBar.querySelector('#imgExport')?.addEventListener('click', () => {
      openImageExportGallery(list);
    });

    list.forEach(d => {
      const row = document.createElement('div');
      row.className = 'imgRow';

      const thumb = document.createElement('div');
      thumb.className = 'thumb';

      const k = imageKeyFromBaseName(d._baseName || d.name);
      const url = imageCache[k];

      if (url) thumb.innerHTML = `<img src="${url}" alt="">`;
      else thumb.textContent = 'No Image';

      const mid = document.createElement('div');
      mid.className = 'imgMid';

      const name = document.createElement('div');
      name.className = 'imgName';
      name.textContent = displayName(d.name);

      const btns = document.createElement('div');
      btns.className = 'imgBtns';

      const pick = document.createElement('button');
      pick.className = 'pill';
      pick.type = 'button';
      pick.textContent = '選択';

      const del = document.createElement('button');
      del.className = 'pill danger';
      del.type = 'button';
      del.textContent = '削除';

      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.style.display = 'none';

      pick.addEventListener('click', () => file.click());

      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;

        try {
          const dataUrl = await fileToDataURLCompressed(f, 900, 0.78);
          await idbPutImage(k, dataUrl);
          imageCache[k] = dataUrl;

          thumb.innerHTML = `<img src="${dataUrl}" alt="">`;
          syncThumbInMainListByDino(d, dataUrl);

          openToast('画像を保存しました');
        } catch {
          openToast('画像の保存に失敗しました');
        }
      });

      del.addEventListener('click', async () => {
        const ok = await confirmAsk('画像を削除しますか？');
        if (!ok) return;

        try {
          await idbDelImage(k);
          delete imageCache[k];
          thumb.textContent = 'No Image';
          syncThumbInMainListByDino(d, '');
          openToast('画像を削除しました');
        } catch {
          openToast('削除に失敗しました');
        }
      });

      thumb.addEventListener('click', () => {
        const u = imageCache[k];
        if (!u) return;
        openImgViewer(u);
      });

      btns.appendChild(pick);
      btns.appendChild(del);

      mid.appendChild(name);
      mid.appendChild(btns);

      row.appendChild(thumb);
      row.appendChild(mid);
      row.appendChild(file);

      wrap.appendChild(row);
    });

    return wrap;
  }

  /* ========= ROOM ========= */
  function hasEggOrEmbryoSelected() {
    const targets = new Set(['受精卵', '受精卵(指定)', '胚', '胚(指定)']);
    for (const s of inputState.values()) {
      if (!s || typeof s !== 'object') continue;
      if (!('m' in s) || !('f' in s) || !('type' in s)) continue;

      const qty = Number(s.m || 0) + Number(s.f || 0);
      if (qty <= 0) continue;

      const t = String(s.type || '').trim();
      if (targets.has(t)) return true;
    }
    return false;
  }

  // ===== ROOM state =====
  const DEFAULT_ROOM_PW = {
    ROOM1: '5412',
    ROOM2: '0000',
    ROOM3: '0000',
    ROOM4: '0000',
    ROOM5: '0000',
    ROOM6: '0000',
    ROOM7: '0000',
    ROOM8: '0000',
    ROOM9: '0000',
  };
  const DEFAULT_ROOM_USER = {
    ROOM1: '',
    ROOM2: '',
    ROOM3: '',
    ROOM4: '',
    ROOM5: '',
    ROOM6: '',
    ROOM7: '',
    ROOM8: '',
    ROOM9: '',
  };

  let entryPw = loadJSON(LS.ROOM_ENTRY_PW, '0000');
  let roomPw = loadJSON(LS.ROOM_PW, DEFAULT_ROOM_PW);
  let roomUser = loadJSON(LS.ROOM_USER, DEFAULT_ROOM_USER);
  let roomCopyCfg = loadJSON(LS.ROOM_COPY_CFG, {
    deliveryAppendEnabled: true,
    deliveryMin: 2000,
  });
  let roomTemplates = loadJSON(LS.ROOM_TEMPLATES, []);

  // ✅ テンプレが壊れてても落ちないように正規化
  if (!Array.isArray(roomTemplates)) roomTemplates = [];
  roomTemplates = roomTemplates
    .filter(t => t && typeof t === 'object')
    .map(t => ({
      id: String(t.id ?? ('t_' + Date.now() + '_' + Math.random().toString(16).slice(2))),
      title: String(t.title ?? '').trim() || 'テンプレ',
      text: String(t.text ?? ''),
    }));
  saveJSON(LS.ROOM_TEMPLATES, roomTemplates);


  // ✅ localStorageが壊れて null / 文字列 になっても「コピー」で落ちないように正規化
  entryPw = (entryPw == null) ? '2580' : String(entryPw);
  if (!roomPw || typeof roomPw !== 'object') roomPw = { ...DEFAULT_ROOM_PW };
  if (!roomUser || typeof roomUser !== 'object') roomUser = { ...DEFAULT_ROOM_USER };
  if (!roomCopyCfg || typeof roomCopyCfg !== 'object') roomCopyCfg = { deliveryAppendEnabled: true, deliveryMin: 2000 };

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

function roomLabelForSentence(room) {
  const n = Number(String(room).replace('ROOM', '')) || 0;
  if (n >= 5) return `2階${room}`;
  return room;
}

// ✅ ルームコピー文で「冷蔵庫/金庫」判定・合計金額判定に使う
function getCurrentPurchaseSummary() {
  const sum = Number(String(el.total?.textContent || '').replace(/[^0-9]/g, '')) || 0;

  let hasDino = false;
  let hasItem = false;

  // dinos
  for (const d of dinos) {
    if (getQtyForCard(d.id, 'dino') > 0) { hasDino = true; break; }
    const dups = getDupKeys(d.id);
    for (const k of dups) {
      if (getQtyForCard(k, 'dino') > 0) { hasDino = true; break; }
    }
    if (hasDino) break;
  }

  // items
  // items（id未設定の要素は除外して誤判定を防ぐ）
  for (const it of items) {
    if (!it || !it.id) continue;
    if (getQtyForCard(it.id, 'item') > 0) { hasItem = true; break; }
  }

  return { sum, hasDino, hasItem };
}

function buildCopyText(room) {
    // ✅ 受精卵/胚の注意
    const warn = hasEggOrEmbryoSelected()
      ? `

⚠️受精卵はサバイバーのインベントリに入れての転送をしないと消えてしまうバグがあるためご注意してください！`
      : '';

    // ✅ ルーム表示とPWは「壊れてても落ちない」ように安全化
    const roomText = roomLabelForSentence(room);
    const entry = (entryPw == null) ? '' : String(entryPw);
    const pw = (roomPw && typeof roomPw === 'object') ? (String(roomPw[room] ?? '')) : '';

    // ✅ 購入サマリー：ここで落ちてもコピー文は生成する
let ps = { sum: 0, hasDino: false, hasItem: false };
    try {
      ps = getCurrentPurchaseSummary();
    } catch (e) {
      // フォールバック：表示中の合計金額から拾う（最低限コピーは動かす）
      ps.sum = Number(String(el.total?.textContent || '').replace(/[^0-9]/g, '')) || 0;

      // 受け取り場所判定は安全に再計算（エラー時に両方trueにしない）
      ps.hasDino = dinos.some(d => d && d.id && getQtyForCard(d.id, 'dino') > 0);
      ps.hasItem = items.some(it => it && it.id && getQtyForCard(it.id, 'item') > 0);

      console.error(e);
    }

    const place = (ps.hasDino && ps.hasItem) ? '冷蔵庫、金庫' : (ps.hasItem ? '金庫' : '冷蔵庫');

// ✅ ROOMコピーには購入内容を入れない
let text =
(entry === '0000')
? 'コピー失敗‼️‼️'
: `納品が完了しましたのでご連絡させて頂きます。以下の場所まで受け取りよろしくお願いします🙏🏻

サーバー番号 : 5041 (アイランド)
座標 : 87 / 16 (西部2、赤オベ付近)
入口パスワード【${entry}】
${roomText}の方にパスワード【${pw}】で入室をして頂き、${place}より受け取りください。${warn}`;
    // ✅ 配送追記（設定ON & 合計が閾値以上）
    if (roomCopyCfg?.deliveryAppendEnabled && ps.sum >= Number(roomCopyCfg.deliveryMin || 0)) {
      text += `

🚚配送希望の場合は
以下の情報をコメントしてください🙇🏻‍♂️

①サーバー番号
②配送先座標
③冷蔵庫、金庫等のパスワード`;
    }

    return text;
  }
  
  function renderRooms() {
    if (!el.roomBody) return;
    el.roomBody.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '12px';

    // 共通入口PW
    const entry = document.createElement('div');
    entry.className = 'mRow';
    entry.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-weight:950;margin-bottom:6px;">入口パスワード設定（全ルーム共通）</div>
        <input id="entryPw" value="${escapeHtml(entryPw)}"
          style="width:100%;height:44px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;padding:0 12px;font-weight:900;">
      </div>
      <button id="saveEntry" class="pill" type="button" style="height:44px;align-self:center;">保存</button>
    `;
    wrap.appendChild(entry);

    entry.querySelector('#saveEntry').onclick = () => {
      entryPw = (entry.querySelector('#entryPw').value || '').trim() || entryPw;
      saveJSON(LS.ROOM_ENTRY_PW, entryPw);
      openToast('入口パスワードを保存しました');
    };

    // 配送設定（ルーム共通・コピー）
    const del = document.createElement('div');
    del.className = 'mRow';
    del.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-weight:950;margin-bottom:6px;">配送設定（全ルーム共通）</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:10px;font-weight:900;">
            <input id="deliveryAppendEnabled" type="checkbox" ${roomCopyCfg?.deliveryAppendEnabled ? 'checked' : ''} style="transform:scale(1.1);">
            配送希望の追記
          </label>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="font-weight:900;opacity:.9;">何円以上</div>
            <input id="deliveryMin" inputmode="numeric" value="${escapeHtml(String(roomCopyCfg?.deliveryMin ?? 2000))}"
              style="width:110px;height:44px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;padding:0 12px;font-weight:900;">
          </div>
        </div>
      </div>
    `;
    wrap.appendChild(del);

    const syncRoomCopyCfg = () => {
      roomCopyCfg = {
        deliveryAppendEnabled: !!del.querySelector('#deliveryAppendEnabled')?.checked,
        deliveryMin: Number((del.querySelector('#deliveryMin')?.value || '').toString().replace(/[^0-9]/g, '')) || 0,
      };
      saveJSON(LS.ROOM_COPY_CFG, roomCopyCfg);
    };
    del.addEventListener('change', syncRoomCopyCfg);
    del.addEventListener('input', (e) => {
      if (e.target?.id === 'deliveryMin') syncRoomCopyCfg();
    });

    // ルーム一覧
    Object.keys(roomPw).forEach(room => {
      const row = document.createElement('div');
      row.className = 'mRow';

      row.innerHTML = `
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">
          <div class="mName">${room}</div>
          <input class="roomUserInput" data-room="${room}" value="${escapeHtml(roomUser?.[room] || '')}" placeholder="">
        </div>
        <div class="roomBtns">
          <button class="pill" data-act="copy" data-room="${room}" type="button">コピー</button>
          <button class="pill" data-act="pw" data-room="${room}" type="button">PW変更</button>
          <button class="pill" data-act="done" data-room="${room}" type="button">受け取り完了</button>
        </div>
      `;
      wrap.appendChild(row);
    });


    /* ===== テンプレ一覧 ===== */
    const tHead = document.createElement('div');
    tHead.className = 'mRow';
    tHead.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-weight:950;">テンプレ</div>
        <div style="opacity:.75;font-size:12px;margin-top:4px;">定型文を保存できます</div>
      </div>
      <button id="addTemplate" class="pill" type="button" style="height:44px;align-self:center;">テンプレ追加</button>
    `;
    wrap.appendChild(tHead);

    const tWrap = document.createElement('div');
    tWrap.id = 'templateWrap';
    tWrap.style.display = 'flex';
    tWrap.style.flexDirection = 'column';
    tWrap.style.gap = '10px';
    wrap.appendChild(tWrap);

    const renderTemplates = () => {
      tWrap.innerHTML = '';
      if (!roomTemplates.length) {
        const empty = document.createElement('div');
        empty.style.opacity = '.7';
        empty.style.fontSize = '12px';
        empty.style.padding = '4px 2px 10px';
        empty.textContent = 'テンプレはまだありません';
        tWrap.appendChild(empty);
        return;
      }

      roomTemplates.forEach(t => {
        const row = document.createElement('div');
        row.className = 'mRow';
        row.dataset.tid = t.id;
        row.classList.add('templateRow');

        row.innerHTML = `
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">
            <div class="mName">${escapeHtml(t.title)}</div>
          </div>
          <div class="templateBtns">
             <button class="pill" data-act="tcopy" data-tid="${escapeHtml(t.id)}" type="button">コピー</button>
             <button class="pill" data-act="tedit" data-tid="${escapeHtml(t.id)}" type="button">編集</button>
             <button class="pill danger" data-act="tdel"  data-tid="${escapeHtml(t.id)}" type="button">削除</button>
           </div>
        `;
        
// ✅ テンプレ本体タップ = 確認画面（コピーはしない）
row.addEventListener('click', (ev) => {
  if (ev.target && ev.target.closest('button')) return; // ボタンは別処理
  const t2 = roomTemplates.find(x => x.id === t.id);
  if (!t2) return;
  showTemplatePreview(String(t2.text ?? ''));
});
tWrap.appendChild(row);
      });
    };

    const persistTemplates = () => saveJSON(LS.ROOM_TEMPLATES, roomTemplates);

    tHead.querySelector('#addTemplate').onclick = async () => {
      const created = await openTemplateEditor({ id: '', title: '', text: '' });
      if (!created) return;

      roomTemplates.unshift({
        id: 't_' + Date.now() + '_' + Math.random().toString(16).slice(2),
        title: created.title.trim() || 'テンプレ',
        text: created.text ?? '',
      });
      persistTemplates();
      renderTemplates();
      openToast('テンプレを追加しました');
    };

    renderTemplates();


    // 使用者名の保存（重複してたので1本化）
    wrap.addEventListener('input', (e) => {
      const inp = e.target?.closest('input.roomUserInput');
      if (!inp) return;
      const room = inp.dataset.room;
      if (!room) return;
      roomUser[room] = (inp.value || '').trim();
      saveJSON(LS.ROOM_USER, roomUser);
    });

    // ボタン処理
    wrap.addEventListener('click', async (e) => {
       const btn = e.target?.closest('button');
       if (!btn) {
         // ✅ テンプレカード本体タップで内容確認
         const tRow = e.target?.closest('#templateWrap .mRow');
         const tid2 = tRow?.dataset?.tid;
         if (tid2) {
           const t = roomTemplates.find(x => x.id === tid2);
           if (t) {
             const text = String(t.text ?? '').trim();
             if (!text) { openToast('テンプレ本文が空です'); return; }
             showTemplatePreview(text);
}
         }
         return;
       }

      const act = btn.dataset.act;
      const room = btn.dataset.room;
      const tid  = btn.dataset.tid;

      if (!act) return;
      if (act === 'copy' || act === 'pw' || act === 'done') {
        if (!room) return;
      } else if (act === 'tcopy' || act === 'tedit' || act === 'tdel') {
        if (!tid) return;
      } else {
        return;
      }

if (act === 'copy') {
  try {
    const copyTxt = buildCopyText(room);
    await copyText(copyTxt);
    showRoomCopyPreview(copyTxt);
    const prev = btn.textContent;
    btn.textContent = 'コピー済';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 900);
  } catch (err) {
    openToast('コピーに失敗しました（もう一度お試しください）');
    console.error(err);
  }
  return;
}

      if (act === 'pw') {
        const npw = prompt(`${room} のパスワードを入力`, roomPw[room]);
        if (!npw) return;
        roomPw[room] = npw;
        saveJSON(LS.ROOM_PW, roomPw);
        openToast(`${room} のPWを更新しました`);
        return;
      }

      if (act === 'done') {
        roomUser[room] = '';
        saveJSON(LS.ROOM_USER, roomUser);

        const inp = wrap.querySelector(`input.roomUserInput[data-room="${CSS.escape(room)}"]`);
        if (inp) inp.value = '';

        openToast(`${room} をリセットしました`);
        return;
      }

      /* ===== templates actions ===== */
      if (act === 'tcopy') {
        const t = roomTemplates.find(x => x.id === tid);
        if (!t) return;
        try {
          const text = String(t.text ?? '').trim();
          if (!text) { openToast('テンプレ本文が空です'); return; }
          await copyText(text);
          showRoomCopyPreview(text, 'コピー完了✨️');
const prev = btn.textContent;
          btn.textContent = 'コピー済';
          btn.disabled = true;
          setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 900);
        } catch (err) {
          openToast('コピーに失敗しました（もう一度お試しください）');
          console.error(err);
        }
        return;
      }

      if (act === 'tedit') {
        const t = roomTemplates.find(x => x.id === tid);
        if (!t) return;

        const edited = await openTemplateEditor({ id: t.id, title: t.title, text: t.text });
        if (!edited) return;

        t.title = edited.title.trim() || 'テンプレ';
        t.text = edited.text ?? '';
        saveJSON(LS.ROOM_TEMPLATES, roomTemplates);
        renderRooms(); // まとめて再描画（シンプル優先）
        openToast('テンプレを更新しました');
        return;
      }

      if (act === 'tdel') {
        const t = roomTemplates.find(x => x.id === tid);
        if (!t) return;

        const ok = await confirmAsk(`「${t.title}」を削除しますか？`);
        if (!ok) return;

        roomTemplates = roomTemplates.filter(x => x.id !== tid);
        saveJSON(LS.ROOM_TEMPLATES, roomTemplates);
        renderRooms();
        openToast('テンプレを削除しました');
        return;
      }
    });

    el.roomBody.appendChild(wrap);
  }

  function openRoom() {
    if (!el.roomOverlay) return;
    ScrollLock.lock(); // ✅
    el.roomOverlay.classList.remove('isHidden');
    renderRooms();

    // ✅ ルーム画面を開いた時に ROOM1 が一番上に見える位置へ
    requestAnimationFrame(() => {
      try {
        const room1Input = el.roomBody?.querySelector('input.roomUserInput[data-room="ROOM1"]');
        const row = room1Input?.closest('.mRow');
        if (row) {
          row.scrollIntoView({ block: 'start' });
        } else if (el.roomBody) {
          el.roomBody.scrollTop = 0;
        }
      } catch {
        if (el.roomBody) el.roomBody.scrollTop = 0;
      }
    });
  }
  function closeRoom() {
    if (!el.roomOverlay) return;
    el.roomOverlay.classList.add('isHidden');
    if (el.roomBody) el.roomBody.innerHTML = '';
    ScrollLock.unlock(); // ✅
  }

  /* ========= events ========= */
  el.tabDinos?.addEventListener('click', () => setTab('dino'));
  el.tabItems?.addEventListener('click', () => setTab('item'));

  el.q?.addEventListener('input', applyCollapseAndSearch);
  el.qClear?.addEventListener('click', () => { el.q.value = ''; applyCollapseAndSearch(); });

  const savedDelivery = localStorage.getItem(LS.DELIVERY);
  if (savedDelivery && el.delivery) el.delivery.value = savedDelivery;

  el.delivery?.addEventListener('change', () => {
    localStorage.setItem(LS.DELIVERY, el.delivery.value);
    rebuildOutput();
  });

  el.copy?.addEventListener('click', async () => {
    const text = el.out.value.trim();
    if (!text) return;

    // 先にコピー
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

    // ✅ コピー時にPOSも記録（確認あり）
    const preview = collectCurrentSelectionForPOS({});
    if (!preview.length) return;

    const ok = await confirmAsk('コピーに加えて、POSにも記録しますか？');
    if (!ok) return;

    const ts = Date.now();
    const orderId = uid();
    const lines = collectCurrentSelectionForPOS({ ts, orderId });
    if (!lines.length) return;

    pos.sales = Array.isArray(pos.sales) ? pos.sales : [];
    pos.sales.push(...lines);
    // 在庫（成体）を減算
    applyStockDeductions(lines);
    posSave();
    openToast(`POS記録しました（${lines.length}件）`);
  });


  /* ========= POS ========= */
  const pos = {
    sales: loadJSON(LS.POS_SALES, []), // flat lines
    stock: loadJSON(LS.POS_STOCK, {}), // { [dinoId]: { m:number|null, f:number|null } }
  };

  // ✅ 既存データ互換：idが無い行にidを付与（削除が安定する）
  if (!Array.isArray(pos.sales)) pos.sales = [];
  let posNeedsSave = false;
  for (const s of pos.sales) {
    if (!s || typeof s !== 'object') continue;
    if (!s.id) { s.id = 's_' + uid(); posNeedsSave = true; }
  }
  if (posNeedsSave) posSave();


if (!pos.stock || typeof pos.stock !== 'object') { pos.stock = {}; posNeedsSave = true; }
  // 既存データ互換：stock の形を正規化
  for (const [k,v] of Object.entries(pos.stock)) {
    if (!v || typeof v !== 'object') { pos.stock[k] = { m: null, f: null }; posNeedsSave = true; continue; }
    if (!('m' in v)) { v.m = null; posNeedsSave = true; }
    if (!('f' in v)) { v.f = null; posNeedsSave = true; }
    if (v.m !== null && !Number.isFinite(Number(v.m))) { v.m = null; posNeedsSave = true; }
    if (v.f !== null && !Number.isFinite(Number(v.f))) { v.f = null; posNeedsSave = true; }
    v.m = (v.m === null) ? null : Math.max(0, Math.floor(Number(v.m)));
    v.f = (v.f === null) ? null : Math.max(0, Math.floor(Number(v.f)));
  }

  function fmtDateTime(ts) {
    const d = new Date(Number(ts) || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${da} ${hh}:${mm}`;
  }
  function fmtMD(ts) {
    const d = new Date(Number(ts) || Date.now());
    const m = String(d.getMonth() + 1);
    const da = String(d.getDate());
    return `${m}/${da}`;
  }
  function monthKeyFromTs(ts) {
    const d = new Date(Number(ts) || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function posSave() {
    saveJSON(LS.POS_SALES, pos.sales || []);
    saveJSON(LS.POS_STOCK, pos.stock || {});
  }

  function getStockKeyForDinoLine(s) {
    // 優先: dinoId / fallback: name
    if (s && typeof s === 'object') {
      if (s.dinoId) return String(s.dinoId);
      if (s.name) return String(s.name);
    }
    return '';
  }

  function stockGet(key) {
    if (!key) return { m: null, f: null };
    const v = pos.stock && pos.stock[key];
    if (!v || typeof v !== 'object') return { m: null, f: null };
    const m = (v.m === null || v.m === undefined) ? null : Number(v.m);
    const f = (v.f === null || v.f === undefined) ? null : Number(v.f);
    return {
      m: Number.isFinite(m) ? Math.max(0, Math.floor(m)) : null,
      f: Number.isFinite(f) ? Math.max(0, Math.floor(f)) : null,
    };
  }

  function stockSet(key, m, f) {
    if (!key) return;
    const mm = (m === null || m === undefined) ? null : Math.max(0, Math.floor(Number(m)));
    const ff = (f === null || f === undefined) ? null : Math.max(0, Math.floor(Number(f)));
    pos.stock = pos.stock && typeof pos.stock === 'object' ? pos.stock : {};
    pos.stock[key] = { m: (Number.isFinite(mm) ? mm : null), f: (Number.isFinite(ff) ? ff : null) };
    posSave();
  }

  function stockDec(key, dm, df) {
    const st = stockGet(key);
    if (st.m === null || st.f === null) return; // 未入力は減らさない
    const mm = Math.max(0, st.m - Math.max(0, Math.floor(Number(dm)||0)));
    const ff = Math.max(0, st.f - Math.max(0, Math.floor(Number(df)||0)));
    stockSet(key, mm, ff);
  }

  function stockDecTotal(key, d) {
    const st = stockGet(key);
    if (st.m === null || st.f === null) return;
    let need = Math.max(0, Math.floor(Number(d)||0));
    let mm = st.m;
    let ff = st.f;
    // まずオス→次にメス（配分不明の時の保守的な減算）
    const takeM = Math.min(mm, need);
    mm -= takeM; need -= takeM;
    const takeF = Math.min(ff, need);
    ff -= takeF; need -= takeF;
    stockSet(key, mm, ff);
  }

  function applyStockDeductions(lines) {
    const adultSet = new Set(['成体','クローン','その他','全種']);
    for (const s of (Array.isArray(lines) ? lines : [])) {
      if (!s || s.kind !== 'dino') continue;
      const typeClean = String(s.type || '').replace('(指定)', '');
      if (!adultSet.has(typeClean)) continue;
      const key = getStockKeyForDinoLine(s);
      if (!key) continue;
      const m = Math.max(0, Math.floor(Number(s.m)||0));
      const f = Math.max(0, Math.floor(Number(s.f)||0));
      if (m > 0 || f > 0) {
        stockDec(key, m, f);
      } else {
        stockDecTotal(key, Number(s.qty)||0);
      }
    }
  }

  function posDisplayParts(s) {
    if (!s || typeof s !== 'object') return { title: '', sub: '' };
    if (s.kind === 'item') {
      let name = formatSpecialLabel(String(s.name || ''));
      const qty = Math.max(0, Math.floor(Number(s.qty)||0));
      return { title: `${name}×${qty}`, sub: '' };
    }

    // special (ガチャ①②など) : 出力画面の見た目に合わせる
    const meta = (s && typeof s.meta === 'object') ? s.meta : null;
    if (meta && meta.mode === 'special_picks' && Array.isArray(meta.picks) && meta.picks.length) {
      let name = formatSpecialLabel(String(s.name || ''));
      const picks = meta.picks.map(x => circled(x)).join('');
      return { title: `${name}${picks}`, sub: '' };
    }

    let name = formatSpecialLabel(String(s.name || ''));
    const rawType = String(s.type || '');
    const typeClean = rawType.replace('(指定)', '');
    const isPair = /\(指定\)$/.test(rawType) || ['幼体', '成体', 'クローン', 'クローン(指定)'].includes(rawType);

    const m = Math.max(0, Math.floor(Number(s.m)||0));
    const f = Math.max(0, Math.floor(Number(s.f)||0));
    const qty = Math.max(0, Math.floor(Number(s.qty)|| (m+f) ));

    if (isPair) {
      if (m > 0 && f > 0 && m !== f) {
        // ✅ 画像/出力では「ペア」見出しを出さず、明細行だけ表示する
        return {
          title: `${name}${typeClean}♂︎×${m} ♀︎×${f}`,
          sub: '',
        };
      }
      const pairs = (m > 0 || f > 0) ? Math.min(m, f) : Math.ceil(qty / 2);
      const mult = pairs > 1 ? `×${pairs}` : '';
      return { title: `${name}${typeClean}ペア${mult}`, sub: '' };
    }

    return { title: `${name}${typeClean}×${qty}`, sub: '' };
  }



  function collectCurrentSelectionForPOS(opts = {}) {
    const lines = [];
    const ts = Number(opts.ts) || Date.now();
    const orderId = String(opts.orderId || uid());
    const delivery = String(opts.delivery || el.delivery?.value || '即納品可能');

    // dinos (visible list 기준)
    const dList = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    for (const d of dList) {
      const baseKey = d.id;
      const keys = [baseKey, ...Array.from(ephemeralKeys).filter(k => k.startsWith(baseKey + '__dup'))];
      const sp = getSpecialCfgForDino(d);

      for (const k of keys) {
        const s = inputState.get(k);
        if (!s) continue;

        // special (ガチャ等)
        if (sp?.enabled && s.mode === 'special') {
          const allowSex = !!sp.allowSex;
          const m = Number(s.m || 0);
          const f = Number(s.f || 0);
          const sexQty = m + f;

          if (allowSex && sexQty > 0) {
            const type = s.type || d.defType || '受精卵';
            const unitPrice = prices[type] || 0;
            const amount = unitPrice * sexQty;
            lines.push({
              ts, orderId, month: monthKeyFromTs(ts),
              delivery,
              kind: 'dino',
              dinoId: d.id,
              name: displayName(d.name),
              type,
              qty: sexQty,
              m, f,
              amount,
            });
            continue;
          }

          const unitPrice = Number(sp.unit || 0);
          const allPrice = Number(sp.all || 0);
          if (s.all) {
            const amount = allPrice;
            if (amount > 0) {
              lines.push({
                ts, orderId, month: monthKeyFromTs(ts),
                delivery,
                kind: 'dino',
                dinoId: d.id,
                name: displayName(d.name),
                type: '全種',
                qty: 1,
                m: 0, f: 0,
                amount,
                meta: { mode: 'special_all' },
              });
            }
            continue;
          }

          const picks = Array.isArray(s.picks) ? s.picks.slice() : [];
          if (picks.length > 0 && unitPrice > 0) {
            const amount = picks.length * unitPrice;
            lines.push({
              ts, orderId, month: monthKeyFromTs(ts),
              delivery,
              kind: 'dino',
              dinoId: d.id,
              name: displayName(d.name),
              type: '特殊',
              qty: picks.length,
              m: 0, f: 0,
              amount,
              meta: { mode: 'special_picks', picks },
            });
          }
          continue;
        }

        // normal
        const type = s.type || d.defType || '受精卵';
        const m = Number(s.m || 0);
        const f = Number(s.f || 0);
        const qty = m + f;
        if (qty <= 0) continue;

        const unitPrice = prices[type] || 0;
        const amount = unitPrice * qty;

        lines.push({
          ts, orderId, month: monthKeyFromTs(ts),
          delivery,
          kind: 'dino',
          dinoId: d.id,
          name: displayName(d.name),
          type,
          qty,
          m, f,
          amount,
        });
      }
    }

    // items
    const iList = sortByOrder(items.filter(it => !hidden.item.has(it.id)), 'item');
    for (const it of iList) {
      const s = inputState.get(it.id);
      if (!s) continue;
      const qty = Number(s.qty || 0);
      if (qty <= 0) continue;
      const unitPrice = Number(it.price || 0);
      const amount = unitPrice * qty;
      lines.push({
        ts, orderId, month: monthKeyFromTs(ts),
        delivery,
        kind: 'item',
        itemId: it.id,
        name: String(it.name || ''),
        type: 'アイテム',
        qty,
        amount,
      });
    }
    // ✅ idを付与（削除が安定する）
    for (const l of lines) {
      if (l && typeof l === 'object' && !l.id) l.id = 's_' + uid();
    }

    return lines;
  }

  function openPosMenu() {
    const id = 'posMenuOverlay';
    let ov = document.getElementById(id);
    if (!ov) {
      ov = document.createElement('div');
      ov.id = id;
      ov.style.position = 'fixed';
      ov.style.inset = '0';
      ov.style.zIndex = '14000';
      ov.style.display = 'none';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';
      ov.style.padding = '16px';
      ov.style.background = 'rgba(0,0,0,.35)';
      ov.style.backdropFilter = 'blur(6px)';

      const panel = document.createElement('div');
      panel.style.width = 'min(420px, 92vw)';
      panel.style.borderRadius = '18px';
      panel.style.border = '1px solid rgba(255,255,255,.14)';
      panel.style.background = 'rgba(20,20,20,.78)';
      panel.style.backdropFilter = 'blur(12px)';
      panel.style.boxShadow = '0 20px 60px rgba(0,0,0,.45)';
      panel.style.overflow = 'hidden';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';

      const head = document.createElement('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.justifyContent = 'space-between';
      head.style.gap = '10px';
      head.style.padding = '12px 12px 8px 14px';

      const title = document.createElement('div');
      title.textContent = 'POS';
      title.style.fontWeight = '900';
      title.style.fontSize = '14px';
      title.style.color = '#fff';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', '閉じる');
      closeBtn.className = 'iconBtn';

      const body = document.createElement('div');
      body.style.padding = '12px 14px 14px';
      body.style.display = 'flex';
      body.style.flexDirection = 'column';
      body.style.gap = '10px';

      const hint = document.createElement('div');
      hint.textContent = '入力 / 確認';
      hint.style.opacity = '.8';
      hint.style.fontSize = '12px';
      hint.style.fontWeight = '800';

      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '10px';

      const bInput = document.createElement('button');
      bInput.type = 'button';
      bInput.className = 'pill';
      bInput.textContent = '入力';
      bInput.style.flex = '1';

      const bCheck = document.createElement('button');
      bCheck.type = 'button';
      bCheck.className = 'pill';
      bCheck.textContent = '確認';
      bCheck.style.flex = '1';

      btnRow.appendChild(bInput);
      btnRow.appendChild(bCheck);

      body.appendChild(hint);
      body.appendChild(btnRow);

      head.appendChild(title);
      head.appendChild(closeBtn);
      panel.appendChild(head);
      panel.appendChild(body);
      ov.appendChild(panel);
      document.body.appendChild(ov);

      const hide = () => {
        ov.style.display = 'none';
        try { ScrollLock.unlock(); } catch {}
      };
      closeBtn.addEventListener('click', hide);
      ov.addEventListener('click', (e) => { if (e.target === ov) hide(); });

      bInput.addEventListener('click', () => {
        hide();
        openPosEntry();
      });

      bCheck.addEventListener('click', () => {
        hide();
        openPosReport();
      });

      // scroll guard
      installOverlayScrollGuard(ov, body);
    }

    try { ScrollLock.lock(); } catch {}
    ov.style.display = 'flex';
  }

  
  function openPosEntry() {
    const id = 'posEntryOverlay';
    let ov = document.getElementById(id);
    if (!ov) {
      ov = document.createElement('div');
      ov.id = id;
      ov.style.position = 'fixed';
      ov.style.inset = '0';
      ov.style.zIndex = '14000';
      ov.style.display = 'none';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';
      ov.style.padding = '16px';
      ov.style.background = 'rgba(0,0,0,.35)';
      ov.style.backdropFilter = 'blur(6px)';

      const panel = document.createElement('div');
      panel.style.width = 'min(520px, 94vw)';
      panel.style.maxHeight = '84vh';
      panel.style.borderRadius = '18px';
      panel.style.border = '1px solid rgba(255,255,255,.14)';
      panel.style.background = 'rgba(20,20,20,.78)';
      panel.style.backdropFilter = 'blur(12px)';
      panel.style.boxShadow = '0 20px 60px rgba(0,0,0,.45)';
      panel.style.overflow = 'hidden';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';

      const head = document.createElement('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.justifyContent = 'space-between';
      head.style.gap = '10px';
      head.style.padding = '12px 12px 8px 14px';

      const title = document.createElement('div');
      title.textContent = 'POS 入力';
      title.style.fontWeight = '900';
      title.style.fontSize = '14px';
      title.style.color = '#fff';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', '閉じる');
      closeBtn.className = 'iconBtn';

      const body = document.createElement('div');
      body.id = 'posEntryBody';
      body.style.padding = '12px 14px 14px';
      body.style.overflow = 'auto';

      head.appendChild(title);
      head.appendChild(closeBtn);
      panel.appendChild(head);
      panel.appendChild(body);
      ov.appendChild(panel);
      document.body.appendChild(ov);

      const hide = () => {
        ov.style.display = 'none';
        try { ScrollLock.unlock(); } catch {}
      };
      closeBtn.addEventListener('click', hide);
      ov.addEventListener('click', (e) => { if (e.target === ov) hide(); });

      ov.__hide = hide;
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const defaultDate = `${y}-${m}-${d}`;

    const body = document.getElementById('posEntryBody');
    if (!body) return;

    const lines = collectCurrentSelectionForPOS({}); // preview (today)
    const total = lines.reduce((a, s) => a + (Number(s.amount) || 0), 0);

    body.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
        <div style="font-weight:900;">日付</div>
        <input id="posEntryDate" type="date" value="${escapeHtml(defaultDate)}"
          style="height:34px;border-radius:14px;padding:0 10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font-weight:900;"/>
        <div style="margin-left:auto;font-weight:950;color:rgba(120,255,179,.95)">合計 ${escapeHtml(yen(total))}</div>
      </div>

      <div style="opacity:.75;font-size:11px;line-height:1.35;margin-bottom:8px;">
        現在の選択中の商品を、指定日付で記録します。
      </div>

      <div class="posBox" style="margin-bottom:12px;">
        <div class="posEntryPreview tabularNums">
          ${lines.length ? lines.map(s => {
            const parts = posDisplayParts(s);
            return `
              <div class="posHistLine posEntryLine">
                <div class="posHistL">
                  <div class="posHistTitle" title="${escapeHtml(parts.title)}">${escapeHtml(parts.title)}</div>
                  ${parts.sub ? `<div class="posHistSub" title="${escapeHtml(parts.sub)}">${escapeHtml(parts.sub)}</div>` : ``}
                </div>
                <div class="posEntryAmt tabularNums" title="${escapeHtml(yen(s.amount))}">${escapeHtml(yen(s.amount))}</div>
              </div>
            `;
          }).join('') : `<div style="padding:10px;opacity:.8;">記録する商品がありません</div>`}
        </div>
      </div>

      <div style="display:flex;gap:10px;">
        <button id="posEntrySave" class="pill" type="button" style="flex:1;">記録</button>
        <button id="posEntryToReport" class="pill" type="button" style="flex:1;">確認</button>
      </div>
    `;

    const saveBtn = document.getElementById('posEntrySave');
    const repBtn = document.getElementById('posEntryToReport');

    const hide = ov.__hide || (() => {});
    saveBtn?.addEventListener('click', async () => {
      const dateVal = String((document.getElementById('posEntryDate') || {}).value || defaultDate);
      // local noon to avoid DST edge cases
      const ts = new Date(`${dateVal}T12:00:00`).getTime();
      const orderId = uid();

      const lines2 = collectCurrentSelectionForPOS({ ts, orderId });
      if (!lines2.length) {
        openToast('記録する商品がありません');
        return;
      }
      const ok = await confirmAsk(`${fmtMD(ts)} に記録します。よろしいですか？`);
      if (!ok) return;

      pos.sales = Array.isArray(pos.sales) ? pos.sales : [];
      pos.sales.push(...lines2);
      // 在庫（成体）を減算
      applyStockDeductions(lines2);
      posSave();
      openToast(`記録しました（${lines2.length}件）`);
      hide();
    });

    repBtn?.addEventListener('click', () => {
      hide();
      openPosReport();
    });

    try { ScrollLock.lock(); } catch {}
    ov.style.display = 'flex';
  }

function openPosReport() {
    const id = 'posReportOverlay';
    let ov = document.getElementById(id);
    if (!ov) {
      ov = document.createElement('div');
      ov.id = id;
      ov.style.position = 'fixed';
      ov.style.inset = '0';
      ov.style.zIndex = '14000';
      ov.style.display = 'none';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';
      ov.style.padding = '16px';
      ov.style.background = 'rgba(0,0,0,.35)';
      ov.style.backdropFilter = 'blur(6px)';

      const panel = document.createElement('div');
      panel.style.width = 'min(760px, 94vw)';
      panel.style.maxHeight = '84vh';
      panel.style.borderRadius = '18px';
      panel.style.border = '1px solid rgba(255,255,255,.14)';
      panel.style.background = 'rgba(20,20,20,.78)';
      panel.style.backdropFilter = 'blur(12px)';
      panel.style.boxShadow = '0 20px 60px rgba(0,0,0,.45)';
      panel.style.overflow = 'hidden';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';

      const head = document.createElement('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.justifyContent = 'space-between';
      head.style.gap = '10px';
      head.style.padding = '12px 12px 8px 14px';

      const title = document.createElement('div');
      title.textContent = '帳簿 売上';
      title.style.fontWeight = '900';
      title.style.fontSize = '14px';
      title.style.color = '#fff';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', '閉じる');
      closeBtn.className = 'iconBtn';

      const body = document.createElement('div');
      body.id = 'posReportBody';
      body.style.padding = '12px 14px 14px';
      body.style.overflow = 'auto';

      head.appendChild(title);
      head.appendChild(closeBtn);
      panel.appendChild(head);
      panel.appendChild(body);
      ov.appendChild(panel);
      document.body.appendChild(ov);

      const hide = () => {
        ov.style.display = 'none';
        try { ScrollLock.unlock(); } catch {}
      };
      closeBtn.addEventListener('click', hide);
      ov.addEventListener('click', (e) => { if (e.target === ov) hide(); });

      installOverlayScrollGuard(ov, body);

      // ✅ イベント委譲：タブ / 削除 / 並び替え
      body.addEventListener('click', async (e) => {
        // タブ切替
        const tabBtn = e.target && e.target.closest ? e.target.closest('[data-pos-tab]') : null;
        if (tabBtn) {
          const t = String(tabBtn.getAttribute('data-pos-tab') || '');
          if (t) {
            ov.__posTab = t;
            try { (ov.__renderPosReport || (()=>{}))(); } catch {}
          }
          return;
        }

        // 取引履歴：注文単位（合計）タップで削除
const orderBtn = e.target && e.target.closest ? e.target.closest('[data-pos-del-order]') : null;
if (orderBtn) {
  const gKey = String(orderBtn.getAttribute('data-pos-del-order') || '');
  if (!gKey) return;
  const ids = gKey.split('|').map(x => x.trim()).filter(Boolean);
  if (!ids.length) return;

  const list = (Array.isArray(pos.sales) ? pos.sales : []).filter(x => ids.includes(String(x.id || '')));
  if (!list.length) return;

  const gTotal = list.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const ts = Math.max(...list.map(x => Number(x.ts) || 0), 0);

  // ✅ 「削除しますか？」→次行から注文内容を改行で表示
  const orderLines = list
    .slice()
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
    .map((s) => {
      const p = posDisplayParts(s);
      const left = p.sub ? `${p.title} ${p.sub}` : p.title;
      return `${left} = ${yen(s.amount)}`;
    });
  const ok = await confirmAsk(`削除しますか？\n${fmtMD(ts)} 注文 合計 ${yen(gTotal)}\n${orderLines.join('\n')}`);
  if (!ok) return;

  pos.sales = (Array.isArray(pos.sales) ? pos.sales : []).filter(x => !ids.includes(String(x.id || '')));
  posSave();
  openToast('削除しました');
  try { (ov.__renderPosReport || (()=>{}))(); } catch {}
  return;
}

// 種別売上：在庫（♂/♀）タップで入力
const stockBtn = e.target && e.target.closest ? e.target.closest('[data-stock-id]') : null;
if (stockBtn) {
  const key = String(stockBtn.getAttribute('data-stock-id') || '');
  if (!key) return;

  const cur = stockGet(key);

  // ✅ 在庫入力は「1/2」形式で1回入力に統一（♂︎/♀︎どちらをタップしても同じ入力）
  // 表示ルール：片方未入力なら、もう片方は0扱い（両方未入力のみ "-"）
  const curM = (cur.m === null && cur.f !== null) ? 0 : cur.m;
  const curF = (cur.f === null && cur.m !== null) ? 0 : cur.f;
  const curTxt = (curM === null && curF === null) ? '' : `${curM ?? 0}/${curF ?? 0}`;

  const v = prompt('在庫を「オス/メス」で入力（例 1/2、空欄で未入力）', curTxt);
  if (v === null) return;
  const s = String(v).trim();
  if (!s) {
    stockSet(key, null, null);
    try { (ov.__renderPosReport || (()=>{}))(); } catch {}
    return;
  }
  const m = s.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!m) { openToast('「1/2」の形式で入力してください'); return; }
  const mm = Math.max(0, Math.floor(Number(m[1])));
  const ff = Math.max(0, Math.floor(Number(m[2])));
  stockSet(key, mm, ff);
  try { (ov.__renderPosReport || (()=>{}))(); } catch {}
  return;
}

// 取引履歴：金額タップで削除
        const delBtn = e.target && e.target.closest ? e.target.closest('[data-pos-del-id]') : null;
        if (delBtn) {
          const sid = String(delBtn.getAttribute('data-pos-del-id') || '');
          if (!sid) return;

          const s = (Array.isArray(pos.sales) ? pos.sales : []).find(x => String(x.id || '') === sid);
          if (!s) return;

          const parts = posDisplayParts(s);
          const ok = await confirmAsk(`削除しますか？\n${fmtMD(s.ts)} ${parts.title} / ${yen(s.amount)}`);
          if (!ok) return;

          const idx = (Array.isArray(pos.sales) ? pos.sales : []).findIndex(x => String(x.id || '') === sid);
          if (idx >= 0) {
            pos.sales.splice(idx, 1);
            posSave();
            openToast('削除しました');
            try { (ov.__renderPosReport || (()=>{}))(); } catch {}
          }
          return;
        }

        // 種別売上：ヘッダタップで並び替え
        const sortTh = e.target && e.target.closest ? e.target.closest('[data-pos-sort]') : null;
        if (sortTh) {
          const key = String(sortTh.getAttribute('data-pos-sort') || '');
          if (!key) return;

          const cur = (ov.__typeSort) ? ov.__typeSort : { key: 'totalAmt', dir: 'desc' };
          let dir = cur.dir || 'desc';
          if (cur.key === key) dir = (dir === 'asc') ? 'desc' : 'asc';
          else dir = (key === 'name') ? 'asc' : 'desc';

          ov.__typeSort = { key, dir };
          try { (ov.__renderPosReport || (()=>{}))(); } catch {}
          return;
        }
      });

      // ✅ 変更：期間モード / 期間キー / 在庫入力
      body.addEventListener('change', (e) => {
        const t = e && e.target ? e.target : null;
        if (!t) return;

        // 在庫入力（♂/♀）
        if (t.matches && t.matches('input.posStockIn[data-stock-id][data-stock-sex]')) {
          const key = String(t.getAttribute('data-stock-id') || '');
          const sex = String(t.getAttribute('data-stock-sex') || '');
          if (!key || (sex !== 'm' && sex !== 'f')) return;

          const cur = stockGet(key);
          const raw = String(t.value || '').trim();
          const vv = raw === '' ? null : Math.max(0, Math.floor(Number(raw)));
          const mm = (sex === 'm') ? (Number.isFinite(vv) ? vv : null) : cur.m;
          const ff = (sex === 'f') ? (Number.isFinite(vv) ? vv : null) : cur.f;
          stockSet(key, mm, ff);

          try { (ov.__renderPosReport || (()=>{}))(); } catch {}
          return;
        }

        // 期間モード（月/年）
        if (t.id === 'posPeriodMode') {
          ov.__periodMode = String(t.value || 'month');

          // モード切替時：先頭へ
          const salesNow = Array.isArray(pos.sales) ? pos.sales : [];
          const monthsNow = Array.from(new Set(salesNow.map(x => String(x.month || monthKeyFromTs(x.ts))))).sort().reverse();
      if (!monthsNow.length) monthsNow.push(monthKeyFromTs(Date.now()));
          const yearsNow = Array.from(new Set(monthsNow.map(m => String(m).slice(0,4)))).sort().reverse();
      if (!yearsNow.length) yearsNow.push(String(new Date().getFullYear()));

          if (ov.__periodMode === 'year') ov.__periodKey = yearsNow[0] || String(new Date().getFullYear());
          else ov.__periodKey = monthsNow[0] || monthKeyFromTs(Date.now());

          try { (ov.__renderPosReport || (()=>{}))(); } catch {}
          return;
        }

        // 期間キー
        if (t.id === 'posPeriodSel') {
          ov.__periodKey = String(t.value || '');
          try { (ov.__renderPosReport || (()=>{}))(); } catch {}
          return;
        }
      });
    }

    const body = document.getElementById('posReportBody');
    if (!body) return;

    const render = () => {
      ov.__renderPosReport = render;

      const salesNow = Array.isArray(pos.sales) ? pos.sales : [];
      const monthsNow = Array.from(new Set(salesNow.map(x => String(x.month || monthKeyFromTs(x.ts))))).sort().reverse();
      if (!monthsNow.length) monthsNow.push(monthKeyFromTs(Date.now()));
      const yearsNow = Array.from(new Set(monthsNow.map(m => String(m).slice(0,4)))).sort().reverse();
      if (!yearsNow.length) yearsNow.push(String(new Date().getFullYear()));

      if (!ov.__periodMode) ov.__periodMode = 'month';
      if (!ov.__periodKey) ov.__periodKey = (ov.__periodMode === 'year'
        ? (yearsNow[0] || String(new Date().getFullYear()))
        : (monthsNow[0] || monthKeyFromTs(Date.now()))
      );
      if (!ov.__posTab) ov.__posTab = 'types';
      if (!ov.__typeSort) ov.__typeSort = { key: 'totalAmt', dir: 'desc' };

      // キーが存在しない場合は先頭へ
      if (ov.__periodMode === 'year') {
        if (!yearsNow.includes(String(ov.__periodKey))) ov.__periodKey = yearsNow[0] || String(new Date().getFullYear());
      } else {
        if (!monthsNow.includes(String(ov.__periodKey))) ov.__periodKey = monthsNow[0] || monthKeyFromTs(Date.now());
      }

      const mode = String(ov.__periodMode);
      const key = String(ov.__periodKey);

      const mSales = salesNow.filter(x => {
        const mk = String(x.month || monthKeyFromTs(x.ts));
        return mode === 'year' ? (mk.slice(0,4) === key) : (mk === key);
      });

      const total = mSales.reduce((a, b) => a + (Number(b.amount) || 0), 0);

      // 種別売上（恐竜 + アイテム、0も全表示）
      const byType = new Map();
      const baseDinos = sortByOrder(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
      const baseItems = sortByOrder(items.filter(it => !hidden.item.has(it.id)), 'item');

      for (const d of baseDinos) byType.set(String(d.id), { id: String(d.id), name: String(d.name || ''), kind: 'dino', eggQty: 0, adultQty: 0, totalAmt: 0 });
      for (const it of baseItems) byType.set(String(it.id), { id: String(it.id), name: String(it.name || ''), kind: 'item', eggQty: 0, adultQty: 0, totalAmt: 0 });

      const eggSet = new Set(['受精卵', '胚', '幼体']);
      const adultSet = new Set(['成体', 'クローン', 'その他', '全種']);

      for (const s of mSales) {
        const kind = String(s.kind || '');
        const name = String(s.name || '');
        const qty = Number(s.qty || 0);
        const amt = Number(s.amount || 0);

        if (kind === 'dino') {
          const id = String(s.dinoId || name);
          const typeRaw = String(s.type || '').replace('(指定)', '');
          if (!byType.has(id)) byType.set(id, { id, name, kind: 'dino', eggQty: 0, adultQty: 0, totalAmt: 0 });
          const cur = byType.get(id);
          if (eggSet.has(typeRaw)) cur.eggQty += qty;
          else if (adultSet.has(typeRaw)) cur.adultQty += qty;
          else cur.adultQty += qty;
          cur.totalAmt += amt;
        } else if (kind === 'item') {
          const id = String(s.itemId || stableId('i', name));
          if (!byType.has(id)) byType.set(id, { id, name, kind: 'item', eggQty: 0, adultQty: 0, totalAmt: 0 });
          const cur = byType.get(id);
          cur.eggQty += qty;
          cur.totalAmt += amt;
        }
      }

      const sortCfg = ov.__typeSort || { key: 'totalAmt', dir: 'desc' };
      const typeList = Array.from(byType.values()).map(d => {
        if (d.kind === 'dino') {
          const st = stockGet(d.id);
          const has = (st.m !== null && st.f !== null);
          const stockTotal = has ? (Number(st.m) + Number(st.f)) : -1;
          return { ...d, stock: st, stockTotal };
        }
        return { ...d, stock: { m: null, f: null }, stockTotal: -1 };
      }).sort((a, b) => {
        const dir = (sortCfg.dir === 'asc') ? 1 : -1;
        const k = String(sortCfg.key || 'totalAmt');
        if (k === 'name') return dir * a.name.localeCompare(b.name, 'ja');
        if (k === 'eggQty') return dir * ((a.eggQty - b.eggQty) || a.name.localeCompare(b.name, 'ja'));
        if (k === 'adultQty') return dir * ((a.adultQty - b.adultQty) || a.name.localeCompare(b.name, 'ja'));
        if (k === 'stock') {
  const aInvalid = (a.stockTotal == null || a.stockTotal < 0);
  const bInvalid = (b.stockTotal == null || b.stockTotal < 0);
  // 「-」(未入力/対象外) はソート対象に含めず、常に下へ送る
  if (aInvalid && bInvalid) return a.name.localeCompare(b.name, 'ja');
  if (aInvalid) return 1;
  if (bInvalid) return -1;
  return dir * ((a.stockTotal - b.stockTotal) || a.name.localeCompare(b.name, 'ja'));
}
        return dir * ((a.totalAmt - b.totalAmt) || ((a.eggQty + a.adultQty) - (b.eggQty + b.adultQty)));
      });

      const typeRows = typeList.slice(0, 300).map((d) => {
        return `
          <tr>
            <td class="l posColName" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</td>
            <td class="c posColEgg tabularNums">${escapeHtml(String(d.eggQty || 0))}</td>
            <td class="c posColAdult tabularNums">${d.kind === 'item' ? `<span class="posDash">-</span>` : escapeHtml(String(d.adultQty || 0))}</td>
            <td class="c posColStock">
  ${d.kind === 'item'
    ? `<span class="posDash">-</span>`
    : (() => {
        const sid = escapeHtml(String(d.id));
        const st = d.stock || { m: null, f: null };
        const m = st.m;
        const f = st.f;
        // 両方未入力 → "-"
        if (m === null && f === null) {
          return `<button type="button" class="posStockBtn posStockDash" data-stock-id="${sid}" data-stock-both="1">-</button>`;
        }
        // 片方未入力 → もう片方は 0 として表示
        const md = (m === null) ? 0 : m;
        const fd = (f === null) ? 0 : f;
        return `
          <button type="button" class="posStockBtn" data-stock-id="${sid}" data-stock-both="1" title="在庫を入力">
            <span class="posStockM tabularNums">${escapeHtml(String(md))}</span>
            <span class="posStockSep">/</span>
            <span class="posStockF tabularNums">${escapeHtml(String(fd))}</span>
          </button>
        `;
      })()
  }
</td>
            <td class="r posColTotal tabularNums">${escapeHtml(yen(d.totalAmt || 0))}</td>
          </tr>
        `;
      }).join('');

      // 取引履歴：注文ごと（orderId優先）
      // - orderId がある → orderId で必ずまとめる
      // - orderId がない古いデータ → 従来通り「同時刻近似（30秒窓）」でまとめる
      const timeline = mSales.slice().sort((a, b) => (b.ts - a.ts));
      const groups = [];

      // 1) orderId あり
      const byOrderId = new Map();
      for (const s of timeline) {
        const oid = (s && s.orderId != null) ? String(s.orderId).trim() : '';
        if (!oid) continue;
        if (!byOrderId.has(oid)) byOrderId.set(oid, { ts: 0, list: [], orderId: oid });
        const g = byOrderId.get(oid);
        const ts = Number(s.ts) || 0;
        g.list.push(s);
        g.ts = Math.max(g.ts, ts);
      }
      groups.push(...Array.from(byOrderId.values()));

      // 2) orderId なし（同時刻近似）
      const noOrder = timeline.filter(s => {
        const oid = (s && s.orderId != null) ? String(s.orderId).trim() : '';
        return !oid;
      });
      const windowMs = 30 * 1000;
      const approx = [];
      for (const s of noOrder) {
        const ts = Number(s.ts) || 0;
        let g = approx.find(x => Math.abs((x.ts || 0) - ts) <= windowMs);
        if (!g) { g = { ts, list: [], orderId: '' }; approx.push(g); }
        g.list.push(s);
        g.ts = Math.max(g.ts, ts);
      }
      groups.push(...approx);

      groups.sort((a, b) => (b.ts - a.ts));

      const timeRows = groups.slice(0, 220).map((g) => {
        const ts = Number(g.ts) || 0;
        const gTotal = g.list.reduce((a, x) => a + (Number(x.amount) || 0), 0);

        const gKey = g.list.map(x => String(x.id || '')).filter(Boolean).join('|');
const head = `
  <div class="posHistHead">
    <div class="posHistHeadL">${escapeHtml(fmtMD(ts))} 注文</div>
    <button type="button" class="posHistHeadR posOrderDel tabularNums" data-pos-del-order="${escapeHtml(gKey)}" title="タップで注文ごと削除">
      合計 ${escapeHtml(yen(gTotal))}
    </button>
  </div>
`;

        const rows = g.list.map((s) => {
          const t = fmtMD(s.ts);
          const parts = posDisplayParts(s);
          return `
            <div class="posHistLine">
              <div class="posHistL" title="${escapeHtml(t)}">
                <div class="posHistTitle" title="${escapeHtml(parts.title)}">${escapeHtml(parts.title)}</div>
                ${parts.sub ? `<div class="posHistSub" title="${escapeHtml(parts.sub)}">${escapeHtml(parts.sub)}</div>` : ``}
              </div>
              <button type="button" class="posHistAmt tabularNums" data-pos-del-id="${escapeHtml(String(s.id || ''))}" title="タップで削除">${escapeHtml(yen(s.amount))}</button>
            </div>
          `;
        }).join('');

        return `<div class="posHistBox">${head}<div class="posHistBody">${rows}</div></div>`;
      }).join('');

      const monthOpts = monthsNow.map(m => `<option value="${escapeHtml(m)}"${String(m)===String(key)&&mode==='month'?' selected':''}>${escapeHtml(m)}</option>`).join('');
      const yearOpts = yearsNow.map(y => `<option value="${escapeHtml(y)}"${String(y)===String(key)&&mode==='year'?' selected':''}>${escapeHtml(y)}</option>`).join('');

      body.innerHTML = `
        <div class="posTopRow">
          <div class="posPeriod">
            <select id="posPeriodMode" class="posSel">
              <option value="month"${mode==='month'?' selected':''}>月</option>
              <option value="year"${mode==='year'?' selected':''}>年</option>
            </select>
            <select id="posPeriodSel" class="posSel">
              ${mode==='year' ? yearOpts : monthOpts}
            </select>
          </div>
          <div class="posTotal">合計 ${escapeHtml(yen(total))}</div>
        </div>

        <div class="posTabsWrap">
          <button type="button" class="posTabBtn ${ov.__posTab==='types'?'isActive':''}" data-pos-tab="types">種別売上</button>
          <button type="button" class="posTabBtn ${ov.__posTab==='hist'?'isActive':''}" data-pos-tab="hist">取引履歴</button>
        </div>

        <div class="posTabPanel ${ov.__posTab==='types'?'':'isHidden'}">
          <div style="font-weight:950;margin:14px 0 6px;">種別売上（売上順）</div>
          <div class="posBox">
            <table class="posT tabularNums">
              <thead>
                <tr>
                  <th class="l posSortTh posColName" data-pos-sort="name">種別</th>
                  <th class="c posSortTh posColEgg" data-pos-sort="eggQty">卵</th>
                  <th class="c posSortTh posColAdult" data-pos-sort="adultQty">成体</th>
                  <th class="c posSortTh posColStock" data-pos-sort="stock">在庫</th>
                  <th class="r posSortTh posColTotal" data-pos-sort="totalAmt">合計</th>
                </tr>
              </thead>
              <tbody>
                ${typeRows || `<tr><td colspan="5" style="padding:10px;opacity:.8;">データなし</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="posTabPanel ${ov.__posTab==='hist'?'':'isHidden'}">
          <div style="font-weight:950;margin:14px 0 6px;">取引履歴</div>
          <div class="posBox">
            <div class="posHistory tabularNums">
              ${timeRows || `<div style="padding:10px;opacity:.8;">データなし</div>`}
            </div>
          </div>

          <div style="margin-top:10px;opacity:.65;font-size:11px;line-height:1.35;">
            ※「入力」は現在の数量をそのまま記録します（自動クリアはしません）。<br>
            ※ 記録データはこの端末のローカル保存です（localStorage）。
          </div>
        </div>
      `;

      // モードに応じてセレクトの中身を更新（innerHTML書き換えでイベントが消えるのでrender内で差し替え）
      const sel = document.getElementById('posPeriodSel');
      if (sel) {
        sel.innerHTML = (mode === 'year') ? yearOpts : monthOpts;
        sel.value = String(key);
      }
    };

    render();

    try { ScrollLock.lock(); } catch {}
    ov.style.display = 'flex';
  }


  el.pos?.addEventListener('click', () => {
    // POSはメニューを挟まず「入力」へ直行
    openPosEntry();
  });


  // ✅ 隠しボタン：右上の合計金額タップで全入力を一括リセット（枠なし）
  el.total?.addEventListener('click', () => {
    const ok = confirm('入力した数値をすべてリセットします。よろしいですか？');
    if (!ok) return;
    inputState.clear();
    ephemeralKeys.clear();
    renderList();
    applyCollapseAndSearch();
    rebuildOutput();
    openToast('リセットしました');
  });


  el.openManage?.addEventListener('click', openModal);
  el.closeManage?.addEventListener('click', closeModal);
  el.modalOverlay?.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closeModal();
  });

  el.mTabCatalog?.addEventListener('click', () => setManageTab('catalog'));
  el.mTabPrices?.addEventListener('click', () => setManageTab('prices'));
  el.mTabImages?.addEventListener('click', () => setManageTab('images'));

  el.openRoom?.addEventListener('click', openRoom);
  el.closeRoom?.addEventListener('click', closeRoom);
  el.roomOverlay?.addEventListener('click', (e) => {
    if (e.target === el.roomOverlay) closeRoom();
  });

  /* ========= init ========= */
  async function init() {
    await migrateOldImagesIfAny();

    try {
      const all = await idbGetAllImages();
      Object.keys(all).forEach(k => { imageCache[k] = all[k]; });
    } catch {
      openToast('画像DBの読み込みに失敗しました');
    }

    const dText = await fetchTextSafe('./dinos.txt');
    const iText = await fetchTextSafe('./items.txt');

    const baseD = dText.split(/\r?\n/).map(parseDinoLine).filter(Boolean);
    const baseI = iText.split(/\r?\n/).map(parseItemLine).filter(Boolean);

    dinos = baseD.concat(custom.dino.map(x => ({
      id: x.id,
      name: x.name,
      defType: x.defType,
      kind: 'dino',
      _baseName: x._baseName || x.name,
    })));

    items = baseI.concat(custom.item.map(x => ({ id: x.id, name: x.name, unit: x.unit, price: x.price, kind: 'item' })));

    ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');

    setTab('dino');
  }

  init().catch((err) => {
    console.error(err);
    openToast('初期化エラー: ' + (err?.message || err) + '（管理＞Version/Console確認）');

    // ここで落ちても「何も表示されない」を回避する
    try { setTab('dino'); } catch {}
  });
  function openEditItem(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;

    const curMemo = getMemoForItemId(id);
    const curMemoImg = String(getMemoImgForItemId(id) || '').trim();

    const box = document.createElement('div');
    box.innerHTML = `
      <div class="editForm">
        <div class="editLabel">名前</div>
        <input id="editName" class="editInput" type="text" value="${escapeHtml(it.name)}" autocomplete="off">

        <div class="editLabel">1セットあたり個数</div>
        <input id="editUnit" class="editInput" type="text" inputmode="numeric" value="${Number(it.unit || 1)}">

        <div class="editLabel">価格（1セット）</div>
        <input id="editPrice" class="editInput" type="text" inputmode="numeric" value="${Number(it.price || 0)}">

        <div class="editLabel">メモ</div>
        <textarea id="editMemo" class="editTextarea" placeholder="例：在庫少 / 取り置き不可">${escapeHtml(curMemo || '')}</textarea>

        <div class="editLabel">メモ画像</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label class="memoImgBtn" title="画像を追加">
            <input id="editMemoImg" class="memoImgInput" type="file" accept="image/*">
            画像
          </label>
          <button id="editMemoImgClear" class="memoImgClear" type="button">×</button>
        </div>
        <div class="memoThumb js-editMemoThumb" style="display:none;">
          <img class="memoThumbImg js-editMemoThumbImg" alt="">
        </div>

        <div class="editBtns">
          <button class="ghost" type="button" data-act="cancel">キャンセル</button>
          <button class="pill" type="button" data-act="save">保存</button>
        </div>
      </div>
    `;

    openEditModal('追加 / 編集', box);

    // メモ画像（編集画面）
    let memoImgData = curMemoImg;
    const imgInp = $('#editMemoImg', box);
    const imgClr = $('#editMemoImgClear', box);
    const thumb = $('.js-editMemoThumb', box);
    const thumbImg = $('.js-editMemoThumbImg', box);

    const syncMemoImgUI = () => {
      if (thumb && thumbImg) {
        if (memoImgData) {
          thumbImg.src = memoImgData;
          thumb.style.display = 'block';
        } else {
          thumbImg.removeAttribute('src');
          thumb.style.display = 'none';
        }
      }
      if (imgClr) imgClr.style.display = memoImgData ? 'inline-flex' : 'none';
    };

    syncMemoImgUI();

    imgInp?.addEventListener('change', async (ev) => {
      const file = ev.target?.files?.[0];
      if (!file) return;
      const url = await readFileAsDataURL(file);
      if (!url) return openToast('画像の読み込みに失敗しました');
      memoImgData = url;
      syncMemoImgUI();
      openToast('画像を設定しました');
      ev.target.value = '';
    });

    imgClr?.addEventListener('click', (ev) => {
      ev.preventDefault();
      memoImgData = '';
      syncMemoImgUI();
      openToast('画像を削除しました');
    });

    thumbImg?.addEventListener('click', () => {
      if (memoImgData) openImgViewer(memoImgData);
    });

    box.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'cancel') {
        closeEditModal();
        return;
      }

      if (act === 'save') {
        const name = ($('#editName', box)?.value || '').trim();
        const unit = Number($('#editUnit', box)?.value || 1);
        const price = Number($('#editPrice', box)?.value || 0);
        const memo = ($('#editMemo', box)?.value || '').trim();

        if (!name) return openToast('名前を入力してください');
        if (!Number.isFinite(unit) || unit <= 0) return openToast('個数は1以上');
        if (!Number.isFinite(price) || price < 0) return openToast('価格が不正');

        const existIdx = custom.item.findIndex(x => x.id === id);
        const rec = { id, name, unit, price, memo, memoImg: String(memoImgData || '') };
        if (existIdx >= 0) custom.item[existIdx] = rec;
        else custom.item.push(rec);
        saveJSON(LS.ITEM_CUSTOM, custom.item);

        const ii = items.findIndex(x => x.id === id);
        if (ii >= 0) items[ii] = Object.assign({}, items[ii], { name, unit, price });

        closeEditModal();
        renderList();
        setManageTab('catalog');
        openToast('保存しました');
      }
    });
  }

})();
