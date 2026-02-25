// ---------------------------------------------------------------------------
// Moray West Windfarm — Grid Export Visualiser
// Fetches B1610 (Actual Generation Output) from the Elexon BMRS API and
// renders an interactive bar chart using Chart.js.
// ---------------------------------------------------------------------------

// ---- Colour palettes (curated for contrast) ----
const BMU_IDS = ["T_MOWWO-1", "T_MOWWO-2", "T_MOWWO-3", "T_MOWWO-4"];

const PALETTES = {
  classic:    { name: "Classic",    colours: ["#1B69D3", "#2EA843", "#E8850C", "#8E24AA"] },
  nautical:   { name: "Nautical",   colours: ["#003F5C", "#58A4B0", "#FF6361", "#FFA600"] },
  highland:   { name: "Highland",   colours: ["#5B7553", "#D4A03C", "#A23B3B", "#2C4A6E"] },
  nordic:     { name: "Nordic",     colours: ["#264653", "#2A9D8F", "#E9C46A", "#E76F51"] },
  slate:      { name: "Slate",      colours: ["#334155", "#6B7F99", "#94A3B8", "#B0BEC5"] },
  vivid:      { name: "Vivid",      colours: ["#E6194B", "#3CB44B", "#4363D8", "#F58231"] },
  pastel:     { name: "Pastel",     colours: ["#7EB4D8", "#8FBF8F", "#E8A87C", "#C49BC8"] },
  highcontrast: { name: "High Contrast", colours: ["#000000", "#E6194B", "#3CB44B", "#FFE119"] },
};

let activePalette = "classic";

function getBMUColours() {
  const cols = PALETTES[activePalette].colours;
  const map = {};
  BMU_IDS.forEach((id, i) => { map[id] = cols[i]; });
  return map;
}

// ---- User-defined reference lines ----
// Each entry: { label, value (MW), colour }
const referenceLines = [
  { label: "90% Contractual Capacity", value: 315, colour: "#e74c3c" },
];

// ---- DOM refs ----
const dateFrom = document.getElementById("date-from");
const dateTo = document.getElementById("date-to");
const aggregation = document.getElementById("aggregation");
const fetchBtn = document.getElementById("fetch-btn");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const bmuCheckboxes = document.querySelectorAll('.bmu-toggles input[type="checkbox"]');
const refLinesList = document.getElementById("ref-lines-list");
const refAddBtn = document.getElementById("ref-add-btn");
const refLabelInput = document.getElementById("ref-label");
const refValueInput = document.getElementById("ref-value");
const refColourInput = document.getElementById("ref-colour");
const paletteContainer = document.getElementById("palette-options");
const downloadPngBtn = document.getElementById("download-png-btn");
const downloadJpgBtn = document.getElementById("download-jpg-btn");

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

// ---- Event listeners ----
fetchBtn.addEventListener("click", run);
refAddBtn.addEventListener("click", addReferenceLine);
downloadPngBtn.addEventListener("click", () => downloadChart("png"));
downloadJpgBtn.addEventListener("click", () => downloadChart("jpg"));

// ---- Reference lines UI ----
function renderRefLines() {
  refLinesList.innerHTML = "";
  referenceLines.forEach((line, i) => {
    const tag = document.createElement("span");
    tag.className = "ref-line-tag";
    tag.innerHTML =
      `<span class="swatch" style="background:${line.colour}"></span>` +
      `${line.label} (${line.value} MW)` +
      `<button title="Remove">&times;</button>`;
    tag.querySelector("button").addEventListener("click", () => {
      referenceLines.splice(i, 1);
      renderRefLines();
      if (chart) chart.update();
    });
    refLinesList.appendChild(tag);
  });
}

function addReferenceLine() {
  const label = refLabelInput.value.trim();
  const value = parseFloat(refValueInput.value);
  const colour = refColourInput.value;
  if (!label) { refLabelInput.focus(); return; }
  if (isNaN(value) || value < 0) { refValueInput.focus(); return; }
  referenceLines.push({ label, value, colour });
  refLabelInput.value = "";
  refValueInput.value = "";
  renderRefLines();
  if (chart) chart.update();
}

renderRefLines();

// ---- Palette UI ----
function buildPaletteUI() {
  paletteContainer.innerHTML = "";
  for (const [key, pal] of Object.entries(PALETTES)) {
    const btn = document.createElement("button");
    btn.className = "palette-btn" + (key === activePalette ? " active" : "");
    btn.title = pal.name;
    btn.dataset.key = key;
    // Four colour swatches
    btn.innerHTML = pal.colours
      .map((c) => `<span class="pal-dot" style="background:${c}"></span>`)
      .join("");
    btn.addEventListener("click", () => {
      activePalette = key;
      paletteContainer.querySelectorAll(".palette-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (!chart) return;
      const colours = getBMUColours();
      chart.data.datasets.forEach((ds) => {
        if (colours[ds.label]) ds.backgroundColor = colours[ds.label];
      });
      chart.update();
    });
    paletteContainer.appendChild(btn);
  }
}
buildPaletteUI();

// ---- Download chart as image ----
function downloadChart(format) {
  if (!chart) return;
  if (format === "jpg") {
    // Draw chart onto a temporary canvas with white background
    const src = chart.canvas;
    const tmp = document.createElement("canvas");
    tmp.width = src.width;
    tmp.height = src.height;
    const ctx = tmp.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(src, 0, 0);
    const link = document.createElement("a");
    link.download = "moray-west-chart.jpg";
    link.href = tmp.toDataURL("image/jpeg", 0.95);
    link.click();
  } else {
    const link = document.createElement("a");
    link.download = "moray-west-chart.png";
    link.href = chart.toBase64Image("image/png", 1);
    link.click();
  }
}

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
      backgroundColor: getBMUColours()[bmu],
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
    plugins: [refLinesPlugin],
  });
}

// Custom plugin: draw all user-defined reference lines
const refLinesPlugin = {
  id: "refLines",
  afterDraw(chart) {
    const yScale = chart.scales.y;
    const ctx = chart.ctx;
    for (const line of referenceLines) {
      if (line.value > yScale.max) continue; // off-screen
      const y = yScale.getPixelForValue(line.value);
      ctx.save();
      ctx.strokeStyle = line.colour;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(chart.chartArea.left, y);
      ctx.lineTo(chart.chartArea.right, y);
      ctx.stroke();
      // Label
      ctx.fillStyle = line.colour;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${line.label} (${line.value} MW)`, chart.chartArea.left + 6, y - 6);
      ctx.restore();
    }
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
