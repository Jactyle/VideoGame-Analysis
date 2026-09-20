"""
Clean the raw Steam Games Dataset CSV into data/games.csv, the file the
site actually loads.

Why this exists: the raw file has ~40 columns, most of which (descriptions,
screenshot URLs, support emails, ...) are irrelevant to the analysis and
just make the file huge. This script also fixes a real bug in the source
file: its header row is missing a comma between "Discount" and "DLC count",
so every data row has one more field (40) than the header has names (39).
Every column from "Discount" onward is read at the wrong position unless
that's corrected first.

One row of output = one Steam game (an event: a game being published, on
the date it was published, published by one company).

Rows are dropped when:
  - the game has no name (essentially unparseable/corrupt row)
  - the name contains "playtest" (a pre-release test build, not a released
    game -- these have no meaningful review/playtime data)
  - the game has no genre listed (genre is used as a filterable field
    throughout the site, so a game without one can't be placed)

Usage: python3 scripts/clean_data.py
"""

import csv
import json
import os
from datetime import datetime

RAW_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "games_raw.csv")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "games.csv")
SUMMARY_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "clean_summary.json")

DATE_FORMATS = ["%b %d, %Y", "%b %Y", "%Y"]

OUT_HEADER = [
    "app_id", "name", "release_date", "release_year",
    "developer", "publisher", "primary_genre", "primary_category", "platforms",
    "is_free", "price_usd", "discount_pct", "dlc_count",
    "positive_reviews", "negative_reviews", "review_count", "review_positive_rate",
    "estimated_owners_low", "estimated_owners_high", "estimated_owners_mid",
    "peak_ccu", "average_playtime_forever_minutes", "metacritic_score", "achievements",
]


def parse_date(raw):
    raw = raw.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def first_item(csv_list_field):
    return csv_list_field.split(",")[0].strip()


def to_int(value, default=0):
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default


def to_float(value, default=0.0):
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def parse_owners(raw):
    parts = raw.split(" - ")
    if len(parts) != 2:
        return 0, 0
    low, high = to_int(parts[0]), to_int(parts[1])
    return low, high


def main():
    if not os.path.exists(RAW_PATH):
        raise SystemExit(f"Raw file not found at {RAW_PATH}. Run scripts/fetch_data.py first.")

    dropped = {"no_name": 0, "playtest": 0, "no_genre": 0}
    kept = 0
    fallback_publisher_from_developer = 0
    fallback_publisher_unknown = 0
    years_seen = set()
    publishers_seen = set()

    with open(RAW_PATH, newline="", encoding="utf-8") as raw_f, \
         open(OUT_PATH, "w", newline="", encoding="utf-8") as out_f:

        reader = csv.reader(raw_f)
        raw_header = next(reader)
        # Fix the missing-comma bug: "DiscountDLC count" is really two columns.
        split_at = raw_header.index("DiscountDLC count")
        header = raw_header[:split_at] + ["Discount", "DLC count"] + raw_header[split_at + 1:]
        pos = {name: i for i, name in enumerate(header)}

        writer = csv.writer(out_f)
        writer.writerow(OUT_HEADER)

        for row in reader:
            if len(row) != len(header):
                continue  # structurally broken row, extremely rare

            name = row[pos["Name"]].strip()
            if not name:
                dropped["no_name"] += 1
                continue
            if "playtest" in name.lower():
                dropped["playtest"] += 1
                continue

            genre = first_item(row[pos["Genres"]])
            if not genre:
                dropped["no_genre"] += 1
                continue

            dt = parse_date(row[pos["Release date"]])
            if dt is None:
                continue  # none observed in this dataset, but guard anyway

            developer = first_item(row[pos["Developers"]])
            publisher = first_item(row[pos["Publishers"]])
            if not publisher:
                if developer:
                    publisher = developer
                    fallback_publisher_from_developer += 1
                else:
                    publisher = "Unknown"
                    fallback_publisher_unknown += 1

            category = first_item(row[pos["Categories"]]) or "Uncategorized"

            platforms = []
            if row[pos["Windows"]] == "True":
                platforms.append("Windows")
            if row[pos["Mac"]] == "True":
                platforms.append("Mac")
            if row[pos["Linux"]] == "True":
                platforms.append("Linux")

            price = to_float(row[pos["Price"]])
            positive = to_int(row[pos["Positive"]])
            negative = to_int(row[pos["Negative"]])
            review_count = positive + negative
            review_rate = round(positive / review_count, 4) if review_count > 0 else ""

            owners_low, owners_high = parse_owners(row[pos["Estimated owners"]])

            out_row = [
                row[pos["AppID"]],
                name,
                dt.strftime("%Y-%m-%d"),
                dt.year,
                developer,
                publisher,
                genre,
                category,
                ", ".join(platforms) if platforms else "None",
                "true" if price == 0 else "false",
                round(price, 2),
                to_int(row[pos["Discount"]]),
                to_int(row[pos["DLC count"]]),
                positive,
                negative,
                review_count,
                review_rate,
                owners_low,
                owners_high,
                round((owners_low + owners_high) / 2),
                to_int(row[pos["Peak CCU"]]),
                to_int(row[pos["Average playtime forever"]]),
                to_int(row[pos["Metacritic score"]]),
                to_int(row[pos["Achievements"]]),
            ]
            writer.writerow(out_row)

            kept += 1
            years_seen.add(dt.year)
            publishers_seen.add(publisher)

    summary = {
        "rows_kept": kept,
        "rows_dropped": dropped,
        "total_rows_dropped": sum(dropped.values()),
        "distinct_release_years": len(years_seen),
        "release_year_range": [min(years_seen), max(years_seen)],
        "distinct_publishers": len(publishers_seen),
        "fallback_publisher_from_developer": fallback_publisher_from_developer,
        "fallback_publisher_unknown": fallback_publisher_unknown,
        "source": "https://huggingface.co/datasets/FronkonGames/steam-games-dataset",
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(SUMMARY_PATH, "w", encoding="utf-8") as sf:
        json.dump(summary, sf, indent=2)

    print(json.dumps(summary, indent=2))
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
