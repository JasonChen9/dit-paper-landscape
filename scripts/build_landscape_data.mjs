#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [
  , ,
  catalogPath = "catalog/papers.csv",
  outputPath = "site/data/landscape.json",
  affiliationsPath = "catalog/author_affiliations.json",
  semanticPath = "catalog/semantic_landscape.json",
] = process.argv;
const CLUSTER_COUNT = 7;
const TOP_INSTITUTION_PALETTE_SIZE = 10;
const FAMILIES = {
  foundation: [
    "ddpm", "score-sde", "continuous-time", "training-objective", "rectified-flow",
    "flow-matching", "straight-path", "training-design", "noise-schedule", "weak-to-strong",
    "interpolant", "sampling", "implicit-process", "ode-solver", "few-step", "distillation",
    "guidance", "self-supervision",
  ],
  architecture: [
    "rae", "latent", "representation", "pixel-space", "tokenization", "single-stream",
    "hybrid-architecture", "scaling-law", "moe", "routing", "expert-design", "scaling",
    "foundation", "foundation-model", "image", "text-rendering", "editing", "conversion",
    "mmdit",
    "linear-attention", "efficient-architecture", "training-efficiency", "high-resolution",
    "text-to-image", "omni", "multi-output", "audio", "synchronization", "interleaved",
    "tri-modal", "understanding", "perception", "unified-representation", "instruction",
    "any-to-any", "image-editing", "prior-preservation", "decoupled", "unified", "prediction",
    "discrete-diffusion", "cross-modal", "native-multimodal", "autoregressive-diffusion",
    "autoregressive-flow", "multimodal-flow", "understanding-generation", "single-transformer",
    "mixed-modality", "continuous-latent", "image-text", "decoder-only", "unified-pretraining",
    "clip-latent", "representation-alignment",
  ],
  video: [
    "video", "long-video", "streaming", "avatar", "real-time", "audio-driven", "mobile",
    "4d-consistency", "3d-constraint", "causal", "autoregressive", "world-consistency",
    "spatiotemporal", "3d-vae", "text-to-video", "video-foundation-model",
  ],
  systems: [
    "cache", "quantization", "sparse-attention", "kernel", "distributed", "parallelism",
    "pipeline", "serving", "scheduling", "communication", "overlap", "load-balancing",
    "inference", "compression", "efficiency", "engine", "speculation", "sequence-parallel",
    "training", "block-wise", "hierarchical", "memory-management", "auto-configuration",
    "patch-parallel", "hybrid-parallel", "stage-graph", "disaggregation", "latency",
    "deployment", "runtime", "edge-deployment", "token-pruning", "benchmark",
  ],
  rl: [
    "rl", "grpo", "reward-model", "verifiable-reward", "alignment", "online",
    "forward-process", "gradient-estimation", "rollout", "spot-gpu", "3d-constraint",
    "4d-consistency", "reasoning", "visual-generation", "flow-matching", "dpo",
    "preference", "human-feedback", "policy-gradient", "kl-regularization", "reward-free",
  ],
  world: [
    "world-model", "world-action-model", "embodied-world-model", "future-prediction",
    "interactive", "interactive-world-model", "long-horizon", "planning", "video-world-model",
    "world-foundation-model", "diffusion-world-model", "action-conditioned", "world-generation",
    "latent-action", "game-engine", "spatial-memory", "policy-evaluation", "reactive-agent",
    "agent-workflow", "llm-agent", "causal-rollout", "physical-ai", "dynamics",
  ],
  vla: [
    "vla", "robotics", "robot-policy", "diffusion-policy", "flow-policy", "action-expert",
    "action", "action-chunking", "cross-embodiment", "tactile", "bimanual", "control",
    "real-time-control", "replanning", "policy-serving", "dual-system", "receding-horizon",
    "embodied-ai", "generalist-policy", "navigation", "3d-representation", "visuomotor",
    "sim-to-real", "trajectory-critic", "foundation-policy", "denoising-transformer",
  ],
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function splitValues(value) {
  return String(value || "").split(";").map((item) => item.trim()).filter(Boolean);
}

function paperTags(paper) {
  return splitValues(paper.topic_tags).map((tag) => tag.toLowerCase());
}

function familyScores(tags) {
  const tagSet = new Set(tags);
  return Object.fromEntries(Object.entries(FAMILIES).map(([key, familyTags]) => [
    key, familyTags.reduce((score, tag) => score + (tagSet.has(tag) ? 1 : 0), 0),
  ]));
}

function buildPaperVectors(papers) {
  const documents = papers.map((paper) => {
    const tags = paperTags(paper);
    return { tags, families: familyScores(tags) };
  });
  const features = new Set();
  documents.forEach((document) => {
    document.tags.forEach((tag) => features.add(`tag:${tag}`));
    Object.entries(document.families).filter(([, score]) => score > 0)
      .forEach(([family]) => features.add(`family:${family}`));
  });
  const vocabulary = [...features].sort();
  const documentFrequency = new Map(vocabulary.map((feature) => [feature, 0]));
  documents.forEach((document) => {
    const present = new Set([
      ...document.tags.map((tag) => `tag:${tag}`),
      ...Object.entries(document.families).filter(([, score]) => score > 0).map(([family]) => `family:${family}`),
    ]);
    present.forEach((feature) => documentFrequency.set(feature, documentFrequency.get(feature) + 1));
  });
  const vectors = documents.map((document) => {
    const vector = vocabulary.map((feature) => {
      if (feature.startsWith("tag:")) {
        const tag = feature.slice(4);
        if (!document.tags.includes(tag)) return 0;
        return Math.log((papers.length + 1) / (documentFrequency.get(feature) + 1)) + 1;
      }
      const hits = document.families[feature.slice(7)];
      return hits > 0 ? 1.45 + Math.min(0.55, (hits - 1) * 0.18) : 0;
    });
    const norm = Math.hypot(...vector) || 1;
    return vector.map((value) => value / norm);
  });
  return { documents, vectors };
}

function dot(left, right) {
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result += left[index] * right[index];
  return result;
}

function normalizeVector(vector) {
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

function clusterVectors(vectors, documents) {
  const used = new Set();
  let centroids = Object.keys(FAMILIES).map((family) => {
    let best = -1;
    let bestScore = -Infinity;
    documents.forEach((document, index) => {
      if (used.has(index)) return;
      const overlap = Object.entries(document.families).filter(([key]) => key !== family)
        .reduce((sum, [, score]) => sum + score, 0);
      const score = document.families[family] * 3 - overlap * 0.25;
      if (score > bestScore) { best = index; bestScore = score; }
    });
    if (best < 0) best = vectors.findIndex((_, index) => !used.has(index));
    used.add(best);
    return [...vectors[best]];
  });
  let assignments = new Array(vectors.length).fill(-1);
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const next = vectors.map((vector) => {
      let bestCluster = 0;
      let bestSimilarity = -Infinity;
      centroids.forEach((centroid, cluster) => {
        const similarity = dot(vector, centroid);
        if (similarity > bestSimilarity) { bestCluster = cluster; bestSimilarity = similarity; }
      });
      return bestCluster;
    });
    if (next.every((cluster, index) => cluster === assignments[index])) break;
    assignments = next;
    centroids = centroids.map((oldCentroid, cluster) => {
      const members = vectors.filter((_, index) => assignments[index] === cluster);
      if (!members.length) return oldCentroid;
      return normalizeVector(oldCentroid.map((_, dimension) =>
        members.reduce((sum, vector) => sum + vector[dimension], 0) / members.length));
    });
  }
  return assignments;
}

function similarityMatrix(vectors) {
  return vectors.map((vector, left) => vectors.map((other, right) => left === right ? 1 : dot(vector, other)));
}

function describeClusters(papers, documents, assignments) {
  return Array.from({ length: CLUSTER_COUNT }, (_, cluster) => {
    const members = papers.map((_, index) => index).filter((index) => assignments[index] === cluster);
    const scores = Object.keys(FAMILIES).map((family) => ({
      family, score: members.reduce((sum, index) => sum + documents[index].families[family], 0),
    })).sort((left, right) => right.score - left.score);
    const counts = new Map();
    members.forEach((index) => paperTags(papers[index]).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return {
      cluster,
      members,
      primaryFamily: scores[0]?.family ?? null,
      secondaryFamily: scores[1]?.score >= Math.max(1, scores[0]?.score * 0.5) ? scores[1].family : null,
      topTags: [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 3).map(([tag]) => tag),
    };
  });
}

function buildPaperEdges(similarities, assignments) {
  const edgeMap = new Map();
  similarities.forEach((row, source) => {
    const candidates = row.map((similarity, target) => ({ target, similarity }))
      .filter(({ target }) => target !== source).sort((left, right) => right.similarity - left.similarity);
    const preferred = candidates.filter(({ similarity }) => similarity >= 0.13).slice(0, 4);
    const selected = preferred.length >= 2 ? preferred : candidates.slice(0, 2);
    selected.forEach(({ target, similarity }) => {
      const left = Math.min(source, target);
      const right = Math.max(source, target);
      const key = `${left}:${right}`;
      if (!edgeMap.has(key) || edgeMap.get(key).similarity < similarity) {
        edgeMap.set(key, { source: left, target: right, similarity });
      }
    });
  });
  return [...edgeMap.values()].filter((edge) =>
    edge.similarity >= 0.08 || assignments[edge.source] === assignments[edge.target]);
}

function hashNumber(value) {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967295;
}

function catalogSignature(papers) {
  const value = papers.map((paper) => [paper.arxiv_id, paper.topic_tags, paper.key_authors].join("\t")).join("\n");
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function paperLayout(papers, assignments, clusterInfo, edges) {
  const height = Math.max(980, 540 * 1.9, Math.sqrt(Math.max(1, papers.length)) * 88);
  const width = Math.max(1520, 930 * 1.55, height * 1.95);
  const area = width * height;
  const slots = [[0.5, 0.28], [0.27, 0.3], [0.73, 0.3], [0.14, 0.7], [0.38, 0.7], [0.62, 0.7], [0.86, 0.7]];
  const ordered = clusterInfo.map((info, cluster) => ({ cluster, count: info.members.length }))
    .sort((left, right) => right.count - left.count || left.cluster - right.cluster);
  const targets = new Array(CLUSTER_COUNT);
  ordered.forEach(({ cluster, count }, rank) => {
    const [xRatio, yRatio] = slots[rank];
    const radius = Math.max(118, Math.min(height * 0.24, Math.sqrt((count * area * 0.3) / (papers.length * Math.PI))));
    targets[cluster] = { x: width * xRatio, y: height * yRatio, homeX: width * xRatio, homeY: height * yRatio, radius, count };
  });
  for (let iteration = 0; iteration < 160; iteration += 1) {
    for (let left = 0; left < targets.length; left += 1) {
      for (let right = left + 1; right < targets.length; right += 1) {
        const a = targets[left]; const b = targets[right];
        let dx = b.x - a.x; let dy = b.y - a.y; let distance = Math.hypot(dx, dy);
        if (distance < 1) { const angle = (left + right * 0.61) * 2.39996; dx = Math.cos(angle); dy = Math.sin(angle); distance = 1; }
        const minimum = a.radius + b.radius + 66;
        if (distance < minimum) {
          const shift = (minimum - distance) * 0.51; const ux = dx / distance; const uy = dy / distance;
          a.x -= ux * shift; a.y -= uy * shift; b.x += ux * shift; b.y += uy * shift;
        }
      }
    }
    targets.forEach((target) => {
      target.x += (target.homeX - target.x) * 0.035; target.y += (target.homeY - target.y) * 0.035;
      const margin = target.radius + 86;
      target.x = Math.max(margin, Math.min(width - margin, target.x));
      target.y = Math.max(margin, Math.min(height - margin, target.y));
    });
  }
  const ranks = Array(CLUSTER_COUNT).fill(0);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const nodes = papers.map((paper, index) => {
    const cluster = assignments[index]; const target = targets[cluster]; const rank = ranks[cluster]++;
    const angle = rank * goldenAngle + hashNumber(`${paper.arxiv_id}:a`) * 0.42;
    const distance = target.radius * 0.8 * Math.sqrt((rank + 0.65) / Math.max(1, target.count));
    return { index, cluster, x: target.x + Math.cos(angle) * distance, y: target.y + Math.sin(angle) * distance, vx: 0, vy: 0 };
  });
  const wall = (position, maximum) => {
    const zone = 132;
    if (position < zone) { const distance = zone - position; return distance * 0.011 * (1 + distance / zone); }
    if (position > maximum - zone) { const distance = position - maximum + zone; return -distance * 0.011 * (1 + distance / zone); }
    return 0;
  };
  for (let iteration = 0; iteration < 240; iteration += 1) {
    for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
      const dx = nodes[right].x - nodes[left].x; const dy = nodes[right].y - nodes[left].y;
      const force = 18 / Math.max(80, dx * dx + dy * dy);
      nodes[left].vx -= dx * force; nodes[left].vy -= dy * force; nodes[right].vx += dx * force; nodes[right].vy += dy * force;
    }
    edges.forEach((edge) => {
      const source = nodes[edge.source]; const target = nodes[edge.target];
      const dx = target.x - source.x; const dy = target.y - source.y; const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - (54 + (1 - edge.similarity) * 104)) * (0.0018 + edge.similarity * 0.0065);
      const fx = (dx / distance) * force; const fy = (dy / distance) * force;
      source.vx += fx; source.vy += fy; target.vx -= fx; target.vy -= fy;
    });
    nodes.forEach((node) => {
      const target = targets[node.cluster]; const dx = target.x - node.x; const dy = target.y - node.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      node.vx += dx * 0.00125; node.vy += dy * 0.00125;
      if (distance > target.radius * 1.08) {
        const excess = distance - target.radius * 1.08;
        node.vx += (dx / distance) * excess * 0.012; node.vy += (dy / distance) * excess * 0.012;
      }
      node.vx += wall(node.x, width); node.vy += wall(node.y, height); node.vx *= 0.86; node.vy *= 0.86;
      const speed = Math.max(1, Math.hypot(node.vx, node.vy));
      if (speed > 13) { node.vx = (node.vx / speed) * 13; node.vy = (node.vy / speed) * 13; }
      node.x += node.vx; node.y += node.vy;
    });
  }
  return nodes.map((node) => ({ x: node.x / width, y: node.y / height }));
}

function parseKeyAuthors(paper) {
  return splitValues(paper.key_authors).map((entry) => {
    const [name, roleText = "first"] = entry.split("|", 2);
    return { name: name.trim(), roles: roleText.split("+").map((role) => role.trim()).filter(Boolean) };
  }).filter(({ name }) => name);
}

function authorModel(papers, paperClusters, affiliationRecords = {}, paperSimilarities = null) {
  const map = new Map();
  papers.forEach((paper, paperIndex) => {
    const tags = paperTags(paper);
    parseKeyAuthors(paper).forEach(({ name }) => {
      if (!map.has(name)) map.set(name, { name, papers: [], paperIds: new Set(), tagCounts: new Map(), clusterCounts: new Map(), cluster: 0 });
      const profile = map.get(name);
      profile.papers.push({ paper, paperIndex }); profile.paperIds.add(paper.arxiv_id);
      tags.forEach((tag) => profile.tagCounts.set(tag, (profile.tagCounts.get(tag) || 0) + 1));
      const cluster = paperClusters[paperIndex];
      profile.clusterCounts.set(cluster, (profile.clusterCounts.get(cluster) || 0) + 1);
    });
  });
  const profiles = [...map.values()].sort((left, right) => right.papers.length - left.papers.length || left.name.localeCompare(right.name, "en"));
  profiles.forEach((profile) => {
    profile.cluster = [...profile.clusterCounts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? 0;
    const affiliation = affiliationRecords[profile.name] || {};
    profile.affiliation = {
      primary: affiliation.primary || "Unknown",
      all: Array.isArray(affiliation.all) ? affiliation.all : [],
      confidence: affiliation.confidence || "unresolved",
      paperId: affiliation.paper_id || null,
      published: affiliation.published || null,
      source: affiliation.source || null,
      sourceUrl: affiliation.source_url || null,
    };
  });
  const institutionCounts = new Map();
  profiles.forEach((profile) => {
    const institution = profile.affiliation.primary;
    institutionCounts.set(institution, (institutionCounts.get(institution) || 0) + 1);
  });
  const institutions = [...institutionCounts.entries()]
    .filter(([institution]) => institution !== "Unknown")
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))
    .map(([institution]) => institution);
  const institutionGroups = institutions.map((name, index) => ({
    name,
    count: institutionCounts.get(name) || 0,
    colorIndex: index < TOP_INSTITUTION_PALETTE_SIZE ? index : null,
    colorHue: Math.round(hashNumber(`institution:${name}`) * 359),
    kind: "institution",
  }));
  const unknownCount = institutionCounts.get("Unknown") || 0;
  if (unknownCount) institutionGroups.push({ name: "Unknown", count: unknownCount, colorIndex: 11, colorHue: null, kind: "unknown" });
  const groupByName = new Map(institutionGroups.map((group) => [group.name, group]));
  profiles.forEach((profile) => {
    const groupName = profile.affiliation.primary;
    profile.affiliation.group = groupName;
    profile.affiliation.colorIndex = groupByName.get(groupName)?.colorIndex ?? null;
    profile.affiliation.colorHue = groupByName.get(groupName)?.colorHue ?? null;
  });
  const vocabulary = [...new Set(profiles.flatMap((profile) => [...profile.tagCounts.keys()]))].sort();
  const frequencies = new Map(vocabulary.map((tag) => [tag, 0]));
  profiles.forEach((profile) => profile.tagCounts.forEach((_, tag) => frequencies.set(tag, frequencies.get(tag) + 1)));
  const vectors = profiles.map((profile) => {
    const values = vocabulary.map((tag) => {
      const count = profile.tagCounts.get(tag) || 0;
      return count ? (1 + Math.log(count)) * (Math.log((profiles.length + 1) / (frequencies.get(tag) + 1)) + 1) : 0;
    });
    const norm = Math.hypot(...values) || 1;
    return values.map((value) => value / norm);
  });
  const similarities = vectors.map((vector, left) => vectors.map((other, right) => {
    if (left === right) return 1;
    const sharedPaper = profiles[left].papers.some(({ paper }) => profiles[right].paperIds.has(paper.arxiv_id));
    if (paperSimilarities) {
      const leftPapers = profiles[left].papers.map(({ paperIndex }) => paperIndex);
      const rightPapers = profiles[right].papers.map(({ paperIndex }) => paperIndex);
      const leftToRight = leftPapers.reduce((sum, source) =>
        sum + Math.max(...rightPapers.map((target) => paperSimilarities[source][target])), 0) / leftPapers.length;
      const rightToLeft = rightPapers.reduce((sum, source) =>
        sum + Math.max(...leftPapers.map((target) => paperSimilarities[source][target])), 0) / rightPapers.length;
      return Math.min(1, (leftToRight + rightToLeft) / 2 + (sharedPaper ? 0.08 : 0));
    }
    return Math.min(1, dot(vector, other) + (sharedPaper ? 0.3 : 0));
  }));
  const edgeMap = new Map();
  similarities.forEach((row, source) => row.map((similarity, target) => ({ target, similarity }))
    .filter(({ target, similarity }) => target !== source && similarity >= (paperSimilarities ? 0.38 : 0.1))
    .sort((left, right) => right.similarity - left.similarity).slice(0, 3)
    .forEach(({ target, similarity }) => {
      const left = Math.min(source, target); const right = Math.max(source, target); const key = `${left}:${right}`;
      if (!edgeMap.has(key) || edgeMap.get(key).similarity < similarity) edgeMap.set(key, { source: left, target: right, similarity });
    }));
  const edges = [...edgeMap.values()];
  const height = Math.max(980, 540 * 1.9, Math.sqrt(Math.max(1, profiles.length)) * 84);
  const width = Math.max(1520, 930 * 1.55, height * 1.9);
  const slots = [[0.5, 0.27], [0.25, 0.31], [0.75, 0.31], [0.13, 0.72], [0.38, 0.7], [0.63, 0.7], [0.87, 0.72]];
  const clusterCounts = Array(CLUSTER_COUNT).fill(0); profiles.forEach((profile) => { clusterCounts[profile.cluster] += 1; });
  const ranks = Array(CLUSTER_COUNT).fill(0); const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const nodes = profiles.map((profile, index) => {
    const rank = ranks[profile.cluster]++; const count = Math.max(1, clusterCounts[profile.cluster]);
    const angle = rank * goldenAngle + hashNumber(profile.name) * 0.6;
    const radius = Math.min(height * 0.21, Math.max(120, Math.sqrt(count) * 36));
    const distance = radius * 0.84 * Math.sqrt((rank + 0.65) / count); const [slotX, slotY] = slots[profile.cluster];
    return { index, cluster: profile.cluster, x: width * slotX + Math.cos(angle) * distance, y: height * slotY + Math.sin(angle) * distance, vx: 0, vy: 0 };
  });
  for (let iteration = 0; iteration < 110; iteration += 1) {
    for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left]; const b = nodes[right]; let dx = b.x - a.x; let dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy)); const minimum = 27 + Math.sqrt(profiles[left].papers.length + profiles[right].papers.length) * 3;
      if (distance < minimum) {
        const push = (minimum - distance) * 0.08; dx /= distance; dy /= distance;
        a.vx -= dx * push; a.vy -= dy * push; b.vx += dx * push; b.vy += dy * push;
      }
    }
    edges.forEach((edge) => {
      const source = nodes[edge.source]; const target = nodes[edge.target]; const dx = target.x - source.x; const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy)); const force = (distance - (68 + (1 - edge.similarity) * 116)) * (0.001 + edge.similarity * 0.0035);
      source.vx += (dx / distance) * force; source.vy += (dy / distance) * force; target.vx -= (dx / distance) * force; target.vy -= (dy / distance) * force;
    });
    nodes.forEach((node) => {
      const [slotX, slotY] = slots[node.cluster]; node.vx += (width * slotX - node.x) * 0.0008; node.vy += (height * slotY - node.y) * 0.0008;
      node.vx *= 0.82; node.vy *= 0.82; node.x += node.vx; node.y += node.vy;
    });
  }
  return {
    names: profiles.map((profile) => profile.name),
    institutions: profiles.map((profile) => profile.affiliation),
    institutionGroups,
    similarities,
    edges,
    positions: nodes.map((node) => ({ x: node.x / width, y: node.y / height, cluster: node.cluster })),
  };
}

function roundNumbers(value) {
  if (typeof value === "number") return Number(value.toFixed(5));
  if (Array.isArray(value)) return value.map(roundNumbers);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundNumbers(item)]));
  return value;
}

const papers = parseCSV(fs.readFileSync(catalogPath, "utf8"));
if (!papers.length) throw new Error(`No papers found in ${catalogPath}`);
const affiliationPayload = fs.existsSync(affiliationsPath)
  ? JSON.parse(fs.readFileSync(affiliationsPath, "utf8"))
  : { authors: {} };
const semanticPayload = fs.existsSync(semanticPath)
  ? JSON.parse(fs.readFileSync(semanticPath, "utf8"))
  : null;
const semanticValid = semanticPayload?.schemaVersion === 1
  && Array.isArray(semanticPayload.paperIds)
  && semanticPayload.paperIds.length === papers.length
  && semanticPayload.paperIds.every((id, index) => id === papers[index].arxiv_id)
  && Array.isArray(semanticPayload.paper?.clusters)
  && semanticPayload.paper.clusters.length === papers.length
  && Array.isArray(semanticPayload.paper?.similarities)
  && semanticPayload.paper.similarities.length === papers.length
  && Array.isArray(semanticPayload.paper?.clusterInfo)
  && semanticPayload.paper.clusterInfo.length === CLUSTER_COUNT
  && Array.isArray(semanticPayload.paper?.edges)
  && Array.isArray(semanticPayload.paper?.positions)
  && semanticPayload.paper.positions.length === papers.length;
const paperModel = semanticValid ? null : buildPaperVectors(papers);
const clusters = semanticValid ? semanticPayload.paper.clusters : clusterVectors(paperModel.vectors, paperModel.documents);
const similarities = semanticValid ? semanticPayload.paper.similarities : similarityMatrix(paperModel.vectors);
const clusterInfo = semanticValid ? semanticPayload.paper.clusterInfo : describeClusters(papers, paperModel.documents, clusters);
const edges = semanticValid ? semanticPayload.paper.edges : buildPaperEdges(similarities, clusters);
const positions = semanticValid ? semanticPayload.paper.positions : paperLayout(papers, clusters, clusterInfo, edges);
const output = roundNumbers({
  algorithmVersion: semanticValid ? 2 : 1,
  similarityModel: semanticValid ? semanticPayload.model : "tag-tfidf",
  semanticCorpusSignature: semanticValid ? semanticPayload.corpusSignature : null,
  generatedAt: new Date().toISOString(),
  catalogSignature: catalogSignature(papers),
  paperIds: papers.map((paper) => paper.arxiv_id),
  paper: { clusters, similarities, clusterInfo, edges, positions },
  authors: authorModel(papers, clusters, affiliationPayload.authors || {}, semanticValid ? similarities : null),
});
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
const sizeKiB = Math.round(fs.statSync(outputPath).size / 1024);
console.log(`precomputed ${papers.length} papers with ${semanticValid ? "SPECTER" : "tag TF-IDF"}, ${output.authors.names.length} authors -> ${outputPath} (${sizeKiB} KiB)`);
