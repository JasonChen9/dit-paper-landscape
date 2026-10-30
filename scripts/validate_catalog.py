#!/usr/bin/env python3
"""Check the public bilingual catalog without network access or PDF downloads."""

import argparse
import collections
import csv
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ("background", "challenge", "method", "result")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-count", type=int)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    rows = list(csv.DictReader((ROOT / "catalog/papers.csv").open()))
    details = json.loads((ROOT / "catalog/paper_details.json").read_text())["papers"]
    abstracts = json.loads((ROOT / "catalog/abstracts.json").read_text())["papers"]
    summaries = json.loads((ROOT / "catalog/summaries_en.json").read_text())
    taxonomy = json.loads((ROOT / "catalog/taxonomy.json").read_text())
    classifications = json.loads((ROOT / "catalog/paper_taxonomy.json").read_text())["papers"]
    errors, warnings = [], []
    ids = [p["arxiv_id"] for p in rows]
    for identifier, count in collections.Counter(ids).items():
        if count != 1:
            errors.append(f"duplicate ID: {identifier}")
    if args.expected_count is not None and len(rows) != args.expected_count:
        errors.append(f"expected {args.expected_count} papers, found {len(rows)}")
    if set(details) != set(ids):
        errors.append(f"card IDs differ: missing={sorted(set(ids)-set(details))}; extra={sorted(set(details)-set(ids))}")
    if set(abstracts) != set(ids):
        errors.append("abstract IDs do not exactly match the catalog")
    if set(classifications) != set(ids):
        errors.append("classification IDs do not exactly match the catalog")
    topics = {topic['id'] for topic in taxonomy['topics']}
    if len(topics) != 8:
        errors.append("expected eight distinct primary topics")
    for choices in [taxonomy['topics'], *(dimension['options'] for dimension in taxonomy['facets'].values())]:
        if len({choice['id'] for choice in choices}) != len(choices):
            errors.append("duplicate taxonomy choice ID")
        for choice in choices:
            if not all(choice.get('label', {}).get(language) for language in ('en', 'zh')):
                errors.append(f"taxonomy label is not bilingual: {choice['id']}")
    for paper in rows:
        identifier = paper["arxiv_id"]
        detail = details.get(identifier, {})
        classification = classifications.get(identifier, {})
        if classification.get('primary_topic') not in topics:
            errors.append(f"{identifier}: missing or invalid unique primary topic")
        if not all(classification.get('primary_reason', {}).get(language, '').strip() for language in ('en', 'zh')):
            errors.append(f"{identifier}: missing bilingual classification rationale")
        for dimension, definition in taxonomy['facets'].items():
            if dimension == 'collections':
                values = paper.get('collection_tags', '').split(';')
            else:
                values = classification.get(definition['field'])
            allowed = {choice['id'] for choice in definition['options']}
            if not isinstance(values, list) or any(value not in allowed for value in values) or len(values) != len(set(values)):
                errors.append(f"{identifier}: invalid {dimension} values")
            if dimension != 'layers' and not values:
                errors.append(f"{identifier}: empty {dimension}")
        if not detail.get("evidence_urls"):
            errors.append(f"{identifier}: card lacks source URLs")
        for url in detail.get("evidence_urls", []):
            if urlparse(url).scheme not in ("http", "https") or not urlparse(url).netloc:
                errors.append(f"{identifier}: invalid evidence URL {url!r}")
        for field in FIELDS:
            for language in ("en", "zh"):
                text = detail.get(field, {}).get(language, "")
                if not isinstance(text, str) or not text.strip():
                    errors.append(f"{identifier}: missing {field}.{language}")
        for field in ("title", "summary_zh"):
            if not paper.get(field):
                errors.append(f"{identifier}: missing {field}")
        if not summaries.get(identifier):
            errors.append(f"{identifier}: missing English summary")
        if not paper.get("title_zh"):
            errors.append(f"{identifier}: missing Chinese title")
        for field in ("authors", "published"):
            if not paper.get(field):
                warnings.append(f"{identifier}: {field} remains unverified")
        date = paper.get("published", "")
        if date and not re.fullmatch(r"\d{4}(-\d{2}){0,2}", date):
            errors.append(f"{identifier}: unsupported publication date {date!r}")
        for field in ("arxiv_url", "pdf_url", "venue_url"):
            url = paper.get(field)
            if url and (urlparse(url).scheme not in ("http", "https") or not urlparse(url).netloc):
                errors.append(f"{identifier}: invalid {field}: {url!r}")
        record = abstracts.get(identifier, {})
        if not record.get("en", "").strip() or record.get("en_kind") != "source-abstract":
            errors.append(f"{identifier}: English source abstract unavailable")
        if not record.get("zh", "").strip() or record.get("zh_kind") != "translation":
            errors.append(f"{identifier}: full Chinese abstract translation unavailable")
        if not record.get("source_url") or not record.get("extraction"):
            errors.append(f"{identifier}: abstract lacks source provenance")
        if detail.get("venue", {}).get("status") in ("published", "accepted") and not detail.get("venue", {}).get("evidence_url"):
            errors.append(f"{identifier}: formal venue claim lacks evidence URL")
    # Only public bibliographic evidence belongs in the public catalog.
    for name in ("papers.csv", "paper_details.json", "abstracts.json", "summaries_en.json", "resources.json", "import_provenance.json", "taxonomy.json", "paper_taxonomy.json"):
        path = ROOT / "catalog" / name
        if path.exists() and re.search(r"/Users/|file://|/tmp/dit-|work/myaicoder", path.read_text()):
            errors.append(f"{name}: contains a private local path")
    semantic = json.loads((ROOT / "catalog/semantic_landscape.json").read_text())
    report = {
        "paper_count": len(rows), "bilingual_card_count": len(details),
        "official_venue_link_count": sum(bool(p.get("venue_url")) for p in rows),
        "classified_paper_count": len(classifications),
        "bilingual_abstract_count": sum(record.get('en_kind') == 'source-abstract' and record.get('zh_kind') == 'translation' for record in abstracts.values()),
        "primary_topic_counts": dict(collections.Counter(record['primary_topic'] for record in classifications.values())),
        "semantic_snapshot_count": len(semantic.get("paperIds", [])),
        "semantic_rebuild_needed": semantic.get("paperIds") != ids,
        "errors": errors, "warnings": warnings,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(bool(errors))


if __name__ == "__main__":
    main()
