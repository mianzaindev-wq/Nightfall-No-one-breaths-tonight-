// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — QTE (Quick Time Event) Engine
// 3 Types: Key Sequence | Circle Hunt | Pattern Memory
// ═══════════════════════════════════════════════════════════════

import audio from './audio.js';
import { getPublicTraitClue, getHiddenTraitClue } from './avatar.js';

// ── QTE Difficulty Profiles ──────────────────────────────────
export function getKillDifficulty(killCount) {
  if (killCount <= 0) return { level: 1, label: 'Easy' };
  if (killCount === 1) return { level: 2, label: 'Medium' };
  if (killCount === 2) return { level: 3, label: 'Hard' };
  return { level: 4, label: 'Deadly' };
}

export function getInvestigateDifficulty(isDetective) {
  if (isDetective) return { level: 1, label: 'Trained' };
  return { level: 2, label: 'Amateur' };
}

// ── Clue Generation ──────────────────────────────────────────
export function generateKillClue(killerCharacter, score, killCount) {
  if (score >= 1.0) return { strength: 'none', text: null };
  if (score >= 0.7) {
    const vague = [
      'The attack happened swiftly, but something felt... off.',
      'A faint disturbance was noticed near the scene.',
      'The killer was careful, but not careful enough to leave nothing.',
    ];
    return { strength: 'weak', text: vague[Math.floor(Math.random() * vague.length)] };
  }
  if (score >= 0.4) {
    const traitClue = getPublicTraitClue(killerCharacter);
    return { strength: 'medium', text: `Witnesses reported seeing ${traitClue}.` };
  }
  const hiddenClue = getHiddenTraitClue(killerCharacter);
  return { strength: 'strong', text: `Crime scene evidence: ${hiddenClue}.` };
}

export function generateInvestClue(targetCharacter, targetPersona, targetRole, score, isDetective) {
  const isKiller = targetRole === 'killer';
  if (score < 0.3) {
    return { success: false, text: `Your investigation of ${targetPersona.name} was inconclusive.` };
  }
  if (score < 0.7) {
    if (isKiller) return { success: true, text: `Something about ${targetPersona.name} doesn't sit right. Their alibi has gaps...` };
    return { success: true, text: `${targetPersona.name} seems uneasy, but nothing concrete.` };
  }
  // High score
  if (isDetective && isKiller) {
    const hidden = getHiddenTraitClue(targetCharacter);
    return { success: true, text: `🔍 Strong evidence: ${targetPersona.name} — ${hidden}. Highly suspicious.`, isStrong: true };
  }
  if (isKiller) {
    const pub = getPublicTraitClue(targetCharacter);
    return { success: true, text: `You noticed suspicious behavior from ${pub}. Could be the killer.`, isStrong: true };
  }
  return { success: true, text: `${targetPersona.name} appears to have a solid alibi. Likely innocent.` };
}

// ── QTE Type Selection ───────────────────────────────────────
const QTE_TYPES = ['keys', 'circles', 'pattern'];

function pickQTEType() {
  return QTE_TYPES[Math.floor(Math.random() * QTE_TYPES.length)];
}

// ── Master QTE Runner ────────────────────────────────────────
export function runQTE(container, difficulty, type = 'kill') {
  const qteType = pickQTEType();
  switch (qteType) {
    case 'circles': return runCircleHuntQTE(container, difficulty, type);
    case 'pattern': return runPatternMemoryQTE(container, difficulty, type);
    default:        return runKeySequenceQTE(container, difficulty, type);
  }
}

// ═════════════════════════════════════════════════════════════
// QTE TYPE 1: KEY SEQUENCE
// ═════════════════════════════════════════════════════════════
const QTE_KEYS = ['W', 'A', 'S', 'D'];
const QTE_ARROWS = { W: '↑', A: '←', S: '↓', D: '→' };
const QTE_KEY_MOBILE = ['↑', '←', '↓', '→'];
const QTE_KEY_MAP_MOBILE = { '↑': 'W', '←': 'A', '↓': 'S', '→': 'D' };

function getKeyParams(level) {
  if (level <= 1) return { keys: 2, timePerKey: 1800 };
  if (level === 2) return { keys: 3, timePerKey: 1400 };
  if (level === 3) return { keys: 4, timePerKey: 1100 };
  return { keys: 5, timePerKey: 850 };
}

function runKeySequenceQTE(container, difficulty, type) {
  return new Promise((resolve) => {
    const { keys: keyCount, timePerKey } = getKeyParams(difficulty.level);
    const sequence = [];
    for (let i = 0; i < keyCount; i++) sequence.push(QTE_KEYS[Math.floor(Math.random() * QTE_KEYS.length)]);

    let idx = 0, hits = 0, misses = 0, timer = null, done = false;
    const accent = type === 'kill' ? 'var(--blood-bright)' : 'var(--det-bright)';
    const label = type === 'kill' ? '🗡 STRIKE' : '🔍 INVESTIGATE';

    function render() {
      const keysHtml = sequence.map((k, i) => {
        let cls = 'qte-key';
        if (i < idx) cls += (i < hits) ? ' qte-hit' : ' qte-miss';
        else if (i === idx) cls += ' qte-active';
        return `<div class="${cls}">${QTE_ARROWS[k]}</div>`;
      }).join('');
      const mobile = QTE_KEY_MOBILE.map(k => `<button class="qte-mobile-btn" data-key="${QTE_KEY_MAP_MOBILE[k]}">${k}</button>`).join('');
      container.innerHTML =
        `<div class="qte-wrapper">` +
          `<div class="qte-label" style="color:${accent}">${label}</div>` +
          `<div class="qte-difficulty">${difficulty.label} • Key Sequence</div>` +
          `<div class="qte-sequence">${keysHtml}</div>` +
          `<div class="qte-timer-bar"><div class="qte-timer-fill" id="qteTimerFill" style="background:${accent}"></div></div>` +
          `<div class="qte-mobile-keys">${mobile}</div>` +
          `<div class="qte-hint">Press the keys in order</div>` +
        `</div>`;
      container.querySelectorAll('.qte-mobile-btn').forEach(b => {
        b.ontouchstart = b.onclick = (e) => { e.preventDefault(); processKey(b.dataset.key); };
      });
    }

    function startTimer() {
      const fill = document.getElementById('qteTimerFill');
      if (fill) { fill.style.transition = `width ${timePerKey}ms linear`; fill.style.width = '0%'; fill.offsetHeight; fill.style.width = '100%'; }
      clearTimeout(timer);
      timer = setTimeout(() => { misses++; idx++; audio.play('bad'); audio.haptic([100,50,100]); if (idx >= keyCount) finish(); else { render(); startTimer(); } }, timePerKey);
    }

    function processKey(key) {
      if (done || idx >= keyCount) return;
      if (key.toUpperCase() === sequence[idx]) { hits++; audio.tone(600+hits*100,'sine',0.1,0.12); audio.haptic([30]); }
      else { misses++; audio.play('bad'); audio.haptic([100,50,100]); }
      clearTimeout(timer); idx++;
      if (idx >= keyCount) finish(); else { render(); startTimer(); }
    }

    function finish() {
      if (done) return; done = true; clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      showResult(container, hits / keyCount, type, resolve);
    }

    function onKey(e) {
      const k = e.key.toUpperCase();
      if (['W','A','S','D','ARROWUP','ARROWDOWN','ARROWLEFT','ARROWRIGHT'].includes(k)) {
        e.preventDefault();
        processKey({ ARROWUP:'W',ARROWDOWN:'S',ARROWLEFT:'A',ARROWRIGHT:'D' }[k] || k);
      }
    }

    document.addEventListener('keydown', onKey);
    render();
    setTimeout(() => startTimer(), 600);
  });
}

// ═════════════════════════════════════════════════════════════
// QTE TYPE 2: CIRCLE HUNT
// Tap white circles, avoid red circles
// ═════════════════════════════════════════════════════════════
function getCircleParams(level) {
  if (level <= 1) return { rounds: 5, spawnTime: 2000, redChance: 0.2, maxActive: 3 };
  if (level === 2) return { rounds: 7, spawnTime: 1600, redChance: 0.25, maxActive: 4 };
  if (level === 3) return { rounds: 9, spawnTime: 1200, redChance: 0.3, maxActive: 5 };
  return { rounds: 12, spawnTime: 900, redChance: 0.35, maxActive: 6 };
}

function runCircleHuntQTE(container, difficulty, type) {
  return new Promise((resolve) => {
    const { rounds, spawnTime, redChance, maxActive } = getCircleParams(difficulty.level);
    const accent = type === 'kill' ? 'var(--blood-bright)' : 'var(--det-bright)';
    const label = type === 'kill' ? '🗡 STRIKE' : '🔍 INVESTIGATE';

    let spawned = 0, hits = 0, misses = 0, done = false;
    let circles = [];
    let spawnInterval = null;

    container.innerHTML =
      `<div class="qte-wrapper">` +
        `<div class="qte-label" style="color:${accent}">${label}</div>` +
        `<div class="qte-difficulty">${difficulty.label} • Circle Hunt</div>` +
        `<div class="qte-circle-arena" id="qteArena"></div>` +
        `<div class="qte-hint">Tap ⚪ white circles • Avoid 🔴 red circles</div>` +
      `</div>`;

    const arena = document.getElementById('qteArena');
    if (!arena) { resolve(0); return; }

    function spawnCircle() {
      if (done || spawned >= rounds) { clearInterval(spawnInterval); setTimeout(finish, spawnTime + 200); return; }
      if (circles.length >= maxActive) return;

      const isRed = Math.random() < redChance;
      const circle = document.createElement('div');
      circle.className = `qte-circle ${isRed ? 'qte-circle-red' : 'qte-circle-white'}`;
      circle.style.left = (10 + Math.random() * 75) + '%';
      circle.style.top = (10 + Math.random() * 70) + '%';
      circle.dataset.red = isRed ? '1' : '0';
      circle.style.animationDuration = (spawnTime * 0.9) + 'ms';

      const circleId = spawned;
      circle.dataset.cid = circleId;

      // Tap handler
      const handler = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (done) return;
        circle.removeEventListener('click', handler);
        circle.removeEventListener('touchstart', handler);
        if (isRed) {
          // Clicked red = mistake
          misses++;
          circle.classList.add('qte-circle-burst-bad');
          audio.play('bad'); audio.haptic([100,50,100]);
        } else {
          // Clicked white = good
          hits++;
          circle.classList.add('qte-circle-burst');
          audio.tone(500 + hits * 80, 'sine', 0.08, 0.1); audio.haptic([30]);
        }
        circles = circles.filter(c => c.id !== circleId);
        setTimeout(() => circle.remove(), 300);
      };
      circle.addEventListener('click', handler);
      circle.addEventListener('touchstart', handler);

      // Auto-expire (white circles that aren't clicked = miss)
      const expireTimer = setTimeout(() => {
        if (done || !circle.parentNode) return;
        if (!isRed) {
          misses++; // Missed a white circle
          circle.classList.add('qte-circle-fade');
        }
        circles = circles.filter(c => c.id !== circleId);
        setTimeout(() => circle.remove(), 300);
      }, spawnTime * 0.85);

      circles.push({ id: circleId, el: circle, timer: expireTimer });
      arena.appendChild(circle);
      spawned++;
    }

    function finish() {
      if (done) return; done = true;
      clearInterval(spawnInterval);
      circles.forEach(c => { clearTimeout(c.timer); c.el.remove(); });
      const total = Math.max(1, hits + misses);
      const score = hits / total;
      showResult(container, score, type, resolve);
    }

    // Start spawning
    setTimeout(() => {
      spawnCircle();
      spawnInterval = setInterval(spawnCircle, spawnTime * 0.6);
    }, 500);
  });
}

// ═════════════════════════════════════════════════════════════
// QTE TYPE 3: PATTERN MEMORY
// See a pattern, then recreate it
// ═════════════════════════════════════════════════════════════
const PATTERN_SYMBOLS = ['◆', '●', '▲', '■', '★', '♦'];
const PATTERN_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e67e22'];

function getPatternParams(level) {
  if (level <= 1) return { length: 3, showTime: 2500, symbols: 4 };
  if (level === 2) return { length: 4, showTime: 2000, symbols: 5 };
  if (level === 3) return { length: 5, showTime: 1500, symbols: 5 };
  return { length: 6, showTime: 1200, symbols: 6 };
}

function runPatternMemoryQTE(container, difficulty, type) {
  return new Promise((resolve) => {
    const { length, showTime, symbols: symCount } = getPatternParams(difficulty.level);
    const accent = type === 'kill' ? 'var(--blood-bright)' : 'var(--det-bright)';
    const label = type === 'kill' ? '🗡 STRIKE' : '🔍 INVESTIGATE';

    // Generate pattern
    const usedSymbols = PATTERN_SYMBOLS.slice(0, symCount);
    const usedColors = PATTERN_COLORS.slice(0, symCount);
    const pattern = [];
    for (let i = 0; i < length; i++) {
      const si = Math.floor(Math.random() * symCount);
      pattern.push({ symbol: usedSymbols[si], color: usedColors[si], index: si });
    }

    let phase = 'show'; // show | input
    let inputIdx = 0, hits = 0, done = false;

    // Show phase
    function renderShow() {
      const patternHtml = pattern.map(p =>
        `<div class="qte-pattern-sym" style="color:${p.color};border-color:${p.color}">${p.symbol}</div>`
      ).join('');
      container.innerHTML =
        `<div class="qte-wrapper">` +
          `<div class="qte-label" style="color:${accent}">${label}</div>` +
          `<div class="qte-difficulty">${difficulty.label} • Pattern Memory</div>` +
          `<div class="qte-pattern-display">${patternHtml}</div>` +
          `<div class="qte-hint">Memorize this pattern!</div>` +
          `<div class="qte-timer-bar"><div class="qte-timer-fill" id="qteTimerFill" style="background:${accent}"></div></div>` +
        `</div>`;
      const fill = document.getElementById('qteTimerFill');
      if (fill) { fill.style.transition = `width ${showTime}ms linear`; fill.style.width = '0%'; fill.offsetHeight; fill.style.width = '100%'; }
    }

    function renderInput() {
      const progressHtml = pattern.map((p, i) => {
        if (i < inputIdx) return `<div class="qte-pattern-sym qte-hit" style="color:${p.color};border-color:${p.color}">${p.symbol}</div>`;
        if (i === inputIdx) return `<div class="qte-pattern-sym qte-active" style="border-color:var(--gold)">?</div>`;
        return `<div class="qte-pattern-sym" style="opacity:.3">?</div>`;
      }).join('');

      const buttonsHtml = usedSymbols.map((s, i) =>
        `<button class="qte-pattern-btn" data-si="${i}" style="color:${usedColors[i]};border-color:${usedColors[i]}">${s}</button>`
      ).join('');

      container.innerHTML =
        `<div class="qte-wrapper">` +
          `<div class="qte-label" style="color:${accent}">${label}</div>` +
          `<div class="qte-difficulty">Recreate the pattern</div>` +
          `<div class="qte-pattern-display">${progressHtml}</div>` +
          `<div class="qte-pattern-buttons">${buttonsHtml}</div>` +
        `</div>`;

      container.querySelectorAll('.qte-pattern-btn').forEach(btn => {
        btn.onclick = btn.ontouchstart = (e) => {
          e.preventDefault();
          if (done || phase !== 'input') return;
          const si = parseInt(btn.dataset.si);
          processInput(si);
        };
      });
    }

    function processInput(selectedIndex) {
      if (done) return;
      const expected = pattern[inputIdx].index;
      if (selectedIndex === expected) {
        hits++;
        audio.tone(500 + hits * 100, 'sine', 0.08, 0.1);
        audio.haptic([30]);
      } else {
        audio.play('bad');
        audio.haptic([100, 50, 100]);
      }
      inputIdx++;
      if (inputIdx >= length) {
        finish();
      } else {
        renderInput();
      }
    }

    function finish() {
      if (done) return; done = true;
      const score = hits / length;
      showResult(container, score, type, resolve);
    }

    // Start: show pattern, then switch to input
    renderShow();
    setTimeout(() => {
      phase = 'input';
      inputIdx = 0;
      renderInput();
    }, showTime + 300);
  });
}

// ═════════════════════════════════════════════════════════════
// SHARED: Result Display
// ═════════════════════════════════════════════════════════════
function showResult(container, score, type, resolve) {
  const passed = score >= 0.5;
  const resultColor = passed ? (type === 'kill' ? 'var(--blood-bright)' : '#81c784') : 'var(--pale-dim)';
  const resultText = type === 'kill'
    ? (score >= 1 ? '☠ CLEAN KILL' : score >= 0.5 ? '🗡 MESSY KILL' : '💨 BOTCHED')
    : (score >= 0.7 ? '🔍 EVIDENCE FOUND' : score >= 0.3 ? '🔎 PARTIAL FINDINGS' : '❌ INCONCLUSIVE');

  container.innerHTML =
    `<div class="qte-wrapper">` +
      `<div class="qte-result" style="color:${resultColor}">${resultText}</div>` +
      `<div class="qte-score">${Math.round(score * 100)}% accuracy</div>` +
    `</div>`;

  if (passed && type === 'kill') audio.play('kill');
  else if (passed) audio.play('good');
  else audio.tone(150, 'sawtooth', 0.4, 0.15);

  setTimeout(() => resolve(score), 1500);
}
