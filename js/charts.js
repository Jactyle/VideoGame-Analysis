/*
 * Thin wrapper around Chart.js so every chart on the site shares the same
 * mark specs and palette (see dataviz skill: single accent hue for a lone
 * series, thin lines, rounded bar ends, muted hairline gridlines).
 */
(function () {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // "--series-1-rgb" etc. hold the same hue as "r, g, b" so it can be dropped
  // into rgba() for a translucent fill — same trick the stylesheet uses for
  // its gradients.
  function rgba(rgbVarName, alpha) {
    return `rgba(${cssVar(rgbVarName)}, ${alpha})`;
  }

  // Wires an optional click-through (e.g. report.js sending the reader to
  // the dashboard pre-filtered to whatever they clicked) plus a pointer
  // cursor on hover so it reads as clickable. `extract(element)` turns
  // Chart.js's {datasetIndex, index} into the args `onClick` receives.
  // `canClick(...args)` (defaults to always-true) lets a chart mark some
  // elements as display-only — e.g. report.js's "Other combinations" slice,
  // which onClick already treats as a no-op — so hovering them shows the
  // default cursor instead of a pointer that promises a click will do
  // something.
  function clickOptions(onClick, extract, canClick) {
    if (!onClick) return {};
    const isClickable = canClick || (() => true);
    return {
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const args = extract(elements[0]);
        if (!isClickable(...args)) return;
        onClick(...args);
      },
      onHover: (evt, elements) => {
        if (!evt.native || !evt.native.target) return;
        const clickable = elements.length && isClickable(...extract(elements[0]));
        evt.native.target.style.cursor = clickable ? "pointer" : "default";
      },
    };
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

  function barChart(canvas, labels, values, { label, horizontal, onClick } = {}) {
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
        ...clickOptions(onClick, (el) => [labels[el.index], el.index]),
      },
    });
  }

  function lineChart(canvas, labels, series, { stacked, onClick } = {}) {
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
        interaction: { mode: "index", intersect: false },
        ...clickOptions(onClick, (el) => [labels[el.index], el.index]),
      },
    });
  }

  // Part-to-whole, at a glance only — capped at the palette's validated
  // 3-hue categorical set plus a neutral "Other" bucket for the remainder,
  // never a generated 4th/5th data hue (dataviz skill: series-count ladder).
  function doughnutChart(canvas, labels, values, { label, onClick, canClick } = {}) {
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
        ...clickOptions(onClick, (el) => [labels[el.index], el.index], canClick),
      },
    });
  }

  // Two clusters of points (fixed categorical color order: series-1 then
  // series-2, per the palette's validated order) plotted on x/y position,
  // with a third measure carried by marker radius — for a finding where
  // position alone ("who's big") isn't the whole story ("...but not the
  // same publishers who are prolific").
  function bubbleChart(canvas, datasets, { xLabel, yLabel, onClick } = {}) {
    destroyExisting(canvas);
    const rgbVars = ["--series-1-rgb", "--series-2-rgb"];
    const compact = window.VGData.formatCompact;
    return new Chart(canvas, {
      type: "bubble",
      data: {
        datasets: datasets.map((d, i) => ({
          label: d.label,
          data: d.points,
          backgroundColor: rgba(rgbVars[i % rgbVars.length], 0.55),
          borderColor: cssVar("--surface-1"),
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: cssVar("--text-secondary"), usePointStyle: true, boxWidth: 8, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = ctx.raw;
                return `${p.name} — ${Math.round(p.x).toLocaleString()} games, ${compact(p.y)} owners, ${p.reviewRate.toFixed(1)}% positive`;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: !!xLabel, text: xLabel, color: cssVar("--text-muted"), font: { size: 11 } },
            grid: { color: cssVar("--gridline") },
            border: { display: false },
            ticks: { color: cssVar("--text-muted"), font: { size: 11 } },
          },
          y: {
            title: { display: !!yLabel, text: yLabel, color: cssVar("--text-muted"), font: { size: 11 } },
            beginAtZero: true,
            grid: { color: cssVar("--gridline") },
            border: { display: false },
            ticks: { color: cssVar("--text-muted"), font: { size: 11 }, callback: (v) => compact(v) },
          },
        },
        ...clickOptions(onClick, (el) => [datasets[el.datasetIndex].points[el.index]]),
      },
    });
  }

  window.VGCharts = { barChart, lineChart, doughnutChart, bubbleChart };
})();
