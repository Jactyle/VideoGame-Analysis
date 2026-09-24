# Steam Games Analysis

A two-page site analyzing 117,420 games published on Steam between 1997 and 2026: a
static report of eight findings, and an interactive dashboard for exploring the data
yourself. 

Live site: https://jactyle.github.io/VideoGame-Analysis/

## Where the data came from

[Steam Games Dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)
by Fronkon Games (MIT license), built from the official Steam store API and SteamSpy,
mirrored on Hugging Face. One row in the source file is one published game on Steam
(DLC, soundtracks, videos, and other non-game listings are already excluded upstream).

The raw file (`games.csv`, ~400 MB) is not committed to this repo — it's rebuilt
locally by the two scripts in `scripts/`. `data/games.csv`, the ~117k-row, 24-column
file the site actually loads, **is** committed, along with a small JSON summary of
exactly which rows were dropped in cleaning and why. The report page's closing section
explains all of this in prose, with the exact drop counts pulled live from
`data/clean_summary.json`.

## Files

### Site (what GitHub Pages serves)

| File | What it does |
|---|---|
| `index.html` | The report page. Loads `data/games.csv` in the browser, computes eight findings (catalog growth, genre concentration, the free-to-play plateau, review positivity by genre, playtime by genre, the decline of Mac/Linux support, publisher concentration, and the long tail of ownership), and renders a chart for each. |
| `dashboard.html` | The interactive dashboard. Filters by release year, genre, platform, price, and publisher; four summary numbers and four charts (each with its own measure and breakdown switch) recalculate live; a sortable table shows the underlying aggregates; Reset clears every filter. |
| `css/style.css` | Shared nav bar, typography, color palette (including automatic dark mode), stat tiles, filter bar, chart cards, and table styling used by both pages. |
| `js/data.js` | Loads and parses `data/games.csv` (via PapaParse) and provides the shared aggregation helpers (`aggregateBy`, `topNWithOther`, `summarize`, etc.) that both pages build their numbers and charts from. |
| `js/charts.js` | Thin wrapper around Chart.js so every chart on the site shares the same bar/line styling and color scheme. |
| `js/motion.js` | Small progressive-enhancement scroll-reveal effect (findings, stat tiles, chart cards fade in as you scroll); does nothing if JS fails or the visitor prefers reduced motion. |
| `js/report.js` | Computes the report page's eight findings and headline numbers and renders their charts. |
| `js/dashboard.js` | Wires up the dashboard's filters, summary tiles, four chart panels, sortable table, and reset button. |

### Data

| File | What it does |
|---|---|
| `data/games.csv` | The cleaned dataset the site loads: 117,420 rows, 24 columns (see below). |
| `data/clean_summary.json` | Row counts from the cleaning run — how many rows were kept, how many were dropped and why, and a few other stats — read live by `index.html`'s closing section. |
| `data/raw/` | Where the ~400 MB raw source file is downloaded to. **Git-ignored** — it's a mechanical download, not something worth versioning, and far too large to commit. Run `scripts/fetch_data.py` to recreate it. |

### Scripts

| File | What it does |
|---|---|
| `scripts/fetch_data.py` | Downloads the raw Steam Games Dataset CSV from Hugging Face into `data/raw/games_raw.csv`. |
| `scripts/clean_data.py` | Reads the raw file, fixes a header bug in the source (a missing comma merges its "Discount" and "DLC count" columns), trims it to the columns this site needs, derives a few fields, drops a small number of low-quality rows, and writes `data/games.csv` and `data/clean_summary.json`. |

To regenerate the data from scratch: `python3 scripts/fetch_data.py && python3 scripts/clean_data.py` (standard library only, no dependencies to install).

## `data/games.csv` columns

One row is one Steam game.

| Column | Meaning |
|---|---|
| `app_id`, `name` | Steam's app ID and the game's title |
| `release_date`, `release_year` | Parsed from Steam's release-date string; the **time column** |
| `developer`, `publisher` | First-listed developer/publisher (see the report's closing section for the fallback rule when one is missing); `publisher` is the **group column** |
| `primary_genre`, `primary_category` | First-listed genre (e.g. Action, RPG) and store category (e.g. Single-player) — the two required **categorical/filterable variables** |
| `platforms` | Which of Windows/Mac/Linux the game supports |
| `is_free`, `price_usd`, `discount_pct` | Whether the game is free, its price, and its current discount |
| `dlc_count` | Number of DLC listed for the game |
| `positive_reviews`, `negative_reviews`, `review_count`, `review_positive_rate` | Steam review counts and the resulting positive rate — **numeric** |
| `estimated_owners_low/high/mid` | Steam/SteamSpy's published owner-count range and its midpoint — **numeric** |
| `peak_ccu`, `average_playtime_forever_minutes`, `metacritic_score`, `achievements` | Peak concurrent players, average playtime, Metacritic score, and achievement count — **numeric** |

## Data-shape requirements this satisfies

- **Panel/event data**: one row is one event (a game being published), with the date it happened (`release_date`) and the group it belongs to (`publisher`).
- **Time column**: `release_year`, spanning 30 distinct years (1997–2026), well over the minimum of 5.
- **Group column**: `publisher`, with 63,358 distinct values, well over the minimum of 10.
- **Size**: 117,420 rows, 24 columns — over the minimums of 50,000 rows and 8 columns.
- **Categorical/filterable**: `primary_genre`, `primary_category`, `platforms`, `is_free` (at least 2 required).
- **Numeric**: price, review counts/rate, estimated owners, playtime, peak CCU, Metacritic score (at least 2 required).
