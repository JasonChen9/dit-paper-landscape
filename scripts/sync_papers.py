#!/usr/bin/env python3
"""Download and verify arXiv PDFs listed in catalog/papers.csv."""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog" / "papers.csv"
PDF_MAGIC = b"%PDF-"


def slugify(value: str) -> str:
    value = value.lower().replace("–", "-").replace("—", "-")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "paper"


def target_path(row: dict[str, str]) -> Path:
    arxiv_id = row["arxiv_id"].split("v", 1)[0]
    filename = f"{arxiv_id}__{slugify(row['short_title'])}.pdf"
    return ROOT / "papers" / row["category"] / filename


def is_valid_pdf(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 10_000:
        return False
    with path.open("rb") as handle:
        return handle.read(len(PDF_MAGIC)) == PDF_MAGIC


def download(row: dict[str, str], path: Path, retries: int = 3) -> None:
    arxiv_id = row["arxiv_id"].split("v", 1)[0]
    url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "DiT-Paper-Landscape/1.0 (personal research library)"},
    )
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=90) as response, partial.open("wb") as handle:
                while chunk := response.read(1_048_576):
                    handle.write(chunk)
            if not is_valid_pdf(partial):
                size = partial.stat().st_size if partial.exists() else 0
                raise RuntimeError(f"response is not a valid PDF ({size} bytes)")
            partial.replace(path)
            return
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            partial.unlink(missing_ok=True)
            if attempt == retries:
                raise RuntimeError(f"failed after {retries} attempts: {exc}") from exc
            time.sleep(2 * attempt)


def load_rows() -> list[dict[str, str]]:
    with CATALOG.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    required = {"arxiv_id", "short_title", "category"}
    if not rows or not required.issubset(rows[0]):
        raise SystemExit(f"catalog missing required columns: {sorted(required)}")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify only; do not download")
    parser.add_argument("--category", help="limit to one category directory")
    parser.add_argument("--workers", type=int, default=4, help="parallel downloads (default: 4)")
    args = parser.parse_args()

    rows = load_rows()
    if args.category:
        rows = [row for row in rows if row["category"] == args.category]

    ok = 0
    failed = 0
    pending: list[tuple[str, dict[str, str], Path]] = []
    for index, row in enumerate(rows, start=1):
        path = target_path(row)
        label = f"[{index:02d}/{len(rows):02d}] {row['arxiv_id']} {row['short_title']}"
        if is_valid_pdf(path):
            print(f"OK      {label}")
            ok += 1
            continue
        if args.check:
            print(f"MISSING {label}")
            failed += 1
            continue
        pending.append((label, row, path))

    if not args.check and pending:
        for label, _, _ in pending:
            print(f"QUEUE   {label}")
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
            futures = {
                executor.submit(download, row, path): (label, path)
                for label, row, path in pending
            }
            for future in concurrent.futures.as_completed(futures):
                label, path = futures[future]
                try:
                    future.result()
                    print(
                        f"SAVED   {label} -> {path.relative_to(ROOT)} "
                        f"({path.stat().st_size / 1_048_576:.1f} MiB)",
                        flush=True,
                    )
                    ok += 1
                except RuntimeError as exc:
                    print(f"ERROR   {label}: {exc}", file=sys.stderr, flush=True)
                    failed += 1

    print(f"summary: ok={ok}, failed={failed}, total={len(rows)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
