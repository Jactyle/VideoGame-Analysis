/*
 * Shared data loading + aggregation used by both the report page and the
 * dashboard. Everything hangs off window.VGData so report.js/dashboard.js
 * can use it as plain scripts (no bundler/module step).
 */
(function () {
  const CSV_URL = "data/games.csv";

  function toNum(v) {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  function parseRow(raw) {
    return {
      appId: raw.app_id,
      name: raw.name,
      releaseDate: raw.release_date,
      releaseYear: toNum(raw.release_year),
      developer: raw.developer,
      publisher: raw.publisher,
      genre: raw.primary_genre,
      category: raw.primary_category,
      platforms: raw.platforms,
      isFree: raw.is_free === "true",
      price: toNum(raw.price_usd) ?? 0,
      discountPct: toNum(raw.discount_pct) ?? 0,
      dlcCount: toNum(raw.dlc_count) ?? 0,
      positiveReviews: toNum(raw.positive_reviews) ?? 0,
      negativeReviews: toNum(raw.negative_reviews) ?? 0,
      reviewCount: toNum(raw.review_count) ?? 0,
      reviewRate: toNum(raw.review_positive_rate), // null when no reviews
      ownersLow: toNum(raw.estimated_owners_low) ?? 0,
      ownersHigh: toNum(raw.estimated_owners_high) ?? 0,
      ownersMid: toNum(raw.estimated_owners_mid) ?? 0,
      peakCcu: toNum(raw.peak_ccu) ?? 0,
      avgPlaytime: toNum(raw.average_playtime_forever_minutes) ?? 0,
      metacritic: toNum(raw.metacritic_score) ?? 0,
      achievements: toNum(raw.achievements) ?? 0,
    };
  }

  function loadGames() {
    return new Promise((resolve, reject) => {
      Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data.map(parseRow)),
        error: reject,
      });
    });
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Breakdown key extractors, shared by dashboard charts and the table.
  const BREAKDOWNS = {
    genre: { label: "Genre", keyFn: (r) => r.genre || "Unknown" },
    platform: { label: "Platform", keyFn: (r) => r.platforms || "None" },
    category: { label: "Category", keyFn: (r) => r.category || "Uncategorized" },
    publisher: { label: "Publisher", keyFn: (r) => r.publisher || "Unknown" },
    free: { label: "Free / Paid", keyFn: (r) => (r.isFree ? "Free" : "Paid") },
    releaseYear: { label: "Release year", keyFn: (r) => String(r.releaseYear) },
  };

  const MEASURES = {
    count: { label: "Count of games" },
    totalOwners: { label: "Total estimated owners" },
    avgPrice: { label: "Average price ($)" },
    medianPlaytime: { label: "Median playtime (minutes)" },
    reviewRate: { label: "Review-positive rate (%)" },
  };

  // One pass over the (already filtered) rows, computing every stat per
  // group so charts and the table can each pick whichever column they need.
  function aggregateBy(rows, breakdownKey) {
    const keyFn = BREAKDOWNS[breakdownKey].keyFn;
    const groups = new Map();

    for (const r of rows) {
      const key = keyFn(r);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          count: 0,
          sumOwners: 0,
          sumPrice: 0,
          playtimes: [],
          sumPositive: 0,
          sumReviewCount: 0,
        });
      }
      const g = groups.get(key);
      g.count += 1;
      g.sumOwners += r.ownersMid;
      g.sumPrice += r.price;
      if (r.avgPlaytime > 0) g.playtimes.push(r.avgPlaytime);
      g.sumPositive += r.positiveReviews;
      g.sumReviewCount += r.reviewCount;
    }

    return Array.from(groups.values()).map((g) => ({
      key: g.key,
      count: g.count,
      totalOwners: g.sumOwners,
      avgPrice: g.count ? g.sumPrice / g.count : 0,
      medianPlaytime: median(g.playtimes),
      reviewRate: g.sumReviewCount ? (100 * g.sumPositive) / g.sumReviewCount : 0,
    }));
  }

  function measureValue(row, measureKey) {
    return row[measureKey] ?? 0;
  }

  // Collapse a long tail into "Other" so bar charts stay readable (also
  // keeps categorical color use within the palette's validated series cap).
  function topNWithOther(aggregated, measureKey, n) {
    const sorted = [...aggregated].sort((a, b) => measureValue(b, measureKey) - measureValue(a, measureKey));
    if (sorted.length <= n) return sorted;
    const top = sorted.slice(0, n);
    const rest = sorted.slice(n);
    const other = rest.reduce(
      (acc, r) => {
        acc.count += r.count;
        acc.totalOwners += r.totalOwners;
        acc.avgPrice += r.avgPrice * r.count;
        acc.sumReviewWeight += r.reviewRate * r.count;
        acc.playtimeSamples.push(r.medianPlaytime);
        return acc;
      },
      { key: "Other", count: 0, totalOwners: 0, avgPrice: 0, sumReviewWeight: 0, playtimeSamples: [] }
    );
    const totalCount = other.count || 1;
    top.push({
      key: "Other",
      count: other.count,
      totalOwners: other.totalOwners,
      avgPrice: other.avgPrice / totalCount,
      medianPlaytime: median(other.playtimeSamples),
      reviewRate: other.sumReviewWeight / totalCount,
    });
    return top;
  }

  function summarize(rows) {
    const totalOwners = rows.reduce((s, r) => s + r.ownersMid, 0);
    const totalPrice = rows.reduce((s, r) => s + r.price, 0);
    const sumPositive = rows.reduce((s, r) => s + r.positiveReviews, 0);
    const sumReviewCount = rows.reduce((s, r) => s + r.reviewCount, 0);
    return {
      count: rows.length,
      totalOwners,
      avgPrice: rows.length ? totalPrice / rows.length : 0,
      reviewRate: sumReviewCount ? (100 * sumPositive) / sumReviewCount : 0,
    };
  }

  function distinctValues(rows, fieldFn) {
    return Array.from(new Set(rows.map(fieldFn))).sort();
  }

  function formatCompact(n) {
    if (n === null || n === undefined) return "—";
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }

  function formatNumber(n) {
    return new Intl.NumberFormat("en-US").format(Math.round(n));
  }

  window.VGData = {
    loadGames,
    aggregateBy,
    topNWithOther,
    summarize,
    distinctValues,
    measureValue,
    median,
    BREAKDOWNS,
    MEASURES,
    formatCompact,
    formatNumber,
  };
})();
