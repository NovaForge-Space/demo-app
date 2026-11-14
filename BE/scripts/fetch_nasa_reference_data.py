"""Fetch a curated set of official NASA fire and combustion reference pages."""

from __future__ import annotations

import html
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "nasa_reference_data"

SOURCES = [
    (
        "nasa-combustion-science",
        "NASA Combustion Science",
        "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/",
    ),
    (
        "nasa-researchers-guide-combustion",
        "A Researcher's Guide to Combustion Science",
        "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/",
    ),
    (
        "nasa-mir-fire-1997",
        "25 Years Ago: Fire Aboard Space Station Mir",
        "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/",
    ),
    (
        "nasa-apollo-1",
        "Apollo 1",
        "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1",
    ),
    (
        "nasa-apollo-13",
        "Apollo 13",
        "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13",
    ),
    (
        "nasa-fire-detector-spinoff",
        "NASA Fire Detector Spinoff",
        "https://spinoff.nasa.gov/node/9407",
    ),
    (
        "nasa-firefighters-air-tanks-spinoff",
        "NASA Fireman's Air Tanks Spinoff",
        "https://spinoff.nasa.gov/node/9582",
    ),
    (
        "nasa-fire-attire-spinoff",
        "NASA Fire Attire Spinoff",
        "https://spinoff.nasa.gov/node/9918",
    ),
]


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip_depth += 1
        elif tag in {"p", "h1", "h2", "h3", "li", "br"} and not self.skip_depth:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self.skip_depth:
            self.skip_depth -= 1
        elif tag in {"p", "h1", "h2", "h3", "li"} and not self.skip_depth:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def extract_text(payload: bytes) -> str:
    parser = TextExtractor()
    parser.feed(payload.decode("utf-8", errors="replace"))
    text = html.unescape("".join(parser.parts))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def fetch(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "NovaForge NASA reference fetcher/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fetched_at = datetime.now(timezone.utc).isoformat()
    manifest: list[dict[str, str]] = []
    for slug, title, url in SOURCES:
        target = OUT / f"{slug}.md"
        try:
            text = extract_text(fetch(url))
            if len(text) < 200:
                raise RuntimeError("page returned too little readable text")
            target.write_text(
                f"# {title}\n\n"
                f"- **Source:** {url}\n"
                f"- **Publisher:** NASA\n"
                f"- **Fetched:** {fetched_at}\n"
                f"- **Evidence type:** official NASA reference page; not an experimental table\n\n"
                f"{text}\n",
                encoding="utf-8",
            )
            manifest.append({"slug": slug, "status": "ready", "path": target.relative_to(ROOT).as_posix(), "url": url})
            print(f"saved {target}")
        except Exception as exc:
            manifest.append({"slug": slug, "status": "failed", "error": str(exc), "url": url})
            print(f"failed {url}: {exc}")

    (OUT / "manifest.json").write_text(
        json.dumps(
            {
                "description": "Curated official NASA reference pages for NovaForge.",
                "fetched_at": fetched_at,
                "psi_data_status": "pending study-level selection; no PSI measurements are included here",
                "sources": manifest,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
