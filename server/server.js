// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — WebSocket Relay Server
// Handles room management, message relay, and disconnection.
// No game logic lives here — the host client manages game state.
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Room Management ──────────────────────────────────────────
const rooms = new Map(); // code -> { players: Map<id, {ws, name, disconnectedAt}>, hostId }
const RECONNECT_GRACE_MS = 15000;
const CODE_LENGTH = 6;

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genCode() : code;
}

function broadcast(room, msg, excludeId = null) {
  const data = JSON.stringify(msg);
  for (const [id, player] of room.players) {
    if (id !== excludeId && player.ws && player.ws.readyState === 1) {
      try { player.ws.send(data); } catch (e) { /* ignore */ }
    }
  }
}

function sendTo(ws, msg) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* ignore */ }
  }
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  const allDisconnected = [...room.players.values()].every(p => !p.ws || p.ws.readyState !== 1);
  if (allDisconnected) {
    rooms.delete(code);
    console.log(`[Room ${code}] Cleaned up (all disconnected)`);
  }
}

// ── WebSocket Connection ─────────────────────────────────────
wss.on('connection', (ws) => {
  let playerId = null;
  let roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.t) {
      // ── Create Room ──
      case 'CREATE': {
        const code = genCode();
        playerId = msg.playerId;
        roomCode = code;
        const room = { players: new Map(), hostId: playerId };
        room.players.set(playerId, { ws, name: msg.name, disconnectedAt: null });
        rooms.set(code, room);
        sendTo(ws, { t: 'CREATED', code, playerId });
        console.log(`[Room ${code}] Created by ${msg.name} (${playerId})`);
        break;
      }

      // ── Join Room ──
      case 'JOIN': {
        const code = msg.code?.toUpperCase();
        const room = rooms.get(code);
        if (!room) { sendTo(ws, { t: 'JOIN_FAIL', reason: 'Room not found' }); return; }
        if (room.players.size >= 16) { sendTo(ws, { t: 'JOIN_FAIL', reason: 'Room is full' }); return; }

        // Check for reconnection
        const existing = room.players.get(msg.playerId);
        if (existing && existing.disconnectedAt) {
          // Reconnecting
          existing.ws = ws;
          existing.disconnectedAt = null;
          playerId = msg.playerId;
          roomCode = code;
          sendTo(ws, { t: 'RECONNECTED', code, playerId, hostId: room.hostId });
          broadcast(room, { t: 'PLAYER_RECONNECTED', playerId, name: existing.name });
          console.log(`[Room ${code}] ${existing.name} reconnected`);
          return;
        }

        // Check name collision
        for (const [, p] of room.players) {
          if (p.name === msg.name) { sendTo(ws, { t: 'JOIN_FAIL', reason: 'Name already taken' }); return; }
        }

        playerId = msg.playerId;
        roomCode = code;
        room.players.set(playerId, { ws, name: msg.name, disconnectedAt: null });
        sendTo(ws, { t: 'JOINED', code, playerId, hostId: room.hostId });
        broadcast(room, { t: 'PLAYER_JOINED', playerId, name: msg.name }, playerId);
        console.log(`[Room ${code}] ${msg.name} joined (${room.players.size} players)`);
        break;
      }

      // ── Relay — forward to all others in room ──
      case 'RELAY': {
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const relayMsg = { ...msg.data, _from: playerId };
        if (msg.to) {
          // Targeted relay to specific player
          const target = room.players.get(msg.to);
          if (target && target.ws) sendTo(target.ws, relayMsg);
        } else {
          // Broadcast to all others
          broadcast(room, relayMsg, playerId);
        }
        break;
      }

      // ── Get room player list ──
      case 'GET_PLAYERS': {
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const list = [];
        for (const [id, p] of room.players) {
          list.push({ id, name: p.name, connected: !p.disconnectedAt });
        }
        sendTo(ws, { t: 'PLAYER_LIST', players: list, hostId: room.hostId });
        break;
      }

      // ── Leave ──
      case 'LEAVE': {
        handleDisconnect();
        break;
      }
    }
  });

  ws.on('close', handleDisconnect);
  ws.on('error', () => handleDisconnect());

  function handleDisconnect() {
    if (!roomCode || !playerId) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    player.disconnectedAt = Date.now();
    player.ws = null;
    broadcast(room, { t: 'PLAYER_DISCONNECTED', playerId, name: player.name });
    console.log(`[Room ${roomCode}] ${player.name} disconnected (grace period ${RECONNECT_GRACE_MS / 1000}s)`);

    // Host migration if host disconnected
    if (playerId === room.hostId) {
      setTimeout(() => {
        const p = room.players.get(playerId);
        if (p && p.disconnectedAt) {
          // Host didn't reconnect — pick a new host
          for (const [id, pl] of room.players) {
            if (!pl.disconnectedAt && pl.ws && pl.ws.readyState === 1) {
              room.hostId = id;
              broadcast(room, { t: 'HOST_CHANGED', newHostId: id, name: pl.name });
              console.log(`[Room ${roomCode}] Host migrated to ${pl.name}`);
              break;
            }
          }
        }
      }, RECONNECT_GRACE_MS);
    }

    // Cleanup after grace period
    setTimeout(() => {
      const p = room.players.get(playerId);
      if (p && p.disconnectedAt) {
        room.players.delete(playerId);
        broadcast(room, { t: 'PLAYER_LEFT', playerId, name: player.name });
        cleanupRoom(roomCode);
      }
    }, RECONNECT_GRACE_MS);

    // Reset local state so duplicate disconnects don't fire
    const savedRoom = roomCode;
    const savedId = playerId;
    roomCode = null;
    playerId = null;
  }
});

// ── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n  🗡  NIGHTFALL Server running on http://localhost:${PORT}\n`);
});
