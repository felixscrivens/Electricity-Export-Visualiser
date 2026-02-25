# Moray West Windfarm — Grid Export Visualiser

An interactive browser-based tool for visualising the actual metered electricity export from the [Moray West offshore windfarm](https://morayoffshorerenewables.com/) using publicly available data from the GB electricity system.

## Live site

Once GitHub Pages is enabled, the visualiser is available at:

```
https://felixscrivens.github.io/Electricity-Export-Visualiser/
```

No downloads, accounts, or API keys are required — just open the link in any modern browser.

## What it shows

The tool fetches **actual metered generation output** for Moray West from the [Elexon BMRS](https://bmrs.elexon.co.uk) (Balancing Mechanism Reporting Service) and displays it as a stacked bar chart. The data comes from the **B1610** dataset, which records the energy (in MWh) delivered to the grid by each Balancing Mechanism Unit (BMU) in every 30-minute settlement period. Values are converted to average power in MW for display.

Moray West is registered as four BMUs:

| BMU ID | NGC BMU Name |
|---|---|
| T_MOWWO-1 | MOWWO-1 |
| T_MOWWO-2 | MOWWO-2 |
| T_MOWWO-3 | MOWWO-3 |
| T_MOWWO-4 | MOWWO-4 |

The farm became operational in 2024, so data before mid-2024 will be sparse or absent.

## Features

- **Date range selector** — choose any From/To period from mid-2024 onwards
- **BMU toggles** — include or exclude individual BMUs to compare their contributions
- **Aggregation level** — view data per settlement period (30 min), daily average, or weekly average
- **Custom reference lines** — add horizontal lines at any MW value with your own label and colour (e.g. contractual capacity benchmarks)
- **Summary statistics** — total energy (MWh), peak and mean average power (MW)

## How to run locally

No build step or server is needed. Simply open `index.html` in a browser:

```bash
# Clone the repo
git clone https://github.com/felixscrivens/Electricity-Export-Visualiser.git
cd Electricity-Export-Visualiser

# Open in your default browser
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

The page fetches data directly from the Elexon BMRS API, which is free and requires no API key.

## Project structure

```
index.html    Main page — controls, chart canvas, help modal
app.js        API fetching, data processing, Chart.js rendering
style.css     Layout and styling
help.html     Standalone instructions and glossary page
README.md     This file
```

## Data source

All data is sourced from the **Elexon BMRS Insights Solution**, specifically:

- **Endpoint:** [`/datasets/B1610/stream`](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/B1610/stream)
- **What it returns:** Actual metered generation output per BMU per settlement period
- **Units:** MWh (energy per 30-minute period), converted to MW for display
- **Latency:** Data is published approximately 5 days after the operational period
- **Licence:** Publicly available, no API key required

See the [help page](help.html) or the in-app help button for a full glossary and guide.

## Key links

| Resource | URL |
|---|---|
| Elexon BMRS | https://bmrs.elexon.co.uk |
| BMU search tool | https://bmrs.elexon.co.uk/balancing-mechanism-bmu-view |
| API documentation | https://bmrs.elexon.co.uk/api-documentation |
| B1610/stream endpoint docs | https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/B1610/stream |
