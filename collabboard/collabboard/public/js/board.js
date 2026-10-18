/* Whiteboard engine: drawing, rendering, remote sync and live cursors. */
(function (global) {
  'use strict';

  const W = 1600;
  const H = 900;
  const FREEHAND = new Set(['pen', 'eraser']);

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  const strokeWidth = (s) => (s.tool === 'eraser' ? s.size * 3 : s.size);
  const textSize = (s) => 16 + s.size * 3;

  function applyStyle(ctx, s) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeWidth(s);
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  }

  function drawStroke(ctx, s) {
    const pts = s.points;
    if (!pts || !pts.length) return;
    const a = pts[0];
    const b = pts[pts.length - 1];
    ctx.save();
    applyStyle(ctx, s);

    switch (s.tool) {
      case 'pen':
      case 'eraser':
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, strokeWidth(s) / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i].x + pts[i + 1].x) / 2;
            const my = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
          }
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      case 'arrow': {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const head = Math.max(14, s.size * 4);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
        ctx.stroke();
        break;
      }
      case 'rect':
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 || 1, Math.abs(b.y - a.y) / 2 || 1, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'text':
        ctx.font = '600 ' + textSize(s) + 'px "DM Sans", system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(s.text || '', a.x, a.y);
        break;
    }
    ctx.restore();
  }

  function drawSegment(ctx, s, from, to) {
    ctx.save();
    applyStyle(ctx, s);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  class Whiteboard {
    constructor(opts) {
      this.stage = opts.stage;
      this.canvas = opts.canvas;
      this.preview = opts.preview;
      this.cursorsEl = opts.cursorsEl;
      this.emit = opts.emit || function () {};
      this.onChange = opts.onChange || function () {};
      this.ctx = this.canvas.getContext('2d');
      this.pctx = this.preview.getContext('2d');

      this.strokes = [];
      this.cursors = new Map();
      this.tool = 'pen';
      this.color = '#14213d';
      this.size = 4;

      this.drawing = null;
      this.pending = [];
      this.flushTimer = null;
      this.lastCursorSent = 0;
      this.textInput = null;
      this.textPoint = null;

      this._bind();
    }

    /* ---------- settings ---------- */
    setTool(tool) {
      this.tool = tool;
      this.preview.style.cursor = tool === 'text' ? 'text' : 'crosshair';
      this.closeText();
    }
    setColor(color) { this.color = color; }
    setSize(size) { this.size = size; }

    /* ---------- coordinates ---------- */
    _point(e) {
      const r = this.preview.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const y = ((e.clientY - r.top) / r.height) * H;
      return { x: Math.max(0, Math.min(W, Math.round(x))), y: Math.max(0, Math.min(H, Math.round(y))) };
    }

    /* ---------- input ---------- */
    _bind() {
      const el = this.preview;
      el.addEventListener('pointerdown', (e) => this._down(e));
      el.addEventListener('pointermove', (e) => this._move(e));
      el.addEventListener('pointerup', (e) => this._up(e));
      el.addEventListener('pointercancel', (e) => this._up(e));
    }

    _down(e) {
      if (e.button > 0) return;
      e.preventDefault();
      const p = this._point(e);

      if (this.tool === 'text') {
        this.textPoint = p;
        return;
      }

      try { this.preview.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const s = { id: uid(), tool: this.tool, color: this.color, size: this.size, points: [p] };
      this.drawing = s;
      this.pending = [];

      if (FREEHAND.has(s.tool)) {
        this.strokes.push(s);
        drawStroke(this.ctx, s);
        this.emit('draw:begin', s);
      }
    }

    _move(e) {
      const p = this._point(e);
      const now = performance.now();
      if (now - this.lastCursorSent > 40) {
        this.lastCursorSent = now;
        this.emit('cursor', p);
      }

      const s = this.drawing;
      if (!s) return;

      if (FREEHAND.has(s.tool)) {
        const last = s.points[s.points.length - 1];
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 2) return;
        s.points.push(p);
        drawSegment(this.ctx, s, last, p);
        this.pending.push(p);
        if (!this.flushTimer) this.flushTimer = setTimeout(() => this._flush(), 30);
      } else {
        s.points[1] = p;
        this.pctx.clearRect(0, 0, W, H);
        drawStroke(this.pctx, s);
      }
    }

    _flush() {
      this.flushTimer = null;
      if (!this.drawing || !this.pending.length) return;
      this.emit('draw:points', { id: this.drawing.id, points: this.pending });
      this.pending = [];
    }

    _up(e) {
      if (this.tool === 'text' && this.textPoint) {
        const p = this.textPoint;
        this.textPoint = null;
        setTimeout(() => this._openText(p), 10);
        return;
      }

      const s = this.drawing;
      if (!s) return;
      this.drawing = null;
      if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }

      if (FREEHAND.has(s.tool)) {
        if (this.pending.length) this.emit('draw:points', { id: s.id, points: this.pending });
        this.pending = [];
        this.emit('draw:end', { id: s.id });
        this.redraw(); // re-render with smoothing
      } else {
        this.pctx.clearRect(0, 0, W, H);
        const a = s.points[0];
        const b = s.points[1];
        if (b && Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > 4) {
          this.strokes.push(s);
          drawStroke(this.ctx, s);
          this.emit('shape:add', s);
        }
      }
      this.onChange();
    }

    /* ---------- text tool ---------- */
    _openText(p) {
      this.closeText();
      const r = this.preview.getBoundingClientRect();
      const scale = r.width / W;
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 200;
      input.className = 'text-input';
      input.placeholder = 'Type, then press Enter';
      input.style.left = (p.x / W) * 100 + '%';
      input.style.top = (p.y / H) * 100 + '%';
      input.style.fontSize = textSize({ size: this.size }) * scale + 'px';
      input.style.color = this.color;
      this.stage.appendChild(input);
      this.textInput = input;
      input.focus();

      let done = false;
      const commit = () => {
        if (done) return;
        done = true;
        const text = input.value.trim();
        input.remove();
        if (this.textInput === input) this.textInput = null;
        if (!text) return;
        const s = { id: uid(), tool: 'text', color: this.color, size: this.size, text, points: [p] };
        this.strokes.push(s);
        drawStroke(this.ctx, s);
        this.emit('shape:add', s);
        this.onChange();
      };
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') commit();
        if (ev.key === 'Escape') { done = true; input.remove(); this.textInput = null; }
      });
      input.addEventListener('blur', commit);
    }

    closeText() {
      if (this.textInput) {
        this.textInput.remove();
        this.textInput = null;
      }
    }

    /* ---------- rendering ---------- */
    redraw() {
      this.ctx.clearRect(0, 0, W, H);
      for (const s of this.strokes) drawStroke(this.ctx, s);
    }

    setStrokes(list) {
      this.strokes = (list || []).map((s) => ({ ...s, points: s.points.slice() }));
      this.redraw();
      this.onChange();
    }

    clear() {
      this.strokes = [];
      this.redraw();
      this.onChange();
    }

    /* ---------- remote events ---------- */
    remoteBegin(s) {
      if (this.strokes.some((x) => x.id === s.id)) return;
      const copy = { ...s, points: s.points.slice() };
      this.strokes.push(copy);
      drawStroke(this.ctx, copy);
      this.onChange();
    }

    remotePoints({ id, points }) {
      const s = this.strokes.find((x) => x.id === id);
      if (!s) return;
      for (const p of points) {
        const last = s.points[s.points.length - 1];
        s.points.push(p);
        drawSegment(this.ctx, s, last, p);
      }
    }

    remoteAdd(s) {
      if (this.strokes.some((x) => x.id === s.id)) return;
      const copy = { ...s, points: s.points.slice() };
      this.strokes.push(copy);
      drawStroke(this.ctx, copy);
      this.onChange();
    }

    remoteRemove({ id }) {
      this.strokes = this.strokes.filter((s) => s.id !== id);
      this.redraw();
      this.onChange();
    }

    /* ---------- cursors ---------- */
    moveCursor(user, x, y) {
      if (!user) return;
      let c = this.cursors.get(user.id);
      if (!c) {
        const el = document.createElement('div');
        el.className = 'remote-cursor';
        el.innerHTML = '<svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true"><path d="M1 1l13 8-6 1.5L5.5 17z" /></svg><span></span>';
        el.querySelector('span').textContent = user.name;
        el.style.setProperty('--c', user.color);
        this.cursorsEl.appendChild(el);
        c = { el, timer: null };
        this.cursors.set(user.id, c);
      }
      c.el.style.left = (x / W) * 100 + '%';
      c.el.style.top = (y / H) * 100 + '%';
      c.el.classList.remove('idle');
      clearTimeout(c.timer);
      c.timer = setTimeout(() => c.el.classList.add('idle'), 4000);
    }

    removeCursor(id) {
      const c = this.cursors.get(id);
      if (!c) return;
      clearTimeout(c.timer);
      c.el.remove();
      this.cursors.delete(id);
    }

    clearCursors() {
      for (const id of Array.from(this.cursors.keys())) this.removeCursor(id);
    }

    /* ---------- export ---------- */
    exportPNG() {
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const c = out.getContext('2d');
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, W, H);
      c.drawImage(this.canvas, 0, 0);
      return out.toDataURL('image/png');
    }

    count() { return this.strokes.length; }
  }

  global.Whiteboard = Whiteboard;
})(window);
