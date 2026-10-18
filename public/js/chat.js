/* Chat panel: messages, system notices and typing indicator. */
(function (global) {
  'use strict';

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  class Chat {
    constructor(opts) {
      this.list = opts.list;
      this.form = opts.form;
      this.input = opts.input;
      this.typingEl = opts.typingEl;
      this.emit = opts.emit || function () {};
      this.onIncoming = opts.onIncoming || function () {};
      this.selfId = null;
      this.typers = new Map();
      this.typingTimer = null;
      this.isTyping = false;

      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.send();
      });
      this.input.addEventListener('input', () => this._onInput());
    }

    setSelf(id) { this.selfId = id; }

    send() {
      const text = this.input.value.trim();
      if (!text) return;
      this.emit('chat:message', { text });
      this.input.value = '';
      this._stopTyping();
    }

    reset(messages) {
      this.list.innerHTML = '';
      this.typers.clear();
      this._renderTyping();
      (messages || []).forEach((m) => this.add(m, true));
    }

    add(msg, silent) {
      const el = document.createElement('div');
      if (msg.type === 'system') {
        el.className = 'msg system';
        el.textContent = msg.text;
      } else {
        const mine = msg.userId === this.selfId;
        el.className = 'msg ' + (mine ? 'mine' : 'theirs');
        const meta = document.createElement('div');
        meta.className = 'meta';
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = mine ? 'You' : msg.name;
        who.style.color = msg.color;
        const time = document.createElement('time');
        time.textContent = formatTime(msg.time);
        meta.append(who, time);
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = msg.text; // textContent keeps user input safe from XSS
        el.append(meta, bubble);
        if (!silent && !mine) this.onIncoming(msg);
      }
      const nearBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 120;
      this.list.appendChild(el);
      if (nearBottom || msg.userId === this.selfId || silent) this.list.scrollTop = this.list.scrollHeight;
    }

    showError(text) {
      this.add({ id: 'err' + Date.now(), type: 'system', text, time: Date.now() }, true);
    }

    /* ---------- typing indicator ---------- */
    _onInput() {
      if (!this.isTyping) {
        this.isTyping = true;
        this.emit('chat:typing', true);
      }
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => this._stopTyping(), 1500);
    }

    _stopTyping() {
      clearTimeout(this.typingTimer);
      if (this.isTyping) {
        this.isTyping = false;
        this.emit('chat:typing', false);
      }
    }

    setTyping({ id, name, typing }) {
      if (typing) this.typers.set(id, name);
      else this.typers.delete(id);
      this._renderTyping();
    }

    dropTyper(id) {
      this.typers.delete(id);
      this._renderTyping();
    }

    _renderTyping() {
      const names = Array.from(this.typers.values());
      if (!names.length) this.typingEl.textContent = '';
      else if (names.length === 1) this.typingEl.textContent = names[0] + ' is typing…';
      else if (names.length === 2) this.typingEl.textContent = names[0] + ' and ' + names[1] + ' are typing…';
      else this.typingEl.textContent = 'Several people are typing…';
    }
  }

  global.Chat = Chat;
})(window);
