'use strict';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
const MAX_STROKES = 5000;
const MAX_MESSAGES = 200;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class Room {
  constructor(code) {
    this.code = code;
    this.users = new Map();         // socketId -> { id, name, color }
    this.strokes = [];              // every drawing object on the board, in order
    this.messages = [];             // recent chat history
    this.redoStacks = new Map();    // socketId -> removed strokes available for redo
    this.activeStrokes = new Map(); // socketId -> stroke currently being drawn
    this.colorIndex = 0;
    this.cleanupTimer = null;
    this.createdAt = Date.now();
  }

  addUser(id, name) {
    const color = COLORS[this.colorIndex++ % COLORS.length];
    const user = { id, name, color };
    this.users.set(id, user);
    return user;
  }

  removeUser(id) {
    this.users.delete(id);
    this.redoStacks.delete(id);
    this.activeStrokes.delete(id);
  }

  userList() {
    return Array.from(this.users.values());
  }

  addStroke(stroke) {
    this.strokes.push(stroke);
    if (this.strokes.length > MAX_STROKES) this.strokes.shift();
  }

  removeLastStrokeBy(userId) {
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      if (this.strokes[i].userId === userId) return this.strokes.splice(i, 1)[0];
    }
    return null;
  }

  pushRedo(userId, stroke) {
    if (!this.redoStacks.has(userId)) this.redoStacks.set(userId, []);
    this.redoStacks.get(userId).push(stroke);
  }

  popRedo(userId) {
    const stack = this.redoStacks.get(userId);
    return stack && stack.length ? stack.pop() : null;
  }

  clearRedo(userId) {
    this.redoStacks.delete(userId);
  }

  clearBoard() {
    this.strokes = [];
    this.redoStacks.clear();
    this.activeStrokes.clear();
  }

  addMessage(message) {
    this.messages.push(message);
    if (this.messages.length > MAX_MESSAGES) this.messages.shift();
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  generateCode() {
    let code;
    do {
      code = '';
      for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    } while (this.rooms.has(code));
    return code;
  }

  get(code) {
    return this.rooms.get(code);
  }

  getOrCreate(code) {
    let room = this.rooms.get(code);
    if (!room) {
      room = new Room(code);
      this.rooms.set(code, room);
    }
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    return room;
  }

  // Empty rooms are kept for a while so people can rejoin, then removed.
  scheduleCleanup(room, delay = 10 * 60 * 1000) {
    if (room.users.size > 0 || room.cleanupTimer) return;
    room.cleanupTimer = setTimeout(() => {
      if (room.users.size === 0) this.rooms.delete(room.code);
    }, delay);
  }

  stats() {
    let users = 0;
    for (const room of this.rooms.values()) users += room.users.size;
    return { rooms: this.rooms.size, users };
  }
}

module.exports = RoomManager;
