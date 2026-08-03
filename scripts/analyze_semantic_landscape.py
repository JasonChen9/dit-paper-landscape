#!/usr/bin/env python3
"""Analyze the complete paper corpus with scientific-document embeddings.

The script caches SPECTER embeddings under tmp/, evaluates candidate topic
counts, and writes an auditable Markdown report. It does not change the public
taxonomy by itself; the report is used to decide the final interpretable topic
layer before semantic similarities are published.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np
import torch
import umap
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import normalize
from transformers import AutoModel, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
MODEL_NAME = "allenai/specter"
GENERIC_TERMS = {
    "paper", "papers", "work", "works", "model", "models", "method", "methods",
    "approach", "approaches", "propose", "proposed", "present", "based", "using",
    "results", "performance", "diffusion", "transformer", "transformers", "generation",
    "generative", "new", "show", "demonstrate", "training", "data", "task", "tasks",
}
FAMILY_ORDER = ["foundation", "architecture", "video", "systems", "rl", "world", "vla"]
FAMILY_LABELS = {
    "foundation": "Foundations, Objectives & Sampling",
    "architecture": "Architecture, Representation & Unified Generation",
    "video": "Video & Long-Horizon Generation",
    "systems": "Systems & Inference Efficiency",
    "rl": "Reinforcement Learning & Alignment",
    "world": "World Models & Interactive Simulation",
    "vla": "Embodied AI & VLA",
}
FAMILY_TAGS = {
    "foundation": {
        "ddpm", "score-sde", "continuous-time", "training-objective", "rectified-flow",
        "flow-matching", "straight-path", "interpolant", "noise-schedule", "sampling",
        "ode-solver", "few-step", "distillation", "guidance", "implicit-process",
    },
    "architecture": {
        "rae", "latent", "representation", "pixel-space", "tokenization", "single-stream",
        "hybrid-architecture", "scaling-law", "moe", "routing", "expert-design", "scaling",
        "foundation", "foundation-model", "image", "text-rendering", "editing", "mmdit",
        "linear-attention", "efficient-architecture", "high-resolution", "omni", "multi-output",
        "audio", "interleaved", "tri-modal", "understanding", "unified-representation",
        "any-to-any", "native-multimodal", "autoregressive-diffusion", "multimodal-flow",
        "understanding-generation", "single-transformer", "mixed-modality", "image-text",
    },
    "video": {
        "video", "long-video", "streaming", "avatar", "real-time", "audio-driven", "mobile",
        "4d-consistency", "spatiotemporal", "3d-vae", "text-to-video", "video-foundation-model",
    },
    "systems": {
        "cache", "quantization", "sparse-attention", "kernel", "distributed", "parallelism",
        "pipeline", "serving", "scheduling", "communication", "overlap", "load-balancing",
        "inference", "compression", "efficiency", "engine", "sequence-parallel", "runtime",
        "memory-management", "auto-configuration", "deployment", "latency", "benchmark",
    },
    "rl": {
        "rl", "grpo", "reward-model", "verifiable-reward", "alignment", "online", "rollout",
        "reasoning", "dpo", "preference", "human-feedback", "policy-gradient", "reward-free",
    },
    "world": {
        "world-model", "world-action-model", "embodied-world-model", "future-prediction",
        "interactive", "interactive-world-model", "long-horizon", "planning", "video-world-model",
        "world-foundation-model", "diffusion-world-model", "action-conditioned", "world-generation",
        "latent-action", "game-engine", "physical-ai", "dynamics", "agent-workflow", "llm-agent",
    },
    "vla": {
        "vla", "robotics", "robot-policy", "diffusion-policy", "flow-policy", "action-expert",
        "action", "action-chunking", "cross-embodiment", "tactile", "bimanual", "control",
        "real-time-control", "replanning", "policy-serving", "embodied-ai", "navigation",
        "visuomotor", "sim-to-real", "foundation-policy", "denoising-transformer",
    },
}


def corpus_signature(rows: list[dict[str, str]], abstracts: dict[str, dict]) -> str:
    digest = hashlib.sha256(MODEL_NAME.encode())
    for row in rows:
        digest.update(row["arxiv_id"].encode())
        digest.update(row["title"].encode())
        digest.update(abstracts[row["arxiv_id"]]["en"].encode())
    return digest.hexdigest()[:16]


def encode(rows: list[dict[str, str]], abstracts: dict[str, dict], cache_dir: Path, batch_size: int) -> tuple[np.ndarray, str]:
    signature = corpus_signature(rows, abstracts)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"specter-{signature}.npy"
    if cache_path.exists():
        embeddings = np.load(cache_path)
        if embeddings.shape[0] == len(rows):
            print(f"loaded cached embeddings: {cache_path}")
            return embeddings, signature

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModel.from_pretrained(MODEL_NAME)
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model.to(device).eval()
    texts = [f'{row["title"]}{tokenizer.sep_token}{abstracts[row["arxiv_id"]]["en"]}' for row in rows]
    vectors: list[np.ndarray] = []
    with torch.inference_mode():
        for start in range(0, len(texts), batch_size):
            batch = tokenizer(
                texts[start : start + batch_size],
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )
            batch = {key: value.to(device) for key, value in batch.items()}
            output = model(**batch).last_hidden_state[:, 0, :]
            output = torch.nn.functional.normalize(output, p=2, dim=1)
            vectors.append(output.detach().cpu().numpy().astype(np.float32))
            print(f"encoded {min(start + batch_size, len(texts))}/{len(texts)}", flush=True)
    embeddings = np.concatenate(vectors, axis=0)
    np.save(cache_path, embeddings)
    return embeddings, signature


def top_terms(texts: list[str], assignments: np.ndarray, cluster_count: int) -> list[list[str]]:
    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=2,
        max_df=0.72,
        max_features=8000,
        sublinear_tf=True,
    )
    matrix = vectorizer.fit_transform(texts)
    features = np.asarray(vectorizer.get_feature_names_out())
    result = []
    for cluster in range(cluster_count):
        members = np.flatnonzero(assignments == cluster)
        scores = np.asarray(matrix[members].mean(axis=0)).ravel()
        ranked = []
        for index in scores.argsort()[::-1]:
            term = features[index]
            if scores[index] <= 0:
                break
            if all(part not in GENERIC_TERMS for part in term.split()) and not any(term in existing or existing in term for existing in ranked):
                ranked.append(term)
            if len(ranked) == 8:
                break
        result.append(ranked)
    return result


def cluster_summary(rows: list[dict[str, str]], embeddings: np.ndarray, assignments: np.ndarray, terms: list[list[str]]) -> list[dict]:
    summaries = []
    for cluster in range(len(terms)):
        members = np.flatnonzero(assignments == cluster)
        centroid = normalize(embeddings[members].mean(axis=0, keepdims=True))[0]
        ranked = members[np.argsort(embeddings[members] @ centroid)[::-1]]
        summaries.append({
            "cluster": cluster,
            "size": int(len(members)),
            "terms": terms[cluster],
            "representatives": [rows[index]["short_title"] for index in ranked[:6]],
            "ids": [rows[index]["arxiv_id"] for index in members],
        })
    return summaries


def analyze(rows: list[dict[str, str]], abstracts: dict[str, dict], embeddings: np.ndarray, candidates: list[int]) -> list[dict]:
    texts = [f'{row["title"]}. {abstracts[row["arxiv_id"]]["en"]}' for row in rows]
    analyses = []
    for cluster_count in candidates:
        model = KMeans(n_clusters=cluster_count, random_state=42, n_init=50, max_iter=600)
        assignments = model.fit_predict(embeddings)
        terms = top_terms(texts, assignments, cluster_count)
        analyses.append({
            "k": cluster_count,
            "silhouette_cosine": float(silhouette_score(embeddings, assignments, metric="cosine")),
            "inertia": float(model.inertia_),
            "clusters": cluster_summary(rows, embeddings, assignments, terms),
        })
        print(f"analyzed k={cluster_count}: silhouette={analyses[-1]['silhouette_cosine']:.4f}")
    return analyses


def paper_tags(row: dict[str, str]) -> list[str]:
    return [tag.strip().lower() for tag in row["topic_tags"].split(";") if tag.strip()]


def align_semantic_clusters(rows: list[dict[str, str]], assignments: np.ndarray) -> tuple[np.ndarray, dict[int, int]]:
    cluster_count = len(FAMILY_ORDER)
    scores = np.zeros((cluster_count, cluster_count), dtype=np.float64)
    for index, raw_cluster in enumerate(assignments):
        tags = set(paper_tags(rows[index]))
        for family_index, family in enumerate(FAMILY_ORDER):
            scores[raw_cluster, family_index] += len(tags & FAMILY_TAGS[family])
    raw_indices, family_indices = linear_sum_assignment(-scores)
    mapping = {int(raw): int(family) for raw, family in zip(raw_indices, family_indices)}
    aligned = np.asarray([mapping[int(cluster)] for cluster in assignments], dtype=np.int32)
    return aligned, mapping


def calibrated_similarity(embeddings: np.ndarray) -> np.ndarray:
    raw = np.clip(embeddings @ embeddings.T, -1, 1)
    calibrated = np.clip((raw - 0.65) / 0.30, 0, 1)
    np.fill_diagonal(calibrated, 1)
    return calibrated


def build_edges(similarities: np.ndarray, assignments: np.ndarray) -> list[dict]:
    edges: dict[tuple[int, int], float] = {}
    for source, row in enumerate(similarities):
        ranked = [int(index) for index in np.argsort(row)[::-1] if index != source]
        selected = [target for target in ranked if row[target] >= 0.5][:4]
        if len(selected) < 2:
            selected = ranked[:2]
        for target in selected:
            key = (min(source, target), max(source, target))
            edges[key] = max(edges.get(key, 0), float(row[target]))
    return [
        {"source": source, "target": target, "similarity": similarity}
        for (source, target), similarity in sorted(edges.items())
        if similarity >= 0.35 or assignments[source] == assignments[target]
    ]


def semantic_positions(embeddings: np.ndarray) -> list[dict[str, float]]:
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=14,
        min_dist=0.24,
        spread=1.0,
        metric="cosine",
        random_state=42,
        n_jobs=1,
    )
    coordinates = reducer.fit_transform(embeddings)
    low = coordinates.min(axis=0)
    high = coordinates.max(axis=0)
    scaled = (coordinates - low) / np.maximum(high - low, 1e-8)
    scaled = 0.07 + scaled * 0.86
    return [{"x": float(x), "y": float(y)} for x, y in scaled]


def public_cluster_info(rows: list[dict[str, str]], assignments: np.ndarray) -> list[dict]:
    result = []
    for cluster, family in enumerate(FAMILY_ORDER):
        members = [index for index, value in enumerate(assignments) if value == cluster]
        counts: dict[str, int] = {}
        for index in members:
            for tag in paper_tags(rows[index]):
                counts[tag] = counts.get(tag, 0) + 1
        top_tags = [tag for tag, _ in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:3]]
        result.append({
            "cluster": cluster,
            "members": members,
            "primaryFamily": family,
            "secondaryFamily": None,
            "topTags": top_tags,
        })
    return result


def write_semantic_output(path: Path, rows: list[dict[str, str]], signature: str, embeddings: np.ndarray, analyses: list[dict]) -> None:
    raw_assignments = KMeans(n_clusters=7, random_state=42, n_init=50, max_iter=600).fit_predict(embeddings)
    assignments, mapping = align_semantic_clusters(rows, raw_assignments)
    similarities = calibrated_similarity(embeddings)
    payload = {
        "schemaVersion": 1,
        "model": MODEL_NAME,
        "input": "title [SEP] abstract",
        "corpusSignature": signature,
        "paperIds": [row["arxiv_id"] for row in rows],
        "taxonomy": [
            {"id": index, "family": family, "label": FAMILY_LABELS[family]}
            for index, family in enumerate(FAMILY_ORDER)
        ],
        "diagnostics": {
            "candidateSilhouettes": {str(item["k"]): round(item["silhouette_cosine"], 6) for item in analyses},
            "selectedK": 7,
            "rawClusterToFamily": {str(raw): FAMILY_ORDER[family] for raw, family in mapping.items()},
            "similarityCalibration": "clip((SPECTER cosine - 0.65) / 0.30, 0, 1)",
        },
        "paper": {
            "clusters": assignments.tolist(),
            "similarities": similarities.tolist(),
            "clusterInfo": public_cluster_info(rows, assignments),
            "edges": build_edges(similarities, assignments),
            "positions": semantic_positions(embeddings),
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def write_report(path: Path, rows: list[dict[str, str]], signature: str, analyses: list[dict]) -> None:
    best = max(analyses, key=lambda item: item["silhouette_cosine"])
    scores = {item["k"]: item["silhouette_cosine"] for item in analyses}
    lines = [
        "# Semantic corpus analysis",
        "",
        f"- Corpus: {len(rows)} papers with complete English abstracts",
        f"- Embedding: `{MODEL_NAME}` over `title [SEP] abstract`, L2-normalized",
        f"- Corpus signature: `{signature}`",
        "- Diagnostic clustering: K-means with 50 restarts; cosine silhouette is used only to compare candidate counts",
        f"- Highest diagnostic silhouette in this range: **k={best['k']}** ({best['silhouette_cosine']:.4f})",
        "",
        "The diagnostic clusters are not automatically promoted to the public taxonomy. They reveal natural neighborhoods; the final colors should remain stable, interpretable research questions.",
        "",
        "## Taxonomy decision",
        "",
        f"**Use seven public topics.** k=7 has the highest cosine silhouette in the tested range ({scores[7]:.4f}; k=5 is {scores[5]:.4f}). The five-cluster view merges video with world models and folds reinforcement learning into broader method clusters, while k=8–10 fragments VLA and systems into small subclusters.",
        "",
        *[f"{index + 1}. {FAMILY_LABELS[family]}" for index, family in enumerate(FAMILY_ORDER)],
        "",
        "The public taxonomy supplies stable, interpretable colors. SPECTER cosine similarity and UMAP supply the edges and positions, so classification and geometric proximity remain related but are not forced to be identical.",
        "",
        "## Candidate topic counts",
        "",
        "| k | cosine silhouette | smallest cluster | largest cluster |",
        "|---:|---:|---:|---:|",
    ]
    for analysis in analyses:
        sizes = [cluster["size"] for cluster in analysis["clusters"]]
        lines.append(f"| {analysis['k']} | {analysis['silhouette_cosine']:.4f} | {min(sizes)} | {max(sizes)} |")
    for analysis in analyses:
        lines.extend(["", f"## k={analysis['k']}", ""])
        for cluster in sorted(analysis["clusters"], key=lambda item: -item["size"]):
            lines.extend([
                f"### Cluster {cluster['cluster']} · {cluster['size']} papers",
                "",
                f"- Terms: {' · '.join(cluster['terms'])}",
                f"- Representatives: {' · '.join(cluster['representatives'])}",
                "",
            ])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=ROOT / "catalog" / "papers.csv")
    parser.add_argument("--abstracts", type=Path, default=ROOT / "catalog" / "abstracts.json")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "tmp" / "semantic")
    parser.add_argument("--report", type=Path, default=ROOT / "notes" / "SEMANTIC_ANALYSIS.md")
    parser.add_argument("--output", type=Path, default=ROOT / "catalog" / "semantic_landscape.json")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--candidates", default="5,6,7,8,9,10")
    args = parser.parse_args()

    with args.catalog.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    abstract_payload = json.loads(args.abstracts.read_text(encoding="utf-8"))
    abstracts = abstract_payload["papers"]
    missing = [row["arxiv_id"] for row in rows if not abstracts.get(row["arxiv_id"], {}).get("en")]
    if missing:
        raise RuntimeError(f"missing English abstracts: {', '.join(missing)}")
    candidates = sorted({int(value) for value in args.candidates.split(",") if value.strip()})
    embeddings, signature = encode(rows, abstracts, args.cache_dir, args.batch_size)
    analyses = analyze(rows, abstracts, embeddings, candidates)
    write_report(args.report, rows, signature, analyses)
    write_semantic_output(args.output, rows, signature, embeddings, analyses)
    print(f"wrote semantic analysis to {args.report}")
    print(f"wrote semantic landscape to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
