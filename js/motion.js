/*
 * Progressive-enhancement scroll reveal. Elements only get the initial
 * hidden state once this script adds the "reveal" class, so a JS failure
 * degrades to everything simply being visible.
 */
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.VGMotion = { reveal: function () {}, revealAll: function () {} };
    return;
  }

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

  function reveal(el) {
    if (!el || el.classList.contains("reveal")) return;
    el.classList.add("reveal");
    observer.observe(el);
  }

  function revealAll(root) {
    (root || document).querySelectorAll(".finding, .stat-tile, .chart-grid .chart-card, .filter-bar, .table-wrap").forEach(reveal);
  }

  window.VGMotion = { reveal, revealAll };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => revealAll());
  } else {
    revealAll();
  }
})();
