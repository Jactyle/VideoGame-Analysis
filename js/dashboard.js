(function () {
  const { loadGames, aggregateBy, topNWithOther, summarize, distinctValues, measureValue, BREAKDOWNS, MEASURES, formatCompact, formatNumber } =
    window.VGData;
  const VGMotion = window.VGMotion;

  const TOP_N = 12;

  // Aperture Science's own logo, stamped in front of each figure number.
  const CHART_FIG_ICON = `<img src="img/aperture-logo.png" class="chart-fig-logo" alt="" width="160" height="41" />`;

  const CHART_PANELS = [
    { id: "chart-1", title: "Count by category", defaultMeasure: "count", defaultBreakdown: "genre" },
    { id: "chart-2", title: "Trend over time", defaultMeasure: "totalOwners", defaultBreakdown: "releaseYear" },
    { id: "chart-3", title: "Reception by category", defaultMeasure: "reviewRate", defaultBreakdown: "platform" },
    { id: "chart-4", title: "Engagement by category", defaultMeasure: "medianPlaytime", defaultBreakdown: "publisher" },
  ];

  let allGames = [];
  let filtered = [];
  let tableSort = { field: "count", dir: "desc" };

  // Lets a table row double as a shortcut into the filter bar: clicking a
  // row drills the whole dashboard down to that group, clicking it again
  // (or hitting Reset filters) backs out. Only breakdowns with a matching
  // filter control get this — "Category" has none, so it's display-only.
  const DRILLDOWNS = {
    genre: {
      canApply: (key) => [...document.getElementById("filter-genre").options].some((o) => o.value === key),
      apply: (key) => { document.getElementById("filter-genre").value = key; },
      clear: () => { document.getElementById("filter-genre").value = ""; },
    },
    platform: {
      canApply: (key) => [...document.getElementById("filter-platform").options].some((o) => o.value === key),
      apply: (key) => { document.getElementById("filter-platform").value = key; },
      clear: () => { document.getElementById("filter-platform").value = ""; },
    },
    publisher: {
      canApply: () => true,
      apply: (key) => { document.getElementById("filter-publisher").value = key; },
      clear: () => { document.getElementById("filter-publisher").value = ""; },
    },
    free: {
      canApply: (key) => key === "Free" || key === "Paid",
      apply: (key) => { document.getElementById("filter-free").value = key === "Free" ? "free" : "paid"; },
      clear: () => { document.getElementById("filter-free").value = ""; },
    },
    releaseYear: {
      canApply: (key) => [...document.getElementById("filter-year-from").options].some((o) => o.value === key),
      apply: (key) => {
        document.getElementById("filter-year-from").value = key;
        document.getElementById("filter-year-to").value = key;
      },
      clear: () => {
        const yearFrom = document.getElementById("filter-year-from");
        const yearTo = document.getElementById("filter-year-to");
        yearFrom.selectedIndex = 0;
        yearTo.selectedIndex = yearTo.options.length - 1;
      },
    },
  };

  function isDrillable(breakdownKey, key) {
    if (key === "Other") return false;
    const d = DRILLDOWNS[breakdownKey];
    return d ? d.canApply(key) : false;
  }

  function isRowActive(breakdownKey, key) {
    switch (breakdownKey) {
      case "genre":
        return document.getElementById("filter-genre").value === key;
      case "platform":
        return document.getElementById("filter-platform").value === key;
      case "publisher": {
        const v = document.getElementById("filter-publisher").value.trim().toLowerCase();
        return v !== "" && v === key.toLowerCase();
      }
      case "free":
        return document.getElementById("filter-free").value === (key === "Free" ? "free" : "paid");
      case "releaseYear": {
        const yearFrom = document.getElementById("filter-year-from").value;
        const yearTo = document.getElementById("filter-year-to").value;
        return yearFrom === key && yearTo === key;
      }
      default:
        return false;
    }
  }

  function handleRowDrill(breakdownKey, key) {
    const d = DRILLDOWNS[breakdownKey];
    if (!d || !d.canApply(key)) return;
    if (isRowActive(breakdownKey, key)) {
      d.clear();
      VGSound.play("reset");
    } else {
      d.apply(key);
      VGSound.play("apply");
    }
    renderAll();
  }

  function populateSelect(select, values, { withAllLabel } = {}) {
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
  }

  function buildOptionSelect(mapObj, selectedKey) {
    const select = document.createElement("select");
    for (const [key, meta] of Object.entries(mapObj)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.label;
      if (key === selectedKey) opt.selected = true;
      select.appendChild(opt);
    }
    return select;
  }

  let allYears = [];

  function setupFilterOptions() {
    allYears = distinctValues(allGames, (r) => r.releaseYear).filter((y) => y !== null);
    const yearFrom = document.getElementById("filter-year-from");
    const yearTo = document.getElementById("filter-year-to");
    populateSelect(yearFrom, allYears);
    populateSelect(yearTo, allYears);
    yearFrom.value = allYears[0];
    yearTo.value = allYears[allYears.length - 1];

    const genres = distinctValues(allGames, (r) => r.genre).filter(Boolean);
    populateSelect(document.getElementById("filter-genre"), genres);

    const platforms = distinctValues(allGames, (r) => r.platforms).filter(Boolean);
    populateSelect(document.getElementById("filter-platform"), platforms);

    const tableBreakdown = document.getElementById("table-breakdown");
    for (const [key, meta] of Object.entries(BREAKDOWNS)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.label;
      if (key === "genre") opt.selected = true;
      tableBreakdown.appendChild(opt);
    }
  }

  // Reads filters out of the URL (e.g. a link from a report chart, or a
  // bookmarked/shared view) and applies them to the controls before the
  // first render. Only ever sets a control to a value that's actually a
  // valid option, so a stale or hand-edited URL can't leave a filter
  // pointing at something that doesn't exist.
  function applyURLParams() {
    const params = new URLSearchParams(window.location.search);

    const yearFrom = params.get("yearFrom");
    if (yearFrom && allYears.includes(Number(yearFrom))) document.getElementById("filter-year-from").value = yearFrom;
    const yearTo = params.get("yearTo");
    if (yearTo && allYears.includes(Number(yearTo))) document.getElementById("filter-year-to").value = yearTo;

    const genre = params.get("genre");
    if (genre) {
      const sel = document.getElementById("filter-genre");
      if ([...sel.options].some((o) => o.value === genre)) sel.value = genre;
    }
    const platform = params.get("platform");
    if (platform) {
      const sel = document.getElementById("filter-platform");
      if ([...sel.options].some((o) => o.value === platform)) sel.value = platform;
    }
    const free = params.get("free");
    if (free === "free" || free === "paid") document.getElementById("filter-free").value = free;

    const publisher = params.get("publisher");
    if (publisher) document.getElementById("filter-publisher").value = publisher;
  }

  // Mirrors the active filters into the URL (replacing history, not
  // pushing, so filter changes don't spam the back button) so the current
  // view is a shareable/bookmarkable link. Only non-default values are
  // included, so the default view keeps a clean URL.
  function syncURL() {
    const f = currentFilters();
    const params = new URLSearchParams();
    if (f.yearFrom !== allYears[0]) params.set("yearFrom", f.yearFrom);
    if (f.yearTo !== allYears[allYears.length - 1]) params.set("yearTo", f.yearTo);
    if (f.genre) params.set("genre", f.genre);
    if (f.platform) params.set("platform", f.platform);
    if (f.free) params.set("free", f.free);
    if (f.publisher) params.set("publisher", f.publisher);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }

  function currentFilters() {
    return {
      yearFrom: Number(document.getElementById("filter-year-from").value),
      yearTo: Number(document.getElementById("filter-year-to").value),
      genre: document.getElementById("filter-genre").value,
      platform: document.getElementById("filter-platform").value,
      free: document.getElementById("filter-free").value,
      publisher: document.getElementById("filter-publisher").value.trim().toLowerCase(),
    };
  }

  function applyFilters() {
    const f = currentFilters();
    filtered = allGames.filter((r) => {
      if (r.releaseYear < f.yearFrom || r.releaseYear > f.yearTo) return false;
      if (f.genre && r.genre !== f.genre) return false;
      if (f.platform && r.platforms !== f.platform) return false;
      if (f.free === "free" && !r.isFree) return false;
      if (f.free === "paid" && r.isFree) return false;
      if (f.publisher && !r.publisher.toLowerCase().includes(f.publisher)) return false;
      return true;
    });
    aggregateCache = new Map();
  }

  // The 4 chart panels and the table breakdown often land on the same key
  // (both default to "genre"), and each aggregateBy pass is a full scan over
  // up to ~117k rows — memoize per render pass instead of repeating it.
  let aggregateCache = new Map();
  function getAggregated(breakdownKey) {
    if (!aggregateCache.has(breakdownKey)) {
      aggregateCache.set(breakdownKey, aggregateBy(filtered, breakdownKey));
    }
    return aggregateCache.get(breakdownKey);
  }

  function renderSummary() {
    const s = summarize(filtered);
    VGMotion.animateNumber(document.getElementById("stat-count"), s.count, { formatter: formatCompact });
    VGMotion.animateNumber(document.getElementById("stat-owners"), s.totalOwners, { formatter: formatCompact });
    VGMotion.animateNumber(document.getElementById("stat-price"), s.avgPrice, { formatter: (n) => `$${n.toFixed(2)}` });
    VGMotion.animateNumber(document.getElementById("stat-rate"), s.reviewRate, { formatter: (n) => `${n.toFixed(1)}%` });
  }

  // A panel's first paint is deferred until its card scrolls into view, so
  // Chart.js's grow-in animation plays on scroll instead of firing off-screen
  // at load; every later call (a filter or switch change) draws immediately,
  // since the panel is already visible and the reader expects instant feedback.
  function renderChartPanel(panel) {
    const measureKey = document.getElementById(`${panel.id}-measure`).value;
    const breakdownKey = document.getElementById(`${panel.id}-breakdown`).value;
    const canvas = document.getElementById(`${panel.id}-canvas`);
    const measureLabel = MEASURES[measureKey].label;
    const breakdownLabel = BREAKDOWNS[breakdownKey].label;

    document.getElementById(`${panel.id}-heading`).textContent = `${measureLabel} by ${breakdownLabel.toLowerCase()}`;

    const aggregated = getAggregated(breakdownKey);

    const draw = () => {
      if (breakdownKey === "releaseYear") {
        const sorted = [...aggregated].sort((a, b) => Number(a.key) - Number(b.key));
        VGCharts.lineChart(
          canvas,
          sorted.map((r) => r.key),
          [{ label: measureLabel, data: sorted.map((r) => measureValue(r, measureKey)) }]
        );
      } else {
        const top = topNWithOther(aggregated, measureKey, TOP_N);
        VGCharts.barChart(
          canvas,
          top.map((r) => r.key),
          top.map((r) => measureValue(r, measureKey)),
          { label: measureLabel, horizontal: breakdownKey === "publisher" }
        );
      }
    };

    if (!panel._initialized) {
      panel._initialized = true;
      panel._cancelOnVisible = VGMotion.onVisible(canvas, draw);
    } else {
      // A later render (e.g. a filter change) always draws immediately —
      // cancel any still-pending "first scroll into view" draw so it can't
      // fire afterward with the stale data it closed over and clobber this.
      if (panel._cancelOnVisible) {
        panel._cancelOnVisible();
        panel._cancelOnVisible = null;
      }
      draw();
    }
  }

  function renderTable() {
    const breakdownKey = document.getElementById("table-breakdown").value;
    let aggregated = topNWithOther(getAggregated(breakdownKey), "count", 30);

    aggregated.sort((a, b) => {
      const dir = tableSort.dir === "asc" ? 1 : -1;
      const av = a[tableSort.field];
      const bv = b[tableSort.field];
      if (typeof av === "string") return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });

    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    tableGroupNames = new Set(aggregated.map((r) => r.key).filter((k) => k !== "Other"));
    groupCache.clear();
    prefetchOpenGroups(breakdownKey);
    // Rows fade/rise in on a stagger, capped so a large table doesn't take
    // forever to finish settling; skipped under reduced motion.
    const animate = !VGMotion.prefersReducedMotion;
    const enteringRows = [];
    aggregated.forEach((row, i) => {
      const tr = document.createElement("tr");
      if (isDrillable(breakdownKey, row.key)) {
        tr.classList.add("row-drillable");
        tr.tabIndex = 0;
        tr.setAttribute("role", "button");
        tr.setAttribute("aria-label", `Filter the dashboard to ${row.key}`);
        tr.dataset.breakdown = breakdownKey;
        tr.dataset.key = row.key;
        if (isRowActive(breakdownKey, row.key)) {
          tr.classList.add("row-active");
          tr.setAttribute("aria-pressed", "true");
        }
      }
      const isOpen = expandedGroups.has(`${breakdownKey}|${row.key}`);
      tr.innerHTML = `
        <td></td>
        <td class="num-cell">${formatNumber(row.count)}</td>
        <td class="num-cell">${formatCompact(row.totalOwners)}</td>
        <td class="num-cell">$${row.avgPrice.toFixed(2)}</td>
        <td class="num-cell">${formatNumber(row.medianPlaytime)}</td>
        <td class="num-cell">${row.reviewRate.toFixed(1)}%</td>
      `;
      tr.firstElementChild.append(buildExpandButton(breakdownKey, row.key, isOpen), document.createTextNode(row.key));
      if (animate) {
        tr.classList.add("row-enter");
        tr.style.transitionDelay = `${Math.min(i * 12, 200)}ms`;
        enteringRows.push(tr);
      }
      tbody.appendChild(tr);
      if (isOpen) tbody.appendChild(buildDetailRow(breakdownKey, row.key));
    });
    if (enteringRows.length) {
      requestAnimationFrame(() => requestAnimationFrame(() => enteringRows.forEach((tr) => tr.classList.remove("row-enter"))));
    }

    updateSortIndicators();
    updateTableStatus(breakdownKey, aggregated);
  }

  // --- Expandable "top games" row under a table group ---
  const expandedGroups = new Set(); // "breakdown|key"
  let tableGroupNames = new Set();
  const groupCache = new Map(); // "breakdown|rank|key" -> top games, cleared each render

  function groupMatcher(breakdownKey) {
    const keyFn = BREAKDOWNS[breakdownKey].keyFn;
    // Rows outside the named table groups roll up into "Other".
    return (r) => {
      const k = keyFn(r);
      return tableGroupNames.has(k) ? k : "Other";
    };
  }

  // One pass over the filtered rows fills the top 5 for every requested
  // group at once, so having several rows open costs the same as one.
  function computeTops(breakdownKey, rankKey, groups) {
    const groupOf = groupMatcher(breakdownKey);
    const collectors = new Map(
      groups.map((g) => [g, window.VGTimeline.createTopN(5, rankKey, RANK_TIEBREAK[rankKey])])
    );
    for (const r of filtered) {
      const c = collectors.get(groupOf(r));
      if (c) c.add(r);
    }
    for (const [g, c] of collectors) groupCache.set(`${breakdownKey}|${rankKey}|${g}`, c.result());
  }

  function topForGroup(breakdownKey, key, rankKey) {
    const cacheKey = `${breakdownKey}|${rankKey}|${key}`;
    if (!groupCache.has(cacheKey)) computeTops(breakdownKey, rankKey, [key]);
    return groupCache.get(cacheKey);
  }

  // Warm the cache for every open group of the current breakdown in one pass.
  function prefetchOpenGroups(breakdownKey) {
    if (!window.VGTimeline) return;
    const rankKey = document.getElementById("featured-rank").value;
    const open = [...expandedGroups]
      .filter((id) => id.startsWith(`${breakdownKey}|`))
      .map((id) => id.slice(breakdownKey.length + 1))
      .filter((g) => g === "Other" || tableGroupNames.has(g))
      .filter((g) => !groupCache.has(`${breakdownKey}|${rankKey}|${g}`));
    if (open.length) computeTops(breakdownKey, rankKey, open);
  }

  function buildExpandButton(breakdownKey, key, isOpen) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-expand";
    btn.dataset.breakdown = breakdownKey;
    btn.dataset.group = key;
    btn.setAttribute("aria-expanded", String(isOpen));
    btn.setAttribute("aria-label", `Top games in ${key}`);
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = isOpen ? "▾" : "▸";
    btn.appendChild(arrow);
    return btn;
  }

  // Rebuilds open detail rows in place (e.g. after the ranking changes).
  function refreshDetailRows() {
    document.querySelectorAll("#table-body tr.detail-row").forEach((tr) => {
      tr.replaceWith(buildDetailRow(tr.dataset.breakdown, tr.dataset.group));
    });
  }

  function cell(tag, text, className) {
    const c = document.createElement(tag);
    c.textContent = text;
    if (className) c.className = className;
    return c;
  }

  function buildDetailRow(breakdownKey, key) {
    const rankKey = document.getElementById("featured-rank").value;
    const games = window.VGTimeline ? topForGroup(breakdownKey, key, rankKey) : [];
    const tr = document.createElement("tr");
    tr.className = "detail-row";
    tr.dataset.breakdown = breakdownKey;
    tr.dataset.group = key;
    const td = document.createElement("td");
    td.colSpan = 6;

    const table = document.createElement("table");
    table.className = "detail-table";
    const head = document.createElement("tr");
    ["Game", "Developer", "Genre", "Released", "Price", "Owners", "Reviews"].forEach((h, i) =>
      head.appendChild(cell("th", h, i >= 4 ? "num-cell" : ""))
    );
    const thead = document.createElement("thead");
    thead.appendChild(head);
    const body = document.createElement("tbody");
    for (const r of games) {
      const row = document.createElement("tr");
      const reviews = r.reviewCount > 0
        ? `${formatCompact(r.reviewCount)}${r.reviewRate !== null ? ` (${Math.round(r.reviewRate * 100)}%)` : ""}`
        : "—";
      row.append(
        cell("td", r.name, "detail-name"),
        cell("td", r.developer || "—"),
        cell("td", r.genre || "—"),
        cell("td", r.releaseDate || "—"),
        cell("td", r.isFree ? "Free" : `$${r.price.toFixed(2)}`, "num-cell"),
        cell("td", `~${formatCompact(r.ownersMid)}`, "num-cell"),
        cell("td", reviews, "num-cell")
      );
      body.appendChild(row);
    }
    table.append(thead, body);
    const title = document.createElement("p");
    title.className = "detail-title";
    title.textContent = `Top ${games.length} in ${key}, ranked by ${document.getElementById("featured-rank").selectedOptions[0].textContent.toLowerCase()}`;
    td.append(title, table);
    tr.appendChild(td);
    return tr;
  }

  const SORT_FIELD_LABELS = {
    key: "Group name",
    count: "Count",
    totalOwners: "Total owners",
    avgPrice: "Avg price",
    medianPlaytime: "Median playtime",
    reviewRate: "Review rate",
  };

  function updateTableStatus(breakdownKey, aggregated) {
    const status = document.getElementById("table-status");
    if (!status) return;
    const breakdownLabel = BREAKDOWNS[breakdownKey].label;
    const fieldLabel = SORT_FIELD_LABELS[tableSort.field];
    const dirWord = tableSort.dir === "asc" ? "lowest first" : "highest first";

    const activeRow = aggregated.find((r) => isDrillable(breakdownKey, r.key) && isRowActive(breakdownKey, r.key));

    let html = `Showing <strong>${aggregated.length}</strong> ${breakdownLabel.toLowerCase()} groups, sorted by <strong>${fieldLabel}</strong> (${dirWord}).`;
    if (activeRow) {
      html += ` Dashboard is filtered to <strong>${activeRow.key}</strong> — click that row again, or Reset filters, to clear it.`;
    }
    status.innerHTML = html;
  }

  function updateSortIndicators() {
    document.querySelectorAll("#data-table th[data-sort]").forEach((th) => {
      const active = th.dataset.sort === tableSort.field;
      th.classList.toggle("sort-asc", active && tableSort.dir === "asc");
      th.classList.toggle("sort-desc", active && tableSort.dir === "desc");
      th.setAttribute("aria-sort", active ? (tableSort.dir === "asc" ? "ascending" : "descending") : "none");
    });
  }

  // Tiebreak keeps the ranking sensible when the primary measure is a coarse
  // bucket (owners) or zero for most rows (playtime).
  const RANK_TIEBREAK = { ownersMid: "reviewCount", reviewCount: "ownersMid", avgPlaytime: "ownersMid" };
  let featured = null;
  function renderFeatured() {
    const root = document.getElementById("featured-root");
    if (!window.VGTimeline) return;
    if (!featured) {
      featured = window.VGTimeline.createFeatured({ formatCompact, formatNumber });
      root.appendChild(featured.root);
    }
    const key = document.getElementById("featured-rank").value;
    const picks = window.VGTimeline.topGames(filtered, 5, key, RANK_TIEBREAK[key]);
    featured.root.hidden = picks.length === 0;
    featured.render(picks);
    document.getElementById("featured-status").textContent = picks.length ? "" : "No games match the current filters.";
  }

  let milestones = null;
  function renderMilestones() {
    if (!window.VGTimeline) return;
    if (!milestones) {
      milestones = window.VGTimeline.createMilestones({
        formatCompact,
        onPick: (year) => {
          document.getElementById("filter-year-from").value = String(year);
          document.getElementById("filter-year-to").value = String(year);
          VGSound.play("apply");
          renderAll();
        },
        onShowAll: () => {
          DRILLDOWNS.releaseYear.clear();
          VGSound.play("reset");
          renderAll();
        },
      });
      document.getElementById("milestones-root").appendChild(milestones.root);
    }
    const key = document.getElementById("featured-rank").value;
    const from = document.getElementById("filter-year-from");
    const to = document.getElementById("filter-year-to");
    const narrowed = from.selectedIndex > 0 || to.selectedIndex < to.options.length - 1;
    milestones.render(filtered, key, RANK_TIEBREAK[key], narrowed);
  }

  function renderAll() {
    applyFilters();
    syncURL();
    renderSummary();
    renderFeatured();
    renderMilestones();
    for (const panel of CHART_PANELS) renderChartPanel(panel);
    renderTable();
  }

  function buildChartPanelsDOM() {
    const grid = document.getElementById("chart-grid");
    CHART_PANELS.forEach((panel, i) => {
      const card = document.createElement("div");
      card.className = "chart-card";
      const fig = String(i + 1).padStart(2, "0");
      card.innerHTML = `
        <p class="chart-fig">${CHART_FIG_ICON}<span>Fig. ${fig}</span></p>
        <h3 id="${panel.id}-heading">${panel.title}</h3>
        <div class="chart-controls">
          <select id="${panel.id}-measure"></select>
          <select id="${panel.id}-breakdown"></select>
          <button type="button" class="reset-filters-btn" id="${panel.id}-reset">Reset</button>
        </div>
        <canvas id="${panel.id}-canvas" height="220"></canvas>
      `;
      grid.appendChild(card);

      const measureSelect = buildOptionSelect(MEASURES, panel.defaultMeasure);
      measureSelect.id = `${panel.id}-measure`;
      card.querySelector(`#${panel.id}-measure`).replaceWith(measureSelect);

      const breakdownSelect = buildOptionSelect(BREAKDOWNS, panel.defaultBreakdown);
      breakdownSelect.id = `${panel.id}-breakdown`;
      card.querySelector(`#${panel.id}-breakdown`).replaceWith(breakdownSelect);

      measureSelect.addEventListener("change", () => {
        VGSound.play("apply");
        renderChartPanel(panel);
      });
      breakdownSelect.addEventListener("change", () => {
        VGSound.play("apply");
        renderChartPanel(panel);
      });
      card.querySelector(`#${panel.id}-reset`).addEventListener("click", () => {
        measureSelect.value = panel.defaultMeasure;
        breakdownSelect.value = panel.defaultBreakdown;
        VGSound.play("reset");
        renderChartPanel(panel);
      });
    });
  }

  function wireControls() {
    document.getElementById("featured-rank").addEventListener("change", () => {
      VGSound.play("apply");
      renderFeatured();
      renderMilestones();
      refreshDetailRows();
    });
    for (const id of ["filter-year-from", "filter-year-to", "filter-genre", "filter-platform", "filter-free"]) {
      document.getElementById(id).addEventListener("change", () => {
        VGSound.play("apply");
        renderAll();
      });
    }
    // Debounced: an animated count-up (and a blip) on every keystroke would
    // fight itself as the reader is still typing.
    let publisherDebounce;
    document.getElementById("filter-publisher").addEventListener("input", () => {
      clearTimeout(publisherDebounce);
      publisherDebounce = setTimeout(() => {
        VGSound.play("apply");
        renderAll();
      }, 200);
    });
    document.getElementById("table-breakdown").addEventListener("change", () => {
      VGSound.play("apply");
      renderTable();
    });

    const resetFilters = () => {
      document.getElementById("filters").reset();
      document.getElementById("filter-year-from").selectedIndex = 0;
      const yearTo = document.getElementById("filter-year-to");
      yearTo.selectedIndex = yearTo.options.length - 1;
      VGSound.play("reset");
      renderAll();
    };
    document.getElementById("reset-filters").addEventListener("click", resetFilters);
    document.getElementById("reset-filters-table").addEventListener("click", resetFilters);

    document.querySelectorAll("#data-table th[data-sort]").forEach((th) => {
      const sortHere = () => {
        const field = th.dataset.sort;
        if (tableSort.field === field) {
          tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
        } else {
          tableSort = { field, dir: "desc" };
        }
        VGSound.play("tick");
        renderTable();
      };
      th.addEventListener("click", sortHere);
      th.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        sortHere();
      });
    });

    const tableBody = document.getElementById("table-body");
    const rowDrillFromEvent = (e) => {
      const tr = e.target.closest("tr[data-key]");
      if (!tr) return;
      handleRowDrill(tr.dataset.breakdown, tr.dataset.key);
    };
    tableBody.addEventListener("click", (e) => {
      const toggle = e.target.closest(".row-expand");
      if (toggle) {
        // The toggle is its own control: it must not also drill the row.
        // Flip just this row's detail in place instead of re-rendering the
        // table (which would replay the row animations and drop scroll/focus).
        const { breakdown, group } = toggle.dataset;
        const id = `${breakdown}|${group}`;
        const tr = toggle.closest("tr");
        const open = !expandedGroups.has(id);
        if (open) {
          expandedGroups.add(id);
          tr.after(buildDetailRow(breakdown, group));
        } else {
          expandedGroups.delete(id);
          if (tr.nextElementSibling && tr.nextElementSibling.classList.contains("detail-row")) tr.nextElementSibling.remove();
        }
        toggle.setAttribute("aria-expanded", String(open));
        toggle.firstElementChild.textContent = open ? "▾" : "▸";
        return;
      }
      if (e.target.closest(".detail-row")) return;
      rowDrillFromEvent(e);
    });
    tableBody.addEventListener("keydown", (e) => {
      if (e.target.closest(".row-expand") || e.target.closest(".detail-row")) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!e.target.closest("tr[data-key]")) return;
      e.preventDefault();
      rowDrillFromEvent(e);
    });
  }

  loadGames().then((games) => {
    document.body.classList.remove("is-loading");
    allGames = games;
    setupFilterOptions();
    applyURLParams();
    buildChartPanelsDOM();
    wireControls();
    renderAll();
    if (window.VGMotion) window.VGMotion.revealAll(document.getElementById("chart-grid"));
  }).catch((err) => {
    // Without this, a failed CSV fetch/parse leaves body.is-loading set
    // forever — the stat tiles would shimmer indefinitely instead of
    // settling on some visible (if unhelpful) state.
    document.body.classList.remove("is-loading");
    console.error("Failed to load games data", err);
  });
})();
