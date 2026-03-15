// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — Game State Machine
// Full persona anonymity + character traits + QTE integration
// ═══════════════════════════════════════════════════════════════

import { assignRoles, getRoleInfo } from './roles.js';
import { assignCharacters, getPublicDesc, getHiddenDesc, serializeForPlayer } from './avatar.js';
import { generateKillClue, generateInvestClue, runQTE, getKillDifficulty, getInvestigateDifficulty } from './qte.js';
import audio from './audio.js';
import chat from './chat.js';
import * as ui from './ui.js';

export default class Game {
  constructor(network, canvasCtrl) {
    this.net = network;
    this.canvasCtrl = canvasCtrl;

    this.myId = 'P' + Math.random().toString(36).slice(2, 9);
    this.myName = '';
    this.myAvatar = '🧙';
    this.isHost = false;

    this.lobbyCode = '';
    this.players = [];

    this.phase = 'lobby';
    this.round = 0;
    this.myRole = null;
    this.settings = { dayTime: 60, nightTime: 45, detTime: 30, doctor: false, jester: false, hideVotes: true };

    // Characters & Personas
    this.charData = {};         // { [playerId]: { persona:{name,icon}, pub:{...}, hidden:{...}(own only) } }
    this.myPersona = null;
    this.myCharacter = null;

    // Night
    this.nightActions = {};
    this.doctorTarget = null;
    this.killClues = [];
    this.investigationClues = [];
    this.killedId = null;
    this.savedId = null;
    this.killCounts = {};

    // Day
    this.votes = {};
    this.selVote = null;
    this.voted = false;
    this.readySet = new Set();
    this.jesterWinner = null;

    // Timers
    this.dayInterval = null;
    this.nightTimeout = null;
    this.lastWordsTimeout = null;
    this.lastDoctorSelf = false;

    // Host-only full data
    this._hostCharacters = null;
    this._hostPersonas = null;

    this.stats = JSON.parse(localStorage.getItem('nf_stats') || '{"games":0,"wins":0}');
    this._setupNetHandlers();
  }

  // ── Helper: get persona display name for a player ──────────
  _pname(playerId) {
    const d = this.charData[playerId];
    return d ? `${d.persona.icon} ${d.persona.name}` : '???';
  }

  // ── Network Handlers ───────────────────────────────────────
  _setupNetHandlers() {
    const n = this.net;

    n.on('CREATED', d => {
      this.lobbyCode = d.code; this.isHost = true;
      this.players = [{ id: this.myId, name: this.myName, avatar: this.myAvatar, alive: true, role: null, disconnected: false, isHost: true }];
      this._showLobby();
    });

    n.on('JOINED', d => {
      this.lobbyCode = d.code; this.isHost = (d.hostId === this.myId);
      n.roomCode = d.code; n.getPlayers(); this._showLobby();
    });

    n.on('JOIN_FAIL', d => ui.toast(d.reason || 'Failed to join', true));

    n.on('RECONNECTED', d => {
      this.lobbyCode = d.code; this.isHost = (d.hostId === this.myId);
      n.roomCode = d.code; ui.toast('Reconnected!'); n.getPlayers();
    });

    n.on('PLAYER_LIST', d => {
      this.players = d.players.map(p => ({
        id: p.id, name: p.name, avatar: p.avatar || '👤',
        alive: p.alive !== undefined ? p.alive : true,
        role: p.role || null, disconnected: !p.connected,
        isHost: p.id === d.hostId
      }));
      this.isHost = d.hostId === this.myId;
      this._renderLobby();
    });

    n.on('PLAYER_JOINED', d => {
      if (!this.players.find(p => p.id === d.playerId)) {
        this.players.push({ id: d.playerId, name: d.name, avatar: '👤', alive: true, role: null, disconnected: false });
      }
      this._renderLobby(); ui.toast(`${d.name} joined`);
    });

    n.on('PLAYER_LEFT', d => { this.players = this.players.filter(p => p.id !== d.playerId); this._renderLobby(); ui.toast(`${d.name} left`); });
    n.on('PLAYER_DISCONNECTED', d => { const p = this.players.find(x => x.id === d.playerId); if (p) p.disconnected = true; this._renderLobby(); });
    n.on('PLAYER_RECONNECTED', d => { const p = this.players.find(x => x.id === d.playerId); if (p) p.disconnected = false; this._renderLobby(); });
    n.on('HOST_CHANGED', d => { this.isHost = (d.newHostId === this.myId); this.players.forEach(p => p.isHost = p.id === d.newHostId); this._renderLobby(); ui.toast(`${d.name} is the new host`); });

    n.on('PL', d => { d.pl.forEach(u => { let p = this.players.find(x => x.id === u.id); if (p) Object.assign(p, u); else this.players.push({ ...u, disconnected: false }); }); this._renderLobby(); });

    // Role + character assignment
    n.on('ROLE', d => {
      this.round = d.round || 1;
      this.phase = 'role';
      this.myRole = d.role;
      this.charData = d.charData || {};
      this.myPersona = this.charData[this.myId]?.persona;
      this.myCharacter = { pub: this.charData[this.myId]?.pub, hidden: this.charData[this.myId]?.hidden };
      d.publicPlayers.forEach(u => { let p = this.players.find(x => x.id === u.id); if (p) p.alive = true; });
      const me = this.players.find(p => p.id === this.myId);
      if (me) me.role = d.role;
      this.settings = d.settings || this.settings;
      this.killCounts = {};
      this._showRole(d.allies || []);
    });

    n.on('NIGHT', d => { this.phase = 'night'; this.round = d.round; this._showNight(d.dur); });
    n.on('DAY', d => this._onDay(d));
    n.on('VOTE_UPDATE', d => { this.votes = d.votes || {}; this._renderVotes(); });
    n.on('VERDICT', d => this._onVerdict(d));
    n.on('GAMEOVER', d => this._onGameOver(d));

    n.on('READY', d => { if (this.isHost) { this.readySet.add(d._from); this._checkReady(); } });

    n.on('KILL_ACTION', d => {
      if (this.isHost) {
        this.nightActions[d._from] = d.targetId;
        if (d.killClue?.text) this.killClues.push(d.killClue.text);
        this.killCounts[d._from] = (this.killCounts[d._from] || 0) + 1;
        this._checkNightDone();
      }
    });

    n.on('INVEST_RESULT', d => { if (this.isHost && d.clue) this.investigationClues.push({ playerId: d._from, clue: d.clue }); });
    n.on('DOC_PROTECT', d => { if (this.isHost) this.doctorTarget = d.targetId; });

    n.on('VOTE', d => {
      if (this.isHost) {
        this.votes[d._from] = d.targetId;
        this.net.relay({ t: 'VOTE_UPDATE', votes: this.votes });
        this._checkVoteDone();
      }
    });

    n.on('CHAT', d => { chat.addMessage(d.persona || d.name, d.text, d.chatType || 'normal'); audio.play('chat'); });
    n.on('LAST_WORDS', d => { chat.addMessage(d.persona || d.name, d.text, 'last-words'); });
    n.on('KICKED', d => { if (d.targetId === this.myId) { ui.toast('You were kicked', true); ui.show('s-land'); this.phase = 'lobby'; this.players = []; } });
    n.on('SETTINGS', d => { this.settings = d.settings; });
  }

  // ── Lobby ──────────────────────────────────────────────────
  createLobby(name, avatar) { this.myName = name; this.myAvatar = avatar; this.net.createRoom(this.myId, name); }
  joinLobby(name, avatar, code) { this.myName = name; this.myAvatar = avatar; this.net.joinRoom(this.myId, name, code); }

  _showLobby() { ui.show('s-lobby'); document.getElementById('lCode').textContent = this.lobbyCode; this._renderLobby(); }
  _renderLobby() { if (this.phase !== 'lobby') return; ui.renderLobby(this.players, this.myId, this.isHost, id => this.kickPlayer(id)); }
  kickPlayer(id) { if (!this.isHost) return; this.net.relay({ t: 'KICKED', targetId: id }); this.players = this.players.filter(p => p.id !== id); this._renderLobby(); }

  // ── Host Start ─────────────────────────────────────────────
  hostStart() {
    if (!this.isHost || this.players.length < 4) return;
    const roleMap = assignRoles(this.players, this.settings);
    roleMap.forEach(r => { const p = this.players.find(x => x.id === r.id); if (p) { p.role = r.role; p.alive = true; } });

    // Generate characters + personas
    const { personas, characters } = assignCharacters(this.players.map(p => p.id));
    this._hostPersonas = personas;
    this._hostCharacters = characters;

    // Store locally
    this.charData = {};
    personas.forEach((persona, id) => {
      this.charData[id] = { persona, pub: characters.get(id).pub };
    });
    // Host gets own hidden traits
    this.charData[this.myId].hidden = characters.get(this.myId).hidden;
    this.myPersona = personas.get(this.myId);
    this.myCharacter = { pub: characters.get(this.myId).pub, hidden: characters.get(this.myId).hidden };

    this.phase = 'role';
    this.round = 1;
    this.readySet = new Set();
    this.jesterWinner = null;
    this.killCounts = {};

    const publicPlayers = this.players.map(p => ({ id: p.id }));

    // Send each player their role + character data (anti-cheat: only own hidden traits)
    this.players.forEach(p => {
      const allies = (p.role === 'killer') ? this.players.filter(x => x.role === 'killer' && x.id !== p.id).map(x => personas.get(x.id).name) : [];
      const playerCharData = {};
      personas.forEach((persona, id) => {
        playerCharData[id] = { persona, pub: characters.get(id).pub };
        if (id === p.id) playerCharData[id].hidden = characters.get(id).hidden;
      });

      if (p.id === this.myId) {
        this.myRole = p.role;
        this._showRole(allies);
      } else {
        this.net.relay({ t: 'ROLE', role: p.role, allies, publicPlayers, round: this.round, settings: this.settings, charData: playerCharData }, p.id);
      }
    });
  }

  // ── Role Screen ────────────────────────────────────────────
  _showRole(allies) {
    ui.show('s-role');
    ui.renderRole(this.myRole, allies, this.myPersona, this.myCharacter);
    audio.play(this.myRole === 'killer' ? 'bad' : 'good');
    ui.hideRoleReminder();
  }

  pressReady() {
    document.getElementById('readyBtn').disabled = true;
    document.getElementById('readyBtn').textContent = 'Waiting...';
    if (this.isHost) { this.readySet.add(this.myId); this._checkReady(); }
    else this.net.relay({ t: 'READY' });
  }

  _checkReady() { if (this.readySet.size >= this.players.filter(p => !p.disconnected).length) this._beginNight(); }

  // ── Night ──────────────────────────────────────────────────
  _beginNight() {
    if (!this.isHost) return;
    this.phase = 'night';
    this.nightActions = {};
    this.doctorTarget = null;
    this.killClues = [];
    this.investigationClues = [];
    this.readySet = new Set();
    this.savedId = null;

    const dur = this.settings.nightTime * 1000;
    this.net.relay({ t: 'NIGHT', round: this.round, dur });
    this._showNight(dur);

    clearTimeout(this.nightTimeout);
    this.nightTimeout = setTimeout(() => { if (this.phase === 'night') this._resolveNight(); }, dur);
  }

  _showNight(dur) {
    this.phase = 'night';
    if (this.canvasCtrl) this.canvasCtrl.setNightPulse(1);
    document.getElementById('nightOv').classList.add('on');
    document.getElementById('nBig').textContent = `NIGHT ${this.round}`;
    document.getElementById('nSm').textContent = 'DARKNESS SWALLOWS THE TOWN';
    audio.play('night');
    const kc = this.players.filter(p => p.role === 'killer' && p.alive).length;
    setTimeout(() => audio.play('kill', Math.max(1, kc)), 3000);

    const me = this.players.find(p => p.id === this.myId);
    const alive = this.players.filter(p => p.alive && p.id !== this.myId);

    if (!me || !me.alive) { ui.renderNightCivilianUI(); return; }

    if (this.myRole === 'killer') this._showKillerNight(alive);
    else if (this.myRole === 'doctor') this._showDoctorNight(alive);
    else this._showInvestigatorNight(alive);
  }

  // ── Killer Night ───────────────────────────────────────────
  _showKillerNight(alive) {
    // Show targets by PERSONA only
    const targets = alive.map(p => ({ id: p.id, displayName: this._pname(p.id) }));
    const kl = ui.renderNightKillerUI(targets);
    if (!kl) return;
    kl.onclick = async (e) => {
      const btn = e.target.closest('.bplayer');
      if (!btn || btn.disabled) return;
      kl.querySelectorAll('.bplayer').forEach(b => { b.disabled = true; b.style.opacity = b === btn ? '1' : '.25'; });
      const tid = btn.dataset.pid;
      audio.haptic([100]);
      const myKills = this.killCounts[this.myId] || 0;
      const diff = getKillDifficulty(myKills);
      const qteContainer = document.getElementById('kCfm');
      if (qteContainer) {
        qteContainer.style.display = 'block'; qteContainer.innerHTML = '';
        const score = await runQTE(qteContainer, diff, 'kill');
        // Get killer's character for clue generation
        const killerChar = this.isHost ? { pub: this._hostCharacters.get(this.myId).pub, hidden: this._hostCharacters.get(this.myId).hidden } : this.myCharacter;
        const killClue = generateKillClue(killerChar, score, myKills);
        if (this.isHost) {
          this.nightActions[this.myId] = tid;
          if (killClue.text) this.killClues.push(killClue.text);
          this.killCounts[this.myId] = myKills + 1;
          this._checkNightDone();
        } else {
          this.net.relay({ t: 'KILL_ACTION', targetId: tid, killClue });
        }
      }
    };
  }

  // ── Doctor Night ───────────────────────────────────────────
  _showDoctorNight(alivePlayers) {
    const canProtectSelf = !this.lastDoctorSelf;
    const targets = this.players.filter(p => p.alive).map(p => ({
      ...p, isSelf: p.id === this.myId, displayName: this._pname(p.id)
    }));
    const dl = ui.renderNightDoctorUI(targets, !canProtectSelf);
    if (!dl) return;
    dl.onclick = async (e) => {
      const btn = e.target.closest('.bdet');
      if (!btn || btn.disabled) return;
      dl.querySelectorAll('.bdet').forEach(b => { b.disabled = true; b.style.opacity = b === btn ? '1' : '.25'; });
      document.getElementById('docCfm').style.display = 'block';
      const tid = btn.dataset.pid;
      this.lastDoctorSelf = (tid === this.myId);
      if (this.isHost) this.doctorTarget = tid; else this.net.relay({ t: 'DOC_PROTECT', targetId: tid });
      audio.haptic([50]);
      setTimeout(() => this._startInvestigationQTE(false), 1500);
    };
  }

  // ── Investigator Night (Civilian / Detective) ──────────────
  _showInvestigatorNight(alive) {
    const area = document.getElementById('nAct');
    if (!area) return;
    const isDet = this.myRole === 'detective';
    const title = isDet ? '🔍 Investigate a Suspect' : '🔎 Search for Clues';
    const color = isDet ? 'var(--det-bright)' : 'var(--gold)';
    const sub = isDet ? 'Your training gives you an edge — easier QTE and hidden details.' : 'You can investigate — harder QTE, but every clue matters.';

    area.innerHTML =
      `<div style="color:${color};font-family:var(--font-display);font-size:1rem;margin-bottom:4px">${title}</div>` +
      `<div class="muted tc" style="font-size:.75rem;margin-bottom:14px">${sub}</div>` +
      `<div id="investList"></div><div id="investQTE" style="display:none"></div><div id="investResult" style="display:none" class="cluebox"></div>`;

    const il = document.getElementById('investList');
    alive.forEach(p => {
      const b = document.createElement('button');
      b.className = 'bdet';
      if (!isDet) { b.style.borderColor = 'rgba(201,168,76,.3)'; b.style.background = 'rgba(201,168,76,.05)'; }
      b.innerHTML = `<span>${this._pname(p.id)}</span>`;
      b.dataset.pid = p.id;
      il.appendChild(b);
    });

    il.onclick = async (e) => {
      const btn = e.target.closest('.bdet');
      if (!btn || btn.disabled) return;
      il.querySelectorAll('.bdet').forEach(b => b.disabled = true);
      const tid = btn.dataset.pid;
      il.style.display = 'none';
      const diff = getInvestigateDifficulty(isDet);
      const qteArea = document.getElementById('investQTE');
      qteArea.style.display = 'block';
      const score = await runQTE(qteArea, diff, 'investigate');
      const targetChar = { pub: this.charData[tid]?.pub, hidden: this.charData[tid]?.hidden };
      const targetPersona = this.charData[tid]?.persona || { name: '???' };
      const target = this.players.find(x => x.id === tid);
      const result = generateInvestClue(targetChar, targetPersona, target?.role, score, isDet);
      const resEl = document.getElementById('investResult');
      if (resEl) { resEl.innerHTML = result.text; resEl.style.display = 'block'; }
      if (this.isHost) this.investigationClues.push({ playerId: this.myId, clue: result.text });
      else this.net.relay({ t: 'INVEST_RESULT', clue: result.text });
    };
  }

  _startInvestigationQTE(isDet) {
    const area = document.getElementById('nAct');
    if (!area) return;
    const alive = this.players.filter(p => p.alive && p.id !== this.myId);
    const div = document.createElement('div');
    div.style.marginTop = '20px';
    div.innerHTML =
      `<div style="color:var(--det-bright);font-family:var(--font-display);font-size:.9rem;margin-bottom:8px">🔍 Also Investigate</div>` +
      `<div id="docInvestList"></div><div id="docInvestQTE" style="display:none"></div><div id="docInvestResult" style="display:none" class="cluebox"></div>`;
    area.appendChild(div);
    const il = document.getElementById('docInvestList');
    alive.forEach(p => {
      const b = document.createElement('button');
      b.className = 'bdet';
      b.innerHTML = `<span>${this._pname(p.id)}</span>`;
      b.dataset.pid = p.id;
      il.appendChild(b);
    });
    il.onclick = async (e) => {
      const btn = e.target.closest('.bdet');
      if (!btn || btn.disabled) return;
      il.querySelectorAll('.bdet').forEach(b => b.disabled = true);
      il.style.display = 'none';
      const diff = getInvestigateDifficulty(isDet);
      const qteArea = document.getElementById('docInvestQTE');
      qteArea.style.display = 'block';
      const tid = btn.dataset.pid;
      const score = await runQTE(qteArea, diff, 'investigate');
      const targetChar = { pub: this.charData[tid]?.pub, hidden: this.charData[tid]?.hidden };
      const targetPersona = this.charData[tid]?.persona || { name: '???' };
      const target = this.players.find(x => x.id === tid);
      const result = generateInvestClue(targetChar, targetPersona, target?.role, score, isDet);
      const resEl = document.getElementById('docInvestResult');
      if (resEl) { resEl.innerHTML = result.text; resEl.style.display = 'block'; }
      if (this.isHost) this.investigationClues.push({ playerId: this.myId, clue: result.text });
      else this.net.relay({ t: 'INVEST_RESULT', clue: result.text });
    };
  }

  _checkNightDone() {
    const killers = this.players.filter(p => p.alive && p.role === 'killer');
    if (killers.every(k => this.nightActions[k.id])) {
      clearTimeout(this.nightTimeout);
      setTimeout(() => this._resolveNight(), 2000);
    }
  }

  _resolveNight() {
    if (!this.isHost) return;
    const vs = Object.values(this.nightActions);
    let killedId = null, savedId = null;
    if (vs.length) {
      const freq = {};
      vs.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      const vic = this.players.find(p => p.id === top);
      if (vic && vic.alive) {
        if (this.doctorTarget === top) savedId = top;
        else { vic.alive = false; killedId = top; }
      }
    }
    this.round++;
    const payload = { t: 'DAY', round: this.round, killedId, savedId, killClues: [...this.killClues], investigationClues: this.investigationClues, pa: this.players.map(p => ({ id: p.id, alive: p.alive })) };
    this.net.relay(payload);
    this._onDay(payload);
  }

  // ── Day ────────────────────────────────────────────────────
  _onDay(d) {
    d.pa.forEach(u => { const p = this.players.find(x => x.id === u.id); if (p) p.alive = u.alive; });
    this.phase = 'day'; this.votes = {}; this.selVote = null; this.voted = false;
    if (this.canvasCtrl) this.canvasCtrl.setNightPulse(0);
    document.getElementById('nightOv').classList.remove('on');
    ui.show('s-day');
    audio.play('day');

    // Death — show PERSONA name, not username
    ui.hideDeathAnnounce(); ui.hideDoctorSave();
    if (d.killedId) {
      ui.showDeathAnnounce(this._pname(d.killedId));
      ui.addLog(`Night ${this.round - 1}: ${this._pname(d.killedId)} was murdered.`, 'lk');
    } else if (d.savedId) {
      ui.showDoctorSave(this._pname(d.savedId));
      ui.addLog(`Night ${this.round - 1}: ${this._pname(d.savedId)} was saved!`, 'lc');
      audio.play('save');
    } else {
      ui.addLog(`Night ${this.round - 1}: No one died.`, 'ls');
    }

    // Kill clues from QTE failures
    ui.hideClue();
    if (d.killClues?.length > 0) {
      ui.showClue(d.killClues.map(c => `<div class="evidence-box"><span class="evidence-label">🔍 CRIME SCENE EVIDENCE</span>${c}</div>`).join(''));
    }

    // Investigation clues
    if (d.investigationClues?.length > 0) {
      d.investigationClues.forEach(ic => {
        const inv = this.players.find(p => p.id === ic.playerId);
        ui.addLog(`${this._pname(ic.playerId)}: ${ic.clue.replace(/<[^>]*>/g, '')}`, 'lc');
      });
    }

    const al = this.players.filter(p => p.alive).length;
    ui.renderDayHeader(this.round - 1, al, this.players.length);
    ui.showRoleReminder(this.myRole);
    this._renderVotes();

    const me = this.players.find(p => p.id === this.myId);
    const isDead = me && !me.alive;
    document.getElementById('deadMsg').style.display = isDead ? 'block' : 'none';
    document.getElementById('cvBtn').style.display = 'none';

    // Town Board button
    const tbBtn = document.getElementById('btnTownBoard');
    if (tbBtn) tbBtn.style.display = 'inline-flex';

    // Last words
    const lwPanel = document.getElementById('lastWordsPanel');
    if (d.killedId === this.myId && lwPanel) {
      lwPanel.style.display = 'block';
      let lwTime = 10;
      ui.updateTimer('lwTimer', lwTime);
      clearTimeout(this.lastWordsTimeout);
      const lwIv = setInterval(() => { lwTime--; ui.updateTimer('lwTimer', lwTime); if (lwTime <= 0) { clearInterval(lwIv); lwPanel.style.display = 'none'; } }, 1000);
      this.lastWordsTimeout = setTimeout(() => { clearInterval(lwIv); lwPanel.style.display = 'none'; }, 10000);
    } else if (lwPanel) lwPanel.style.display = 'none';

    if (isDead) { chat.addMessage('', 'You are dead. You can observe but not speak.', 'system'); chat.setEnabled(false); }
    else chat.setEnabled(true);

    let tl = this.settings.dayTime || 60;
    ui.updateTimer('dTimer', tl);
    document.getElementById('dTimer').classList.remove('urg');
    clearInterval(this.dayInterval);
    this.dayInterval = setInterval(() => { tl--; ui.updateTimer('dTimer', tl); if (tl <= 0) { clearInterval(this.dayInterval); if (this.isHost) this._closeVote(); } }, 1000);
  }

  _renderVotes() {
    const me = this.players.find(p => p.id === this.myId);
    const isDead = me && !me.alive;
    // Voting by PERSONA only
    const displayPlayers = this.players.map(p => ({
      ...p,
      name: this._pname(p.id),           // Override name with persona
      avatar: this.charData[p.id]?.persona?.icon || '❓'
    }));
    const c = ui.renderVotes(displayPlayers, this.myId, this.votes, this.selVote, this.voted, isDead, this.settings.hideVotes);
    if (c) c.onclick = (e) => { const btn = e.target.closest('.bplayer'); if (btn && !btn.disabled) this._pickVote(btn.dataset.pid); };
  }

  _pickVote(id) {
    if (this.voted) return;
    this.selVote = id; audio.play('vote');
    this._renderVotes();
    document.getElementById('cvBtn').style.display = 'flex';
    document.getElementById('vStatus').textContent = 'Selected: ' + this._pname(id);
  }

  confirmVote() {
    if (!this.selVote || this.voted) return;
    this.voted = true;
    document.getElementById('cvBtn').style.display = 'none';
    document.getElementById('vStatus').textContent = '✓ Vote cast';
    if (this.isHost) { this.votes[this.myId] = this.selVote; this.net.relay({ t: 'VOTE_UPDATE', votes: this.votes }); this._checkVoteDone(); }
    else this.net.relay({ t: 'VOTE', targetId: this.selVote });
    audio.haptic([40]);
  }

  _checkVoteDone() { if (Object.keys(this.votes).length >= this.players.filter(p => p.alive).length) { clearInterval(this.dayInterval); this._closeVote(); } }

  _closeVote() {
    if (!this.isHost) return;
    const tally = {}; Object.values(this.votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    let exId = null;
    if (sorted.length && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) exId = sorted[0][0];
    let isJester = false;
    if (exId) { const p = this.players.find(x => x.id === exId); if (p) { if (p.role === 'jester') { isJester = true; this.jesterWinner = this._pname(exId); } p.alive = false; } }
    const w = this._checkWin();
    if (w) {
      const payload = { t: 'GAMEOVER', winner: w, players: this.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: p.alive, role: p.role })), tally, exId, isJester, jesterWinner: this.jesterWinner, charData: this.charData };
      this.net.relay(payload); this._onGameOver(payload);
    } else {
      const payload = { t: 'VERDICT', tally, exId, isJester, pa: this.players.map(p => ({ id: p.id, alive: p.alive, role: p.role })), jesterWinner: this.jesterWinner };
      this.net.relay(payload); this._onVerdict(payload);
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

  _onVerdict(d) {
    d.pa.forEach(u => { const p = this.players.find(x => x.id === u.id); if (p) { p.alive = u.alive; p.role = u.role || p.role; } });
    this.phase = 'verdict'; ui.show('s-verdict'); ui.hideRoleReminder();
    const ex = d.exId ? this.players.find(p => p.id === d.exId) : null;
    // Show persona name in verdict
    if (ex) ex._displayName = this._pname(d.exId);
    ui.renderVerdict(ex, d.isJester);
    if (ex) { const isK = ex.role === 'killer'; ui.addLog(`${this._pname(d.exId)} executed — ${d.isJester ? 'Jester wins!' : isK ? 'a killer!' : 'innocent.'}`, 'lv'); audio.play(d.isJester ? 'jester' : isK ? 'bad' : 'good'); }
    ui.renderVoteBars(d.tally, this.players.map(p => ({ ...p, name: this._pname(p.id), avatar: this.charData[p.id]?.persona?.icon || '❓' })));
    let vc = 6;
    document.getElementById('vcT').textContent = vc;
    const t = setInterval(() => { vc--; document.getElementById('vcT').textContent = vc; if (vc <= 0) { clearInterval(t); if (this.isHost) this._beginNight(); } }, 1000);
  }

  _onGameOver(d) {
    clearInterval(this.dayInterval); clearTimeout(this.nightTimeout);
    document.getElementById('nightOv').classList.remove('on');
    if (d.players) this.players = d.players;
    this.phase = 'over'; ui.show('s-over'); ui.hideRoleReminder();
    if (this.canvasCtrl) this.canvasCtrl.setNightPulse(0);
    const kw = d.winner === 'killers';
    // Game over reveals REAL NAMES alongside personas
    const revealPlayers = this.players.map(p => ({ ...p, displayName: `${this._pname(p.id)} — ${p.name}` }));
    ui.renderGameOver(d.winner, revealPlayers, d.jesterWinner);
    audio.play(kw ? 'bad' : 'good');
    const me = this.players.find(p => p.id === this.myId);
    this.stats.games++;
    if (me) {
      if (me.role === 'jester' && d.jesterWinner) this.stats.wins++;
      else if (me.role === 'killer' && kw) this.stats.wins++;
      else if (me.role !== 'killer' && me.role !== 'jester' && !kw) this.stats.wins++;
    }
    localStorage.setItem('nf_stats', JSON.stringify(this.stats));
    ui.renderStats(this.stats);
  }

  backToLobby() {
    this.phase = 'lobby'; this.players.forEach(p => { p.role = null; p.alive = true; });
    this.myRole = null; this.selVote = null; this.voted = false; this.jesterWinner = null;
    this.lastDoctorSelf = false; this.charData = {}; this.myPersona = null; this.myCharacter = null;
    this._hostCharacters = null; this._hostPersonas = null; this.killCounts = {};
    chat.clear(); ui.clearLog(); this._showLobby();
    if (this.isHost) this.net.relay({ t: 'PL', pl: this.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: true })) });
  }

  sendChat(text) {
    if (!text.trim()) return;
    const me = this.players.find(p => p.id === this.myId);
    if (me && !me.alive) return;
    // Chat uses PERSONA name, not real name
    const pname = this.myPersona ? `${this.myPersona.icon} ${this.myPersona.name}` : this.myName;
    chat.addMessage(pname, text, 'normal');
    this.net.relay({ t: 'CHAT', persona: pname, text, chatType: 'normal' });
  }

  sendLastWords(text) {
    if (!text.trim()) return;
    const pname = this.myPersona ? `${this.myPersona.icon} ${this.myPersona.name}` : this.myName;
    chat.addMessage(pname, text, 'last-words');
    this.net.relay({ t: 'LAST_WORDS', persona: pname, text });
    document.getElementById('lastWordsPanel').style.display = 'none';
    clearTimeout(this.lastWordsTimeout);
  }

  updateSettings(s) { this.settings = { ...this.settings, ...s }; if (this.isHost) this.net.relay({ t: 'SETTINGS', settings: this.settings }); }

  // ── Town Board: returns all character data for display ──────
  getTownBoardData() {
    const board = [];
    Object.entries(this.charData).forEach(([id, data]) => {
      const p = this.players.find(x => x.id === id);
      board.push({
        id,
        persona: data.persona,
        pub: getPublicDesc({ pub: data.pub }),
        hidden: data.hidden ? getHiddenDesc({ hidden: data.hidden }) : null,
        alive: p ? p.alive : true,
        isMe: id === this.myId,
      });
    });
    return board;
  }

  getStats() { return this.stats; }
}
