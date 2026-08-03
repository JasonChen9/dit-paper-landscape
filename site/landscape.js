(() => {
  const t = (key, values) => window.DiTI18n.t(key, values);

  const FAMILIES = {
    architecture: {
      labelKey: "cluster.architecture",
      tags: [
        "rae", "latent", "representation", "pixel-space", "tokenization", "single-stream",
        "hybrid-architecture", "scaling-law", "moe", "routing", "expert-design", "scaling",
        "foundation", "foundation-model", "image", "text-rendering", "editing", "conversion",
        "ddpm", "score-sde", "continuous-time", "training-objective", "rectified-flow",
        "flow-matching", "straight-path", "training-design", "noise-schedule",
        "mmdit", "linear-attention", "efficient-architecture", "training-efficiency",
        "high-resolution", "weak-to-strong", "interpolant", "self-supervision", "text-to-image",
      ],
    },
    video: {
      labelKey: "cluster.video",
      tags: [
        "video", "long-video", "streaming", "avatar", "real-time", "audio-driven", "mobile",
        "4d-consistency", "3d-constraint", "causal", "autoregressive", "world-consistency",
        "spatiotemporal", "3d-vae", "text-to-video", "video-foundation-model",
      ],
    },
    systems: {
      labelKey: "cluster.systems",
      tags: [
        "cache", "quantization", "sparse-attention", "kernel", "distributed", "parallelism",
        "pipeline", "serving", "scheduling", "communication", "overlap", "load-balancing",
        "inference", "compression", "efficiency", "engine", "speculation", "sequence-parallel",
        "training", "block-wise", "hierarchical", "memory-management", "auto-configuration",
        "sampling", "implicit-process", "ode-solver", "few-step", "distillation", "guidance",
        "patch-parallel", "hybrid-parallel", "stage-graph", "disaggregation", "latency",
        "deployment", "runtime", "edge-deployment", "token-pruning", "benchmark",
      ],
    },
    rl: {
      labelKey: "cluster.rl",
      tags: [
        "rl", "grpo", "reward-model", "verifiable-reward", "alignment", "online",
        "forward-process", "gradient-estimation", "rollout", "spot-gpu", "3d-constraint",
        "4d-consistency", "reasoning", "visual-generation", "flow-matching",
        "dpo", "preference", "human-feedback", "policy-gradient", "kl-regularization", "reward-free",
      ],
    },
    agent: {
      labelKey: "cluster.agent",
      tags: [
        "world-model", "world-action-model", "embodied-world-model", "future-prediction",
        "interactive", "interactive-world-model", "long-horizon", "planning", "video-world-model",
        "world-foundation-model", "diffusion-world-model", "action-conditioned", "world-generation",
        "latent-action", "game-engine", "spatial-memory", "policy-evaluation", "reactive-agent",
        "agent-workflow", "llm-agent", "causal-rollout", "physical-ai", "dynamics",
      ],
    },
    vla: {
      labelKey: "cluster.vla",
      tags: [
        "vla", "robotics", "robot-policy", "diffusion-policy", "flow-policy", "action-expert",
        "action", "action-chunking", "cross-embodiment", "tactile", "bimanual", "control",
        "real-time-control", "replanning", "policy-serving", "dual-system", "receding-horizon",
        "embodied-ai", "generalist-policy", "navigation", "3d-representation", "visuomotor",
        "sim-to-real", "trajectory-critic", "foundation-policy", "denoising-transformer",
      ],
    },
    omni: {
      labelKey: "cluster.omni",
      tags: [
        "omni", "multi-output", "audio", "synchronization", "interleaved", "tri-modal",
        "understanding", "perception", "unified-representation", "instruction", "any-to-any",
        "image-editing", "prior-preservation", "decoupled", "unified", "prediction",
        "discrete-diffusion", "cross-modal",
        "native-multimodal", "autoregressive-diffusion", "autoregressive-flow", "multimodal-flow",
        "understanding-generation", "single-transformer", "mixed-modality", "continuous-latent",
        "image-text", "decoder-only", "unified-pretraining", "clip-latent", "representation-alignment",
      ],
    },
  };

  const CLUSTER_COUNT = 7;
  const state = {
    papers: [],
    paperDays: [],
    tags: [],
    vectors: [],
    similarities: [],
    clusters: [],
    clusterInfo: [],
    edges: [],
    nodes: [],
    selected: null,
    hovered: null,
    activeCluster: null,
    activeTag: null,
    width: 0,
    height: 0,
    virtualWidth: 0,
    virtualHeight: 0,
    clusterTargets: [],
    view: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      targetScale: 1,
      targetOffsetX: 0,
      targetOffsetY: 0,
      fitScale: 1,
      fitOffsetX: 0,
      fitOffsetY: 0,
      initialized: false,
      manual: false,
    },
    palette: [],
    animationToken: 0,
    hoverFocus: null,
    hoverEnergy: 0,
    timeMin: null,
    timeMax: null,
    timeStart: null,
    timeEnd: null,
    externalIds: null,
  };

  const elements = {};

  function paperTags(paper) {
    return paper.topic_tags
      .split(";")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  function publishedDay(value) {
    return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
  }

  function formatDay(day) {
    return new Date(day * 86400000).toISOString().slice(0, 10);
  }

  function paperSummary(paper) {
    return window.DiTI18n.language === "zh" ? paper.summary_zh : paper.summary_en || paper.summary_zh;
  }

  function clusterName(info) {
    const primary = info.primaryFamily ? t(FAMILIES[info.primaryFamily].labelKey) : t("cluster.other");
    const secondary = info.secondaryFamily ? t(FAMILIES[info.secondaryFamily].labelKey) : null;
    return secondary ? `${primary} × ${secondary}` : primary;
  }

  function paperInTimeRange(index) {
    const day = state.paperDays[index];
    return day >= state.timeStart && day <= state.timeEnd;
  }

  function paperInExternalFilter(index) {
    return state.externalIds === null || state.externalIds.has(state.papers[index].arxiv_id);
  }

  function paperInTopicFilter(index) {
    if (state.activeCluster !== null && state.clusters[index] !== state.activeCluster) return false;
    if (state.activeTag && !paperTags(state.papers[index]).includes(state.activeTag)) return false;
    return true;
  }

  function paperAvailable(index) {
    return paperInTimeRange(index) && paperInExternalFilter(index);
  }

  function familyScores(tags) {
    const tagSet = new Set(tags);
    return Object.fromEntries(
      Object.entries(FAMILIES).map(([key, family]) => [
        key,
        family.tags.reduce((score, tag) => score + (tagSet.has(tag) ? 1 : 0), 0),
      ]),
    );
  }

  function buildVectors(papers) {
    const documents = papers.map((paper) => {
      const tags = paperTags(paper);
      return { tags, families: familyScores(tags) };
    });
    const featureKeys = new Set();
    for (const document of documents) {
      document.tags.forEach((tag) => featureKeys.add(`tag:${tag}`));
      Object.entries(document.families)
        .filter(([, score]) => score > 0)
        .forEach(([family]) => featureKeys.add(`family:${family}`));
    }
    const vocabulary = [...featureKeys].sort();
    const documentFrequency = new Map(vocabulary.map((feature) => [feature, 0]));

    for (const document of documents) {
      const present = new Set([
        ...document.tags.map((tag) => `tag:${tag}`),
        ...Object.entries(document.families)
          .filter(([, score]) => score > 0)
          .map(([family]) => `family:${family}`),
      ]);
      present.forEach((feature) => documentFrequency.set(feature, documentFrequency.get(feature) + 1));
    }

    const vectors = documents.map((document) => {
      const vector = vocabulary.map((feature) => {
        if (feature.startsWith("tag:")) {
          const tag = feature.slice(4);
          if (!document.tags.includes(tag)) return 0;
          const idf = Math.log((papers.length + 1) / (documentFrequency.get(feature) + 1)) + 1;
          return idf;
        }
        const family = feature.slice(7);
        const hits = document.families[family];
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

  function seedCentroids(vectors, documents) {
    const used = new Set();
    return Object.keys(FAMILIES).map((family) => {
      let best = -1;
      let bestScore = -Infinity;
      documents.forEach((document, index) => {
        if (used.has(index)) return;
        const own = document.families[family];
        const overlap = Object.entries(document.families)
          .filter(([key]) => key !== family)
          .reduce((sum, [, score]) => sum + score, 0);
        const score = own * 3 - overlap * 0.25;
        if (score > bestScore) {
          best = index;
          bestScore = score;
        }
      });
      if (best < 0) best = vectors.findIndex((_, index) => !used.has(index));
      used.add(best);
      return [...vectors[best]];
    });
  }

  function clusterVectors(vectors, documents) {
    let centroids = seedCentroids(vectors, documents);
    let assignments = new Array(vectors.length).fill(-1);

    for (let iteration = 0; iteration < 30; iteration += 1) {
      const nextAssignments = vectors.map((vector) => {
        let bestCluster = 0;
        let bestSimilarity = -Infinity;
        centroids.forEach((centroid, cluster) => {
          const similarity = dot(vector, centroid);
          if (similarity > bestSimilarity) {
            bestCluster = cluster;
            bestSimilarity = similarity;
          }
        });
        return bestCluster;
      });
      if (nextAssignments.every((cluster, index) => cluster === assignments[index])) break;
      assignments = nextAssignments;

      centroids = centroids.map((oldCentroid, cluster) => {
        const members = vectors.filter((_, index) => assignments[index] === cluster);
        if (!members.length) return oldCentroid;
        const mean = oldCentroid.map((_, dimension) =>
          members.reduce((sum, vector) => sum + vector[dimension], 0) / members.length,
        );
        return normalizeVector(mean);
      });
    }
    return assignments;
  }

  function buildSimilarityMatrix(vectors) {
    return vectors.map((vector, left) =>
      vectors.map((other, right) => (left === right ? 1 : dot(vector, other))),
    );
  }

  function describeClusters(papers, documents, assignments) {
    return Array.from({ length: CLUSTER_COUNT }, (_, cluster) => {
      const members = papers.map((_, index) => index).filter((index) => assignments[index] === cluster);
      const scores = Object.keys(FAMILIES).map((family) => ({
        family,
        score: members.reduce((sum, index) => sum + documents[index].families[family], 0),
      })).sort((left, right) => right.score - left.score);
      const counts = new Map();
      members.forEach((index) => paperTags(papers[index]).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
      const topTags = [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 3)
        .map(([tag]) => tag);
      const primaryFamily = scores[0]?.family ?? null;
      const secondaryFamily = scores[1]?.score >= Math.max(1, scores[0]?.score * 0.5)
        ? scores[1].family
        : null;
      return {
        cluster,
        members,
        primaryFamily,
        secondaryFamily,
        topTags,
      };
    });
  }

  function buildEdges(similarities, assignments) {
    const edgeMap = new Map();
    similarities.forEach((row, source) => {
      const candidates = row
        .map((similarity, target) => ({ target, similarity }))
        .filter(({ target }) => target !== source)
        .sort((left, right) => right.similarity - left.similarity);
      const preferred = candidates.filter(({ similarity }) => similarity >= 0.13).slice(0, 4);
      const selected = preferred.length >= 2 ? preferred : candidates.slice(0, 2);
      selected.forEach(({ target, similarity }) => {
        const key = source < target ? `${source}:${target}` : `${target}:${source}`;
        const existing = edgeMap.get(key);
        if (!existing || similarity > existing.similarity) {
          edgeMap.set(key, { source: Math.min(source, target), target: Math.max(source, target), similarity });
        }
      });
    });
    return [...edgeMap.values()].filter(
      (edge) => edge.similarity >= 0.08 || assignments[edge.source] === assignments[edge.target],
    );
  }

  function hashNumber(value) {
    let hash = 2166136261;
    for (const char of value) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function readPalette() {
    const styles = getComputedStyle(document.documentElement);
    state.palette = Array.from({ length: CLUSTER_COUNT }, (_, index) =>
      styles.getPropertyValue(`--cluster-${index + 1}`).trim(),
    );
  }

  function setDimensions() {
    const rect = elements.plot.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width));
    const height = Math.max(390, Math.min(540, Math.round(width * 0.62)));
    if (Math.abs(width - state.width) < 4 && state.nodes.length) return false;
    state.width = width;
    state.height = height;
    const paperScale = Math.sqrt(Math.max(1, state.papers.length));
    state.virtualHeight = Math.max(980, height * 1.9, paperScale * 88);
    state.virtualWidth = Math.max(1520, width * 1.55, state.virtualHeight * 1.95);
    state.view.initialized = false;
    state.view.manual = false;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    elements.canvas.width = Math.round(width * ratio);
    elements.canvas.height = Math.round(height * ratio);
    elements.canvas.style.height = `${height}px`;
    elements.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return true;
  }

  function computeClusterTargets() {
    const total = Math.max(1, state.papers.length);
    const virtualArea = state.virtualWidth * state.virtualHeight;
    const slots = [
      [0.5, 0.28],
      [0.27, 0.3],
      [0.73, 0.3],
      [0.14, 0.7],
      [0.38, 0.7],
      [0.62, 0.7],
      [0.86, 0.7],
    ];
    const orderedClusters = state.clusterInfo
      .map((info, cluster) => ({ cluster, count: info.members.length }))
      .sort((left, right) => right.count - left.count || left.cluster - right.cluster);
    const targets = new Array(CLUSTER_COUNT);

    orderedClusters.forEach(({ cluster, count }, rank) => {
      const [xRatio, yRatio] = slots[rank];
      const radius = Math.max(
        118,
        Math.min(
          state.virtualHeight * 0.24,
          Math.sqrt((count * virtualArea * 0.3) / (total * Math.PI)),
        ),
      );
      targets[cluster] = {
        x: state.virtualWidth * xRatio,
        y: state.virtualHeight * yRatio,
        homeX: state.virtualWidth * xRatio,
        homeY: state.virtualHeight * yRatio,
        radius,
        count,
      };
    });

    for (let iteration = 0; iteration < 160; iteration += 1) {
      for (let left = 0; left < targets.length; left += 1) {
        for (let right = left + 1; right < targets.length; right += 1) {
          const a = targets[left];
          const b = targets[right];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.hypot(dx, dy);
          if (distance < 1) {
            const angle = (left + right * 0.61) * 2.39996;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distance = 1;
          }
          const minimum = a.radius + b.radius + 66;
          if (distance < minimum) {
            const shift = (minimum - distance) * 0.51;
            const ux = dx / distance;
            const uy = dy / distance;
            a.x -= ux * shift;
            a.y -= uy * shift;
            b.x += ux * shift;
            b.y += uy * shift;
          }
        }
      }
      targets.forEach((target) => {
        target.x += (target.homeX - target.x) * 0.035;
        target.y += (target.homeY - target.y) * 0.035;
        const margin = target.radius + 86;
        target.x = Math.max(margin, Math.min(state.virtualWidth - margin, target.x));
        target.y = Math.max(margin, Math.min(state.virtualHeight - margin, target.y));
      });
    }
    state.clusterTargets = targets;
  }

  function initializeNodes() {
    computeClusterTargets();
    const clusterRanks = new Array(CLUSTER_COUNT).fill(0);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    state.nodes = state.papers.map((paper, index) => {
      const cluster = state.clusters[index];
      const target = state.clusterTargets[cluster];
      const rank = clusterRanks[cluster]++;
      const angle = rank * goldenAngle + hashNumber(`${paper.arxiv_id}:a`) * 0.42;
      const fillRatio = Math.sqrt((rank + 0.65) / Math.max(1, target.count));
      const distance = target.radius * 0.8 * fillRatio;
      const x = target.x + Math.cos(angle) * distance;
      const y = target.y + Math.sin(angle) * distance;
      return {
        index,
        cluster,
        publishedDay: state.paperDays[index],
        x,
        y,
        anchorX: x,
        anchorY: y,
        vx: 0,
        vy: 0,
        driftPhase: hashNumber(`${paper.arxiv_id}:phase`) * Math.PI * 2,
        driftSpeed: 0.00164 + hashNumber(`${paper.arxiv_id}:speed`) * 0.00096,
        driftAmplitude: 3.2 + hashNumber(`${paper.arxiv_id}:amplitude`) * 2,
      };
    });
    updateViewTarget(true);
  }

  function updateViewTarget(immediate = false, force = false) {
    if (!state.nodes.length) return;
    const padding = 82;
    const minX = Math.min(...state.nodes.map((node) => node.x)) - padding;
    const maxX = Math.max(...state.nodes.map((node) => node.x)) + padding;
    const minY = Math.min(...state.nodes.map((node) => node.y)) - padding;
    const maxY = Math.max(...state.nodes.map((node) => node.y)) + padding;
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const screenPaddingX = Math.min(48, state.width * 0.06);
    const screenPaddingY = Math.min(38, state.height * 0.08);
    const scale = Math.min(
      (state.width - screenPaddingX * 2) / contentWidth,
      (state.height - screenPaddingY * 2) / contentHeight,
      1.15,
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    state.view.fitScale = scale;
    state.view.fitOffsetX = state.width / 2 - centerX * scale;
    state.view.fitOffsetY = state.height / 2 - centerY * scale;
    if (state.view.manual && !force) return;
    state.view.targetScale = scale;
    state.view.targetOffsetX = state.view.fitOffsetX;
    state.view.targetOffsetY = state.view.fitOffsetY;
    if (immediate || !state.view.initialized) {
      state.view.scale = state.view.targetScale;
      state.view.offsetX = state.view.targetOffsetX;
      state.view.offsetY = state.view.targetOffsetY;
      state.view.initialized = true;
    }
  }

  function easeView(amount = 0.1) {
    state.view.scale += (state.view.targetScale - state.view.scale) * amount;
    state.view.offsetX += (state.view.targetOffsetX - state.view.offsetX) * amount;
    state.view.offsetY += (state.view.targetOffsetY - state.view.offsetY) * amount;
  }

  function screenPosition(node) {
    return {
      x: node.x * state.view.scale + state.view.offsetX,
      y: node.y * state.view.scale + state.view.offsetY,
    };
  }

  function zoomAt(screenX, screenY, factor) {
    const currentScale = Math.max(0.001, state.view.scale);
    const minimumScale = state.view.fitScale * 0.7;
    const maximumScale = state.view.fitScale * 6;
    const nextScale = Math.max(minimumScale, Math.min(maximumScale, currentScale * factor));
    if (Math.abs(nextScale - currentScale) < 0.0001) return;
    const worldX = (screenX - state.view.offsetX) / currentScale;
    const worldY = (screenY - state.view.offsetY) / currentScale;
    state.view.scale = nextScale;
    state.view.offsetX = screenX - worldX * nextScale;
    state.view.offsetY = screenY - worldY * nextScale;
    state.view.targetScale = state.view.scale;
    state.view.targetOffsetX = state.view.offsetX;
    state.view.targetOffsetY = state.view.offsetY;
    state.view.manual = true;
    draw();
  }

  function panView(deltaX, deltaY) {
    state.view.offsetX += deltaX;
    state.view.offsetY += deltaY;
    state.view.targetOffsetX = state.view.offsetX;
    state.view.targetOffsetY = state.view.offsetY;
    state.view.targetScale = state.view.scale;
    state.view.manual = true;
    draw();
  }

  function fitView() {
    state.view.manual = false;
    const immediate = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    updateViewTarget(immediate, true);
    draw();
  }

  function softWallForce(position, maximum) {
    const zone = 132;
    if (position < zone) {
      const distance = zone - position;
      return distance * 0.011 * (1 + distance / zone);
    }
    if (position > maximum - zone) {
      const distance = position - maximum + zone;
      return -distance * 0.011 * (1 + distance / zone);
    }
    return 0;
  }

  function forceStep() {
    const nodes = state.nodes;
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const dx = nodes[right].x - nodes[left].x;
        const dy = nodes[right].y - nodes[left].y;
        const distanceSquared = Math.max(80, dx * dx + dy * dy);
        const force = 18 / distanceSquared;
        nodes[left].vx -= dx * force;
        nodes[left].vy -= dy * force;
        nodes[right].vx += dx * force;
        nodes[right].vy += dy * force;
      }
    }

    for (const edge of state.edges) {
      const source = nodes[edge.source];
      const target = nodes[edge.target];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const desired = 54 + (1 - edge.similarity) * 104;
      const force = (distance - desired) * (0.0018 + edge.similarity * 0.0065);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    nodes.forEach((node) => {
      const target = state.clusterTargets[node.cluster];
      const dx = target.x - node.x;
      const dy = target.y - node.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      node.vx += dx * 0.00125;
      node.vy += dy * 0.00125;
      const clusterLimit = target.radius * 1.08;
      if (distance > clusterLimit) {
        const excess = distance - clusterLimit;
        node.vx += (dx / distance) * excess * 0.012;
        node.vy += (dy / distance) * excess * 0.012;
      }
      node.vx += softWallForce(node.x, state.virtualWidth);
      node.vy += softWallForce(node.y, state.virtualHeight);
      node.vx *= 0.86;
      node.vy *= 0.86;
      const speed = Math.max(1, Math.hypot(node.vx, node.vy));
      if (speed > 13) {
        node.vx = (node.vx / speed) * 13;
        node.vy = (node.vy / speed) * 13;
      }
      node.x += node.vx;
      node.y += node.vy;
    });
  }

  function isNodeActive(node) {
    if (!paperAvailable(node.index)) return false;
    if (state.activeCluster !== null && node.cluster !== state.activeCluster) return false;
    if (state.activeTag && !paperTags(state.papers[node.index]).includes(state.activeTag)) return false;
    return true;
  }

  function draw() {
    const context = elements.context;
    const rootStyles = getComputedStyle(document.documentElement);
    const edgeColor = rootStyles.getPropertyValue("--landscape-edge").trim();
    const labelColor = rootStyles.getPropertyValue("--text").trim();
    context.clearRect(0, 0, state.width, state.height);
    const focus = state.hovered ?? state.selected;
    const focusNeighbors = new Set(
      focus === null ? [] : nearestPapers(focus, 4).map(({ candidate }) => candidate),
    );

    for (const edge of state.edges) {
      const source = state.nodes[edge.source];
      const target = state.nodes[edge.target];
      const sourcePoint = screenPosition(source);
      const targetPoint = screenPosition(target);
      const edgeActive = isNodeActive(source) && isNodeActive(target);
      const highlighted = edgeActive && focus !== null
        && (edge.source === focus && focusNeighbors.has(edge.target)
          || edge.target === focus && focusNeighbors.has(edge.source));
      context.beginPath();
      context.moveTo(sourcePoint.x, sourcePoint.y);
      context.lineTo(targetPoint.x, targetPoint.y);
      context.strokeStyle = highlighted ? state.palette[source.cluster] : edgeColor;
      context.globalAlpha = edgeActive
        ? (highlighted ? 0.7 : 0.18 + edge.similarity * 0.25)
        : 0.025;
      context.lineWidth = highlighted ? 1.6 : 0.8;
      context.stroke();
    }

    state.nodes.forEach((node) => {
      const point = screenPosition(node);
      const active = isNodeActive(node);
      const selected = state.selected === node.index;
      const hovered = state.hovered === node.index;
      const degree = state.edges.filter((edge) => edge.source === node.index || edge.target === node.index).length;
      const radius = (selected ? 7.5 : hovered ? 6.8 : 4.3) + Math.min(1.8, degree * 0.12);
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fillStyle = state.palette[node.cluster];
      context.globalAlpha = active ? 0.94 : 0.12;
      context.fill();
      if ((selected || hovered) && active) {
        context.strokeStyle = labelColor;
        context.globalAlpha = 0.9;
        context.lineWidth = 1.5;
        context.stroke();
      }
      if ((selected || hovered) && active) {
        const paper = state.papers[node.index];
        context.globalAlpha = 1;
        context.fillStyle = labelColor;
        context.font = "500 12px Roboto, sans-serif";
        const label = paper.short_title;
        const labelWidth = context.measureText(label).width;
        const x = Math.min(state.width - labelWidth - 7, point.x + 10);
        const y = Math.max(14, point.y - 10);
        context.fillText(label, x, y);
      }
    });
    context.globalAlpha = 1;
  }

  function captureAnchors() {
    state.nodes.forEach((node) => {
      node.anchorX = node.x;
      node.anchorY = node.y;
    });
  }

  function startAmbientMotion(token) {
    let lastFrame = 0;
    let handoffStart = null;
    const frameInterval = 1000 / 30;
    const handoffDuration = 1200;
    const frame = (timestamp) => {
      if (token !== state.animationToken) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        state.nodes.forEach((node) => {
          node.x = node.anchorX;
          node.y = node.anchorY;
        });
        draw();
        return;
      }

      if (!document.hidden && timestamp - lastFrame >= frameInterval) {
        const elapsed = lastFrame ? timestamp - lastFrame : frameInterval;
        const motionElapsed = Math.min(elapsed, frameInterval * 3);
        lastFrame = timestamp;
        if (handoffStart === null) handoffStart = timestamp;
        const handoffProgress = Math.min(1, (timestamp - handoffStart) / handoffDuration);
        const handoffBlend = 1 - Math.pow(1 - handoffProgress, 3);
        if (state.hovered !== null) {
          state.hoverEnergy += (1 - state.hoverEnergy) * 0.2;
        } else {
          state.hoverEnergy *= Math.pow(0.955, elapsed / frameInterval);
        }
        if (state.hoverEnergy < 0.01) {
          state.hoverEnergy = 0;
          state.hoverFocus = null;
        }

        state.nodes.forEach((node) => {
          const similarity = state.hoverFocus === null
            ? 0
            : state.similarities[state.hoverFocus][node.index];
          const proximity = node.index === state.hoverFocus ? 1 : similarity;
          const activation = state.hoverEnergy * proximity;
          const amplitude = node.driftAmplitude * (1 + activation * 0.95);
          node.driftPhase += motionElapsed * node.driftSpeed * (1 + activation * 0.45);
          const phase = node.driftPhase;
          node.x = node.anchorX + Math.sin(phase) * amplitude * handoffBlend;
          node.y = node.anchorY + Math.cos(phase * 0.83) * amplitude * 0.72 * handoffBlend;
        });
        easeView(0.12);
        draw();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function runSimulation() {
    const token = ++state.animationToken;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      for (let index = 0; index < 180; index += 1) forceStep();
      updateViewTarget(true);
      captureAnchors();
      draw();
      return;
    }
    let settleFrame = 0;
    const settleFrames = 72;
    const frame = () => {
      if (token !== state.animationToken) return;
      const settleProgress = settleFrame / (settleFrames - 1);
      const forceSteps = Math.max(1, Math.round(5 - settleProgress * 4));
      for (let step = 0; step < forceSteps; step += 1) forceStep();
      updateViewTarget();
      easeView(0.095);
      draw();
      settleFrame += 1;
      if (settleFrame < settleFrames) {
        requestAnimationFrame(frame);
      } else {
        updateViewTarget();
        captureAnchors();
        startAmbientMotion(token);
      }
    };
    requestAnimationFrame(frame);
  }

  function nearestPapers(index, limit = 4) {
    return state.similarities[index]
      .map((similarity, candidate) => ({ candidate, similarity }))
      .filter(({ candidate }) => candidate !== index)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit);
  }

  function link(label, url) {
    const anchor = document.createElement("a");
    anchor.textContent = label;
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    return anchor;
  }

  function selectPaper(index) {
    state.selected = index;
    const paper = state.papers[index];
    const cluster = state.clusterInfo[state.clusters[index]];
    const container = elements.selection;
    container.replaceChildren();

    const eyebrow = document.createElement("p");
    eyebrow.className = "selection-eyebrow";
    eyebrow.textContent = clusterName(cluster);
    const title = document.createElement("h3");
    title.textContent = paper.short_title;
    const fullTitle = document.createElement("p");
    fullTitle.className = "selection-full-title";
    fullTitle.textContent = paper.title;
    const summary = document.createElement("p");
    summary.textContent = paperSummary(paper);
    const links = document.createElement("div");
    links.className = "selection-links";
    links.append(link(t("paper.abstract"), paper.arxiv_url), link(t("paper.pdf"), paper.pdf_url));

    const neighborTitle = document.createElement("h4");
    neighborTitle.textContent = t("neighbors.heading");
    const neighbors = document.createElement("div");
    neighbors.className = "neighbor-list";
    nearestPapers(index).forEach(({ candidate, similarity }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${state.papers[candidate].short_title} · ${Math.round(similarity * 100)}%`;
      button.addEventListener("click", () => selectPaper(candidate));
      neighbors.append(button);
    });
    container.append(eyebrow, title, fullTitle, summary, links, neighborTitle, neighbors);
    draw();
  }

  function emitTopicFilter() {
    let ids = null;
    let label = "";
    let source = null;
    let cluster = null;
    if (state.activeCluster !== null) {
      const info = state.clusterInfo[state.activeCluster];
      ids = info.members.map((index) => state.papers[index].arxiv_id);
      label = clusterName(info);
      source = "cluster";
      cluster = state.activeCluster;
    } else if (state.activeTag) {
      ids = state.papers
        .filter((paper) => paperTags(paper).includes(state.activeTag))
        .map((paper) => paper.arxiv_id);
      label = state.activeTag;
      source = "tag";
    }
    window.dispatchEvent(new CustomEvent("dit:landscape-topic-filter", {
      detail: { ids, label, source, cluster },
    }));
  }

  function emitClusterCatalog() {
    const clusters = state.clusterInfo.map((info, cluster) => ({
      id: String(cluster),
      name: clusterName(info),
      ids: info.members.map((index) => state.papers[index].arxiv_id),
      topTags: [...info.topTags],
    }));
    window.dispatchEvent(new CustomEvent("dit:landscape-clusters-ready", { detail: { clusters } }));
  }

  function emitTimeFilter() {
    const fullRange = state.timeStart === state.timeMin && state.timeEnd === state.timeMax;
    window.dispatchEvent(new CustomEvent("dit:landscape-time-filter", {
      detail: {
        start: formatDay(state.timeStart),
        end: formatDay(state.timeEnd),
        fullRange,
      },
    }));
  }

  function renderLegend() {
    elements.legend.replaceChildren();
    state.clusterInfo.forEach((info, cluster) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cluster-key";
      button.style.setProperty("--cluster-color", state.palette[cluster]);
      button.setAttribute("aria-pressed", String(state.activeCluster === cluster));
      const swatch = document.createElement("span");
      swatch.className = "cluster-swatch";
      const label = document.createElement("span");
      label.innerHTML = `<strong></strong><small></small>`;
      label.querySelector("strong").textContent = clusterName(info);
      const availableCount = info.members.filter(paperAvailable).length;
      label.querySelector("small").textContent = `${t(availableCount === 1 ? "count.paper" : "count.papers", { count: availableCount })} · ${info.topTags.join(" / ")}`;
      button.append(swatch, label);
      button.addEventListener("click", () => {
        state.activeCluster = state.activeCluster === cluster ? null : cluster;
        state.activeTag = null;
        renderTimeDensity();
        syncTimeFilter();
        renderLegend();
        renderTopicCloud();
        draw();
        emitTopicFilter();
      });
      elements.legend.append(button);
    });
  }

  function renderTopicCloud() {
    const counts = new Map();
    state.papers.forEach((paper, index) => {
      if (!paperAvailable(index)) return;
      paperTags(paper).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    });
    const tags = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 24);
    elements.cloud.replaceChildren();
    if (!tags.length) return;
    const max = Math.max(...tags.map(([, count]) => count));
    const min = Math.min(...tags.map(([, count]) => count));
    tags.forEach(([tag, count]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "topic-word";
      const scale = max === min ? 0.5 : (count - min) / (max - min);
      button.style.setProperty("--word-scale", (0.82 + scale * 0.58).toFixed(2));
      button.setAttribute("aria-pressed", String(state.activeTag === tag));
      button.textContent = `${tag} ${count}`;
      button.addEventListener("click", () => {
        state.activeTag = state.activeTag === tag ? null : tag;
        state.activeCluster = null;
        renderTimeDensity();
        syncTimeFilter();
        renderLegend();
        renderTopicCloud();
        draw();
        emitTopicFilter();
      });
      elements.cloud.append(button);
    });
  }

  function renderBridges() {
    const pairs = [];
    for (let left = 0; left < state.papers.length; left += 1) {
      for (let right = left + 1; right < state.papers.length; right += 1) {
        if (state.clusters[left] === state.clusters[right]) continue;
        if (state.papers[left].window !== "in-window" || state.papers[right].window !== "in-window") continue;
        if (!paperAvailable(left) || !paperAvailable(right)) continue;
        pairs.push({ left, right, similarity: state.similarities[left][right] });
      }
    }
    const selected = [];
    const signatures = new Set();
    pairs.sort((left, right) => right.similarity - left.similarity).forEach((pair) => {
      if (selected.length >= 6 || pair.similarity < 0.12) return;
      const signature = [state.clusters[pair.left], state.clusters[pair.right]].sort().join(":");
      if (signatures.has(signature)) return;
      signatures.add(signature);
      selected.push(pair);
    });

    elements.bridges.replaceChildren();
    selected.forEach((pair) => {
      const button = document.createElement("button");
      button.type = "button";
      const titles = document.createElement("strong");
      titles.textContent = `${state.papers[pair.left].short_title} ↔ ${state.papers[pair.right].short_title}`;
      const meta = document.createElement("span");
      meta.textContent = `${clusterName(state.clusterInfo[state.clusters[pair.left]])} × ${clusterName(state.clusterInfo[state.clusters[pair.right]])} · ${Math.round(pair.similarity * 100)}%`;
      button.append(titles, meta);
      button.addEventListener("click", () => selectPaper(pair.left));
      elements.bridges.append(button);
    });
  }

  function renderTimeDensity() {
    const binCount = 30;
    const span = Math.max(1, state.timeMax - state.timeMin);
    const counts = new Array(binCount).fill(0);
    state.paperDays.forEach((day, paperIndex) => {
      if (!paperInExternalFilter(paperIndex) || !paperInTopicFilter(paperIndex)) return;
      const index = Math.min(
        binCount - 1,
        Math.round(((day - state.timeMin) / span) * (binCount - 1)),
      );
      counts[index] += 1;
    });
    const smoothed = counts.map((count, index) => {
      const previous = counts[Math.max(0, index - 1)];
      const next = counts[Math.min(binCount - 1, index + 1)];
      return (previous + count * 2 + next) / 4;
    });
    const peak = Math.max(1, ...smoothed);
    const points = smoothed.map((count, index) => ({
      x: (index / (binCount - 1)) * 1000,
      y: 52 - (count / peak) * 44,
    }));
    const line = points.map((point, index) =>
      `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    elements.timeDensityLine.setAttribute("d", line);
    elements.timeDensityArea.setAttribute("d", `M0,56 ${line} L1000,56 Z`);
  }

  function renderTimeTicks() {
    elements.timeTicks.replaceChildren();
    const span = Math.max(1, state.timeMax - state.timeMin);
    const firstYear = new Date(state.timeMin * 86400000).getUTCFullYear();
    const lastYear = new Date(state.timeMax * 86400000).getUTCFullYear();
    for (let year = firstYear; year <= lastYear; year += 1) {
      const day = publishedDay(`${year}-01-01`);
      if (day < state.timeMin || day > state.timeMax) continue;
      const tick = document.createElement("span");
      tick.className = "time-range-tick";
      tick.style.left = `${(((day - state.timeMin) / span) * 100).toFixed(3)}%`;
      tick.textContent = String(year);
      elements.timeTicks.append(tick);
    }
  }

  function syncTimeFilter() {
    const span = Math.max(1, state.timeMax - state.timeMin);
    const startPercent = ((state.timeStart - state.timeMin) / span) * 100;
    const endPercent = ((state.timeEnd - state.timeMin) / span) * 100;
    elements.timeControl.style.setProperty("--range-start", `${startPercent.toFixed(3)}%`);
    elements.timeControl.style.setProperty("--range-end", `${endPercent.toFixed(3)}%`);
    elements.timeStart.value = String(state.timeStart);
    elements.timeEnd.value = String(state.timeEnd);
    elements.timeStart.setAttribute("aria-valuetext", formatDay(state.timeStart));
    elements.timeEnd.setAttribute("aria-valuetext", formatDay(state.timeEnd));
    const fullRange = state.timeStart === state.timeMin && state.timeEnd === state.timeMax;
    elements.timeReadout.textContent = fullRange
      ? t("time.all")
      : `${formatDay(state.timeStart)} — ${formatDay(state.timeEnd)}`;
    const availableTotal = state.papers.filter((_, index) =>
      paperInExternalFilter(index) && paperInTopicFilter(index)).length;
    const count = state.paperDays.filter((day, index) =>
      paperInExternalFilter(index) && paperInTopicFilter(index)
      && day >= state.timeStart && day <= state.timeEnd).length;
    elements.timeCount.textContent = t("time.count", { count, total: availableTotal });
  }

  function applyTimeRange(start, end, { notify = true } = {}) {
    state.timeStart = Math.max(state.timeMin, Math.min(start, state.timeMax));
    state.timeEnd = Math.max(state.timeStart, Math.min(end, state.timeMax));
    state.hovered = null;
    elements.tooltip.hidden = true;
    syncTimeFilter();
    renderLegend();
    renderTopicCloud();
    renderBridges();
    draw();
    if (notify) emitTimeFilter();
  }

  function bindTimeBrushWindow() {
    let drag = null;
    elements.timeWindow.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        start: state.timeStart,
        end: state.timeEnd,
      };
      elements.timeWindow.setPointerCapture(event.pointerId);
      elements.timeWindow.classList.add("is-dragging");
      event.preventDefault();
    });
    elements.timeWindow.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const rect = elements.timeControl.getBoundingClientRect();
      const totalSpan = Math.max(1, state.timeMax - state.timeMin);
      const selectedSpan = drag.end - drag.start;
      const delta = Math.round(((event.clientX - drag.clientX) / rect.width) * totalSpan);
      const start = Math.max(state.timeMin, Math.min(drag.start + delta, state.timeMax - selectedSpan));
      applyTimeRange(start, start + selectedSpan);
    });
    const finishDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (elements.timeWindow.hasPointerCapture(event.pointerId)) {
        elements.timeWindow.releasePointerCapture(event.pointerId);
      }
      drag = null;
      elements.timeWindow.classList.remove("is-dragging");
    };
    elements.timeWindow.addEventListener("pointerup", finishDrag);
    elements.timeWindow.addEventListener("pointercancel", finishDrag);
  }

  function initializeTimeFilter() {
    state.paperDays = state.papers.map((paper) => publishedDay(paper.published));
    state.timeMin = Math.min(...state.paperDays);
    state.timeMax = Math.max(...state.paperDays);
    state.timeStart = state.timeMin;
    state.timeEnd = state.timeMax;
    [elements.timeStart, elements.timeEnd].forEach((input) => {
      input.min = String(state.timeMin);
      input.max = String(state.timeMax);
      input.step = "1";
    });
    renderTimeDensity();
    renderTimeTicks();
    elements.timeStart.addEventListener("input", (event) => {
      applyTimeRange(Math.min(Number(event.currentTarget.value), state.timeEnd), state.timeEnd);
    });
    elements.timeEnd.addEventListener("input", (event) => {
      applyTimeRange(state.timeStart, Math.max(Number(event.currentTarget.value), state.timeStart));
    });
    bindTimeBrushWindow();
    syncTimeFilter();
  }

  function pointerNode(event) {
    const rect = elements.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null;
    let nearestDistance = 14;
    state.nodes.forEach((node) => {
      if (!isNodeActive(node)) return;
      const point = screenPosition(node);
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    });
    return { node: nearest, x, y };
  }

  function bindCanvas() {
    let pan = null;
    let suppressClick = false;
    let lastWheelAt = 0;
    let trackpadSeries = false;

    elements.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      pan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
      };
      elements.canvas.setPointerCapture(event.pointerId);
      elements.canvas.classList.add("is-panning");
      elements.tooltip.hidden = true;
    });

    elements.canvas.addEventListener("pointermove", (event) => {
      if (pan && event.pointerId === pan.pointerId) {
        const totalDistance = Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY);
        if (totalDistance > 3) pan.moved = true;
        if (pan.moved) {
          panView(event.clientX - pan.lastX, event.clientY - pan.lastY);
          state.hovered = null;
          elements.tooltip.hidden = true;
        }
        pan.lastX = event.clientX;
        pan.lastY = event.clientY;
        return;
      }
      const { node, x, y } = pointerNode(event);
      state.hovered = node?.index ?? null;
      if (node) {
        state.hoverFocus = node.index;
        state.hoverEnergy = 1;
      }
      elements.canvas.style.cursor = node ? "pointer" : "grab";
      if (node) {
        const paper = state.papers[node.index];
        elements.tooltip.textContent = `${paper.short_title} · ${clusterName(state.clusterInfo[node.cluster])}`;
        elements.tooltip.hidden = false;
        const left = Math.min(state.width - 230, Math.max(8, x + 13));
        const top = Math.max(8, y - 34);
        elements.tooltip.style.left = `${left}px`;
        elements.tooltip.style.top = `${top}px`;
      } else {
        elements.tooltip.hidden = true;
      }
      draw();
    });

    const finishPan = (event) => {
      if (!pan || event.pointerId !== pan.pointerId) return;
      suppressClick = pan.moved;
      if (elements.canvas.hasPointerCapture(event.pointerId)) {
        elements.canvas.releasePointerCapture(event.pointerId);
      }
      pan = null;
      elements.canvas.classList.remove("is-panning");
      elements.canvas.style.cursor = "grab";
    };
    elements.canvas.addEventListener("pointerup", finishPan);
    elements.canvas.addEventListener("pointercancel", finishPan);

    elements.canvas.addEventListener("pointerleave", () => {
      if (pan) return;
      state.hovered = null;
      elements.tooltip.hidden = true;
      draw();
    });
    elements.canvas.addEventListener("click", (event) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      const { node } = pointerNode(event);
      if (node) selectPaper(node.index);
    });

    elements.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = elements.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const now = performance.now();
      if (now - lastWheelAt > 180) trackpadSeries = false;
      lastWheelAt = now;

      if (event.ctrlKey) {
        zoomAt(x, y, Math.exp(-event.deltaY * 0.012));
      } else {
        if (event.deltaMode === 0 && (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 50)) {
          trackpadSeries = true;
        }
        if (trackpadSeries) {
          panView(-event.deltaX, -event.deltaY);
        } else {
          zoomAt(x, y, event.deltaY > 0 ? 0.86 : 1.16);
        }
      }
      state.hovered = null;
      elements.tooltip.hidden = true;
    }, { passive: false });
  }

  function chooseInitialPaper() {
    let best = 0;
    let bestScore = -1;
    state.similarities.forEach((row, index) => {
      if (state.papers[index].window !== "in-window") return;
      if (!paperInExternalFilter(index)) return;
      const crossThemeScore = row.reduce((sum, similarity, other) =>
        sum + (state.clusters[index] !== state.clusters[other] ? similarity : 0), 0);
      if (crossThemeScore > bestScore) {
        best = index;
        bestScore = crossThemeScore;
      }
    });
    return best;
  }

  function resetFilters(notify = false) {
    state.activeCluster = null;
    state.activeTag = null;
    state.hovered = null;
    state.hoverFocus = null;
    state.hoverEnergy = 0;
    state.timeStart = state.timeMin;
    state.timeEnd = state.timeMax;
    renderTimeDensity();
    syncTimeFilter();
    renderLegend();
    renderTopicCloud();
    selectPaper(chooseInitialPaper());
    renderBridges();
    fitView();
    if (notify) {
      emitTopicFilter();
      emitTimeFilter();
    }
  }

  function clearTopicFilter() {
    if (state.activeCluster === null && !state.activeTag) return;
    state.activeCluster = null;
    state.activeTag = null;
    renderTimeDensity();
    syncTimeFilter();
    renderLegend();
    renderTopicCloud();
    draw();
  }

  function setClusterFilter(cluster) {
    const nextCluster = Number.isInteger(cluster) && cluster >= 0 && cluster < state.clusterInfo.length
      ? cluster
      : null;
    state.activeCluster = nextCluster;
    state.activeTag = null;
    if (!state.papers.length) return;
    renderTimeDensity();
    syncTimeFilter();
    renderLegend();
    renderTopicCloud();
    draw();
  }

  function setExternalFilter(ids) {
    state.externalIds = Array.isArray(ids) ? new Set(ids) : null;
    if (!state.papers.length) return;
    renderTimeDensity();
    syncTimeFilter();
    renderLegend();
    renderTopicCloud();
    renderBridges();
    draw();
  }

  function setTimePreset(preset) {
    if (!state.papers.length) return;
    if (preset === "all" || preset === "custom") {
      applyTimeRange(state.timeMin, state.timeMax, { notify: false });
      return;
    }
    const days = state.papers
      .map((paper, index) => ({ paper, day: state.paperDays[index] }))
      .filter(({ paper }) => paper.window === preset)
      .map(({ day }) => day);
    if (days.length) applyTimeRange(Math.min(...days), Math.max(...days), { notify: false });
  }

  function setTimeRange(start, end) {
    if (!state.papers.length) return;
    const startDay = publishedDay(start);
    const endDay = publishedDay(end);
    if (Number.isFinite(startDay) && Number.isFinite(endDay)) {
      applyTimeRange(startDay, endDay, { notify: false });
    }
  }

  function init(papers) {
    if (!papers?.length || state.papers.length) return;
    Object.assign(elements, {
      canvas: document.querySelector("#landscape-canvas"),
      plot: document.querySelector("#landscape-plot"),
      tooltip: document.querySelector("#landscape-tooltip"),
      legend: document.querySelector("#cluster-legend"),
      selection: document.querySelector("#landscape-selection"),
      cloud: document.querySelector("#topic-cloud"),
      bridges: document.querySelector("#bridge-list"),
      reset: document.querySelector("#landscape-reset"),
      zoomOut: document.querySelector("#landscape-zoom-out"),
      zoomIn: document.querySelector("#landscape-zoom-in"),
      zoomFit: document.querySelector("#landscape-zoom-fit"),
      timeControl: document.querySelector("#time-range-control"),
      timeStart: document.querySelector("#time-range-start"),
      timeEnd: document.querySelector("#time-range-end"),
      timeReadout: document.querySelector("#time-range-readout"),
      timeCount: document.querySelector("#time-range-count"),
      timeDensityArea: document.querySelector("#time-density-area"),
      timeDensityLine: document.querySelector("#time-density-line"),
      timeTicks: document.querySelector("#time-range-ticks"),
      timeWindow: document.querySelector("#time-brush-window"),
    });
    if (Object.values(elements).some((element) => !element)) return;
    elements.context = elements.canvas.getContext("2d");
    state.papers = papers;
    initializeTimeFilter();
    const model = buildVectors(papers);
    state.tags = model.documents;
    state.vectors = model.vectors;
    state.clusters = clusterVectors(model.vectors, model.documents);
    state.similarities = buildSimilarityMatrix(model.vectors);
    state.clusterInfo = describeClusters(papers, model.documents, state.clusters);
    state.edges = buildEdges(state.similarities, state.clusters);
    readPalette();
    setDimensions();
    initializeNodes();
    renderLegend();
    renderTopicCloud();
    renderBridges();
    emitClusterCatalog();
    selectPaper(chooseInitialPaper());
    bindCanvas();
    elements.reset.addEventListener("click", () => resetFilters(true));
    elements.zoomOut.addEventListener("click", () => zoomAt(state.width / 2, state.height / 2, 0.8));
    elements.zoomIn.addEventListener("click", () => zoomAt(state.width / 2, state.height / 2, 1.25));
    elements.zoomFit.addEventListener("click", fitView);
    new ResizeObserver(() => {
      if (setDimensions()) {
        initializeNodes();
        runSimulation();
      }
    }).observe(elements.plot);
    runSimulation();
  }

  function themeChanged() {
    if (!state.papers.length) return;
    readPalette();
    renderLegend();
    draw();
  }

  function languageChanged() {
    if (!state.papers.length) return;
    renderLegend();
    renderTopicCloud();
    renderBridges();
    syncTimeFilter();
    if (state.selected !== null) selectPaper(state.selected);
    emitClusterCatalog();
    draw();
  }

  window.addEventListener("dit:language-change", languageChanged);

  window.DiTLandscape = {
    init,
    themeChanged,
    clearTopicFilter,
    resetFilters,
    setClusterFilter,
    setExternalFilter,
    setTimePreset,
    setTimeRange,
  };
})();
