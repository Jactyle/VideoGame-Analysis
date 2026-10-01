(function () {
  const { loadGames, aggregateBy, summarize, distinctValues, formatNumber, formatCompact } = window.VGData;
  const VGMotion = window.VGMotion;

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function pct(n) {
    return `${n.toFixed(1)}%`;
  }

  // Sends the reader from a report chart straight to the dashboard,
  // pre-filtered to whatever they clicked — the URL only carries filters
  // that were actually set, so it's the same clean query-string shape
  // dashboard.js itself writes as filters change there.
  function goToDashboard(filters) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, v);
    }
    window.location.href = `dashboard.html?${params.toString()}`;
  }

  function byYear(games) {
    const map = new Map();
    for (const r of games) {
      const y = r.releaseYear;
      if (!map.has(y)) map.set(y, { year: y, total: 0, free: 0, mac: 0, linux: 0 });
      const g = map.get(y);
      g.total += 1;
      if (r.isFree) g.free += 1;
      if (r.platforms && r.platforms.includes("Mac")) g.mac += 1;
      if (r.platforms && r.platforms.includes("Linux")) g.linux += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year);
  }

  function render(games, cleanSummary) {
    document.body.classList.remove("is-loading");
    const s = summarize(games);
    const years = games.map((r) => r.releaseYear);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const publisherCount = distinctValues(games, (r) => r.publisher).length;

    VGMotion.animateNumber(document.getElementById("stat-total-games"), s.count, { formatter: formatCompact });
    VGMotion.animateNumber(document.getElementById("stat-year-from"), minYear, { formatter: (n) => Math.round(n) });
    VGMotion.animateNumber(document.getElementById("stat-year-to"), maxYear, { formatter: (n) => Math.round(n) });
    VGMotion.animateNumber(document.getElementById("stat-publishers"), publisherCount, { formatter: formatCompact });
    VGMotion.animateNumber(document.getElementById("stat-review-rate"), s.reviewRate, { formatter: pct });
    setText("p-total-games", formatNumber(s.count));
    setText("p-year-range", `${minYear} and ${maxYear}`);

    // Finding 1: games per year
    const yearly = byYear(games);

    const goToYear = (label) => goToDashboard({ yearFrom: label, yearTo: label });
    const goToGenre = (label) => goToDashboard({ genre: label });

    VGMotion.onVisible(document.getElementById("chart-1"), () =>
      VGCharts.lineChart(
        document.getElementById("chart-1"),
        yearly.map((y) => y.year),
        [{ label: "Games released", data: yearly.map((y) => y.total) }],
        { onClick: goToYear }
      )
    );
    const y2015 = yearly.find((y) => y.year === 2015);
    const y2025 = yearly.find((y) => y.year === 2025);
    setText("f1-2015", formatNumber(y2015 ? y2015.total : 0));
    setText("f1-2025", formatNumber(y2025 ? y2025.total : 0));

    // Finding 2: genre counts
    const genreAgg = aggregateBy(games, "genre").sort((a, b) => b.count - a.count);
    const top10Genre = genreAgg.slice(0, 10);
    VGMotion.onVisible(document.getElementById("chart-2"), () =>
      VGCharts.barChart(
        document.getElementById("chart-2"),
        top10Genre.map((g) => g.key),
        top10Genre.map((g) => g.count),
        { label: "Games", onClick: goToGenre }
      )
    );
    const top3sum = genreAgg.slice(0, 3).reduce((s, g) => s + g.count, 0);
    setText("f2-share", pct((100 * top3sum) / s.count));
    setText("f2-action", formatNumber(genreAgg[0].count));

    // Finding 3: free % by year
    const freeSeries = yearly.map((y) => (100 * y.free) / y.total);
    VGMotion.onVisible(document.getElementById("chart-3"), () =>
      VGCharts.lineChart(
        document.getElementById("chart-3"),
        yearly.map((y) => y.year),
        [{ label: "% free to play", data: freeSeries }],
        { onClick: goToYear }
      )
    );
    const y2010 = yearly.find((y) => y.year === 2010);
    // Restrict the "peak" search to years with a meaningful sample size —
    // early years with only 1-2 releases can show a spurious 50-100% free
    // rate that isn't representative of anything.
    const MIN_SAMPLE = 100;
    const peakCandidates = yearly.filter((y) => y.total >= MIN_SAMPLE);
    const peakYear = peakCandidates.reduce((best, y) => ((100 * y.free) / y.total > (100 * best.free) / best.total ? y : best));
    setText("f3-2010", pct(y2010 ? (100 * y2010.free) / y2010.total : 0));
    setText("f3-peak", pct((100 * peakYear.free) / peakYear.total));
    setText("f3-peak-year", String(peakYear.year));
    setText("f3-2025", pct(y2025 ? (100 * y2025.free) / y2025.total : 0));
    setText("f3-overall", pct((100 * games.filter((r) => r.isFree).length) / s.count));

    // Finding 4: review rate by genre (top 10 by count)
    VGMotion.onVisible(document.getElementById("chart-4"), () =>
      VGCharts.barChart(
        document.getElementById("chart-4"),
        top10Genre.map((g) => g.key),
        top10Genre.map((g) => g.reviewRate),
        { label: "Review-positive rate (%)", onClick: goToGenre }
      )
    );
    setText("f4-overall", pct(s.reviewRate));

    // Finding 5: median playtime by genre (top 10 by count)
    VGMotion.onVisible(document.getElementById("chart-5"), () =>
      VGCharts.barChart(
        document.getElementById("chart-5"),
        top10Genre.map((g) => g.key),
        top10Genre.map((g) => g.medianPlaytime),
        { label: "Median playtime (minutes)", onClick: goToGenre }
      )
    );
    const rpg = top10Genre.find((g) => g.key === "RPG");
    setText("f5-rpg", formatNumber(rpg ? rpg.medianPlaytime : 0));

    // Finding 6: Mac/Linux support by year
    VGMotion.onVisible(document.getElementById("chart-6"), () =>
      VGCharts.lineChart(
        document.getElementById("chart-6"),
        yearly.map((y) => y.year),
        [
          { label: "% supporting Mac", data: yearly.map((y) => (100 * y.mac) / y.total) },
          { label: "% supporting Linux", data: yearly.map((y) => (100 * y.linux) / y.total) },
        ],
        { onClick: goToYear }
      )
    );
    const y2013 = yearly.find((y) => y.year === 2013);
    setText("f6-mac-peak", pct(y2013 ? (100 * y2013.mac) / y2013.total : 0));
    setText("f6-mac-2025", pct(y2025 ? (100 * y2025.mac) / y2025.total : 0));
    setText("f6-linux-2025", pct(y2025 ? (100 * y2025.linux) / y2025.total : 0));

    // Finding 7: top publishers by estimated owners vs. top publishers by
    // game count — two clusters that barely overlap, which is exactly the
    // claim in the prose above. A bubble chart shows both rankings (x/y
    // position) plus review rate (marker radius) in one view; a bar chart
    // can only ever show one ranking at a time.
    const pubAgg = aggregateBy(games, "publisher");
    const byOwners = [...pubAgg].sort((a, b) => b.totalOwners - a.totalOwners).slice(0, 10);
    const ownersKeys = new Set(byOwners.map((p) => p.key));
    const byCount = [...pubAgg]
      .filter((p) => !ownersKeys.has(p.key))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const toBubblePoints = (list) =>
      list.map((p) => ({
        x: p.count,
        y: p.totalOwners,
        r: 8 + (Math.min(p.reviewRate, 100) / 100) * 14,
        name: p.key,
        reviewRate: p.reviewRate,
      }));
    VGMotion.onVisible(document.getElementById("chart-7"), () =>
      VGCharts.bubbleChart(
        document.getElementById("chart-7"),
        [
          { label: "Top 10 by estimated owners", points: toBubblePoints(byOwners) },
          { label: "Top 10 by game count", points: toBubblePoints(byCount) },
        ],
        { xLabel: "Games published", yLabel: "Total estimated owners", onClick: (point) => goToDashboard({ publisher: point.name }) }
      )
    );
    const top10PubOwners = byOwners.reduce((sum, p) => sum + p.totalOwners, 0);
    setText("f7-share", pct((100 * top10PubOwners) / s.totalOwners));

    // Finding 8: ownership concentration (Pareto)
    const ownersSorted = games.map((r) => r.ownersMid).sort((a, b) => b - a);
    const totalOwners = s.totalOwners;
    const buckets = [0.01, 0.05, 0.1, 0.2, 0.5];
    const bucketShares = buckets.map((p) => {
      const k = Math.max(1, Math.floor(ownersSorted.length * p));
      let sum = 0;
      for (let i = 0; i < k; i++) sum += ownersSorted[i];
      return (100 * sum) / totalOwners;
    });
    VGMotion.onVisible(document.getElementById("chart-8"), () =>
      VGCharts.barChart(
        document.getElementById("chart-8"),
        buckets.map((p) => `Top ${p * 100}%`),
        bucketShares,
        { label: "Share of total estimated owners (%)" }
      )
    );
    setText("f8-top1", pct(bucketShares[0]));
    setText("f8-top10", pct(bucketShares[2]));

    // Finding 9: platform-combination composition of the whole catalog — a
    // present-day, part-to-whole complement to Finding 6's over-time line.
    // Capped at the palette's 3 validated categorical hues; the (rare)
    // Mac-only, Linux-only, and Mac+Linux-without-Windows listings fold into
    // "Other" rather than seating a 4th/5th data hue.
    const platformGroups = { winOnly: 0, winMacLinux: 0, winMacOnly: 0, other: 0 };
    for (const r of games) {
      if (r.platforms === "Windows") platformGroups.winOnly += 1;
      else if (r.platforms === "Windows, Mac, Linux") platformGroups.winMacLinux += 1;
      else if (r.platforms === "Windows, Mac") platformGroups.winMacOnly += 1;
      else platformGroups.other += 1;
    }
    // The doughnut's own labels are display copy, not the dashboard's raw
    // platform-filter values — map the 3 clickable slices to those values;
    // "Other combinations" isn't one clean value, so it stays inert.
    const PLATFORM_FILTER_BY_LABEL = {
      "Windows only": "Windows",
      "Windows + Mac + Linux": "Windows, Mac, Linux",
      "Windows + Mac": "Windows, Mac",
    };
    VGMotion.onVisible(document.getElementById("chart-9"), () =>
      VGCharts.doughnutChart(
        document.getElementById("chart-9"),
        ["Windows only", "Windows + Mac + Linux", "Windows + Mac", "Other combinations"],
        [platformGroups.winOnly, platformGroups.winMacLinux, platformGroups.winMacOnly, platformGroups.other],
        {
          onClick: (label) => {
            const platform = PLATFORM_FILTER_BY_LABEL[label];
            if (platform) goToDashboard({ platform });
          },
          canClick: (label) => !!PLATFORM_FILTER_BY_LABEL[label],
        }
      )
    );
    setText("f9-win-only", pct((100 * platformGroups.winOnly) / s.count));
    setText("f9-all-three", pct((100 * platformGroups.winMacLinux) / s.count));
    setText("f9-win-mac", pct((100 * platformGroups.winMacOnly) / s.count));

    // Closing: data-cleaning summary
    if (cleanSummary) {
      const raw = cleanSummary.rows_kept + cleanSummary.total_rows_dropped;
      setText("closing-raw-count", formatNumber(raw));
      setText("closing-dropped-total", formatNumber(cleanSummary.total_rows_dropped));
      setText("closing-dropped-playtest", formatNumber(cleanSummary.rows_dropped.playtest));
      setText("closing-dropped-genre", formatNumber(cleanSummary.rows_dropped.no_genre));
      setText("closing-kept", formatNumber(cleanSummary.rows_kept));
    }

    // Timeline last, so any problem in it can't leave the rest of the report unrendered.
    window.VGTimeline.init(games, {
      formatNumber,
      formatCompact,
      onExplore: (year) => goToDashboard({ yearFrom: year, yearTo: year }),
    });
  }

  Promise.all([loadGames(), fetch("data/clean_summary.json").then((r) => r.json())])
    .then(([games, summary]) => render(games, summary))
    .catch((err) => {
      // Without this, a failed CSV/JSON fetch leaves body.is-loading set
      // forever — the stat tiles would shimmer indefinitely instead of
      // settling on some visible (if unhelpful) state.
      document.body.classList.remove("is-loading");
      console.error("Failed to load report data", err);
    });
})();
