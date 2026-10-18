# Architecture

## Overview

```
Browser A ──┐                       ┌── Browser B
 (canvas +  │   WebSocket (Socket.IO) │   (canvas +
  chat UI)  ├──────► Node server ◄────┤    chat UI)
            │        Express + rooms  │
Browser C ──┘                       └── Browser D
```

The server is the single source of truth for each room. It keeps the ordered list of drawing objects ("strokes") and the recent chat messages in memory. Clients render from that list.

## Drawing flow

1. **Pen and eraser**: the client sends `draw:begin`, then batches of points with `draw:points` about every 30 ms, then `draw:end`. The server stores the stroke and relays each message to the other people in the room, who draw the new segment immediately.
2. **Shapes and text**: the client shows a local preview while dragging, then sends one `shape:add` when the mouse is released.
3. **Late joiners**: `room:join` returns every stroke and recent chat message, and the client replays them.

## Undo and redo

The server removes the last stroke created by the requesting user and broadcasts `stroke:remove`. The removed stroke is kept on that user's redo stack. `redo` puts it back and broadcasts `stroke:add`. Drawing anything new clears that user's redo stack.

## Rendering

Each stroke has a `tool`. `board.js` renders every tool from the same data, both for live drawing and for full redraws. The eraser uses the canvas `destination-out` composite mode, so replaying strokes in order always gives the same picture.

## Validation and safety

`server/socket.js` checks every incoming event: allowed tools only, colours must be `#rrggbb`, sizes and coordinates are range checked, point counts and text length are capped, and chat is rate limited. Chat and names are rendered with `textContent`, never `innerHTML`.

## Room lifecycle

A room is created on first join. When the last person leaves, a 10-minute timer starts. If nobody returns, the room is deleted from memory.
