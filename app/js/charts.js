// Trend chart. Chart.js is only downloaded when the chart scrolls into view,
// so it never delays first paint or the rest of the page.
import { esc } from './format.js';

const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/auto/+esm';
let chartModule;

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Draws the dashed "Mission Found started" line. `position` is a fractional
// category index, so a mid-month start lands part-way into that month.
const startMarker = {
  id: 'startMarker',
  afterDatasetsDraw(chart, _args, opts) {
    if (opts.position == null) return;
    const { ctx, chartArea, scales: { x } } = chart;
    const i = Math.floor(opts.position);
    const frac = opts.position - i;
    const step = x.getPixelForValue(1) - x.getPixelForValue(0);
    const px = x.getPixelForValue(i) + (frac - 0.5) * (Number.isFinite(step) ? step : 0);
    if (px < chartArea.left || px > chartArea.right) return;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, chartArea.top + 18);
    ctx.lineTo(px, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = opts.color;
    ctx.font = opts.font;
    ctx.textAlign = px > (chartArea.left + chartArea.right) / 2 ? 'right' : 'left';
    ctx.fillText(opts.label, px + (ctx.textAlign === 'left' ? 6 : -6), chartArea.top + 10);
    ctx.restore();
  },
};

// Renders once the container is visible. Returns a function that destroys
// the chart (used when the month changes).
export function lazyTrendChart(container, { labels, values, markerPosition, markerLabel, summary }) {
  container.innerHTML = `<canvas role="img" aria-label="${esc(summary)}"></canvas>`;
  const canvas = container.querySelector('canvas');
  let chart;
  let destroyed = false;

  const draw = async () => {
    try {
      chartModule ||= await import(CHART_JS);
    } catch {
      container.innerHTML = '<p class="empty">The chart could not load. Use "Show as table" to see the numbers.</p>';
      return;
    }
    if (destroyed) return;
    const Chart = chartModule.default;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const font = token('--font-sans');
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: token('--chart-line'),
          backgroundColor: token('--chart-line'),
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.25,
          spanGaps: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reduced ? false : { duration: 400 },
        layout: { padding: { top: 8 } },
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false, callbacks: { label: (c) => `${c.formattedValue} actions` } },
          startMarker: {
            position: markerPosition,
            label: markerLabel,
            color: token('--chart-marker'),
            font: `600 13px ${font}`,
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: token('--color-ink-muted'), font: { family: font } } },
          y: {
            beginAtZero: true,
            grid: { color: token('--chart-grid') },
            border: { display: false },
            ticks: { color: token('--color-ink-muted'), font: { family: font }, precision: 0 },
          },
        },
      },
      plugins: [startMarker],
    });
  };

  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      draw();
    }
  }, { rootMargin: '200px' });
  io.observe(container);

  return () => {
    destroyed = true;
    io.disconnect();
    chart?.destroy();
  };
}
