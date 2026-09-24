/*
 * Full-screen boot intro, styled after the real Steam Deck startup
 * animation: scattered light particles react to the cursor, rush to a
 * point on click, then hand off to an SVG build-up of the actual Steam
 * icon glyph (a blue "power" pupil inside a ring that closes, the
 * arm/ball growing in, an outer badge ring drawing itself), which
 * crossfades into Valve's exact icon geometry and fades into the page.
 * Plays once per browser session (sessionStorage) and degrades to a
 * simple crossfade under prefers-reduced-motion.
 *
 * All shapes are traced from Valve's official Steam icon mark (the
 * white glyph, minus its background badge), from the SVG at
 * https://commons.wikimedia.org/wiki/File:Steam_icon_logo.svg
 * (original viewBox 0 0 65 65). GROUP_A_D is that same path's swoosh
 * arm + connecting ball (its first two subpaths); STEAM_ICON_PATH_D is
 * the complete, pixel-accurate glyph (all four subpaths).
 */
(function () {
  const SS_KEY = "vg-boot-intro-played";
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STEAM_ICON_PATH_D =
    "M30.31 23.985l.003.158-7.83 11.375c-1.268-.058-2.54.165-3.748.662a8.14 8.14 0 0 0-1.498.8L.042 29.893s-.398 6.546 1.26 11.424l12.156 5.016c.6 2.728 2.48 5.12 5.242 6.27a8.88 8.88 0 0 0 11.603-4.782 8.89 8.89 0 0 0 .684-3.656L42.18 36.16l.275.005c6.705 0 12.155-5.466 12.155-12.18s-5.44-12.16-12.155-12.174c-6.702 0-12.155 5.46-12.155 12.174zm-1.88 23.05c-1.454 3.5-5.466 5.147-8.953 3.694a6.84 6.84 0 0 1-3.524-3.362l3.957 1.64a5.04 5.04 0 0 0 6.591-2.719 5.05 5.05 0 0 0-2.715-6.601l-4.1-1.695c1.578-.6 3.372-.62 5.05.077 1.7.703 3 2.027 3.696 3.72s.692 3.56-.01 5.246M42.466 32.1a8.12 8.12 0 0 1-8.098-8.113 8.12 8.12 0 0 1 8.098-8.111 8.12 8.12 0 0 1 8.1 8.111 8.12 8.12 0 0 1-8.1 8.113m-6.068-8.126a6.09 6.09 0 0 1 6.08-6.095c3.355 0 6.084 2.73 6.084 6.095a6.09 6.09 0 0 1-6.084 6.093 6.09 6.09 0 0 1-6.081-6.093z";

  const GROUP_A_D =
    "M30.31 23.985l.003.158-7.83 11.375c-1.268-.058-2.54.165-3.748.662a8.14 8.14 0 0 0-1.498.8L.042 29.893s-.398 6.546 1.26 11.424l12.156 5.016c.6 2.728 2.48 5.12 5.242 6.27a8.88 8.88 0 0 0 11.603-4.782 8.89 8.89 0 0 0 .684-3.656L42.18 36.16l.275.005c6.705 0 12.155-5.466 12.155-12.18s-5.44-12.16-12.155-12.174c-6.702 0-12.155 5.46-12.155 12.174zm-1.88 23.05c-1.454 3.5-5.466 5.147-8.953 3.694a6.84 6.84 0 0 1-3.524-3.362l3.957 1.64a5.04 5.04 0 0 0 6.591-2.719 5.05 5.05 0 0 0-2.715-6.601l-4.1-1.695c1.578-.6 3.372-.62 5.05.077 1.7.703 3 2.027 3.696 3.72s.692 3.56-.01 5.246";

  // Geometry of the eye/pupil ring and the icon's overall bounds, in the
  // path's own 0..65 unit space — derived once by rasterizing each
  // sub-shape and reading back its true pixel bounding box.
  const EYE_CX = 42.25;
  const EYE_CY = 23.93;
  const EYE_MID_R = 7.105; // midpoint of the 6.09 (inner) / 8.12 (outer) ring radii
  const EYE_RING_W = 2.03;
  const EYE_CIRC = 2 * Math.PI * EYE_MID_R;
  const FULL_CX = 27.18;
  const FULL_CY = 32.35;
  const BADGE_R = 31.3;
  const BADGE_CIRC = 2 * Math.PI * BADGE_R;
  const VB_MINX = -6.32;
  const VB_MINY = -1.15;
  const VB_SIZE = 67;
  const VIEWBOX = `${VB_MINX} ${VB_MINY} ${VB_SIZE} ${VB_SIZE}`;
  // Where the pupil sits as a fraction of the logo box, so the particle
  // rush can converge on its exact on-screen spot rather than the box's
  // geometric center (the pupil sits up-and-right of that center).
  const EYE_FRAC_X = (EYE_CX - VB_MINX) / VB_SIZE;
  const EYE_FRAC_Y = (EYE_CY - VB_MINY) / VB_SIZE;

  function parseRgb(str) {
    const parts = str.trim().split(",").map(Number);
    return parts.length === 3 && parts.every((n) => !Number.isNaN(n)) ? parts : [102, 192, 244];
  }

  function alreadyPlayed() {
    try {
      return sessionStorage.getItem(SS_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markPlayed() {
    try {
      sessionStorage.setItem(SS_KEY, "1");
    } catch (e) {}
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "boot-intro";
    overlay.innerHTML =
      '<canvas id="boot-canvas"></canvas>' +
      '<div class="boot-logo-wrap" aria-hidden="true">' +
      `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">` +
      '<g class="lg-build">' +
      `<circle class="lg-pupil" cx="${EYE_CX}" cy="${EYE_CY}" r="6.09" />` +
      `<circle class="lg-eye-ring" cx="${EYE_CX}" cy="${EYE_CY}" r="${EYE_MID_R}" ` +
      `stroke-width="${EYE_RING_W}" stroke-dasharray="${EYE_CIRC}" stroke-dashoffset="${EYE_CIRC * 0.28}" />` +
      `<path class="lg-arm" d="${GROUP_A_D}" />` +
      "</g>" +
      `<path class="lg-final" d="${STEAM_ICON_PATH_D}" />` +
      `<circle class="lg-badge" cx="${FULL_CX}" cy="${FULL_CY}" r="${BADGE_R}" ` +
      `stroke-dasharray="${BADGE_CIRC}" stroke-dashoffset="${BADGE_CIRC}" />` +
      "</svg>" +
      "</div>" +
      '<div class="boot-wordmark" aria-hidden="true">Steam Games Analysis</div>' +
      '<button type="button" class="boot-skip">Skip intro</button>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function teardown(overlay) {
    document.documentElement.classList.remove("boot-lock");
    overlay.remove();
    markPlayed();
  }

  function runReducedMotion() {
    document.documentElement.classList.add("boot-lock");
    const overlay = buildOverlay();
    overlay.classList.add("boot-reduced");

    function finish() {
      overlay.classList.add("boot-fade");
      window.setTimeout(() => teardown(overlay), 500);
    }

    overlay.addEventListener("click", finish);
    requestAnimationFrame(() => overlay.classList.add("boot-assembled"));
    window.setTimeout(finish, 1100);
  }

  function runFullIntro() {
    document.documentElement.classList.add("boot-lock");
    const overlay = buildOverlay();
    const canvas = overlay.querySelector("#boot-canvas");
    const ctx = canvas.getContext("2d");
    const skipBtn = overlay.querySelector(".boot-skip");
    const logoWrap = overlay.querySelector(".boot-logo-wrap");

    const styles = getComputedStyle(document.documentElement);
    const blueRgb = parseRgb(styles.getPropertyValue("--series-1-rgb") || "102, 192, 244");
    const violetRgb = parseRgb(styles.getPropertyValue("--decor-4-rgb") || "155, 107, 255");
    const PUPIL_RGB = [26, 159, 255]; // matches --accent-strong / .lg-pupil fill (#1a9fff)

    let W = 0;
    let H = 0;
    let logoSize = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      logoSize = Math.min(W, H) * 0.38;
      logoWrap.style.setProperty("--boot-logo-size", logoSize + "px");
    }
    resize();

    const COUNT = Math.round(Math.min(420, Math.max(160, (W * H) / 5000)));
    const particles = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.3 + 0.6,
        base: Math.random() < 0.82 ? blueRgb : violetRgb,
        convergeT: 0,
        sx: 0,
        sy: 0,
        tx: 0,
        ty: 0,
        cpx: 0,
        cpy: 0,
        delay: 0,
      });
    }

    const mouse = { x: W / 2, y: H / 2, active: false };
    function onMove(e) {
      const p = e.touches ? e.touches[0] : e;
      if (!p) return;
      mouse.x = p.clientX;
      mouse.y = p.clientY;
      mouse.active = true;
    }

    let phase = "idle"; // idle -> converging -> logo
    let finishing = false;
    let convergeStart = 0;
    let convergeTargetX = 0;
    let convergeTargetY = 0;
    let convergePupilR = 0;
    const CONVERGE_MS = 1400;
    const SOLID_HOLD_MS = 150; // brief beat on the fully-formed circle before the boot sequence starts
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

    function beginConverge() {
      if (phase !== "idle") return;
      phase = "converging";
      convergeStart = performance.now();

      // Every particle rushes to the exact spot the pupil will appear at
      // (not the logo box's geometric center — the pupil sits up-and-right
      // of that), so the burst hands off to the SVG with no visible jump.
      const wrapCenterX = W / 2;
      const wrapCenterY = H / 2 - 10;
      convergeTargetX = wrapCenterX + (EYE_FRAC_X - 0.5) * logoSize;
      convergeTargetY = wrapCenterY + (EYE_FRAC_Y - 0.5) * logoSize;
      convergePupilR = 6.09 * (logoSize / VB_SIZE);
      const count = particles.length;
      particles.forEach((p, i) => {
        // A sunflower-seed spiral, not random jitter, so the landing spots
        // tile the disc evenly — no random clumps or gaps — and the merge
        // actually resolves into a clean circle rather than a lumpy blob.
        const frac = (i + 0.5) / count;
        const rr = convergePupilR * 0.86 * Math.sqrt(frac);
        const angle = i * GOLDEN_ANGLE;
        p.sx = p.x;
        p.sy = p.y;
        p.tx = convergeTargetX + Math.cos(angle) * rr;
        p.ty = convergeTargetY + Math.sin(angle) * rr;
        p.cpx = (p.sx + p.tx) / 2 + (Math.random() - 0.5) * W * 0.25;
        p.cpy = (p.sy + p.ty) / 2 + (Math.random() - 0.5) * H * 0.25;
        p.delay = Math.random() * 380;
      });
    }

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function drawSolidPupil() {
      // A perfectly round, crisp disc in the pupil's exact color/position/
      // radius — painted last, on top of the particles, so whatever
      // texture or gaps they happen to leave is fully hidden.
      const pupilStr = PUPIL_RGB.join(", ");
      const glow = ctx.createRadialGradient(
        convergeTargetX,
        convergeTargetY,
        0,
        convergeTargetX,
        convergeTargetY,
        convergePupilR * 2.2
      );
      glow.addColorStop(0, `rgba(${pupilStr}, 0.5)`);
      glow.addColorStop(1, `rgba(${pupilStr}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(convergeTargetX, convergeTargetY, convergePupilR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgb(${pupilStr})`;
      ctx.beginPath();
      ctx.arc(convergeTargetX, convergeTargetY, convergePupilR, 0, Math.PI * 2);
      ctx.fill();
    }

    function onParticlesArrived() {
      phase = "solid";
      // Hold on the fully-formed circle for a beat before the boot
      // sequence begins, so it reads as a deliberate "it's formed" moment
      // rather than an instant hand-off.
      window.setTimeout(revealLogo, SOLID_HOLD_MS);
    }

    function revealLogo() {
      if (finishing) return;
      phase = "logo";
      canvas.classList.add("boot-canvas-hide");
      overlay.classList.add("boot-logo-active");
      window.setTimeout(() => {
        overlay.classList.add("boot-assembled");
      }, 2300);
      window.setTimeout(() => {
        if (finishing) return;
        finishing = true;
        overlay.classList.add("boot-fade");
        window.setTimeout(finalTeardown, 1100);
      }, 3500);
    }

    function finalTeardown() {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("keydown", onKey);
      teardown(overlay);
    }

    function skipIntro() {
      if (finishing) return;
      finishing = true;
      overlay.classList.add("boot-fade");
      window.setTimeout(finalTeardown, 500);
    }

    function onKey(e) {
      if (e.key === "Escape") skipIntro();
    }

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("keydown", onKey);
    overlay.addEventListener("click", beginConverge);
    overlay.addEventListener("touchstart", beginConverge, { passive: true });
    skipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      skipIntro();
    });

    function frame(now) {
      // Trailing fade (instead of a hard clear) gives particles a light-streak trail.
      ctx.fillStyle = "rgba(6, 9, 13, 0.22)";
      ctx.fillRect(0, 0, W, H);

      if (phase === "idle") {
        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          if (mouse.active) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < 130) {
              const force = ((130 - dist) / 130) * 0.6;
              p.x += (dx / dist) * force;
              p.y += (dy / dist) * force;
            }
          }
          if (p.x < 0) p.x = W;
          if (p.x > W) p.x = 0;
          if (p.y < 0) p.y = H;
          if (p.y > H) p.y = 0;
        });
      } else if (phase === "converging") {
        let allDone = true;
        particles.forEach((p) => {
          const elapsed = now - convergeStart - p.delay;
          if (elapsed < 0) {
            allDone = false;
            return;
          }
          const t = Math.min(1, elapsed / CONVERGE_MS);
          if (t < 1) allDone = false;
          const e = easeInOutCubic(t);
          const mt = 1 - e;
          p.x = mt * mt * p.sx + 2 * mt * e * p.cpx + e * e * p.tx;
          p.y = mt * mt * p.sy + 2 * mt * e * p.cpy + e * e * p.ty;
          // Color shifts to the pupil's exact blue a little ahead of
          // arrival, so particles are already "charged up" by the time
          // they land — and drop the white sparkle core in the process.
          p.convergeT = Math.min(1, e * 1.4);
        });
        if (allDone) onParticlesArrived();
      }

      particles.forEach((p) => {
        const ct = p.convergeT;
        const cr = p.base[0] + (PUPIL_RGB[0] - p.base[0]) * ct;
        const cg = p.base[1] + (PUPIL_RGB[1] - p.base[1]) * ct;
        const cb = p.base[2] + (PUPIL_RGB[2] - p.base[2]) * ct;
        const color = `${cr}, ${cg}, ${cb}`;

        // Particles swell toward roughly half the pupil's radius as they
        // converge, so hundreds of overlapping circles visibly melt
        // together into one solid disc — not a hidden last-frame swap.
        const drawR = p.r + (convergePupilR * 0.5 - p.r) * ct;
        const glowMult = 5 - 3.3 * ct;
        const glowAlpha = 0.95 - 0.35 * ct;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, drawR * glowMult);
        glow.addColorStop(0, `rgba(${color}, ${glowAlpha})`);
        glow.addColorStop(1, `rgba(${color}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawR * glowMult, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgb(${color})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawR, 0, Math.PI * 2);
        ctx.fill();
      });

      // On the exact frame the particles finish arriving, paint the
      // perfect circle on top as the final word on their shape.
      if (phase === "solid") drawSolidPupil();

      if (!finishing && (phase === "idle" || phase === "converging")) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function runIntro() {
    if (alreadyPlayed()) return;
    if (reduceMotion) {
      runReducedMotion();
    } else {
      runFullIntro();
    }
  }

  function replayIntro() {
    try {
      sessionStorage.removeItem(SS_KEY);
    } catch (e) {}
    const existing = document.getElementById("boot-intro");
    if (existing) existing.remove();
    document.documentElement.classList.remove("boot-lock");
    runIntro();
  }

  window.VGBootIntro = { run: runIntro, replay: replayIntro };

  const replayBtn = document.getElementById("replay-intro");
  if (replayBtn) replayBtn.addEventListener("click", replayIntro);

  if (!alreadyPlayed()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runIntro);
    } else {
      runIntro();
    }
  }
})();
