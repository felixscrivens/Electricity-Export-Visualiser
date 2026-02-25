// ---------------------------------------------------------------------------
// Moray West Windfarm — Grid Export Visualiser
// Fetches B1610 (Actual Generation Output) from the Elexon BMRS API and
// renders an interactive bar chart using Chart.js.
// ---------------------------------------------------------------------------

const BMU_COLOURS = {
  "T_MOWWO-1": "#2196F3",
  "T_MOWWO-2": "#4CAF50",
  "T_MOWWO-3": "#FF9800",
  "T_MOWWO-4": "#9C27B0",
};

const CAPACITY_LINE_MW = 315; // 90% of 350 MW contractual capacity

// ---- DOM refs ----
const dateFrom = document.getElementById("date-from");
const dateTo = document.getElementById("date-to");
const aggregation = document.getElementById("aggregation");
const fetchBtn = document.getElementById("fetch-btn");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const bmuCheckboxes = document.querySelectorAll('.bmu-toggles input[type="checkbox"]');

// ---- Sensible defaults ----
// Default: last 30 days (data has ~5-day lag so go back a bit further)
const today = new Date();
const defaultTo = new Date(today);
defaultTo.setDate(today.getDate() - 5);
const defaultFrom = new Date(defaultTo);
defaultFrom.setDate(defaultTo.getDate() - 30);

dateFrom.value = fmtDate(defaultFrom);
dateTo.value = fmtDate(defaultTo);

// ---- Chart instance ----
let chart = null;

// ---- Event listener ----
fetchBtn.addEventListener("click", run);

// ---- Main flow ----
async function run() {
  const from = dateFrom.value;
  const to = dateTo.value;
  if (!from || !to) {
    setStatus("Please select both From and To dates.", true);
    return;
  }
  if (from > to) {
    setStatus("'From' date must be before 'To' date.", true);
    return;
  }

  const selectedBMUs = getSelectedBMUs();
  if (selectedBMUs.length === 0) {
    setStatus("Please select at least one BMU.", true);
    return;
  }

  const agg = aggregation.value;

  fetchBtn.disabled = true;
  setStatus("Fetching data from BMRS API...");
  summaryEl.textContent = "";

  try {
    const raw = await fetchB1610(from, to, selectedBMUs);

    if (raw.length === 0) {
      setStatus("No data returned for the selected range and BMUs. Moray West data is only available from mid-2024 onwards.", true);
      fetchBtn.disabled = false;
      return;
    }

    setStatus(`Received ${raw.length.toLocaleString()} records. Processing...`);

    const { labels, datasets, summaryText } = processData(raw, agg, selectedBMUs);
    renderChart(labels, datasets, agg);
    summaryEl.innerHTML = summaryText;
    setStatus(`Showing ${labels.length} data points across ${selectedBMUs.length} BMU(s).`);
  } catch (err) {
    console.error(err);
    setStatus("Error: " + err.message, true);
  }

  fetchBtn.disabled = false;
}

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------
async function fetchB1610(from, to, bmuList) {
  const url = new URL("https://data.elexon.co.uk/bmrs/api/v1/datasets/B1610/stream");
  url.searchParams.set("from", from + "T00:00Z");
  url.searchParams.set("to", to + "T23:30Z");
  bmuList.forEach((b) => url.searchParams.append("bmUnit", b));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`BMRS API returned HTTP ${resp.status}: ${resp.statusText}`);
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// Data processing
// ---------------------------------------------------------------------------
function processData(raw, agg, selectedBMUs) {
  // Build per-BMU maps keyed by bucket label
  const buckets = {}; // { bucketLabel: { bmu: totalMWh, ... } }
  const bucketHours = {}; // { bucketLabel: hours } for MW conversion

  for (const rec of raw) {
    const bmu = rec.bmUnit;
    const key = bucketKey(rec, agg);
    if (!buckets[key]) {
      buckets[key] = {};
      bucketHours[key] = 0;
    }
    buckets[key][bmu] = (buckets[key][bmu] || 0) + rec.quantity;
    // Each settlement period = 0.5 hours; count once per unique period per bucket
  }

  // Count settlement periods per bucket for hour conversion
  const periodTracker = {};
  for (const rec of raw) {
    const key = bucketKey(rec, agg);
    const periodId = rec.settlementDate + "-" + rec.settlementPeriod;
    if (!periodTracker[key]) periodTracker[key] = new Set();
    periodTracker[key].add(periodId);
  }
  for (const key of Object.keys(bucketHours)) {
    // Each unique settlement period is 0.5 hours.
    // But we may have multiple BMUs sharing the same period, so count distinct periods.
    bucketHours[key] = periodTracker[key].size * 0.5 / selectedBMUs.length;
  }

  const sortedKeys = Object.keys(buckets).sort();

  // Build one dataset per BMU (stacked)
  const datasets = selectedBMUs.map((bmu) => {
    const data = sortedKeys.map((key) => {
      const mwh = buckets[key][bmu] || 0;
      const hours = bucketHours[key] || 1;
      return +(mwh / hours).toFixed(2); // average MW
    });
    return {
      label: bmu,
      data,
      backgroundColor: BMU_COLOURS[bmu],
      stack: "combined",
    };
  });

  // Summary statistics (total across all selected BMUs)
  const totalMWh = raw.reduce((s, r) => s + r.quantity, 0);
  const allMW = sortedKeys.map((key) => {
    const totalForBucket = selectedBMUs.reduce((s, bmu) => s + (buckets[key][bmu] || 0), 0);
    return totalForBucket / (bucketHours[key] || 1);
  });
  const peakMW = Math.max(...allMW);
  const avgMW = allMW.reduce((a, b) => a + b, 0) / allMW.length;

  const summaryText =
    `<strong>Total energy:</strong> ${totalMWh.toLocaleString(undefined, { maximumFractionDigits: 0 })} MWh &nbsp;|&nbsp; ` +
    `<strong>Peak avg MW:</strong> ${peakMW.toFixed(1)} MW &nbsp;|&nbsp; ` +
    `<strong>Mean avg MW:</strong> ${avgMW.toFixed(1)} MW &nbsp;|&nbsp; ` +
    `<strong>Records:</strong> ${raw.length.toLocaleString()}`;

  return { labels: sortedKeys, datasets, summaryText };
}

function bucketKey(rec, agg) {
  if (agg === "settlement") {
    // Use halfHourEndTime for fine-grained labels
    return rec.halfHourEndTime;
  }
  if (agg === "weekly") {
    // ISO week: find Monday of the week
    const d = new Date(rec.settlementDate + "T00:00:00");
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return "w/c " + fmtDate(monday);
  }
  // daily
  return rec.settlementDate;
}

// ---------------------------------------------------------------------------
// Chart rendering
// ---------------------------------------------------------------------------
function renderChart(labels, datasets, agg) {
  if (chart) chart.destroy();

  const ctx = document.getElementById("main-chart").getContext("2d");

  const aggLabel = {
    settlement: "Average Power (MW) per Settlement Period",
    daily: "Daily Average Power (MW)",
    weekly: "Weekly Average Power (MW)",
  }[agg];

  chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top" },
        title: {
          display: true,
          text: "Moray West — " + aggLabel,
          font: { size: 15 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} MW`,
            afterBody: (items) => {
              const total = items.reduce((s, i) => s + i.parsed.y, 0);
              return `Total: ${total.toFixed(1)} MW`;
            },
          },
        },
        annotation: undefined, // we draw the line via a plugin below
      },
      scales: {
        x: {
          stacked: true,
          title: { display: true, text: agg === "settlement" ? "Settlement Period" : "Date" },
          ticks: {
            maxRotation: 60,
            autoSkip: true,
            maxTicksLimit: 40,
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: "Average Power (MW)" },
        },
      },
    },
    plugins: [capacityLinePlugin],
  });
}

// Custom plugin: draw 315 MW reference line
const capacityLinePlugin = {
  id: "capacityLine",
  afterDraw(chart) {
    const yScale = chart.scales.y;
    if (CAPACITY_LINE_MW > yScale.max) return; // don't draw if off-screen
    const y = yScale.getPixelForValue(CAPACITY_LINE_MW);
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(chart.chartArea.left, y);
    ctx.lineTo(chart.chartArea.right, y);
    ctx.stroke();
    // Label
    ctx.fillStyle = "#e74c3c";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("90% Contractual Capacity (315 MW)", chart.chartArea.left + 6, y - 6);
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSelectedBMUs() {
  return Array.from(bmuCheckboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function setStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", !!isError);
}
