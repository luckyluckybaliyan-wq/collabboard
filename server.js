'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const RoomManager = require('./server/rooms');
const registerSocketHandlers = require('./server/socket');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6, // 1 MB per incoming message
});

const rooms = new RoomManager();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- REST API ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ...rooms.stats() });
});

app.get('/api/room/new', (req, res) => {
  res.json({ room: rooms.generateCode() });
});

app.get('/api/room/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  res.json({ exists: Boolean(room), users: room ? room.users.size : 0 });
});

// ---------- Pages ----------
app.get('/room/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ---------- Real-time ----------
registerSocketHandlers(io, rooms);

server.listen(PORT, () => {
  console.log(`CollabBoard running at http://localhost:${PORT}`);
});
