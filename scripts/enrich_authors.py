#!/usr/bin/env python3
"""Populate catalog author metadata from arXiv abstract pages.

Full author lists are used for display and text search. The key_authors field is
curated separately and contains only first, explicitly co-first, and explicitly
corresponding authors. When no curated role data exists, this script initializes
the first listed author as ``Name|first``.
"""

from __future__ import annotations

import argparse
import csv
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog" / "papers.csv"
CACHE = ROOT / "catalog" / "arxiv-cache.json"
KEY_AUTHORS = ROOT / "catalog" / "key_authors.json"
USER_AGENT = "Diffusion-Intelligence-Atlas/1.0 (research catalog author enrichment)"


class CitationMetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.authors: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "meta":
            return
        values = {key.lower(): value or "" for key, value in attrs}
        if values.get("name", "").lower() == "citation_author" and values.get("content"):
            self.authors.append(html.unescape(values["content"]).strip())


def display_name(citation_name: str) -> str:
    """Convert arXiv's ``Family, Given`` citation form to ``Given Family``."""
    value = re.sub(r"\s+", " ", citation_name).strip()
    if "," not in value:
        return value
    family, given = (part.strip() for part in value.split(",", 1))
    return f"{given} {family}".strip()


def load_cache() -> dict[str, list[str]]:
    if not CACHE.exists():
        return {}
    payload = json.loads(CACHE.read_text(encoding="utf-8"))
    return {str(key): list(value) for key, value in payload.items() if isinstance(value, list)}


def save_cache(cache: dict[str, list[str]]) -> None:
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_key_authors() -> dict[str, list[str]]:
    if not KEY_AUTHORS.exists():
        return {}
    payload = json.loads(KEY_AUTHORS.read_text(encoding="utf-8"))
    return {str(key): list(value) for key, value in payload.items() if isinstance(value, list)}


def is_group_author(name: str) -> bool:
    value = name.casefold()
    return "team" in value or value in {"nvidia", "physical intelligence"}


def fetch_authors(arxiv_id: str, retries: int = 4) -> list[str]:
    url = f"https://arxiv.org/abs/{arxiv_id}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                parser = CitationMetaParser()
                parser.feed(response.read().decode("utf-8", errors="replace"))
            authors = [display_name(author) for author in parser.authors]
            if not authors:
                raise RuntimeError("citation_author metadata is empty")
            return authors
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            if attempt + 1 == retries:
                raise RuntimeError(f"{arxiv_id}: {exc}") from exc
            time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def is_arxiv_row(row: dict[str, str]) -> bool:
    return bool(re.fullmatch(r"\d{4}\.\d{4,5}", row.get("arxiv_id", "")))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="refresh cached arXiv metadata")
    parser.add_argument("--delay", type=float, default=0.25, help="delay between arXiv requests")
    parser.add_argument("--limit", type=int, help="fetch at most this many uncached records")
    args = parser.parse_args()

    with CATALOG.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    for field, after in [
        ("alternate_titles", "title"),
        ("authors", "alternate_titles"),
        ("key_authors", "authors"),
        ("source_label", "summary_zh"),
    ]:
        if field in fieldnames:
            continue
        position = fieldnames.index(after) + 1 if after in fieldnames else len(fieldnames)
        fieldnames.insert(position, field)
        for row in rows:
            row[field] = ""

    cache = load_cache()
    key_author_overrides = load_key_authors()
    fetched = 0
    failures: list[str] = []
    for row in rows:
        arxiv_id = row.get("arxiv_id", "")
        if not is_arxiv_row(row):
            continue
        authors = None if args.refresh else cache.get(arxiv_id)
        if authors is None:
            if args.limit is not None and fetched >= args.limit:
                continue
            try:
                authors = fetch_authors(arxiv_id)
                cache[arxiv_id] = authors
                fetched += 1
                print(f"FETCH {arxiv_id}: {authors[0]} +{len(authors) - 1}", flush=True)
                save_cache(cache)
                time.sleep(max(0, args.delay))
            except RuntimeError as exc:
                failures.append(str(exc))
                print(f"ERROR {exc}", flush=True)
                continue
        authors = [author for author in authors if author and author != ":"]
        row["authors"] = ";".join(authors)
        if arxiv_id in key_author_overrides:
            row["key_authors"] = ";".join(key_author_overrides[arxiv_id])
        elif authors and is_group_author(authors[0]):
            row["key_authors"] = ""
        elif not row.get("key_authors") and authors:
            row["key_authors"] = f"{authors[0]}|first"
        if not row.get("source_label"):
            row["source_label"] = "arXiv"

    for row in rows:
        paper_id = row.get("arxiv_id", "")
        if paper_id in key_author_overrides:
            row["key_authors"] = ";".join(key_author_overrides[paper_id])

    with CATALOG.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)
    save_cache(cache)
    print(f"summary: rows={len(rows)}, fetched={fetched}, failures={len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
