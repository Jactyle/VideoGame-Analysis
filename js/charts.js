/*
 * Thin wrapper around Chart.js so every chart on the site shares the same
 * mark specs and palette (see dataviz skill: single accent hue for a lone
 * series, thin lines, rounded bar ends, muted hairline gridlines).
 */
(function () {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function commonScales(extra) {
    return Object.assign(
      {
        x: {
          grid: { display: false },
          ticks: { color: cssVar("--text-muted"), font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: cssVar("--gridline") },
          border: { display: false },
          ticks: { color: cssVar("--text-muted"), font: { size: 11 } },
        },
      },
      extra || {}
    );
  }

  function destroyExisting(canvas) {
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
  }

  function barChart(canvas, labels, values, { label, horizontal } = {}) {
    destroyExisting(canvas);
    return new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            backgroundColor: cssVar("--series-1"),
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        indexAxis: horizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: "nearest", intersect: true },
        },
        scales: horizontal
          ? commonScales({
              x: { beginAtZero: true, grid: { color: cssVar("--gridline") }, ticks: { color: cssVar("--text-muted") } },
              y: { grid: { display: false }, ticks: { color: cssVar("--text-muted") } },
            })
          : commonScales(),
      },
    });
  }

  function lineChart(canvas, labels, series, { stacked } = {}) {
    destroyExisting(canvas);
    const colors = [cssVar("--series-1"), cssVar("--series-2"), cssVar("--series-3")];
    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.data,
          borderColor: colors[i % colors.length],
          backgroundColor: colors[i % colors.length],
          borderWidth: 2,
          pointRadius: 4,
          pointBorderColor: cssVar("--surface-1"),
          pointBorderWidth: 2,
          tension: 0.15,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: series.length > 1, labels: { color: cssVar("--text-secondary"), usePointStyle: true } },
          tooltip: { mode: "index", intersect: false },
        },
        scales: commonScales(),
      },
    });
  }

  window.VGCharts = { barChart, lineChart };
})();
