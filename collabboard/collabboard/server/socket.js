'use strict';

const BOARD_W = 1600;
const BOARD_H = 900;
const MAX_POINTS = 5000;
const TOOLS = new Set(['pen', 'eraser', 'line', 'arrow', 'rect', 'ellipse', 'text']);

// ---------- validation helpers ----------
const inRange = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

function cleanPoint(p) {
  if (!p || !inRange(p.x, 0, BOARD_W) || !inRange(p.y, 0, BOARD_H)) return null;
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function cleanStroke(raw, userId) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 64) return null;
  if (!TOOLS.has(raw.tool)) return null;

  const color = typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#000000';
  const size = inRange(raw.size, 1, 40) ? Math.round(raw.size) : 4;
  const points = (Array.isArray(raw.points) ? raw.points.slice(0, MAX_POINTS) : []).map(cleanPoint).filter(Boolean);
  if (!points.length) return null;

  const stroke = { id: raw.id, userId, tool: raw.tool, color, size, points };
  if (raw.tool === 'text') {
    stroke.text = String(raw.text || '').slice(0, 200);
    if (!stroke.text.trim()) return null;
  }
  return stroke;
}

function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return n || 'Guest';
}

function cleanCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

// Sliding-window limiter to stop chat spam.
function makeLimiter(max, windowMs) {
  let stamps = [];
  return () => {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < windowMs);
    if (stamps.length >= max) return false;
    stamps.push(now);
    return true;
  };
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

module.exports = function registerSocketHandlers(io, rooms) {
  io.on('connection', (socket) => {
    let room = null;
    let user = null;
    const chatLimiter = makeLimiter(6, 5000);

    const systemMessage = (r, text) => {
      const msg = { id: newId(), type: 'system', text, time: Date.now() };
      r.addMessage(msg);
      io.to(r.code).emit('chat:message', msg);
    };

    // ---- join ----
    socket.on('room:join', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const code = cleanCode(payload && payload.code);
      if (code.length < 4) return reply({ ok: false, error: 'Room code must be 4–12 letters or numbers.' });
      if (room) return reply({ ok: false, error: 'Already in a room.' });

      room = rooms.getOrCreate(code);
      user = room.addUser(socket.id, cleanName(payload && payload.name));
      socket.join(code);

      reply({
        ok: true,
        you: user,
        users: room.userList(),
        strokes: room.strokes,
        messages: room.messages,
      });

      socket.to(code).emit('user:joined', user);
      systemMessage(room, `${user.name} joined the room`);
    });

    // ---- freehand drawing (streamed live) ----
    socket.on('draw:begin', (raw) => {
      if (!room) return;
      const stroke = cleanStroke(raw, socket.id);
      if (!stroke) return;
      room.addStroke(stroke);
      room.activeStrokes.set(socket.id, stroke);
      room.clearRedo(socket.id);
      socket.to(room.code).emit('draw:begin', stroke);
    });

    socket.on('draw:points', (payload) => {
      if (!room || !payload) return;
      const stroke = room.activeStrokes.get(socket.id);
      if (!stroke || stroke.id !== payload.id) return;
      const pts = (Array.isArray(payload.points) ? payload.points.slice(0, 200) : []).map(cleanPoint).filter(Boolean);
      if (!pts.length || stroke.points.length + pts.length > MAX_POINTS) return;
      stroke.points.push(...pts);
      socket.to(room.code).emit('draw:points', { id: stroke.id, points: pts });
    });

    socket.on('draw:end', () => {
      if (!room) return;
      room.activeStrokes.delete(socket.id);
    });

    // ---- complete shapes / text ----
    socket.on('shape:add', (raw) => {
      if (!room) return;
      const stroke = cleanStroke(raw, socket.id);
      if (!stroke) return;
      room.addStroke(stroke);
      room.clearRedo(socket.id);
      socket.to(room.code).emit('stroke:add', stroke);
    });

    // ---- undo / redo (per user) ----
    socket.on('undo', () => {
      if (!room) return;
      const removed = room.removeLastStrokeBy(socket.id);
      if (!removed) return;
      room.pushRedo(socket.id, removed);
      io.to(room.code).emit('stroke:remove', { id: removed.id });
    });

    socket.on('redo', () => {
      if (!room) return;
      const stroke = room.popRedo(socket.id);
      if (!stroke) return;
      room.addStroke(stroke);
      io.to(room.code).emit('stroke:add', stroke);
    });

    socket.on('board:clear', () => {
      if (!room || !user) return;
      room.clearBoard();
      io.to(room.code).emit('board:clear', { by: user.name });
      systemMessage(room, `${user.name} cleared the board`);
    });

    // ---- live cursors ----
    socket.on('cursor', (p) => {
      if (!room) return;
      const point = cleanPoint(p);
      if (!point) return;
      socket.to(room.code).volatile.emit('cursor', { id: socket.id, x: point.x, y: point.y });
    });

    // ---- chat ----
    socket.on('chat:message', (payload) => {
      if (!room || !user) return;
      const text = String((payload && payload.text) || '').trim().slice(0, 500);
      if (!text) return;
      if (!chatLimiter()) {
        socket.emit('chat:error', 'You are sending messages too quickly. Wait a few seconds.');
        return;
      }
      const msg = {
        id: newId(),
        type: 'user',
        userId: socket.id,
        name: user.name,
        color: user.color,
        text,
        time: Date.now(),
      };
      room.addMessage(msg);
      io.to(room.code).emit('chat:message', msg);
    });

    socket.on('chat:typing', (isTyping) => {
      if (!room || !user) return;
      socket.to(room.code).emit('chat:typing', { id: socket.id, name: user.name, typing: Boolean(isTyping) });
    });

    // ---- leave ----
    socket.on('disconnect', () => {
      if (!room || !user) return;
      const current = room;
      current.removeUser(socket.id);
      io.to(current.code).emit('user:left', { id: socket.id });
      if (current.users.size > 0) systemMessage(current, `${user.name} left the room`);
      rooms.scheduleCleanup(current);
    });
  });
};
