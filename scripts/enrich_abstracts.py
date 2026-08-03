#!/usr/bin/env python3
"""Collect source abstracts and maintain bilingual abstract data.

English abstracts come from the arXiv Atom API whenever an arXiv identifier is
available. Non-arXiv entries use an explicit, auditable fallback. Chinese text is
translated separately with GPT-5.6-sol and cached so routine site builds never
call an external service.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "catalog" / "papers.csv"
DEFAULT_OUTPUT = ROOT / "catalog" / "abstracts.json"
ARXIV_ID = re.compile(r"^\d{4}\.\d{4,5}$")
ARXIV_API = "https://export.arxiv.org/api/query"
USER_AGENT = "Diffusion-Intelligence-Atlas/1.0 (https://github.com/JasonChen9/dit-paper-landscape)"
ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}


def normalize_text(value: str) -> str:
    value = html.unescape(value or "")
    value = value.replace("\u00ad", "").replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r" *\n+ *", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def plain_text_from_latex(value: str) -> str:
    replacements = {
        r"\times": "×",
        r"\cdot": "·",
        r"\leq": "≤",
        r"\geq": "≥",
        r"\pm": "±",
        r"\rho": "ρ",
        r"\pi": "π",
        r"\alpha": "α",
        r"\beta": "β",
        r"\lambda": "λ",
        r"\%": "%",
        r"\&": "&",
        r"\_": "_",
        r"\method": "the proposed method",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    for _ in range(4):
        updated = re.sub(r"\\(?:textbf|textit|emph|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}", r"\1", value)
        if updated == value:
            break
        value = updated
    value = value.replace("$", "").replace("~", " ")
    value = re.sub(r"\\[A-Za-z]+", "", value)
    value = value.replace("{", "").replace("}", "")
    return normalize_text(value)


def request_bytes(url: str, *, data: bytes | None = None, retries: int = 4) -> bytes:
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/atom+xml, application/json, text/html;q=0.9, */*;q=0.8",
            "Content-Type": "application/x-www-form-urlencoded" if data is not None else "application/octet-stream",
        },
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == retries - 1:
                raise RuntimeError(f"request failed after {retries} attempts: {url}") from error
            time.sleep(1.5 * (2**attempt))
    raise AssertionError("unreachable")


def chunks(values: list[str], size: int):
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def fetch_arxiv_abstracts(ids: list[str], batch_size: int) -> dict[str, str]:
    abstracts: dict[str, str] = {}
    batches = list(chunks(ids, batch_size))
    for index, batch in enumerate(batches, start=1):
        query = urllib.parse.urlencode({"id_list": ",".join(batch), "max_results": len(batch)})
        root = ET.fromstring(request_bytes(f"{ARXIV_API}?{query}"))
        for entry in root.findall("atom:entry", ATOM_NS):
            raw_id = entry.findtext("atom:id", default="", namespaces=ATOM_NS)
            summary = entry.findtext("atom:summary", default="", namespaces=ATOM_NS)
            identifier = raw_id.rsplit("/", 1)[-1].split("v", 1)[0]
            if identifier and summary:
                abstracts[identifier] = plain_text_from_latex(normalize_text(summary))
        print(f"arXiv batches: {index}/{len(batches)} ({len(abstracts)}/{len(ids)} abstracts)", flush=True)
        if index != len(batches):
            time.sleep(1)
    return abstracts


def fetch_arxiv_html_fallback(identifier: str) -> str:
    page = request_bytes(f"https://arxiv.org/abs/{identifier}").decode("utf-8", errors="replace")
    meta = re.search(
        r'<meta\s+name=["\']citation_abstract["\']\s+content=["\'](.*?)["\']\s*/?>',
        page,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if meta:
        return plain_text_from_latex(normalize_text(meta.group(1)))
    block = re.search(r'<blockquote[^>]*class=["\'][^"\']*abstract[^"\']*["\'][^>]*>(.*?)</blockquote>', page, re.I | re.S)
    if not block:
        return ""
    text = re.sub(r"<[^>]+>", " ", block.group(1))
    text = re.sub(r"^\s*Abstract:\s*", "", text, flags=re.I)
    return plain_text_from_latex(normalize_text(text))


def extract_socc_abstract(pdf_url: str) -> str:
    with tempfile.TemporaryDirectory(prefix="dit-atlas-pdf-") as directory:
        pdf_path = Path(directory) / "paper.pdf"
        text_path = Path(directory) / "paper.txt"
        pdf_path.write_bytes(request_bytes(pdf_url))
        subprocess.run(
            ["pdftotext", "-f", "1", "-l", "1", "-raw", str(pdf_path), str(text_path)],
            check=True,
            capture_output=True,
        )
        raw = text_path.read_text(encoding="utf-8", errors="replace")

    match = re.search(
        r"\bAbstract\s*\n(?P<abstract>.*?)(?:\n[∗*]?\s*Corresponding Author|\nCCS Concepts|\nKeywords|\n1\s+Introduction)",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not match:
        raise RuntimeError("could not locate the abstract in the SoCC PDF")
    abstract = match.group("abstract")
    abstract = re.sub(r"(?<=\w)-\n(?=\w)", "", abstract)
    abstract = abstract.replace("systemlevel", "system-level").replace("crosslayer", "cross-layer")
    return normalize_text(abstract)


def load_existing(path: Path) -> dict:
    if not path.exists():
        return {"papers": {}}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload.get("papers"), dict):
        raise ValueError(f"invalid abstracts data: {path}")
    return payload


def collect_english(rows: list[dict[str, str]], existing: dict, batch_size: int, refresh: bool) -> dict[str, dict]:
    records = dict(existing.get("papers", {}))
    arxiv_rows = [row for row in rows if ARXIV_ID.fullmatch(row["arxiv_id"])]
    wanted = [
        row["arxiv_id"]
        for row in arxiv_rows
        if refresh or not normalize_text(records.get(row["arxiv_id"], {}).get("en", ""))
    ]
    fetched = fetch_arxiv_abstracts(wanted, batch_size) if wanted else {}

    for row in arxiv_rows:
        identifier = row["arxiv_id"]
        abstract = fetched.get(identifier) or normalize_text(records.get(identifier, {}).get("en", ""))
        if not abstract:
            print(f"arXiv HTML fallback: {identifier}", flush=True)
            abstract = fetch_arxiv_html_fallback(identifier)
        records[identifier] = {
            **records.get(identifier, {}),
            "en": abstract,
            "source": "arXiv",
            "source_url": f"https://arxiv.org/abs/{identifier}",
            "extraction": "arxiv-atom-api",
        }

    for row in rows:
        identifier = row["arxiv_id"]
        if ARXIV_ID.fullmatch(identifier):
            continue
        if identifier == "socc25-diffusion-serving":
            abstract = normalize_text(records.get(identifier, {}).get("en", ""))
            if refresh or not abstract:
                abstract = extract_socc_abstract(row["pdf_url"])
            records[identifier] = {
                **records.get(identifier, {}),
                "en": abstract,
                "source": "ACM SoCC 2025 author PDF",
                "source_url": row["pdf_url"],
                "extraction": "pdf-first-page",
            }
        else:
            raise RuntimeError(f"no abstract source rule for {identifier}")
    return records


def polish_chinese_translation(text: str) -> str:
    replacements = (
        ("变压器", "Transformer"),
        ("视觉语言动作", "视觉-语言-动作"),
        ("视觉-语言-行动", "视觉-语言-动作"),
        ("流量匹配", "流匹配"),
        ("令牌", "token"),
        ("代币", "token"),
        ("机器人政策", "机器人策略"),
        ("政策", "策略"),
        ("骨干网", "骨干网络"),
        ("体现智能", "具身智能"),
        ("潜伏", "latent"),
        ("零镜头", "零样本"),
        ("充分注意力", "全注意力"),
        ("缩放配方", "缩放方案"),
        ("训练配方", "训练方案"),
        ("开放配方", "开放方案"),
        ("我们的 Transfusion 配方", "Transfusion 方案"),
        ("发电质量", "生成质量"),
        ("文本、图像和视频标记", "文本、图像和视频 token"),
        ("图像和视频标记", "图像和视频 token"),
        ("图像和文本标记", "图像和文本 token"),
        ("视觉标记计数", "视觉 token 数量"),
        ("视觉标记空间", "视觉 token 空间"),
        ("图像标记器", "图像 tokenizer"),
        ("推断为 30 秒视频", "外推到 30 秒视频"),
        ("10 美元到 50 美元地", "10 倍到 50 倍"),
        ("每秒 8 美元帧", "每秒 8 帧"),
        ("512 美元×896 美元", "512×896"),
        ("6.1 美元\\倍$", "6.1 倍"),
        ("4.8 美元\\倍", "4.8 倍"),
        ("2 美元\\倍$", "2 倍"),
        ("3$\\time$ GPU", "3 倍 GPU"),
        ("19% 的美元", "19% 的成本"),
        ("the proposed method", "所提方法"),
        ("本文对服务于生产云环境挑战的扩散模型进行了全面分析。", "本文对生产云环境中的扩散模型服务挑战进行了全面分析。"),
        ("提供了生产中服务的扩散模型的第一个整体视图", "首次提供了生产环境中扩散模型服务的整体视图"),
    )
    for source, target in replacements:
        text = text.replace(source, target)
    return text


def validate(rows: list[dict[str, str]], records: dict[str, dict], require_chinese: bool) -> None:
    expected = {row["arxiv_id"] for row in rows}
    if set(records) - expected:
        print(f"warning: {len(set(records) - expected)} stale records will be omitted", file=sys.stderr)
    missing_en = sorted(identifier for identifier in expected if len(normalize_text(records.get(identifier, {}).get("en", ""))) < 80)
    missing_zh = sorted(identifier for identifier in expected if len(normalize_text(records.get(identifier, {}).get("zh", ""))) < 40)
    if missing_en:
        raise RuntimeError(f"missing or too-short English abstracts: {', '.join(missing_en)}")
    if require_chinese and missing_zh:
        raise RuntimeError(f"missing or too-short Chinese abstracts: {', '.join(missing_zh)}")


def write_output(path: Path, rows: list[dict[str, str]], records: dict[str, dict]) -> None:
    for record in records.values():
        if record.get("en"):
            record["en"] = plain_text_from_latex(record["en"])
        if record.get("zh"):
            record["zh"] = plain_text_from_latex(polish_chinese_translation(record["zh"]))
    ordered = {row["arxiv_id"]: records[row["arxiv_id"]] for row in rows}
    payload = {
        "schema_version": 1,
        "generated_at": date.today().isoformat(),
        "abstract_count": len(ordered),
        "translation_model": "gpt-5.6-sol" if all(record.get("translation") == "gpt-5.6-sol" for record in ordered.values()) else "mixed-or-pending",
        "translation_note_en": "Chinese abstracts are translated from the source English abstracts with GPT-5.6-sol and retain the English text for verification.",
        "translation_note_zh": "中文摘要由 GPT-5.6-sol 根据英文原始摘要翻译，并保留英文原文供核对。",
        "papers": ordered,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--batch-size", type=int, default=40)
    parser.add_argument("--refresh", action="store_true", help="refetch all English abstracts")
    parser.add_argument("--require-chinese", action="store_true", help="fail if any GPT-translated Chinese abstract is missing")
    args = parser.parse_args()

    with args.catalog.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    existing = load_existing(args.output)
    records = collect_english(rows, existing, args.batch_size, args.refresh)
    validate(rows, records, require_chinese=args.require_chinese)
    write_output(args.output, rows, records)
    translated = sum(bool(normalize_text(record.get("zh", ""))) for record in records.values())
    print(f"wrote {len(rows)} English and {translated} Chinese abstracts to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
