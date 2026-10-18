(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);

  const nameEl = $('#name');
  const codeEl = $('#code');
  const errEl = $('#formError');
  nameEl.value = localStorage.getItem('wb_name') || '';

  function fail(msg, el) {
    errEl.textContent = msg;
    if (el) el.focus();
  }

  function saveName() {
    const n = nameEl.value.trim();
    if (!n) { fail('Enter your name so others can see who is drawing.', nameEl); return false; }
    localStorage.setItem('wb_name', n.slice(0, 24));
    return true;
  }

  $('#createBtn').addEventListener('click', async () => {
    errEl.textContent = '';
    if (!saveName()) return;
    try {
      const res = await fetch('/api/room/new');
      const data = await res.json();
      location.href = '/room/' + data.room;
    } catch (_) {
      fail('Could not reach the server. Check that it is running and try again.');
    }
  });

  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.textContent = '';
    if (!saveName()) return;
    const code = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) return fail('Room codes have at least 4 letters or numbers.', codeEl);
    location.href = '/room/' + code;
  });

  codeEl.addEventListener('input', () => {
    codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  });
})();
