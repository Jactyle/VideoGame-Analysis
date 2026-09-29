/*
 * Progressive-enhancement scroll reveal, lazy chart draw-in, number
 * count-up, and the reading-progress bar. Elements only get the initial
 * hidden state once this script adds the "reveal" class, so a JS failure
 * degrades to everything simply being visible; reduced-motion visitors get
 * the same end state instantly, with no animation loop, no deferred chart
 * construction, and no stat-tile pulse.
 */
(function () {
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A short ring-pulse on a stat tile whenever its number actually changes
  // (see animateNumber below) — skipped entirely under reduced motion.
  function pulse(el) {
    if (!el || reducedMotion) return;
    el.classList.remove("pulse");
    void el.offsetWidth; // reflow, so re-adding the class restarts the animation on rapid successive changes
    el.classList.add("pulse");
  }

  if (reducedMotion) {
    window.VGMotion = {
      prefersReducedMotion: true,
      reveal: function () {},
      revealAll: function () {},
      onVisible: function (el, callback) {
        if (callback) callback();
        return function () {};
      },
      animateNumber: function (el, toValue, opts) {
        if (!el) return;
        const formatter = (opts && opts.formatter) || ((n) => String(Math.round(n)));
        el.textContent = formatter(toValue);
      },
      pulse: function () {},
    };
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    const reveal = (el) => {
      if (!el || el.classList.contains("reveal")) return;
      el.classList.add("reveal");
      observer.observe(el);
    };

    const revealAll = (root) => {
      (root || document).querySelectorAll(".finding, .stat-tile, .chart-grid .chart-card, .filter-bar, .table-wrap").forEach(reveal);
    };

    // Runs `callback` once, the first time `el` scrolls into view, then
    // stops watching. Used to defer a chart's initial construction until
    // its card is visible, so Chart.js's own grow-in animation plays on
    // scroll instead of firing off-screen at page load. Returns a cancel
    // function — a caller that ends up drawing `el` itself (e.g. a filter
    // change that lands before the card ever scrolled into view) must call
    // it, or this pending observer will fire later with whatever callback
    // it was given and clobber the fresher draw.
    const onVisible = (el, callback) => {
      if (!el || !callback) return () => {};
      if (!("IntersectionObserver" in window)) {
        callback();
        return () => {};
      }
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              io.unobserve(entry.target);
              callback();
            }
          }
        },
        { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
      );
      io.observe(el);
      return () => io.unobserve(el);
    };

    // Animates an element's text from its currently-displayed value (0 the
    // first time) to `toValue`, easing out over `duration`ms, and pulses the
    // nearest .stat-tile when the value actually changed. Re-triggering
    // while a prior run is still going (a fast filter change) retargets
    // smoothly from wherever the number is actually rendered right now,
    // rather than snapping back to the previous run's target first.
    const animateNumber = (el, toValue, { duration = 700, formatter = (n) => String(Math.round(n)) } = {}) => {
      if (!el || !Number.isFinite(toValue)) return;
      const from = Number.isFinite(el.__vgCurrentValue) ? el.__vgCurrentValue : 0;
      if (el.__vgRaf) cancelAnimationFrame(el.__vgRaf);
      if (from === toValue) {
        el.textContent = formatter(toValue);
        el.__vgCurrentValue = toValue;
        return;
      }
      pulse(el.closest(".stat-tile"));
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const current = from + (toValue - from) * eased;
        el.__vgCurrentValue = current;
        el.textContent = formatter(current);
        el.__vgRaf = t < 1 ? requestAnimationFrame(step) : null;
      };
      el.__vgRaf = requestAnimationFrame(step);
    };

    window.VGMotion = { prefersReducedMotion: false, reveal, revealAll, onVisible, animateNumber, pulse };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => revealAll());
    } else {
      revealAll();
    }
  }

  // Reading-progress bar — report page only (dashboard.html has no
  // #scroll-progress-bar element, so this is a no-op there). Reflects
  // scroll position directly on every scroll/resize, rAF-throttled; not
  // gated by reduced motion, same as a native scrollbar.
  function initScrollProgress() {
    const bar = document.getElementById("scroll-progress-bar");
    if (!bar) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const frac = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      bar.style.transform = `scaleX(${frac})`;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScrollProgress);
  } else {
    initScrollProgress();
  }
})();
