#!/usr/bin/env python3
"""Validate and merge model-translated abstract shards into the catalog."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("shards", nargs="+", type=Path)
    parser.add_argument("--abstracts", type=Path, default=ROOT / "catalog" / "abstracts.json")
    args = parser.parse_args()

    payload = json.loads(args.abstracts.read_text(encoding="utf-8"))
    records = payload.get("papers", {})
    expected = set(records)
    translations: dict[str, str] = {}
    for shard_path in args.shards:
        shard = json.loads(shard_path.read_text(encoding="utf-8"))
        if not isinstance(shard, dict):
            raise ValueError(f"translation shard must be an object: {shard_path}")
        duplicates = set(shard) & set(translations)
        if duplicates:
            raise ValueError(f"duplicate translations in {shard_path}: {sorted(duplicates)}")
        for identifier, text in shard.items():
            normalized = " ".join(str(text).split())
            if len(normalized) < 120:
                raise ValueError(f"translation is missing or too short: {identifier}")
            translations[identifier] = normalized

    missing = expected - set(translations)
    extra = set(translations) - expected
    if missing or extra:
        raise ValueError(f"translation coverage mismatch; missing={sorted(missing)}, extra={sorted(extra)}")

    for identifier, record in records.items():
        record["zh"] = translations[identifier]
        record["translation"] = "gpt-5.6-sol"
    payload["translation_model"] = "gpt-5.6-sol"
    payload["translation_note_en"] = "Chinese abstracts were translated from the source English abstracts with GPT-5.6-sol and retain the English text for verification."
    payload["translation_note_zh"] = "中文摘要由 GPT-5.6-sol 根据英文原始摘要翻译，并保留英文原文供核对。"
    args.abstracts.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"merged {len(translations)} GPT-5.6-sol translations into {args.abstracts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
