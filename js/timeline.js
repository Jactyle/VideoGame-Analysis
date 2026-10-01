/*
 * Interactive release timeline: one node per release year, sized by how many
 * games shipped that year. Picking a year lists its biggest releases,
 * ranked by estimated owners (review count breaks ties, since SteamSpy's
 * owner figures are coarse buckets). Mounted by report.js with the already
 * loaded games so the CSV isn't parsed twice.
 */
(function () {
  const TOP_N = 5;
  const DEFAULT_YEAR = 2015;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Steam's public CDN serves each game's art by app id. Each slot lists
  // its preferred image first and falls back down the list (older listings
  // often lack the portrait capsule), ending on a blank tile.
  const ART_BASE = "https://cdn.akamai.steamstatic.com/steam/apps";
  const ART = { portrait: "library_600x900.jpg", header: "header.jpg" };
  function art(r, className, kinds, eager) {
    const img = el("img", className);
    img.alt = "";
    img.loading = eager ? "eager" : "lazy";
    img.decoding = "async";
    const sources = kinds.map((k) => `${ART_BASE}/${r.appId}/${ART[k]}`);
    let i = 0;
    img.addEventListener("error", () => {
      i += 1;
      if (i < sources.length) img.src = sources[i];
      else img.classList.add("is-missing");
    });
    img.src = sources[0];
    return img;
  }

  // Same buckets Steam's own store page uses for its review summary line.
  function reviewSummary(r) {
    if (r.reviewCount < 10 || r.reviewRate === null) return null;
    const pct = r.reviewRate * 100;
    let label;
    if (pct >= 95 && r.reviewCount >= 500) label = "Overwhelmingly Positive";
    else if (pct >= 80 && r.reviewCount >= 50) label = "Very Positive";
    else if (pct >= 80) label = "Positive";
    else if (pct >= 70) label = "Mostly Positive";
    else if (pct >= 40) label = "Mixed";
    else if (pct >= 20) label = "Mostly Negative";
    else label = r.reviewCount >= 500 ? "Overwhelmingly Negative" : "Very Negative";
    return { label, tone: pct >= 70 ? "pos" : pct >= 40 ? "mixed" : "neg" };
  }

  // The Steam-store-style hero + rail. Shared by the report timeline and the
  // dashboard's filter-driven panel: render(games) shows up to a handful of
  // games, hero on the first and the rest hoverable in the rail.
  function createFeatured({ formatCompact, formatNumber }) {
    const root = el("div", "store-feature");
    const hero = el("div", "store-hero");
    const rail = el("div", "store-rail");
    root.append(hero, rail);

    // Filter changes re-render constantly but the top picks rarely change, so
    // an identical list is a no-op (no image refetch/flicker). Hero nodes are
    // cached per game for the same reason when hovering back and forth.
    let shownKey = null;
    const heroCache = new Map();

    function buildHero(r) {
      const stage = el("div", "store-stage");
      stage.append(art(r, "store-capsule", ["header", "portrait"], true));

      const info = el("div", "store-info");
      info.appendChild(el("h4", "store-name", r.name));
      const tags = el("div", "store-tags");
      [r.genre, r.category].filter(Boolean).forEach((t) => tags.appendChild(el("span", "store-tag", t)));
      info.appendChild(tags);
      const rev = reviewSummary(r);
      if (rev) {
        const line = el("div", "store-review");
        line.append(
          el("span", `store-review-label is-${rev.tone}`, rev.label),
          el("span", "store-review-count", ` (${formatNumber(r.reviewCount)} reviews)`)
        );
        info.appendChild(line);
      }
      info.appendChild(el("div", "store-owners", `~${formatCompact(r.ownersMid)} owners`));
      info.appendChild(el("div", "store-price", r.isFree ? "Free To Play" : `$${r.price.toFixed(2)}`));
      return [stage, info];
    }

    function renderHero(r) {
      if (!heroCache.has(r.appId)) heroCache.set(r.appId, buildHero(r));
      hero.replaceChildren(...heroCache.get(r.appId));
    }

    function render(picks) {
      const key = picks.map((r) => r.appId).join(",");
      if (key === shownKey) return;
      shownKey = key;
      const railItems = [];
      function pick(i) {
        renderHero(picks[i]);
        railItems.forEach((btn, j) => btn.classList.toggle("is-active", j === i));
      }
      picks.forEach((r, i) => {
        const btn = el("button", "store-rail-item");
        btn.type = "button";
        const text = el("span", "store-rail-text");
        text.append(
          el("span", "store-rail-name", r.name),
          el("span", "store-rail-price", r.isFree ? "Free To Play" : `$${r.price.toFixed(2)}`)
        );
        btn.append(art(r, "timeline-art", ["portrait", "header"]), text);
        // Steam's own featured rail swaps the hero on hover; click covers touch.
        btn.addEventListener("mouseenter", () => pick(i));
        btn.addEventListener("focus", () => pick(i));
        btn.addEventListener("click", () => pick(i));
        railItems.push(btn);
      });
      rail.replaceChildren(...railItems);
      if (picks.length) pick(0);
      else hero.replaceChildren();
    }

    return { root, render };
  }

  // A horizontal strip with one tile per year: that year's top game by the
  // given key, box art only, with a caption line for whichever tile is
  // hovered/focused. Long ranges are thinned to every k-th year so the
  // strip stays scannable. onPick(year) fires on click.
  const MAX_MILESTONES = 15;
  function createMilestones({ formatCompact, onPick, onShowAll }) {
    const root = el("div", "milestones");
    const strip = el("div", "milestones-strip");
    const footer = el("div", "milestones-footer");
    const caption = el("p", "milestones-caption");
    caption.setAttribute("aria-live", "polite");
    // Shown only while the year range is narrower than the full dataset, so
    // there's a way back after clicking a tile (or setting the year filters).
    const showAll = el("button", "milestones-all", "Show all years");
    showAll.type = "button";
    showAll.hidden = true;
    showAll.addEventListener("click", onShowAll);
    footer.append(caption, showAll);
    root.append(strip, footer);

    let shownSig = null;
    function render(rows, key, tiebreak, narrowed) {
      showAll.hidden = !narrowed;
      const bestByYear = new Map();
      for (const r of rows) {
        const cur = bestByYear.get(r.releaseYear);
        if (!cur || r[key] > cur[key] || (r[key] === cur[key] && r[tiebreak] > cur[tiebreak])) {
          bestByYear.set(r.releaseYear, r);
        }
      }
      let years = Array.from(bestByYear.keys()).sort((a, b) => a - b);
      const step = Math.ceil(years.length / MAX_MILESTONES);
      if (step > 1) years = years.filter((_, i) => i % step === 0);

      const sig = years.map((y) => bestByYear.get(y).appId).join(",") + `|${step}`;
      if (sig === shownSig) return;
      shownSig = sig;

      const describe = (r) =>
        `${r.releaseYear} · ${r.name} — ${[r.genre, `~${formatCompact(r.ownersMid)} owners`].filter(Boolean).join(" · ")}`;
      const defaultCaption = step > 1 ? `Showing every ${step === 2 ? "other" : `${step}th`} year in your range.` : "";

      const tiles = years.map((y) => {
        const r = bestByYear.get(y);
        const btn = el("button", "milestone");
        btn.type = "button";
        btn.setAttribute("aria-label", `${describe(r)}. Filter to ${y}.`);
        btn.append(art(r, "milestone-art", ["portrait", "header"]), el("span", "milestone-year", String(y)));
        const show = () => {
          caption.textContent = describe(r);
          tiles.forEach((t) => t.classList.toggle("is-active", t === btn));
        };
        const hide = () => {
          caption.textContent = defaultCaption;
          btn.classList.remove("is-active");
        };
        btn.addEventListener("mouseenter", show);
        btn.addEventListener("focus", show);
        btn.addEventListener("mouseleave", hide);
        btn.addEventListener("blur", hide);
        btn.addEventListener("click", () => onPick(y));
        return btn;
      });
      strip.replaceChildren(...tiles);
      caption.textContent = defaultCaption;
      root.hidden = tiles.length === 0;
    }

    return { root, render };
  }

  // Incremental top-n collector (descending by key, then tiebreak). Lets a
  // caller bucket many groups in one pass over the rows instead of one pass
  // per group.
  function createTopN(n, key, tiebreak) {
    const best = [];
    const better = (a, b) => b[key] - a[key] || b[tiebreak] - a[tiebreak];
    return {
      add(r) {
        if (best.length === n && better(r, best[n - 1]) >= 0) return;
        let i = best.length;
        while (i > 0 && better(r, best[i - 1]) < 0) i -= 1;
        best.splice(i, 0, r);
        if (best.length > n) best.pop();
      },
      result: () => best,
    };
  }

  // Top n rows by key, in one pass instead of a full sort — the dashboard
  // re-runs this on every filter change.
  function topGames(rows, n, key, tiebreak) {
    const top = createTopN(n, key, tiebreak);
    for (const r of rows) top.add(r);
    return top.result();
  }

  function init(games, { formatNumber, formatCompact, onExplore }) {
    const root = document.getElementById("timeline-root");
    if (!root) return;

    const byYear = new Map();
    for (const r of games) {
      if (!byYear.has(r.releaseYear)) byYear.set(r.releaseYear, []);
      byYear.get(r.releaseYear).push(r);
    }
    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    const maxCount = Math.max(...years.map((y) => byYear.get(y).length));

    const topByYear = new Map();
    function topFor(year) {
      if (!topByYear.has(year)) {
        topByYear.set(year, topGames(byYear.get(year), TOP_N, "ownersMid", "reviewCount"));
      }
      return topByYear.get(year);
    }

    const track = el("div", "timeline-track");
    track.setAttribute("role", "radiogroup");
    track.setAttribute("aria-label", "Release year");
    const panel = el("div", "timeline-panel");
    panel.setAttribute("aria-live", "polite");
    root.replaceChildren(track, panel);

    const buttons = new Map();
    for (const year of years) {
      const count = byYear.get(year).length;
      const btn = el("button", "timeline-node");
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-label", `${year}, ${formatNumber(count)} games`);
      btn.dataset.year = year;
      const dot = el("span", "timeline-dot");
      const size = 10 + 26 * Math.sqrt(count / maxCount);
      dot.style.width = dot.style.height = `${size.toFixed(1)}px`;
      const slot = el("span", "timeline-slot");
      slot.appendChild(dot);
      btn.append(slot, el("span", "timeline-year", String(year)));
      btn.addEventListener("click", () => {
        if (select(year, false)) playChange();
      });
      track.appendChild(btn);
      buttons.set(year, btn);
    }

    const featured = createFeatured({ formatCompact, formatNumber });

    function renderPanel(year) {
      const head = el("div", "timeline-head");
      head.append(
        el("h3", "timeline-title", `Featured releases of ${year}`),
        el("span", "timeline-sub", `${formatNumber(byYear.get(year).length)} games released`)
      );

      featured.render(topFor(year));

      const explore = el("button", "timeline-explore", `Browse all ${year} releases in the dashboard →`);
      explore.type = "button";
      explore.addEventListener("click", () => onExplore(year));

      panel.replaceChildren(head, featured.root, explore);
    }

    // Same clip the dashboard plays when a filter is applied. Only for real
    // user picks, not the initial render, and VGSound handles the mute gate.
    function playChange() {
      if (window.VGSound) window.VGSound.play("apply");
    }

    // Returns whether the selection actually changed.
    let current = null;
    function select(year, scroll) {
      if (year === current) return false;
      current = year;
      buttons.forEach((btn, y) => {
        const on = y === year;
        btn.setAttribute("aria-checked", String(on));
        btn.tabIndex = on ? 0 : -1;
        btn.classList.toggle("is-active", on);
      });
      renderPanel(year);
      if (scroll) {
        const btn = buttons.get(year);
        track.scrollTo({ left: btn.offsetLeft - track.clientWidth / 2 + btn.offsetWidth / 2, behavior: "smooth" });
      }
      return true;
    }

    track.addEventListener("keydown", (e) => {
      const i = years.indexOf(current);
      let next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = years[Math.min(i + 1, years.length - 1)];
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = years[Math.max(i - 1, 0)];
      else if (e.key === "Home") next = years[0];
      else if (e.key === "End") next = years[years.length - 1];
      if (next === null) return;
      e.preventDefault();
      if (select(next, true)) playChange();
      buttons.get(next).focus();
    });

    const start = years.includes(DEFAULT_YEAR) ? DEFAULT_YEAR : years[years.length - 1];
    select(start, false);
    const startBtn = buttons.get(start);
    track.scrollLeft = startBtn.offsetLeft - track.clientWidth / 2 + startBtn.offsetWidth / 2;
  }

  window.VGTimeline = { init, createFeatured, createMilestones, topGames, createTopN };
})();
