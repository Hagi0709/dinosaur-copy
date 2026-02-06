(() => {
  'use strict';

  /* ========= utils ========= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ========= storage ========= */
  const LS = {
    ROOM_ENTRY_PW: 'room_entry_pw_v1',
    ROOM_PW: 'room_pw_v1', // { ROOM1: '1234', ... }
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

  /* ========= DOM ========= */
  const el = {
    openRoom: $('#openRoom'),
    roomOverlay: $('#roomOverlay'),
    roomBody: $('#roomBody'),
    closeRoom: $('#closeRoom'),
  };

  /* ========= room state ========= */
  let entryPw = loadJSON(LS.ROOM_ENTRY_PW, '2580');
  let roomPw = loadJSON(LS.ROOM_PW, {
    ROOM1: '5412',
    ROOM2: '0000',
    ROOM3: '0000',
    ROOM4: '0000',
    ROOM5: '0000',
    ROOM6: '0000',
    ROOM7: '0000',
    ROOM8: '0000',
    ROOM9: '0000',
  });

  /* ========= copy ========= */
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

  /* ========= template ========= */
  function buildCopyText(room) {
    return `納品が完了しましたのでご連絡させて頂きます。以下の場所まで受け取りよろしくお願いします🙏🏻

サーバー番号 : 5041 (アイランド)
座標 : 87 / 16 (西部2、赤オベ付近)
入口パスワード【${entryPw}】
${room}の方にパスワード【${roomPw[room]}】で入室をして頂き、冷蔵庫より受け取りお願いします。

⚠️受精卵はサバイバーのインベントリに入れての転送をしないと消えてしまうバグがあるためご注意してください！`;
  }

  /* ========= render ========= */
  function renderRooms() {
    el.roomBody.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '12px';

    // 共通入口PW
    const entry = document.createElement('div');
    entry.innerHTML = `
      <div style="font-weight:900;margin-bottom:4px;">入口パスワード（共通）</div>
      <div style="display:flex;gap:10px;">
        <input id="entryPw" value="${entryPw}" style="flex:1;height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.25);color:#fff;padding:0 10px;">
        <button id="saveEntry" class="pill">保存</button>
      </div>
    `;
    wrap.appendChild(entry);

    entry.querySelector('#saveEntry').onclick = () => {
      entryPw = entry.querySelector('#entryPw').value.trim() || entryPw;
      saveJSON(LS.ROOM_ENTRY_PW, entryPw);
    };

    // ROOM1-9
    Object.keys(roomPw).forEach(room => {
      const row = document.createElement('div');
      row.className = 'mRow';
      row.innerHTML = `
        <div class="mName">${room}</div>
        <button class="sBtn" data-act="copy" data-room="${room}">コピー</button>
        <button class="sBtn" data-act="pw" data-room="${room}">PW変更</button>
      `;
      wrap.appendChild(row);
    });

    wrap.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      const room = e.target?.dataset?.room;
      if (!act || !room) return;

      if (act === 'copy') {
        await copyText(buildCopyText(room));
        e.target.textContent = 'コピー済';
        setTimeout(() => (e.target.textContent = 'コピー'), 900);
      }

      if (act === 'pw') {
        const npw = prompt(`${room} のパスワードを入力`, roomPw[room]);
        if (!npw) return;
        roomPw[room] = npw;
        saveJSON(LS.ROOM_PW, roomPw);
      }
    });

    el.roomBody.appendChild(wrap);
  }

  /* ========= open / close ========= */
  function openRoom() {
    el.roomOverlay.classList.remove('isHidden');
    renderRooms();
  }
  function closeRoom() {
    el.roomOverlay.classList.add('isHidden');
  }

  el.openRoom?.addEventListener('click', openRoom);
  el.closeRoom?.addEventListener('click', closeRoom);
  el.roomOverlay?.addEventListener('click', (e) => {
    if (e.target === el.roomOverlay) closeRoom();
  });
})();