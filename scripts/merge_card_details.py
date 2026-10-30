#!/usr/bin/env python3
"""Merge reviewed bilingual card JSON files and synchronize catalog fields."""

import argparse
import csv
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
ALIASES = {
    "lingbot-va2": "2607.08639",
    "hy-world-2": "2604.14268",
    "dream-rsi": "2609.14858",
}
CARD_FIELDS = ("background", "challenge", "method", "result")
PUBLICATION_DOMAINS = (
    "usenix.org", "mlr.press", "neurips.cc", "nips.cc", "openreview.net", "iclr.cc",
    "thecvf.com", "acm.org", "doi.org", "ieee.org", "roboticsproceedings.org",
    "aclanthology.org", "mlsys.org", "informs.org", "sigcomm.org", "aaai.org",
    "eurosys.org", "jmlr.org", "researchr.org", "wiley.com", "springer.com",
    "tandfonline.com", "asplos-conference.org", "cgo.org",
)


def publication_page(url):
    host = (urlparse(url or "").hostname or "").lower()
    return any(host == domain or host.endswith("." + domain) for domain in PUBLICATION_DOMAINS)


def write_json(name, payload):
    (ROOT / "catalog" / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", type=Path)
    args = parser.parse_args()
    rows = list(csv.DictReader((ROOT / "catalog/papers.csv").open()))
    headers = list(rows[0])
    for name in ("venue_url", "venue_status", "venue_evidence_url"):
        if name not in headers:
            headers.append(name)
    cards = {}
    for path in args.inputs:
        for identifier, raw in json.loads(path.read_text())["papers"].items():
            identifier = ALIASES.get(identifier, identifier)
            if identifier in cards:
                raise ValueError(f"Duplicate card: {identifier}")
            cards[identifier] = {key: raw[key] for key in ("title_zh", *CARD_FIELDS, "evidence_urls", "venue")}
            if raw.get("review_note"):
                cards[identifier]["review_note"] = raw["review_note"]
    ids = [ALIASES.get(p["arxiv_id"], p["arxiv_id"]) for p in rows]
    if len(ids) != len(set(ids)) or set(ids) != set(cards):
        raise ValueError(f"Card set mismatch: missing={set(ids)-set(cards)}, extra={set(cards)-set(ids)}")
    for identifier, card in cards.items():
        for field in CARD_FIELDS:
            if not all(card[field].get(lang, "").strip() for lang in ("en", "zh")):
                raise ValueError(f"Incomplete bilingual card: {identifier}/{field}")
    provenance = json.loads((ROOT / "catalog/import_provenance.json").read_text())
    for row in rows:
        previous_id = row["arxiv_id"]
        identifier = ALIASES.get(previous_id, previous_id)
        row["arxiv_id"] = identifier
        card = cards[identifier]
        row["title_zh"] = card["title_zh"]
        venue = card["venue"]
        claimed = venue.get("status") in ("published", "accepted")
        formal = claimed and publication_page(venue.get("evidence_url", ""))
        venue["verification"] = "official-publication-page" if formal else "author-reported" if claimed else "unverified"
        row["venue_url"] = venue.get("url", "") if formal and publication_page(venue.get("url", "")) else ""
        row["venue_status"] = venue.get("status", "unknown")
        row["venue_evidence_url"] = venue.get("evidence_url", "")
        if formal:
            row["venue"] = venue["name"]
            row["metadata_status"] = ";".join(x for x in row.get("metadata_status", "").split(";") if x != "venue-unverified")
        elif claimed:
            row["venue"] = venue["name"]
            row["venue_status"] = f"author-reported-{venue['status']}"
            flags = [x for x in row.get("metadata_status", "").split(";") if x and x != "checked"]
            if "venue-unverified" not in flags:
                flags.append("venue-unverified")
            row["metadata_status"] = ";".join(flags)
        elif "未核实" in row["venue"] and "arXiv" not in row["venue"]:
            row["venue"] = "Publication venue unverified"
        elif "arXiv" in row["venue"]:
            row["venue"] = "arXiv preprint"
        # Preserve a previously recorded formal venue when this review only found
        # the preprint: failure to retrieve a publisher page is not a retraction.
        elif row["venue_status"] == "preprint":
            row["venue_status"] = "unknown"
            card["venue"] = {**venue, "name": row["venue"], "status": "unknown"}
        date_end = row["published"] + ("-12-31" if len(row["published"]) == 4 else "-31" if len(row["published"]) == 7 else "")
        row["window"] = "in-window" if date_end >= "2023-08-02" else "background"
        if previous_id != identifier and previous_id in provenance["papers"]:
            provenance["papers"][identifier] = provenance["papers"].pop(previous_id)
            provenance["papers"][identifier]["previous_catalog_id"] = previous_id
        provenance["papers"][identifier]["card_evidence_urls"] = card["evidence_urls"]
        provenance["papers"][identifier]["venue_review"] = card["venue"]
    with (ROOT / "catalog/papers.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    for name, nested in (("abstracts.json", True), ("summaries_en.json", False)):
        payload = json.loads((ROOT / "catalog" / name).read_text())
        records = payload["papers"] if nested else payload
        for old, new in ALIASES.items():
            if old in records:
                if new in records:
                    raise ValueError(f"Alias collision: {name}/{old}/{new}")
                records[new] = records.pop(old)
        write_json(name, payload)
    abstracts = json.loads((ROOT / "catalog/abstracts.json").read_text())["papers"]
    for row in rows:
        identifier = row["arxiv_id"]
        record = provenance["papers"][identifier]
        record.update({
            "source_url": row["arxiv_url"], "pdf_url": row["pdf_url"],
            "date_precision": row["published_precision"], "date_basis": row["published_basis"],
            "metadata_status": [x for x in row["metadata_status"].split(";") if x and x != "checked"],
            "abstract_kind": abstracts[identifier].get("en_kind", "source-abstract"),
            "abstract_extraction": abstracts[identifier].get("extraction", ""),
        })
    provenance["review_queue"] = [
        {"id": p["arxiv_id"], "short_title": p["short_title"],
         "missing_or_partial": [x for x in p.get("metadata_status", "").split(";") if x and x not in ("checked", "preserved-original")],
         "source_url": p["arxiv_url"]}
        for p in rows if p.get("metadata_status") not in ("", "checked", "preserved-original")
    ]
    provenance["counts"]["papers"] = len(rows)
    provenance["counts"]["bilingual_cards"] = len(cards)
    provenance["counts"]["authors_unverified"] = sum(not p["authors"] for p in rows)
    provenance["counts"]["dates_unknown"] = sum(not p["published"] for p in rows)
    provenance["counts"]["official_venue_links"] = sum(bool(p["venue_url"]) for p in rows)
    write_json("import_provenance.json", provenance)
    write_json("id_aliases.json", {"schema_version": 1, "aliases": ALIASES})
    write_json("paper_details.json", {
        "schema_version": 1, "updated_at": "2026-10-29", "paper_count": len(cards),
        "description": {"en": "Editorial bilingual cards; results describe what the cited work reports, not independent reproduction.",
                        "zh": "双语整理卡片；结果描述所引论文报告的结论，不代表独立复现。"},
        "papers": {identifier: cards[identifier] for identifier in ids},
    })
    print(f"Merged {len(cards)} bilingual cards; {sum(bool(p['venue_url']) for p in rows)} formal venue links.")


if __name__ == "__main__":
    main()
