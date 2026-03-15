// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — Game State Machine
// ═══════════════════════════════════════════════════════════════

import { assignRoles, getRoleInfo } from './roles.js';
import audio from './audio.js';
import chat from './chat.js';
import * as ui from './ui.js';

export default class Game {
  constructor(network, canvasCtrl) {
    this.net = network;
    this.canvasCtrl = canvasCtrl;

    // Identity
    this.myId = 'P' + Math.random().toString(36).slice(2, 9);
    this.myName = '';
    this.myAvatar = '🧙';
    this.isHost = false;

    // Room
    this.lobbyCode = '';
    this.players = []; // [{id, name, avatar, alive, role, disconnected}]

    // State
    this.phase = 'lobby'; // lobby | role | night | day | verdict | over
    this.round = 0;
    this.myRole = null;
    this.settings = { dayTime: 60, nightTime: 45, detTime: 30, doctor: false, jester: false, hideVotes: true };

    // Night
    this.nightActions = {}; // killerId -> targetId
    this.doctorTarget = null;
    this.clue = null;
    this.detDone = false;

    // Day
    this.killedId = null;
    this.savedId = null;
    this.votes = {};
    this.selVote = null;
    this.voted = false;
    this.readySet = new Set();
    this.jesterWinner = null;

    // Timers
    this.dayInterval = null;
    this.nightTimeout = null;
    this.lastWordsTimeout = null;
    this.lastDoctorSelf = false; // did doctor protect self last night?

    // Stats
    this.stats = JSON.parse(localStorage.getItem('nf_stats') || '{"games":0,"wins":0}');

    this._setupNetHandlers();
  }

  // ── Network Handlers ───────────────────────────────────────
  _setupNetHandlers() {
    const n = this.net;

    n.on('CREATED', d => {
      this.lobbyCode = d.code;
      this.isHost = true;
      this.players = [{ id: this.myId, name: this.myName, avatar: this.myAvatar, alive: true, role: null, disconnected: false, isHost: true }];
      this._showLobby();
    });

    n.on('JOINED', d => {
      this.lobbyCode = d.code;
      this.isHost = (d.hostId === this.myId);
      n.roomCode = d.code;
      n.getPlayers();
      this._showLobby();
    });

    n.on('JOIN_FAIL', d => {
      ui.toast(d.reason || 'Failed to join', true);
    });

    n.on('RECONNECTED', d => {
      this.lobbyCode = d.code;
      this.isHost = (d.hostId === this.myId);
      n.roomCode = d.code;
      ui.toast('Reconnected!');
      n.getPlayers();
    });

    n.on('PLAYER_LIST', d => {
      this.players = d.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar || '👤',
        alive: p.alive !== undefined ? p.alive : true,
        role: p.role || null,
        disconnected: !p.connected,
        isHost: p.id === d.hostId
      }));
      this.isHost = d.hostId === this.myId;
      this._renderLobby();
    });

    n.on('PLAYER_JOINED', d => {
      if (!this.players.find(p => p.id === d.playerId)) {
        this.players.push({ id: d.playerId, name: d.name, avatar: '👤', alive: true, role: null, disconnected: false });
      }
      this._renderLobby();
      ui.toast(`${d.name} joined`);
    });

    n.on('PLAYER_LEFT', d => {
      this.players = this.players.filter(p => p.id !== d.playerId);
      this._renderLobby();
      ui.toast(`${d.name} left`);
    });

    n.on('PLAYER_DISCONNECTED', d => {
      const p = this.players.find(x => x.id === d.playerId);
      if (p) p.disconnected = true;
      this._renderLobby();
    });

    n.on('PLAYER_RECONNECTED', d => {
      const p = this.players.find(x => x.id === d.playerId);
      if (p) p.disconnected = false;
      this._renderLobby();
    });

    n.on('HOST_CHANGED', d => {
      this.isHost = (d.newHostId === this.myId);
      this.players.forEach(p => p.isHost = (p.id === d.newHostId));
      this._renderLobby();
      ui.toast(`${d.name} is the new host`);
    });

    // ── Game Messages (relayed) ──
    // Player list update from host
    n.on('PL', d => {
      d.pl.forEach(u => {
        let p = this.players.find(x => x.id === u.id);
        if (p) { Object.assign(p, u); }
        else { this.players.push({ ...u, disconnected: false }); }
      });
      this._renderLobby();
    });

    // Game start — role assignment (anti-cheat: each player gets only their role)
    n.on('ROLE', d => {
      this.round = d.round || 1;
      this.phase = 'role';
      this.myRole = d.role;
      // Update player list with public info
      d.publicPlayers.forEach(u => {
        let p = this.players.find(x => x.id === u.id);
        if (p) { p.alive = true; p.avatar = u.avatar || p.avatar; }
      });
      const me = this.players.find(p => p.id === this.myId);
      if (me) me.role = d.role;
      this.settings = d.settings || this.settings;
      this._showRole(d.allies || []);
    });

    // Night begins
    n.on('NIGHT', d => {
      this.phase = 'night';
      this.round = d.round;
      this._showNight(d.dur);
    });

    // Night resolved — day begins
    n.on('DAY', d => {
      this._onDay(d);
    });

    // Vote update
    n.on('VOTE_UPDATE', d => {
      this.votes = d.votes || {};
      this._renderVotes();
    });

    // Verdict
    n.on('VERDICT', d => {
      this._onVerdict(d);
    });

    // Game over
    n.on('GAMEOVER', d => {
      this._onGameOver(d);
    });

    // Player ready
    n.on('READY', d => {
      if (this.isHost) {
        this.readySet.add(d._from);
        this._checkReady();
      }
    });

    // Kill action from killer
    n.on('KILL_ACTION', d => {
      if (this.isHost) {
        this.nightActions[d._from] = d.targetId;
        this._checkNightDone();
      }
    });

    // Detective clue
    n.on('DET_CLUE', d => {
      if (this.isHost) {
        this.clue = d.clue;
        this.detDone = true;
      }
    });

    // Doctor protect
    n.on('DOC_PROTECT', d => {
      if (this.isHost) {
        this.doctorTarget = d.targetId;
      }
    });

    // Vote from player
    n.on('VOTE', d => {
      if (this.isHost) {
        this.votes[d._from] = d.targetId;
        // Broadcast updated votes (hidden or shown)
        this.net.relay({ t: 'VOTE_UPDATE', votes: this.votes });
        this._checkVoteDone();
      }
    });

    // Chat message
    n.on('CHAT', d => {
      chat.addMessage(d.name, d.text, d.chatType || 'normal');
      audio.play('chat');
    });

    // Last words
    n.on('LAST_WORDS', d => {
      chat.addMessage(d.name, d.text, 'last-words');
    });

    // Kick
    n.on('KICKED', d => {
      if (d.targetId === this.myId) {
        ui.toast('You were kicked from the lobby', true);
        ui.show('s-land');
        this.phase = 'lobby';
        this.players = [];
      }
    });

    // Settings update from host
    n.on('SETTINGS', d => {
      this.settings = d.settings;
    });
  }

  // ── Create Lobby ───────────────────────────────────────────
  createLobby(name, avatar) {
    this.myName = name;
    this.myAvatar = avatar;
    this.net.createRoom(this.myId, name);
  }

  // ── Join Lobby ─────────────────────────────────────────────
  joinLobby(name, avatar, code) {
    this.myName = name;
    this.myAvatar = avatar;
    this.net.joinRoom(this.myId, name, code);
  }

  // ── Show Lobby ─────────────────────────────────────────────
  _showLobby() {
    ui.show('s-lobby');
    document.getElementById('lCode').textContent = this.lobbyCode;
    this._renderLobby();
  }

  _renderLobby() {
    if (this.phase !== 'lobby') return;
    ui.renderLobby(this.players, this.myId, this.isHost, (kickId) => this.kickPlayer(kickId));
  }

  // ── Kick Player ────────────────────────────────────────────
  kickPlayer(playerId) {
    if (!this.isHost) return;
    this.net.relay({ t: 'KICKED', targetId: playerId });
    this.players = this.players.filter(p => p.id !== playerId);
    this._renderLobby();
  }

  // ── Host Start ─────────────────────────────────────────────
  hostStart() {
    if (!this.isHost || this.players.length < 4) return;
    const roleMap = assignRoles(this.players, this.settings);
    roleMap.forEach(r => {
      const p = this.players.find(x => x.id === r.id);
      if (p) { p.role = r.role; p.alive = true; }
    });

    this.phase = 'role';
    this.round = 1;
    this.readySet = new Set();
    this.jesterWinner = null;

    const killerIds = this.players.filter(p => p.role === 'killer').map(p => p.id);
    const publicPlayers = this.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));

    // Send each player ONLY their own role (anti-cheat)
    this.players.forEach(p => {
      const allies = (p.role === 'killer')
        ? this.players.filter(x => x.role === 'killer' && x.id !== p.id).map(x => x.name)
        : [];

      if (p.id === this.myId) {
        // Local host
        this.myRole = p.role;
        this._showRole(allies);
      } else {
        this.net.relay({
          t: 'ROLE',
          role: p.role,
          allies,
          publicPlayers,
          round: this.round,
          settings: this.settings
        }, p.id);
      }
    });
  }

  // ── Role Screen ────────────────────────────────────────────
  _showRole(allies) {
    ui.show('s-role');
    ui.renderRole(this.myRole, allies);
    audio.play(this.myRole === 'killer' ? 'bad' : 'good');
    ui.hideRoleReminder();
  }

  pressReady() {
    document.getElementById('readyBtn').disabled = true;
    document.getElementById('readyBtn').textContent = 'Waiting...';
    if (this.isHost) {
      this.readySet.add(this.myId);
      this._checkReady();
    } else {
      this.net.relay({ t: 'READY' });
    }
  }

  _checkReady() {
    if (this.readySet.size >= this.players.filter(p => !p.disconnected).length) {
      this._beginNight();
    }
  }

  // ── Night ──────────────────────────────────────────────────
  _beginNight() {
    if (!this.isHost) return;
    this.phase = 'night';
    this.nightActions = {};
    this.doctorTarget = null;
    this.detDone = false;
    this.clue = null;
    this.readySet = new Set();
    this.savedId = null;

    const dur = this.settings.nightTime * 1000;
    this.net.relay({ t: 'NIGHT', round: this.round, dur });
    this._showNight(dur);

    clearTimeout(this.nightTimeout);
    this.nightTimeout = setTimeout(() => {
      if (this.phase === 'night') this._resolveNight();
    }, dur);
  }

  _showNight(dur) {
    this.phase = 'night';
    if (this.canvasCtrl) this.canvasCtrl.setNightPulse(1);

    const ov = document.getElementById('nightOv');
    ov.classList.add('on');
    document.getElementById('nBig').textContent = `NIGHT ${this.round}`;
    document.getElementById('nSm').textContent = 'DARKNESS SWALLOWS THE TOWN';
    audio.play('night');
    const killerCount = this.players.filter(p => p.role === 'killer' && p.alive).length;
    setTimeout(() => audio.play('kill', Math.max(1, killerCount)), 3000);

    const me = this.players.find(p => p.id === this.myId);
    const alive = this.players.filter(p => p.alive && p.id !== this.myId);

    if (!me || !me.alive) {
      ui.renderNightCivilianUI();
      return;
    }

    if (this.myRole === 'killer') {
      const kl = ui.renderNightKillerUI(alive);
      if (kl) {
        kl.onclick = (e) => {
          const btn = e.target.closest('.bplayer');
          if (!btn || btn.disabled) return;
          kl.querySelectorAll('.bplayer').forEach(b => { b.disabled = true; b.style.opacity = b === btn ? '1' : '.25'; });
          document.getElementById('kCfm').style.display = 'block';
          const tid = btn.dataset.pid;
          if (this.isHost) { this.nightActions[this.myId] = tid; this._checkNightDone(); }
          else this.net.relay({ t: 'KILL_ACTION', targetId: tid });
          audio.haptic([100]);
        };
      }
    } else if (this.myRole === 'detective') {
      const detTime = this.settings.detTime || 30;
      const dl = ui.renderNightDetectiveUI(alive, detTime);
      let tl = detTime;
      const tk = setInterval(() => {
        tl--;
        ui.updateTimer('dtmr', tl);
        if (tl <= 0) { clearInterval(tk); this._submitDetClue('No investigation was completed.'); }
      }, 1000);

      if (dl) {
        dl.onclick = (e) => {
          const btn = e.target.closest('.bdet');
          if (!btn || btn.disabled) return;
          clearInterval(tk);
          dl.querySelectorAll('.bdet').forEach(b => b.disabled = true);
          const tid = btn.dataset.pid;
          const target = this.players.find(p => p.id === tid);
          const isKiller = target?.role === 'killer';
          const clue = isKiller
            ? `Suspicious evidence links <strong>${ui.esc(target.name)}</strong> to recent events. They may be the killer.`
            : `<strong>${ui.esc(target.name)}</strong> appears to have an alibi. Likely innocent.`;
          this._submitDetClue(clue);
          const r = document.getElementById('dRes');
          if (r) { r.innerHTML = clue; r.style.display = 'block'; }
        };
      }
    } else if (this.myRole === 'doctor') {
      const canProtectSelf = !this.lastDoctorSelf;
      const targets = this.players.filter(p => p.alive).map(p => ({
        ...p,
        isSelf: p.id === this.myId
      }));
      const filtered = canProtectSelf ? targets : targets;
      const dl = ui.renderNightDoctorUI(filtered, !canProtectSelf);
      if (dl) {
        dl.onclick = (e) => {
          const btn = e.target.closest('.bdet');
          if (!btn || btn.disabled) return;
          dl.querySelectorAll('.bdet').forEach(b => { b.disabled = true; b.style.opacity = b === btn ? '1' : '.25'; });
          document.getElementById('docCfm').style.display = 'block';
          const tid = btn.dataset.pid;
          this.lastDoctorSelf = (tid === this.myId);
          if (this.isHost) { this.doctorTarget = tid; }
          else this.net.relay({ t: 'DOC_PROTECT', targetId: tid });
          audio.haptic([50]);
        };
      }
    } else {
      ui.renderNightCivilianUI();
    }
  }

  _submitDetClue(clue) {
    if (this.isHost) { this.clue = clue; this.detDone = true; }
    else this.net.relay({ t: 'DET_CLUE', clue });
  }

  _checkNightDone() {
    const killers = this.players.filter(p => p.alive && p.role === 'killer');
    if (killers.every(k => this.nightActions[k.id])) {
      clearTimeout(this.nightTimeout);
      this._resolveNight();
    }
  }

  // ── Resolve Night ──────────────────────────────────────────
  _resolveNight() {
    if (!this.isHost) return;

    const vs = Object.values(this.nightActions);
    let killedId = null;
    let savedId = null;

    if (vs.length) {
      const freq = {};
      vs.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      const vic = this.players.find(p => p.id === top);

      if (vic && vic.alive) {
        // Check doctor protection
        if (this.doctorTarget === top) {
          savedId = top;
          // Player survives
        } else {
          vic.alive = false;
          killedId = top;
        }
      }
    }

    this.round++;
    this.killedId = killedId;
    this.savedId = savedId;

    const payload = {
      t: 'DAY',
      round: this.round,
      killedId,
      savedId,
      clue: this.clue,
      pa: this.players.map(p => ({ id: p.id, alive: p.alive }))
    };
    this.net.relay(payload);
    this._onDay(payload);
  }

  // ── Day ────────────────────────────────────────────────────
  _onDay(d) {
    d.pa.forEach(u => {
      const p = this.players.find(x => x.id === u.id);
      if (p) p.alive = u.alive;
    });

    this.phase = 'day';
    this.killedId = d.killedId;
    this.savedId = d.savedId;
    this.clue = d.clue;
    this.votes = {};
    this.selVote = null;
    this.voted = false;

    if (this.canvasCtrl) this.canvasCtrl.setNightPulse(0);
    document.getElementById('nightOv').classList.remove('on');
    ui.show('s-day');
    audio.play('day');

    // Death announcement
    ui.hideDeathAnnounce();
    ui.hideDoctorSave();
    if (d.killedId) {
      const v = this.players.find(p => p.id === d.killedId);
      ui.showDeathAnnounce(v?.name || 'Unknown');
      ui.addLog(`Night ${this.round - 1}: ${v?.name || 'Someone'} was murdered.`, 'lk');
    } else if (d.savedId) {
      const sv = this.players.find(p => p.id === d.savedId);
      ui.showDoctorSave(sv?.name || 'Someone');
      ui.addLog(`Night ${this.round - 1}: Someone was attacked but was saved by the Doctor!`, 'lc');
      audio.play('save');
    } else {
      ui.addLog(`Night ${this.round - 1}: No one died.`, 'ls');
    }

    // Clue
    if (d.clue) ui.showClue(d.clue); else ui.hideClue();

    // Chips
    const al = this.players.filter(p => p.alive).length;
    ui.renderDayHeader(this.round - 1, al, this.players.length);

    // Role reminder
    ui.showRoleReminder(this.myRole);

    // Votes
    this._renderVotes();

    // Dead state
    const me = this.players.find(p => p.id === this.myId);
    const isDead = me && !me.alive;
    document.getElementById('deadMsg').style.display = isDead ? 'block' : 'none';
    document.getElementById('cvBtn').style.display = 'none';

    // Last words for just-killed player
    const lwPanel = document.getElementById('lastWordsPanel');
    if (d.killedId === this.myId && lwPanel) {
      lwPanel.style.display = 'block';
      let lwTime = 10;
      ui.updateTimer('lwTimer', lwTime);
      clearTimeout(this.lastWordsTimeout);
      const lwIv = setInterval(() => {
        lwTime--;
        ui.updateTimer('lwTimer', lwTime);
        if (lwTime <= 0) { clearInterval(lwIv); lwPanel.style.display = 'none'; }
      }, 1000);
      this.lastWordsTimeout = setTimeout(() => { clearInterval(lwIv); lwPanel.style.display = 'none'; }, 10000);
    } else if (lwPanel) {
      lwPanel.style.display = 'none';
    }

    // Chat
    chat.setEnabled(!isDead || false); // dead can observe
    if (isDead) {
      chat.addMessage('', 'You are dead. You can watch but not speak.', 'system');
      chat.setEnabled(false);
    }

    // Day timer
    let tl = this.settings.dayTime || 60;
    ui.updateTimer('dTimer', tl);
    document.getElementById('dTimer').classList.remove('urg');

    clearInterval(this.dayInterval);
    this.dayInterval = setInterval(() => {
      tl--;
      ui.updateTimer('dTimer', tl);
      if (tl <= 0) {
        clearInterval(this.dayInterval);
        if (this.isHost) this._closeVote();
      }
    }, 1000);
  }

  _renderVotes() {
    const me = this.players.find(p => p.id === this.myId);
    const isDead = me && !me.alive;
    const c = ui.renderVotes(this.players, this.myId, this.votes, this.selVote, this.voted, isDead, this.settings.hideVotes);
    if (c) {
      c.onclick = (e) => {
        const btn = e.target.closest('.bplayer');
        if (!btn || btn.disabled) return;
        this._pickVote(btn.dataset.pid);
      };
    }
  }

  _pickVote(id) {
    if (this.voted) return;
    this.selVote = id;
    audio.play('vote');
    this._renderVotes();
    document.getElementById('cvBtn').style.display = 'flex';
    const p = this.players.find(x => x.id === id);
    document.getElementById('vStatus').textContent = 'Selected: ' + (p?.name || '');
  }

  confirmVote() {
    if (!this.selVote || this.voted) return;
    this.voted = true;
    document.getElementById('cvBtn').style.display = 'none';
    document.getElementById('vStatus').textContent = '✓ Vote cast';

    if (this.isHost) {
      this.votes[this.myId] = this.selVote;
      this.net.relay({ t: 'VOTE_UPDATE', votes: this.votes });
      this._checkVoteDone();
    } else {
      this.net.relay({ t: 'VOTE', targetId: this.selVote });
    }
    audio.haptic([40]);
  }

  _checkVoteDone() {
    const aliveCount = this.players.filter(p => p.alive).length;
    if (Object.keys(this.votes).length >= aliveCount) {
      clearInterval(this.dayInterval);
      this._closeVote();
    }
  }

  _closeVote() {
    if (!this.isHost) return;

    const tally = {};
    Object.values(this.votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    let exId = null;
    if (sorted.length && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) {
      exId = sorted[0][0];
    }

    let isJester = false;
    if (exId) {
      const p = this.players.find(x => x.id === exId);
      if (p) {
        if (p.role === 'jester') {
          isJester = true;
          this.jesterWinner = p.name;
        }
        p.alive = false;
      }
    }

    // Check win condition
    const w = this._checkWin();
    if (w) {
      const payload = {
        t: 'GAMEOVER',
        winner: w,
        players: this.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: p.alive, role: p.role })),
        tally, exId, isJester,
        jesterWinner: this.jesterWinner
      };
      this.net.relay(payload);
      this._onGameOver(payload);
    } else {
      const payload = {
        t: 'VERDICT',
        tally, exId, isJester,
        pa: this.players.map(p => ({ id: p.id, alive: p.alive, role: p.role })),
        jesterWinner: this.jesterWinner
      };
      this.net.relay(payload);
      this._onVerdict(payload);
    }
  }

  _checkWin() {
    const ak = this.players.filter(p => p.alive && p.role === 'killer');
    const ac = this.players.filter(p => p.alive && p.role !== 'killer' && p.role !== 'jester');
    const aj = this.players.filter(p => p.alive && p.role === 'jester');
    if (!ak.length) return 'civilians';
    if (ak.length >= ac.length + aj.length) return 'killers';
    return null;
  }

  // ── Verdict ────────────────────────────────────────────────
  _onVerdict(d) {
    d.pa.forEach(u => {
      const p = this.players.find(x => x.id === u.id);
      if (p) { p.alive = u.alive; p.role = u.role || p.role; }
    });

    this.phase = 'verdict';
    ui.show('s-verdict');
    ui.hideRoleReminder();

    const ex = d.exId ? this.players.find(p => p.id === d.exId) : null;
    ui.renderVerdict(ex, d.isJester);

    if (ex) {
      const isK = ex.role === 'killer';
      ui.addLog(`${ex.name} executed — ${d.isJester ? 'the Jester! They win!' : isK ? 'a killer!' : 'innocent.'}`, 'lv');
      audio.play(d.isJester ? 'jester' : isK ? 'bad' : 'good');
    }

    ui.renderVoteBars(d.tally, this.players);

    let vc = 6;
    document.getElementById('vcT').textContent = vc;
    const t = setInterval(() => {
      vc--;
      document.getElementById('vcT').textContent = vc;
      if (vc <= 0) {
        clearInterval(t);
        if (this.isHost) this._beginNight();
      }
    }, 1000);
  }

  // ── Game Over ──────────────────────────────────────────────
  _onGameOver(d) {
    clearInterval(this.dayInterval);
    clearTimeout(this.nightTimeout);
    document.getElementById('nightOv').classList.remove('on');

    // Update players with final data
    if (d.players) {
      this.players = d.players;
    }

    this.phase = 'over';
    ui.show('s-over');
    ui.hideRoleReminder();
    if (this.canvasCtrl) this.canvasCtrl.setNightPulse(0);

    const kw = d.winner === 'killers';
    ui.renderGameOver(d.winner, this.players, d.jesterWinner);
    audio.play(kw ? 'bad' : 'good');

    // Stats
    const me = this.players.find(p => p.id === this.myId);
    this.stats.games++;
    if (me) {
      if (me.role === 'jester' && d.jesterWinner === me.name) this.stats.wins++;
      else if (me.role === 'killer' && kw) this.stats.wins++;
      else if (me.role !== 'killer' && me.role !== 'jester' && !kw) this.stats.wins++;
    }
    localStorage.setItem('nf_stats', JSON.stringify(this.stats));
    ui.renderStats(this.stats);
  }

  // ── Back to Lobby ──────────────────────────────────────────
  backToLobby() {
    this.phase = 'lobby';
    this.players.forEach(p => { p.role = null; p.alive = true; });
    this.myRole = null;
    this.selVote = null;
    this.voted = false;
    this.jesterWinner = null;
    this.lastDoctorSelf = false;
    chat.clear();
    ui.clearLog();
    this._showLobby();
    if (this.isHost) {
      this.net.relay({ t: 'PL', pl: this.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: true })) });
    }
  }

  // ── Send Chat ──────────────────────────────────────────────
  sendChat(text) {
    if (!text.trim()) return;
    const me = this.players.find(p => p.id === this.myId);
    if (me && !me.alive) return; // dead can't chat
    chat.addMessage(this.myName, text, 'normal');
    this.net.relay({ t: 'CHAT', name: this.myName, text, chatType: 'normal' });
  }

  // ── Send Last Words ────────────────────────────────────────
  sendLastWords(text) {
    if (!text.trim()) return;
    chat.addMessage(this.myName, text, 'last-words');
    this.net.relay({ t: 'LAST_WORDS', name: this.myName, text });
    document.getElementById('lastWordsPanel').style.display = 'none';
    clearTimeout(this.lastWordsTimeout);
  }

  // ── Update Settings ────────────────────────────────────────
  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    if (this.isHost) {
      this.net.relay({ t: 'SETTINGS', settings: this.settings });
    }
  }

  getStats() { return this.stats; }
}
