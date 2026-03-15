// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — Canvas Background
// ═══════════════════════════════════════════════════════════════

export function initCanvas() {
  const cv = document.getElementById('bgC');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, stars = [];

  function resize() {
    W = cv.width = window.innerWidth;
    H = cv.height = window.innerHeight;
    stars = [];
    for (let i = 0; i < 130; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.3 + Math.random() * 1.4,
        ph: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 1.2,
        b: 0.05 + Math.random() * 0.4
      });
    }
  }

  resize();
  window.addEventListener('resize', resize);

  let nightPulse = 0;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#02020a');
    sky.addColorStop(0.6, '#06061a');
    sky.addColorStop(1, '#0a0505');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Moon
    const mx = W * 0.82, my = H * 0.1;
    const mg = ctx.createRadialGradient(mx - 6, my - 6, 2, mx, my, 40);
    mg.addColorStop(0, '#fffde7');
    mg.addColorStop(0.4, '#f5e642');
    mg.addColorStop(1, '#c8a800');
    ctx.beginPath();
    ctx.arc(mx, my, 40, 0, Math.PI * 2);
    ctx.fillStyle = mg;
    ctx.shadowColor = 'rgba(248,230,66,.5)';
    ctx.shadowBlur = 50;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Stars
    const now = performance.now() / 1000;
    for (const s of stars) {
      const op = s.b + Math.abs(Math.sin(now * s.sp + s.ph)) * (1 - s.b);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${op.toFixed(3)})`;
      ctx.fill();
    }

    // Night phase red pulse
    if (nightPulse > 0) {
      const pulse = Math.sin(now * 2) * 0.03 * nightPulse;
      ctx.fillStyle = `rgba(139,0,0,${Math.abs(pulse).toFixed(4)})`;
      ctx.fillRect(0, 0, W, H);
    }

    requestAnimationFrame(draw);
  }

  draw();

  // Expose control for night pulse
  return {
    setNightPulse(val) { nightPulse = val; }
  };
}
