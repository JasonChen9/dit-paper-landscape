#!/usr/bin/env python3
"""Build a curated affiliation snapshot for the key-author map.

The author map uses the primary affiliation printed on an author's most recent
key-author paper in the catalog. The script prefers paper-level arXiv HTML,
falls back to ar5iv, and records provenance instead of guessing.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import date
import html
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

from bs4 import BeautifulSoup, Tag


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog" / "papers.csv"
OUTPUT = ROOT / "catalog" / "author_affiliations.json"
CACHE = ROOT / "catalog" / "affiliation-cache.json"
USER_AGENT = "Diffusion-Intelligence-Atlas/1.0 (public paper affiliation indexing)"

SOURCE_URLS = (
    ("arXiv HTML", "https://arxiv.org/html/{paper_id}"),
    ("ar5iv", "https://ar5iv.labs.arxiv.org/html/{paper_id}"),
)

INSTITUTION_ALIASES = {
    "HKUST": "Hong Kong University of Science and Technology",
    "The Hong Kong University of Science and Technology": "Hong Kong University of Science and Technology",
    "The Hong Kong University of Science and Technology (Guangzhou)": "Hong Kong University of Science and Technology (Guangzhou)",
    "UC Berkeley": "University of California, Berkeley",
    "U.C. Berkeley": "University of California, Berkeley",
    "NYU": "New York University",
    "CMU": "Carnegie Mellon University",
    "MIT": "Massachusetts Institute of Technology",
    "MIT CSAIL": "Massachusetts Institute of Technology",
    "UIUC": "University of Illinois Urbana-Champaign",
    "UW": "University of Washington",
    "UCLA": "University of California, Los Angeles",
    "USC": "University of Southern California",
    "ETH Zurich": "ETH Zürich",
    "ETH Zürich": "ETH Zürich",
    "FAIR, Meta": "Meta AI",
    "Meta FAIR": "Meta AI",
    "Meta AI, FAIR": "Meta AI",
    "Google Research": "Google",
    "Google DeepMind": "Google DeepMind",
    "ByteDance Research": "ByteDance",
    "Bytedance": "ByteDance",
    "ByteDance Seed": "ByteDance",
    "Adobe Research": "Adobe",
    "Google Brain": "Google",
    "NVIDIA Research": "NVIDIA",
    "Shanghai AI Lab": "Shanghai AI Laboratory",
    "Tencent China": "Tencent",
    "Tencent Hunyuan": "Tencent",
    "Meta": "Meta AI",
    "Baidu VIS": "Baidu",
}

INSTITUTION_SUBSTRINGS = (
    ("physicalintelligence.company", "Physical Intelligence"),
    ("mmlab, cuhk", "Chinese University of Hong Kong"),
    ("national university of singapore", "National University of Singapore"),
    ("beijing normal university", "Beijing Normal University"),
    ("fudan university", "Fudan University"),
    ("tsinghua university", "Tsinghua University"),
    ("monash university", "Monash University"),
    ("university of texas at austin", "University of Texas at Austin"),
    ("the university of texas at austin", "University of Texas at Austin"),
    ("university of oxford", "University of Oxford"),
    ("university of toronto", "University of Toronto"),
    ("columbia university", "Columbia University"),
    ("max planck research school for intelligent systems", "Max Planck Institute for Intelligent Systems"),
    ("ludwig maximilian university of munich", "Ludwig Maximilian University of Munich"),
    ("institute of computing technology, cas", "Chinese Academy of Sciences"),
    ("jd.com", "JD.com"),
    ("tongyi lab", "Alibaba Group"),
    ("klingai", "Kuaishou"),
    ("oppo ai", "OPPO"),
)

INSTITUTION_TERMS = (
    "university", "institute", "school", "college", "academy", "laboratory",
    "laboratories", "lab", "research", "center", "centre", "department",
    "corporation", "company", "group", "technology", "intelligence",
    "openai", "deepmind", "google", "meta", "microsoft", "nvidia", "adobe",
    "amazon", "apple", "alibaba", "bytedance", "tencent", "baidu", "huawei",
    "tesla", "moonshot", "stability ai", "runway", "waymo", "physical intelligence",
    "unitree", "xpeng", "hkust", "uiuc", "mit", "cmu", "uc berkeley", "ucla",
)

NON_AFFILIATION = (
    "equal contribution", "corresponding author", "project page", "work done",
    "code available", "footnotemark", "footnote", "email", "@", "anonymous",
)


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip(" ,;|\n\t")


def normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def split_values(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split(";") if item.strip()]


def key_author_names(row: dict[str, str]) -> list[str]:
    return [entry.split("|", 1)[0].strip() for entry in split_values(row.get("key_authors", ""))]


def catalog_authors(row: dict[str, str]) -> list[str]:
    return split_values(row.get("authors", ""))


def canonical_institution(value: str) -> str | None:
    candidate = re.sub(r"\[\[[^]]+\]\]", " ", value)
    candidate = re.sub(r"\{\}\^\{[^}]+\}", " ", candidate)
    candidate = re.sub(r"(?:normal-[^\s]+\s+)?start_FLOATSUPERSCRIPT.*?end_FLOATSUPERSCRIPT", " ", candidate)
    candidate = re.sub(r"^(?:Affiliation|affiliationmark)\s*:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = compact(candidate)
    candidate = re.sub(r"^(?:and\s+)?(?:\d+[\s,]*)+", "", candidate).strip(" ,;.-")
    candidate = re.sub(r"^[*†‡♢♦◊⋄§¶#]+\s*", "", candidate).strip()
    if not candidate or len(candidate) < 3:
        return None
    lowered = candidate.casefold()
    if any(fragment in lowered for fragment in NON_AFFILIATION):
        return None
    if lowered in {"no institutional affiliation", "independent researcher", "independent"}:
        return "Independent"
    if lowered in {"research hub", "department of computer science"}:
        return None
    for fragment, canonical in INSTITUTION_SUBSTRINGS:
        if fragment in lowered:
            return canonical
    if not any(term in lowered for term in INSTITUTION_TERMS):
        return None
    if candidate in INSTITUTION_ALIASES:
        return INSTITUTION_ALIASES[candidate]
    for alias, canonical in sorted(INSTITUTION_ALIASES.items(), key=lambda item: -len(item[0])):
        if normalized_name(candidate) == normalized_name(alias):
            return canonical
    return candidate


def recanonicalize_record(record: dict[str, object]) -> dict[str, object] | None:
    primary = canonical_institution(str(record.get("primary", "")))
    institutions = [canonical_institution(str(value)) for value in record.get("all", [])]
    institutions = [institution for institution in institutions if institution]
    if primary and primary not in institutions:
        institutions.insert(0, primary)
    if not primary and institutions:
        primary = institutions[0]
    if not primary:
        return None
    return {**record, "primary": primary, "all": list(dict.fromkeys(institutions))}


def marker_text(value: str) -> str:
    value = compact(value)
    value = value.replace("^{", "").replace("}", "")
    value = value.replace("footnotemark:", "")
    return compact(value)


def marker_tokens(value: str) -> list[str]:
    value = marker_text(value)
    tokens = re.findall(r"\d+|[*†‡♢♦◊⋄§¶#]", value)
    return list(dict.fromkeys(tokens or ([value] if value else [])))


def marked_lines(element: Tag) -> list[str]:
    clone = BeautifulSoup(str(element), "html.parser")
    for node in clone.select("sup"):
        marker = marker_text(node.get_text(" ", strip=True))
        node.replace_with(f" [[{marker}]] " if marker else " ")
    for node in clone.select("br"):
        node.replace_with("\n")
    text = clone.get_text(" ", strip=False)
    return [compact(line) for line in text.splitlines() if compact(line)]


def author_markers(text: str, author: str, all_authors: list[str]) -> list[str]:
    start = text.casefold().find(author.casefold())
    if start < 0:
        return []
    end = len(text)
    for other in all_authors:
        if other == author:
            continue
        position = text.casefold().find(other.casefold(), start + len(author))
        if position >= 0:
            end = min(end, position)
    fragment = text[start + len(author):end]
    return [token for marker in re.findall(r"\[\[([^]]+)\]\]", fragment) for token in marker_tokens(marker)]


def institution_markers(line: str) -> list[str]:
    match = re.match(r"^(?:(?:\s*\[\[[^]]+\]\]\s*)+)", line)
    prefix = match.group(0) if match else ""
    return [token for marker in re.findall(r"\[\[([^]]+)\]\]", prefix) for token in marker_tokens(marker)]


def affiliation_entries(line: str) -> list[tuple[str, list[str]]]:
    markers = list(re.finditer(r"\[\[([^]]+)\]\]", line))
    entries: list[tuple[str, list[str]]] = []
    if not markers:
        institution = canonical_institution(line)
        return [(institution, [])] if institution else []
    leading = canonical_institution(line[: markers[0].start()])
    if leading:
        entries.append((leading, []))
    for index, match in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(line)
        institution = canonical_institution(line[match.end():end])
        marker = marker_tokens(match.group(1))
        if institution:
            entries.append((institution, marker))
    return entries


def direct_creator_records(box: Tag, authors: list[str]) -> dict[str, dict[str, object]]:
    records: dict[str, dict[str, object]] = {}
    creators = box.select(".ltx_creator.ltx_role_author")
    if len(creators) <= 1:
        return records
    for creator in creators:
        text = compact(creator.get_text(" ", strip=True))
        matches = [author for author in authors if normalized_name(author) in normalized_name(text)]
        if len(matches) != 1:
            continue
        author = matches[0]
        institutions = [canonical_institution(node.get_text(" ", strip=True)) for node in creator.select(".ltx_affiliation_institution")]
        institutions = [institution for institution in institutions if institution]
        if not institutions:
            lines = marked_lines(creator)
            author_line = next((index for index, line in enumerate(lines) if normalized_name(author) in normalized_name(line)), -1)
            for line in lines[author_line + 1:]:
                entries = affiliation_entries(line)
                if len(entries) == 1:
                    institutions.append(entries[0][0])
        if institutions:
            records[author] = {"primary": institutions[0], "all": list(dict.fromkeys(institutions)), "confidence": "high"}
    return records


def grouped_records(box: Tag, authors: list[str]) -> dict[str, dict[str, object]]:
    clone = BeautifulSoup(str(box), "html.parser")
    contacts = clone.select(".ltx_role_affiliation")
    contact_lines = [line for contact in contacts for line in marked_lines(contact)]
    for contact in contacts:
        contact.decompose()
    lines = marked_lines(clone)
    if not lines:
        return {}
    last_author_line = -1
    for index, line in enumerate(lines):
        if any(normalized_name(author) in normalized_name(line) for author in authors):
            last_author_line = index
    if last_author_line < 0:
        return {}
    author_text = " ".join(lines[: last_author_line + 1])
    affiliations: list[tuple[str, list[str]]] = []
    source_lines = contact_lines or lines[last_author_line + 1:]
    for line in source_lines:
        affiliations.extend(affiliation_entries(line))
    if not affiliations:
        return {}
    valid_markers = {marker for _, markers in affiliations for marker in markers}
    unmarked = [institution for institution, markers in affiliations if not markers]
    records: dict[str, dict[str, object]] = {}
    for author in authors:
        markers = [marker for marker in author_markers(author_text, author, authors) if marker in valid_markers]
        matched = [institution for institution, aff_markers in affiliations if set(markers) & set(aff_markers)]
        if not matched and unmarked:
            matched = unmarked
        if not matched and len(affiliations) == 1:
            matched = [affiliations[0][0]]
        if not matched:
            continue
        all_institutions = list(dict.fromkeys(matched))
        confidence = "high" if markers or len(affiliations) == 1 else "medium"
        records[author] = {"primary": all_institutions[0], "all": all_institutions, "confidence": confidence}
    return records


def parse_affiliations(payload: bytes, row: dict[str, str]) -> dict[str, dict[str, object]]:
    soup = BeautifulSoup(payload, "html.parser")
    box = soup.select_one(".ltx_authors")
    if not box:
        return {}
    authors = catalog_authors(row)
    records = direct_creator_records(box, authors)
    records.update({author: record for author, record in grouped_records(box, authors).items() if author not in records})
    return {author: records[author] for author in key_author_names(row) if author in records}


def fetch(url: str, retries: int = 1) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=18) as response:
                return response.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            if attempt + 1 == retries:
                raise exc
            time.sleep(1.5 * (attempt + 1))
    raise AssertionError("unreachable")


def openalex_records(row: dict[str, str]) -> dict[str, dict[str, object]]:
    paper_id = row["arxiv_id"]
    url = f"https://api.openalex.org/works/https://doi.org/10.48550/arXiv.{paper_id}"
    payload = json.loads(fetch(url).decode("utf-8"))
    by_name = {normalized_name(author): author for author in key_author_names(row)}
    records: dict[str, dict[str, object]] = {}
    for authorship in payload.get("authorships", []):
        display_name = authorship.get("author", {}).get("display_name", "")
        author = by_name.get(normalized_name(display_name))
        if not author:
            continue
        institutions = [canonical_institution(item.get("display_name", "")) for item in authorship.get("institutions", [])]
        institutions = [institution for institution in institutions if institution]
        if institutions:
            records[author] = {
                "primary": institutions[0],
                "all": list(dict.fromkeys(institutions)),
                "confidence": "high",
                "source_url": url,
            }
    return records


def semantic_scholar_records(row: dict[str, str]) -> dict[str, dict[str, object]]:
    paper_id = row["arxiv_id"]
    url = f"https://api.semanticscholar.org/graph/v1/paper/ARXIV:{paper_id}/authors?fields=name,affiliations"
    payload = json.loads(fetch(url).decode("utf-8"))
    by_name = {normalized_name(author): author for author in key_author_names(row)}
    records: dict[str, dict[str, object]] = {}
    for item in payload.get("data", []):
        author = by_name.get(normalized_name(item.get("name", "")))
        if not author:
            continue
        institutions = [canonical_institution(value) for value in item.get("affiliations", [])]
        institutions = [institution for institution in institutions if institution]
        if institutions:
            records[author] = {
                "primary": institutions[0],
                "all": list(dict.fromkeys(institutions)),
                "confidence": "medium",
                "source_url": url,
            }
    return records


def load_cache() -> dict[str, object]:
    if not CACHE.exists():
        return {}
    return json.loads(CACHE.read_text(encoding="utf-8"))


def save_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def paper_records(
    row: dict[str, str],
    refresh: bool,
    cache: dict[str, object],
    cached_only: bool = False,
) -> tuple[dict[str, dict[str, object]], str | None]:
    paper_id = row["arxiv_id"]
    if not refresh and isinstance(cache.get(paper_id), dict) and cache[paper_id].get("authors"):
        cached = cache[paper_id]
        records = {
            author: normalized
            for author, record in cached.get("authors", {}).items()
            if (normalized := recanonicalize_record(record)) is not None
        }
        if records:
            cache[paper_id]["authors"] = records
            return records, cached.get("source")
    skip_html = not refresh and isinstance(cache.get(paper_id), dict)
    if cached_only and skip_html:
        return {}, None
    if not re.fullmatch(r"\d{4}\.\d{4,5}", paper_id):
        cache[paper_id] = {"source": None, "authors": {}}
        return {}, None
    if not skip_html:
        for source, template in SOURCE_URLS:
            url = template.format(paper_id=paper_id)
            try:
                records = parse_affiliations(fetch(url), row)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
                continue
            if records:
                for record in records.values():
                    record["source_url"] = url
                cache[paper_id] = {"source": source, "authors": records}
                return records, source
    for source, resolver in (("OpenAlex", openalex_records), ("Semantic Scholar", semantic_scholar_records)):
        try:
            records = resolver(row)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            continue
        if records:
            cache[paper_id] = {"source": source, "authors": records}
            return records, source
    cache[paper_id] = {"source": None, "authors": {}}
    return {}, None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="refresh every paper instead of reusing parsed metadata")
    parser.add_argument("--delay", type=float, default=0.12, help="delay between papers")
    parser.add_argument("--workers", type=int, default=3, help="number of concurrent paper fetches")
    parser.add_argument("--cached-only", action="store_true", help="rebuild from cached records without network fallbacks")
    args = parser.parse_args()

    with CATALOG.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    rows = [row for row in rows if row.get("key_authors")]
    rows.sort(key=lambda row: (row.get("published", ""), row.get("arxiv_id", "")), reverse=True)
    cache = load_cache()
    by_author: dict[str, dict[str, object]] = {}
    all_key_authors = sorted({author for row in rows for author in key_author_names(row)})

    def resolve(row: dict[str, str]) -> tuple[dict[str, str], dict[str, dict[str, object]], str | None]:
        records, source = paper_records(row, args.refresh, cache, args.cached_only)
        time.sleep(max(0, args.delay))
        return row, records, source

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        resolved_rows = executor.map(resolve, rows)
        for index, (row, records, source) in enumerate(resolved_rows, 1):
            for author, record in records.items():
                if author in by_author:
                    continue
                by_author[author] = {
                    **record,
                    "paper_id": row["arxiv_id"],
                    "paper_title": row["title"],
                    "published": row["published"],
                    "source": source,
                }
            if index % 12 == 0:
                print(f"processed {index}/{len(rows)} papers; resolved {len(by_author)}/{len(all_key_authors)} authors", flush=True)
    save_json(CACHE, cache)
    for author in all_key_authors:
        by_author.setdefault(author, {
            "primary": "Unknown",
            "all": [],
            "confidence": "unresolved",
            "paper_id": None,
            "paper_title": None,
            "published": None,
            "source": None,
        })
    institution_counts: dict[str, int] = {}
    for record in by_author.values():
        institution = str(record["primary"])
        institution_counts[institution] = institution_counts.get(institution, 0) + 1
    payload = {
        "generated_at": date.today().isoformat(),
        "selection_rule": "Primary affiliation on the latest resolved key-author paper in the catalog",
        "authors": dict(sorted(by_author.items())),
        "institution_counts": dict(sorted(institution_counts.items(), key=lambda item: (-item[1], item[0]))),
    }
    save_json(OUTPUT, payload)
    resolved = sum(record["primary"] != "Unknown" for record in by_author.values())
    print(f"wrote {OUTPUT}: {resolved}/{len(by_author)} authors resolved across {len(institution_counts)} labels")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
