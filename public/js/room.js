/* Room page controller: connects sockets, toolbar, users and chat together. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const code = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (code.length < 4) { location.replace('/'); return; }

  $('#roomCode').textContent = code;
  document.title = 'Room ' + code + ' · CollabBoard';

  /* ---------- theme ---------- */
  const root = document.documentElement;
  root.dataset.theme = localStorage.getItem('wb_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  $('#themeBtn').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('wb_theme', root.dataset.theme);
  });

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- name prompt ---------- */
  const modal = $('#nameModal');
  let name = (localStorage.getItem('wb_name') || '').trim();
  if (name) start();
  else {
    modal.hidden = false;
    $('#nameInput').focus();
    $('#nameForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#nameInput').value.trim();
      if (!v) return;
      name = v.slice(0, 24);
      localStorage.setItem('wb_name', name);
      modal.hidden = true;
      start();
    });
  }

  function start() {
    const socket = io();
    const users = new Map();
    let me = null;
    let unread = 0;

    /* ----- board ----- */
    const board = new Whiteboard({
      stage: $('#stage'),
      canvas: $('#board'),
      preview: $('#preview'),
      cursorsEl: $('#cursors'),
      emit: (ev, data) => socket.emit(ev, data),
      onChange: () => { $('#emptyHint').hidden = board.count() > 0; },
    });

    /* ----- chat ----- */
    const sidebar = $('#sidebar');
    const chat = new Chat({
      list: $('#messages'),
      form: $('#chatForm'),
      input: $('#chatInput'),
      typingEl: $('#typing'),
      emit: (ev, data) => socket.emit(ev, data),
      onIncoming: () => {
        if (!sidebar.classList.contains('open') && matchMedia('(max-width: 900px)').matches) {
          unread++;
          const b = $('#unread');
          b.textContent = unread;
          b.hidden = false;
        }
      },
    });

    /* ----- connection ----- */
    const dot = $('#statusDot');
    function setStatus(state, label) {
      dot.dataset.state = state;
      dot.title = label;
      $('#statusText').textContent = label;
    }
    setStatus('connecting', 'Connecting');

    socket.on('connect', () => {
      socket.emit('room:join', { code, name }, (res) => {
        if (!res || !res.ok) {
          setStatus('error', 'Could not join');
          toast((res && res.error) || 'Could not join this room.');
          return;
        }
        me = res.you;
        chat.setSelf(me.id);
        users.clear();
        res.users.forEach((u) => users.set(u.id, u));
        board.clearCursors();
        board.setStrokes(res.strokes);
        chat.reset(res.messages);
        renderUsers();
        setStatus('online', 'Connected');
      });
    });
    socket.on('disconnect', () => setStatus('connecting', 'Reconnecting'));
    socket.on('connect_error', () => setStatus('error', 'Offline'));

    /* ----- remote drawing ----- */
    socket.on('draw:begin', (s) => board.remoteBegin(s));
    socket.on('draw:points', (p) => board.remotePoints(p));
    socket.on('stroke:add', (s) => board.remoteAdd(s));
    socket.on('stroke:remove', (p) => board.remoteRemove(p));
    socket.on('board:clear', () => board.clear());
    socket.on('cursor', (c) => board.moveCursor(users.get(c.id), c.x, c.y));

    /* ----- users ----- */
    socket.on('user:joined', (u) => { users.set(u.id, u); renderUsers(); });
    socket.on('user:left', ({ id }) => {
      users.delete(id);
      board.removeCursor(id);
      chat.dropTyper(id);
      renderUsers();
    });

    function initials(n) {
      const parts = n.trim().split(/\s+/);
      return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    function renderUsers() {
      const all = Array.from(users.values());
      $('#userCount').textContent = all.length;

      const av = $('#avatars');
      av.innerHTML = '';
      all.slice(0, 5).forEach((u) => {
        const el = document.createElement('span');
        el.className = 'avatar';
        el.style.background = u.color;
        el.textContent = initials(u.name);
        el.title = u.name + (me && u.id === me.id ? ' (you)' : '');
        av.appendChild(el);
      });
      if (all.length > 5) {
        const more = document.createElement('span');
        more.className = 'avatar more';
        more.textContent = '+' + (all.length - 5);
        av.appendChild(more);
      }

      const list = $('#people');
      list.innerHTML = '';
      all.forEach((u) => {
        const li = document.createElement('li');
        const a = document.createElement('span');
        a.className = 'avatar';
        a.style.background = u.color;
        a.textContent = initials(u.name);
        const n = document.createElement('span');
        n.className = 'pname';
        n.textContent = u.name;
        li.append(a, n);
        if (me && u.id === me.id) {
          const you = document.createElement('span');
          you.className = 'you';
          you.textContent = 'You';
          li.appendChild(you);
        }
        list.appendChild(li);
      });
    }

    /* ----- chat events ----- */
    socket.on('chat:message', (m) => chat.add(m));
    socket.on('chat:typing', (t) => chat.setTyping(t));
    socket.on('chat:error', (t) => chat.showError(t));

    /* ----- toolbar ----- */
    const toolBtns = $$('[data-tool]');
    function selectTool(t) {
      board.setTool(t);
      toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    }
    toolBtns.forEach((b) => b.addEventListener('click', () => selectTool(b.dataset.tool)));
    selectTool('pen');

    const swatches = $$('.swatch');
    const colorPicker = $('#colorPicker');
    function selectColor(c, fromSwatch) {
      board.setColor(c);
      colorPicker.value = c;
      swatches.forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.color === c)));
      if (!fromSwatch && board.tool === 'eraser') selectTool('pen');
      if (board.tool === 'eraser') selectTool('pen');
    }
    swatches.forEach((s) => {
      s.style.background = s.dataset.color;
      s.addEventListener('click', () => selectColor(s.dataset.color, true));
    });
    colorPicker.addEventListener('input', () => selectColor(colorPicker.value.toLowerCase(), false));
    selectColor('#14213d', true);

    const sizeInput = $('#sizeInput');
    function updateSize() {
      board.setSize(Number(sizeInput.value));
      $('#sizeDot').style.setProperty('--s', Math.max(3, Number(sizeInput.value) * 1.6) + 'px');
    }
    sizeInput.addEventListener('input', updateSize);
    updateSize();

    $('#undoBtn').addEventListener('click', () => socket.emit('undo'));
    $('#redoBtn').addEventListener('click', () => socket.emit('redo'));
    $('#clearBtn').addEventListener('click', () => {
      if (confirm('Clear the board for everyone in this room?')) socket.emit('board:clear');
    });
    $('#saveBtn').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = board.exportPNG();
      a.download = 'collabboard-' + code + '.png';
      a.click();
      toast('Board saved as PNG');
    });

    /* ----- shortcuts ----- */
    const keyTools = { p: 'pen', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text' };
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        socket.emit(e.shiftKey ? 'redo' : 'undo');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        socket.emit('redo');
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && keyTools[e.key.toLowerCase()]) {
        selectTool(keyTools[e.key.toLowerCase()]);
      }
    });

    /* ----- sidebar ----- */
    const tabs = $$('[data-tab]');
    function showTab(t) {
      tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
      $('#chatPanel').hidden = t !== 'chat';
      $('#peoplePanel').hidden = t !== 'people';
    }
    tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

    $('#sidebarBtn').addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (sidebar.classList.contains('open')) {
        unread = 0;
        $('#unread').hidden = true;
        showTab('chat');
        $('#chatInput').focus();
      }
    });
    $('#closeSidebar').addEventListener('click', () => sidebar.classList.remove('open'));

    /* ----- share ----- */
    $('#copyLink').addEventListener('click', async () => {
      const url = location.origin + '/room/' + code;
      try {
        await navigator.clipboard.writeText(url);
        toast('Invite link copied');
      } catch (_) {
        prompt('Copy this link to invite others:', url);
      }
    });
  }
})();
