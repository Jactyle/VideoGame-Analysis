(function () {
  const { loadGames, aggregateBy, summarize, distinctValues, formatNumber, formatCompact } = window.VGData;

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function pct(n) {
    return `${n.toFixed(1)}%`;
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
    const s = summarize(games);
    const years = games.map((r) => r.releaseYear);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const publisherCount = distinctValues(games, (r) => r.publisher).length;

    setText("stat-total-games", formatCompact(s.count));
    setText("stat-year-span", `${minYear}–${maxYear}`);
    setText("stat-publishers", formatCompact(publisherCount));
    setText("stat-review-rate", pct(s.reviewRate));
    setText("p-total-games", formatNumber(s.count));
    setText("p-year-range", `${minYear} and ${maxYear}`);

    // Finding 1: games per year
    const yearly = byYear(games);
    VGCharts.lineChart(
      document.getElementById("chart-1"),
      yearly.map((y) => y.year),
      [{ label: "Games released", data: yearly.map((y) => y.total) }]
    );
    const y2015 = yearly.find((y) => y.year === 2015);
    const y2025 = yearly.find((y) => y.year === 2025);
    setText("f1-2015", formatNumber(y2015 ? y2015.total : 0));
    setText("f1-2025", formatNumber(y2025 ? y2025.total : 0));

    // Finding 2: genre counts
    const genreAgg = aggregateBy(games, "genre").sort((a, b) => b.count - a.count);
    const top10Genre = genreAgg.slice(0, 10);
    VGCharts.barChart(
      document.getElementById("chart-2"),
      top10Genre.map((g) => g.key),
      top10Genre.map((g) => g.count),
      { label: "Games" }
    );
    const top3sum = genreAgg.slice(0, 3).reduce((s, g) => s + g.count, 0);
    setText("f2-share", pct((100 * top3sum) / s.count));
    setText("f2-action", formatNumber(genreAgg[0].count));

    // Finding 3: free % by year
    const freeSeries = yearly.map((y) => (100 * y.free) / y.total);
    VGCharts.lineChart(
      document.getElementById("chart-3"),
      yearly.map((y) => y.year),
      [{ label: "% free to play", data: freeSeries }]
    );
    const y2010 = yearly.find((y) => y.year === 2010);
    let peakYear = yearly.reduce((best, y) => ((100 * y.free) / y.total > (100 * best.free) / best.total ? y : best));
    setText("f3-2010", pct(y2010 ? (100 * y2010.free) / y2010.total : 0));
    setText("f3-peak", pct((100 * peakYear.free) / peakYear.total));
    setText("f3-2025", pct(y2025 ? (100 * y2025.free) / y2025.total : 0));
    setText("f3-overall", pct((100 * games.filter((r) => r.isFree).length) / s.count));

    // Finding 4: review rate by genre (top 10 by count)
    VGCharts.barChart(
      document.getElementById("chart-4"),
      top10Genre.map((g) => g.key),
      top10Genre.map((g) => g.reviewRate),
      { label: "Review-positive rate (%)" }
    );
    setText("f4-overall", pct(s.reviewRate));

    // Finding 5: median playtime by genre (top 10 by count)
    VGCharts.barChart(
      document.getElementById("chart-5"),
      top10Genre.map((g) => g.key),
      top10Genre.map((g) => g.medianPlaytime),
      { label: "Median playtime (minutes)" }
    );
    const rpg = top10Genre.find((g) => g.key === "RPG");
    setText("f5-rpg", formatNumber(rpg ? rpg.medianPlaytime : 0));

    // Finding 6: Mac/Linux support by year
    VGCharts.lineChart(
      document.getElementById("chart-6"),
      yearly.map((y) => y.year),
      [
        { label: "% supporting Mac", data: yearly.map((y) => (100 * y.mac) / y.total) },
        { label: "% supporting Linux", data: yearly.map((y) => (100 * y.linux) / y.total) },
      ]
    );
    const y2014 = yearly.find((y) => y.year === 2014);
    setText("f6-mac-peak", pct(y2014 ? (100 * y2014.mac) / y2014.total : 0));
    setText("f6-mac-2025", pct(y2025 ? (100 * y2025.mac) / y2025.total : 0));
    setText("f6-linux-2025", pct(y2025 ? (100 * y2025.linux) / y2025.total : 0));

    // Finding 7: top publishers by estimated owners
    const pubAgg = aggregateBy(games, "publisher").sort((a, b) => b.totalOwners - a.totalOwners);
    const top10Pub = pubAgg.slice(0, 10);
    VGCharts.barChart(
      document.getElementById("chart-7"),
      top10Pub.map((p) => p.key),
      top10Pub.map((p) => p.totalOwners),
      { label: "Total estimated owners", horizontal: true }
    );
    const top10PubOwners = top10Pub.reduce((sum, p) => sum + p.totalOwners, 0);
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
    VGCharts.barChart(
      document.getElementById("chart-8"),
      buckets.map((p) => `Top ${p * 100}%`),
      bucketShares,
      { label: "Share of total estimated owners (%)" }
    );
    setText("f8-top1", pct(bucketShares[0]));
    setText("f8-top10", pct(bucketShares[2]));

    // Closing: data-cleaning summary
    if (cleanSummary) {
      const raw = cleanSummary.rows_kept + cleanSummary.total_rows_dropped;
      setText("closing-raw-count", formatNumber(raw));
      setText("closing-dropped-total", formatNumber(cleanSummary.total_rows_dropped));
      setText("closing-dropped-playtest", formatNumber(cleanSummary.rows_dropped.playtest));
      setText("closing-dropped-genre", formatNumber(cleanSummary.rows_dropped.no_genre));
      setText("closing-kept", formatNumber(cleanSummary.rows_kept));
    }
  }

  Promise.all([loadGames(), fetch("data/clean_summary.json").then((r) => r.json())]).then(([games, summary]) =>
    render(games, summary)
  );
})();
