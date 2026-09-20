"""
Download the raw Steam Games Dataset CSV.

Source: Fronkon Games' "Steam Games Dataset" (MIT licensed), built from the
official Steam store API and SteamSpy, mirrored on Hugging Face at
https://huggingface.co/datasets/FronkonGames/steam-games-dataset

The raw file is ~400 MB with 40 columns (many of them descriptions, image
URLs, and other fields we don't need), so it is downloaded to data/raw/
(git-ignored) rather than committed. clean_data.py turns it into the much
smaller data/games.csv that the site actually loads.

Usage: python3 scripts/fetch_data.py
"""

import os
import urllib.request

URL = "https://huggingface.co/datasets/FronkonGames/steam-games-dataset/resolve/main/games.csv"
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "games_raw.csv")


def main():
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    print(f"Downloading {URL}")
    urllib.request.urlretrieve(URL, OUT_PATH)
    size_mb = os.path.getsize(OUT_PATH) / (1024 * 1024)
    print(f"Saved {OUT_PATH} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
