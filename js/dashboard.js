(function () {
  const { loadGames, aggregateBy, topNWithOther, summarize, distinctValues, measureValue, BREAKDOWNS, MEASURES, formatCompact, formatNumber } =
    window.VGData;

  const TOP_N = 12;

  const CHART_PANELS = [
    { id: "chart-1", title: "Count by category", defaultMeasure: "count", defaultBreakdown: "genre" },
    { id: "chart-2", title: "Trend over time", defaultMeasure: "totalOwners", defaultBreakdown: "releaseYear" },
    { id: "chart-3", title: "Reception by category", defaultMeasure: "reviewRate", defaultBreakdown: "platform" },
    { id: "chart-4", title: "Engagement by category", defaultMeasure: "medianPlaytime", defaultBreakdown: "publisher" },
  ];

  let allGames = [];
  let filtered = [];
  let tableSort = { field: "count", dir: "desc" };

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

  function setupFilterOptions() {
    const years = distinctValues(allGames, (r) => r.releaseYear).filter((y) => y !== null);
    const yearFrom = document.getElementById("filter-year-from");
    const yearTo = document.getElementById("filter-year-to");
    populateSelect(yearFrom, years);
    populateSelect(yearTo, years);
    yearFrom.value = years[0];
    yearTo.value = years[years.length - 1];

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
  }

  function renderSummary() {
    const s = summarize(filtered);
    document.getElementById("stat-count").textContent = formatCompact(s.count);
    document.getElementById("stat-owners").textContent = formatCompact(s.totalOwners);
    document.getElementById("stat-price").textContent = `$${s.avgPrice.toFixed(2)}`;
    document.getElementById("stat-rate").textContent = `${s.reviewRate.toFixed(1)}%`;
  }

  function renderChartPanel(panel) {
    const measureKey = document.getElementById(`${panel.id}-measure`).value;
    const breakdownKey = document.getElementById(`${panel.id}-breakdown`).value;
    const canvas = document.getElementById(`${panel.id}-canvas`);
    const measureLabel = MEASURES[measureKey].label;
    const breakdownLabel = BREAKDOWNS[breakdownKey].label;

    document.getElementById(`${panel.id}-heading`).textContent = `${measureLabel} by ${breakdownLabel.toLowerCase()}`;

    const aggregated = aggregateBy(filtered, breakdownKey);

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
  }

  function renderTable() {
    const breakdownKey = document.getElementById("table-breakdown").value;
    let aggregated = aggregateBy(filtered, breakdownKey);
    aggregated = topNWithOther(aggregated, "count", 30);

    aggregated.sort((a, b) => {
      const dir = tableSort.dir === "asc" ? 1 : -1;
      const av = a[tableSort.field];
      const bv = b[tableSort.field];
      if (typeof av === "string") return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });

    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    for (const row of aggregated) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.key}</td>
        <td>${formatNumber(row.count)}</td>
        <td>${formatCompact(row.totalOwners)}</td>
        <td>$${row.avgPrice.toFixed(2)}</td>
        <td>${formatNumber(row.medianPlaytime)}</td>
        <td>${row.reviewRate.toFixed(1)}%</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderAll() {
    applyFilters();
    renderSummary();
    for (const panel of CHART_PANELS) renderChartPanel(panel);
    renderTable();
  }

  function buildChartPanelsDOM() {
    const grid = document.getElementById("chart-grid");
    for (const panel of CHART_PANELS) {
      const card = document.createElement("div");
      card.className = "chart-card";
      card.innerHTML = `
        <h3 id="${panel.id}-heading">${panel.title}</h3>
        <div class="chart-controls">
          <select id="${panel.id}-measure"></select>
          <select id="${panel.id}-breakdown"></select>
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

      measureSelect.addEventListener("change", () => renderChartPanel(panel));
      breakdownSelect.addEventListener("change", () => renderChartPanel(panel));
    }
  }

  function wireControls() {
    for (const id of ["filter-year-from", "filter-year-to", "filter-genre", "filter-platform", "filter-free"]) {
      document.getElementById(id).addEventListener("change", renderAll);
    }
    document.getElementById("filter-publisher").addEventListener("input", renderAll);
    document.getElementById("table-breakdown").addEventListener("change", renderTable);

    document.getElementById("reset-filters").addEventListener("click", () => {
      document.getElementById("filters").reset();
      document.getElementById("filter-year-from").selectedIndex = 0;
      const yearTo = document.getElementById("filter-year-to");
      yearTo.selectedIndex = yearTo.options.length - 1;
      renderAll();
    });

    document.querySelectorAll("#data-table th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const field = th.dataset.sort;
        if (tableSort.field === field) {
          tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
        } else {
          tableSort = { field, dir: "desc" };
        }
        renderTable();
      });
    });
  }

  loadGames().then((games) => {
    allGames = games;
    setupFilterOptions();
    buildChartPanelsDOM();
    wireControls();
    renderAll();
    if (window.VGMotion) window.VGMotion.revealAll(document.getElementById("chart-grid"));
  });
})();
