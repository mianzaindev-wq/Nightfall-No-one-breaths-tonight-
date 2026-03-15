// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — Network Module (WebSocket)
// ═══════════════════════════════════════════════════════════════

class Network {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.status = 'disconnected'; // disconnected | connecting | connected
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.playerId = null;
    this.roomCode = null;
    this._url = null;
  }

  // Register a handler for a message type
  on(type, fn) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(fn);
  }

  // Emit to local handlers
  _emit(type, data) {
    (this.handlers[type] || []).forEach(fn => fn(data));
  }

  // Connect to WebSocket server
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this._url = `${proto}://${location.host}`;
    this.status = 'connecting';
    this._emit('status', this.status);

    try {
      this.ws = new WebSocket(this._url);
    } catch (e) {
      this.status = 'disconnected';
      this._emit('status', this.status);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.status = 'connected';
      this.reconnectAttempts = 0;
      this._emit('status', this.status);

      // If we were in a room, try to rejoin
      if (this.roomCode && this.playerId) {
        this.send({ t: 'JOIN', code: this.roomCode, playerId: this.playerId, name: this._name || '' });
      }
    };

    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this._emit(msg.t, msg);
    };

    this.ws.onclose = () => {
      this.status = 'disconnected';
      this._emit('status', this.status);
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // Create a room
  createRoom(playerId, name) {
    this.playerId = playerId;
    this._name = name;
    this.send({ t: 'CREATE', playerId, name });
  }

  // Join a room
  joinRoom(playerId, name, code) {
    this.playerId = playerId;
    this._name = name;
    this.roomCode = code;
    this.send({ t: 'JOIN', code, playerId, name });
  }

  // Relay a message to others in the room (or to a specific player)
  relay(data, toPlayerId = null) {
    const msg = { t: 'RELAY', data };
    if (toPlayerId) msg.to = toPlayerId;
    this.send(msg);
  }

  // Request player list
  getPlayers() {
    this.send({ t: 'GET_PLAYERS' });
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
    if (this.ws) {
      this.send({ t: 'LEAVE' });
      this.ws.close();
    }
  }
}

export default Network;
