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
    const measureKey = panel.defaultMeasure;
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
      tr.innerHTML = `
        <td>${row.key}</td>
        <td class="num-cell">${formatNumber(row.count)}</td>
        <td class="num-cell">${formatCompact(row.totalOwners)}</td>
        <td class="num-cell">$${row.avgPrice.toFixed(2)}</td>
        <td class="num-cell">${formatNumber(row.medianPlaytime)}</td>
        <td class="num-cell">${row.reviewRate.toFixed(1)}%</td>
      `;
      if (animate) {
        tr.classList.add("row-enter");
        tr.style.transitionDelay = `${Math.min(i * 12, 200)}ms`;
        enteringRows.push(tr);
      }
      tbody.appendChild(tr);
    });
    if (enteringRows.length) {
      requestAnimationFrame(() => requestAnimationFrame(() => enteringRows.forEach((tr) => tr.classList.remove("row-enter"))));
    }

    updateSortIndicators();
    updateTableStatus(breakdownKey, aggregated);
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

  function renderAll() {
    applyFilters();
    syncURL();
    renderSummary();
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
          <select id="${panel.id}-breakdown"></select>
        </div>
        <canvas id="${panel.id}-canvas" height="220"></canvas>
      `;
      grid.appendChild(card);

      const breakdownSelect = buildOptionSelect(BREAKDOWNS, panel.defaultBreakdown);
      breakdownSelect.id = `${panel.id}-breakdown`;
      card.querySelector(`#${panel.id}-breakdown`).replaceWith(breakdownSelect);

      breakdownSelect.addEventListener("change", () => {
        VGSound.play("apply");
        renderChartPanel(panel);
      });
    });
  }

  function wireControls() {
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
    tableBody.addEventListener("click", rowDrillFromEvent);
    tableBody.addEventListener("keydown", (e) => {
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
