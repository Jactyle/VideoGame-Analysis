/*
 * Cursor-reactive visual flourishes: a spark trail that follows the pointer
 * across whichever .chart-card it's over, and a slow parallax drift on the
 * hero header's background glow. The parallax is a pure CSS-custom-property
 * write; the trail is a handful of small particles drawn on a single
 * full-viewport canvas overlay, colored to match the hovered card's own
 * accent. Everything here is driven by one delegated, rAF-throttled
 * pointermove listener — no per-card or per-page setup needed, so cards
 * added later (the dashboard builds its chart cards after this script runs)
 * pick it up for free. Skipped entirely under prefers-reduced-motion or on
 * touch/coarse pointers.
 */
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const header = document.querySelector(".page-header");
  let queued = false;
  let lastEvent = null;

  // --- Particle trail -------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:5;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const MAX_PARTICLES = 100;
  const particles = [];
  let particleLoopRunning = false;
  let lastFrameTime = null;

  function spawnParticles(x, y, rgb) {
    for (let i = 0; i < 2; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.15 + Math.random() * 0.35;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.25, // slight upward drift, like sparks
        r: 1.5 + Math.random() * 2,
        life: 0,
        maxLife: 450 + Math.random() * 350,
        rgb,
      });
    }
    if (!particleLoopRunning) {
      particleLoopRunning = true;
      lastFrameTime = null;
      requestAnimationFrame(stepParticles);
    }
  }

  function stepParticles(now) {
    const dt = lastFrameTime ? Math.min(48, now - lastFrameTime) : 16;
    lastFrameTime = now;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      const step = dt / 16;
      p.x += p.vx * step;
      p.y += p.vy * step;
      const t = p.life / p.maxLife;
      const alpha = (1 - t) * 0.75;
      const radius = Math.max(0.3, p.r * (1 - t * 0.6));
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.rgb}, ${alpha})`;
      ctx.fill();
    }
    if (particles.length > 0) {
      requestAnimationFrame(stepParticles);
    } else {
      particleLoopRunning = false;
      lastFrameTime = null;
    }
  }
  // ---------------------------------------------------------------------

  // A card's accent color is fixed for its lifetime (set once by CSS
  // nth-child rules), so it's cached per element instead of re-running
  // getComputedStyle on every rAF tick while the pointer sits over it.
  const cardColorCache = new WeakMap();
  function cardColor(card) {
    let rgb = cardColorCache.get(card);
    if (rgb === undefined) {
      rgb = getComputedStyle(card).getPropertyValue("--bracket-color-rgb").trim();
      cardColorCache.set(card, rgb);
    }
    return rgb;
  }

  function apply() {
    queued = false;
    const e = lastEvent;
    if (!e) return;

    const card = e.target.closest ? e.target.closest(".chart-card") : null;
    if (card) {
      const rgb = cardColor(card);
      if (rgb) spawnParticles(e.clientX, e.clientY, rgb);
    }

    if (header) {
      const cx = window.innerWidth / 2;
      const cy = Math.min(window.innerHeight, 400) / 2;
      const hx = ((e.clientX - cx) / cx) * 12; // px, small range — a drift, not a pan
      const hy = ((e.clientY - cy) / cy) * 8;
      header.style.setProperty("--hx", `${hx}px`);
      header.style.setProperty("--hy", `${hy}px`);
    }
  }

  document.addEventListener(
    "pointermove",
    (e) => {
      lastEvent = e;
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () => {
    if (header) {
      header.style.setProperty("--hx", "0px");
      header.style.setProperty("--hy", "0px");
    }
  });
})();
