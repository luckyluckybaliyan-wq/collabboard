# CollabBoard — Real-Time Collaborative Whiteboard & Chat Application

CollabBoard is a full-stack web application where multiple people join the same room, draw on a shared whiteboard and chat at the same time. Every stroke, shape, cursor movement and message reaches everyone in the room instantly using WebSockets (Socket.IO). No sign-up is required, only a name and a room code.

## Features

**Whiteboard**
- Pen and eraser with live streaming, so others watch each stroke as it is drawn
- Line, arrow, rectangle, ellipse and text tools
- 8 preset colours plus a custom colour picker, and an adjustable brush size
- Per-user undo and redo (you only undo your own work)
- Clear board for everyone, and download the board as a PNG
- Live cursors with name tags for every participant
- Works with mouse, touch and pen (Pointer Events)
- Keyboard shortcuts: `P` pen, `E` eraser, `L` line, `A` arrow, `R` rectangle, `O` ellipse, `T` text, `Ctrl+Z` undo, `Ctrl+Y` or `Ctrl+Shift+Z` redo

**Chat and rooms**
- Room chat with timestamps, system notices (joined, left, board cleared) and a typing indicator
- Chat history and the full board are replayed to anyone who joins late
- Rooms are created with a random 6-character code and shared with an invite link
- People panel showing who is in the room, each with a unique colour
- Unread badge on mobile when the chat panel is closed

**Quality**
- Responsive layout for desktop, tablet and phone
- Light and dark theme
- Server-side validation of every incoming drawing and chat event
- Chat rate limiting, message length limits, and XSS-safe rendering (`textContent` only)
- Empty rooms are removed automatically after 10 minutes
- Reduced-motion support and visible keyboard focus

## Tech stack

| Layer | Technology |
|-------|------------|
| Server | Node.js, Express |
| Real-time | Socket.IO (WebSockets with fallback) |
| Frontend | HTML5, CSS3, vanilla JavaScript |
| Drawing | HTML Canvas 2D API with Pointer Events |
| Deployment | Any Node host, or the included Dockerfile |

## Project structure

```
collabboard/
├── server.js              # Express app, REST routes, Socket.IO bootstrap
├── server/
│   ├── rooms.js           # Room and RoomManager (state, undo/redo stacks, cleanup)
│   └── socket.js          # Socket event handlers and input validation
├── public/
│   ├── index.html         # Landing page (create or join a room)
│   ├── room.html          # Whiteboard + chat page
│   ├── 404.html
│   ├── css/style.css      # Styles for all pages, light and dark themes
│   └── js/
│       ├── landing.js     # Landing page logic
│       ├── room.js        # Room controller (sockets, toolbar, users, shortcuts)
│       ├── board.js       # Whiteboard engine (drawing, rendering, cursors, export)
│       └── chat.js        # Chat panel and typing indicator
├── docs/ARCHITECTURE.md   # How it works, event reference
├── Dockerfile
├── .env.example
├── .gitignore
└── package.json
```

## Getting started

You need Node.js 18 or newer.

```bash
# 1. Open the project folder
cd collabboard

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Open **http://localhost:3000**. Enter a name and press **Create a new room**. To test collaboration, open the invite link in a second browser window (or a private window) with a different name. You can also open it on a phone on the same Wi-Fi using `http://<your-computer-ip>:3000`.

For development with automatic restarts on file changes, run `npm run dev`.

To change the port, copy `.env.example` and set `PORT`, or run `PORT=5000 npm start` (on Windows PowerShell: `$env:PORT=5000; npm start`).

## How to use

1. Enter your name on the home page.
2. Press **Create a new room**, or type a room code and press **Join room**.
3. Pick a tool on the left and draw. Everyone in the room sees it live.
4. Use the chat on the right. On phones, tap the chat icon in the top bar.
5. Press **Copy invite link** and send it to others.
6. Use the download icon to save the board as a PNG.

## REST API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Server status, uptime, active rooms and users |
| GET | `/api/room/new` | Returns a new unused room code |
| GET | `/api/room/:code` | Whether a room exists and how many people are in it |
| GET | `/room/:code` | Serves the whiteboard page |

## Socket events

**Client to server**

| Event | Payload | Purpose |
|-------|---------|---------|
| `room:join` | `{ code, name }` + ack | Join a room, receive the current state |
| `draw:begin` | stroke | Start a freehand stroke (pen or eraser) |
| `draw:points` | `{ id, points[] }` | Stream extra points for the active stroke |
| `draw:end` | `{ id }` | Finish the active stroke |
| `shape:add` | stroke | Add a finished shape or text |
| `undo` / `redo` | none | Undo or redo your own last stroke |
| `board:clear` | none | Clear the board for everyone |
| `cursor` | `{ x, y }` | Share cursor position (volatile) |
| `chat:message` | `{ text }` | Send a chat message |
| `chat:typing` | boolean | Typing indicator |

**Server to client**

`user:joined`, `user:left`, `draw:begin`, `draw:points`, `stroke:add`, `stroke:remove`, `board:clear`, `cursor`, `chat:message`, `chat:typing`, `chat:error`

A stroke object looks like this:

```json
{ "id": "uuid", "userId": "socketId", "tool": "pen", "color": "#14213d", "size": 4,
  "points": [{ "x": 120, "y": 80 }, { "x": 124, "y": 83 }] }
```

The board uses a fixed logical size of 1600 x 900. Coordinates are scaled to the screen, so the drawing looks the same on every device.

## Deployment

**Render, Railway or any Node host:** push the folder to GitHub, create a new Web Service, set the build command to `npm install` and the start command to `npm start`. The platform provides the `PORT` variable automatically.

**Docker:**

```bash
docker build -t collabboard .
docker run -p 3000:3000 collabboard
```

Note: rooms are stored in server memory. A restart clears all boards and chats, and you should run a single server instance (see the ideas below to scale further).

## Troubleshooting

- **`Cannot find module 'express'`**: run `npm install` inside the project folder first.
- **Port already in use**: start with another port, for example `PORT=4000 npm start`.
- **Drawings do not appear on the other device**: make sure both are in the same room code and that your firewall allows the port.
- **Fonts look different offline**: the page falls back to system fonts, which is expected.

## Ideas for further work

- Save rooms to MongoDB or Redis so boards survive restarts
- User accounts and private, password-protected rooms
- Redis adapter for Socket.IO to run several server instances
- Image upload, sticky notes, pan and zoom on an infinite canvas
- Voice or video with WebRTC
- Export the board as PDF or SVG

## Resume description

> Built a real-time collaborative whiteboard and chat application with Node.js, Express, Socket.IO and the HTML Canvas API. Implemented live stroke streaming, shape tools, per-user undo and redo, live cursors, room-based chat with typing indicators, server-side input validation and a responsive light and dark UI.

## License

MIT
