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

  // Part-to-whole, at a glance only — capped at the palette's validated
  // 3-hue categorical set plus a neutral "Other" bucket for the remainder,
  // never a generated 4th/5th data hue (dataviz skill: series-count ladder).
  function doughnutChart(canvas, labels, values, { label } = {}) {
    destroyExisting(canvas);
    const total = values.reduce((sum, v) => sum + v, 0) || 1;
    const colors = [cssVar("--series-1"), cssVar("--series-2"), cssVar("--series-3"), cssVar("--text-muted")];
    const sliceColors = labels.map((_, i) => colors[i % colors.length]);
    return new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            backgroundColor: sliceColors,
            borderColor: cssVar("--surface-1"),
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          // Percentages ride the legend text itself (direct-labeled) rather
          // than relying on slice angle/color alone to carry the value.
          legend: {
            position: "right",
            labels: {
              color: cssVar("--text-secondary"),
              usePointStyle: true,
              boxWidth: 8,
              font: { size: 11 },
              generateLabels: (chart) =>
                chart.data.labels.map((text, i) => ({
                  text: `${text} — ${((100 * values[i]) / total).toFixed(1)}%`,
                  fillStyle: sliceColors[i],
                  strokeStyle: sliceColors[i],
                  // The legend's draw loop reads `fontColor` per item (not
                  // `color`, and not a fallback to labels.color) to paint
                  // the text — leaving it unset fell back to the canvas's
                  // default black instead of the intended muted gray.
                  fontColor: cssVar("--text-secondary"),
                  index: i,
                })),
            },
          },
          tooltip: { mode: "nearest", intersect: true },
        },
      },
    });
  }

  window.VGCharts = { barChart, lineChart, doughnutChart };
})();
