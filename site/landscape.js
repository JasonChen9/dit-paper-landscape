(() => {
  const CATEGORY_LABELS = {
    "00_background": "背景锚点",
    "01_foundation_architecture": "基础架构",
    "02_video_long_context": "视频与长上下文",
    "03_efficiency_systems": "效率与系统",
    "04_rl_alignment": "RL 与对齐",
    "05_agent_world_robotics": "Agent 与世界模型",
    "06_omni_unified": "Omni 统一模型",
  };

  const FAMILIES = {
    architecture: {
      label: "表示与架构",
      tags: [
        "rae", "latent", "representation", "pixel-space", "tokenization", "single-stream",
        "hybrid-architecture", "scaling-law", "moe", "routing", "expert-design", "scaling",
        "foundation", "foundation-model", "image", "text-rendering", "editing", "conversion",
      ],
    },
    video: {
      label: "视频与长时生成",
      tags: [
        "video", "long-video", "streaming", "avatar", "real-time", "audio-driven", "mobile",
        "4d-consistency", "3d-constraint", "causal", "autoregressive", "world-consistency",
      ],
    },
    systems: {
      label: "系统与推理效率",
      tags: [
        "cache", "quantization", "sparse-attention", "kernel", "distributed", "parallelism",
        "pipeline", "serving", "scheduling", "communication", "overlap", "load-balancing",
        "inference", "compression", "efficiency", "engine", "speculation", "sequence-parallel",
        "training", "block-wise", "hierarchical",
      ],
    },
    rl: {
      label: "RL 与奖励",
      tags: [
        "rl", "grpo", "reward-model", "verifiable-reward", "alignment", "online",
        "forward-process", "gradient-estimation", "rollout", "spot-gpu", "3d-constraint",
        "4d-consistency", "reasoning", "visual-generation", "flow-matching",
      ],
    },
    agent: {
      label: "Agent 与世界模型",
      tags: [
        "robotics", "diffusion-policy", "cross-embodiment", "tactile", "bimanual", "world-model",
        "action", "interactive", "long-horizon", "language", "u-shape", "cross-embodiment",
      ],
    },
    omni: {
      label: "Omni 与多模态",
      tags: [
        "omni", "multimodal", "multi-output", "audio", "synchronization", "interleaved",
        "understanding", "generation", "perception", "unified-representation", "instruction",
        "image-editing", "prior-preservation", "decoupled", "unified", "prediction",
      ],
    },
  };

  const CLUSTER_COUNT = 6;
  const state = {
    papers: [],
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
    palette: [],
    animationToken: 0,
  };

  const elements = {};

  function paperTags(paper) {
    return paper.topic_tags
      .split(";")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
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
      const primary = FAMILIES[scores[0]?.family]?.label ?? "其他";
      const secondary = scores[1]?.score >= Math.max(1, scores[0]?.score * 0.5)
        ? FAMILIES[scores[1].family].label
        : null;
      return {
        cluster,
        members,
        name: secondary ? `${primary} × ${secondary}` : primary,
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
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    elements.canvas.width = Math.round(width * ratio);
    elements.canvas.height = Math.round(height * ratio);
    elements.canvas.style.height = `${height}px`;
    elements.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return true;
  }

  function initializeNodes() {
    const radius = Math.min(state.width, state.height) * 0.29;
    const centerX = state.width / 2;
    const centerY = state.height / 2;
    state.nodes = state.papers.map((paper, index) => {
      const cluster = state.clusters[index];
      const angle = (cluster / CLUSTER_COUNT) * Math.PI * 2 - Math.PI / 2;
      const jitterAngle = hashNumber(`${paper.arxiv_id}:a`) * Math.PI * 2;
      const jitterRadius = 20 + hashNumber(`${paper.arxiv_id}:r`) * 62;
      return {
        index,
        cluster,
        x: centerX + Math.cos(angle) * radius + Math.cos(jitterAngle) * jitterRadius,
        y: centerY + Math.sin(angle) * radius + Math.sin(jitterAngle) * jitterRadius,
        vx: 0,
        vy: 0,
      };
    });
  }

  function forceStep() {
    const nodes = state.nodes;
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const dx = nodes[right].x - nodes[left].x;
        const dy = nodes[right].y - nodes[left].y;
        const distanceSquared = Math.max(80, dx * dx + dy * dy);
        const force = 12 / distanceSquared;
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
      const desired = 38 + (1 - edge.similarity) * 82;
      const force = (distance - desired) * (0.0025 + edge.similarity * 0.009);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    const clusterCenters = Array.from({ length: CLUSTER_COUNT }, () => ({ x: 0, y: 0, count: 0 }));
    nodes.forEach((node) => {
      clusterCenters[node.cluster].x += node.x;
      clusterCenters[node.cluster].y += node.y;
      clusterCenters[node.cluster].count += 1;
    });
    clusterCenters.forEach((center) => {
      if (center.count) {
        center.x /= center.count;
        center.y /= center.count;
      }
    });

    nodes.forEach((node) => {
      const clusterCenter = clusterCenters[node.cluster];
      node.vx += (clusterCenter.x - node.x) * 0.0024;
      node.vy += (clusterCenter.y - node.y) * 0.0024;
      node.vx += (state.width / 2 - node.x) * 0.0032;
      node.vy += (state.height / 2 - node.y) * 0.0032;
      if (node.x < 38) node.vx += (38 - node.x) * 0.025;
      if (node.x > state.width - 38) node.vx -= (node.x - state.width + 38) * 0.025;
      if (node.y < 38) node.vy += (38 - node.y) * 0.025;
      if (node.y > state.height - 38) node.vy -= (node.y - state.height + 38) * 0.025;
      node.vx *= 0.84;
      node.vy *= 0.84;
      node.x = Math.max(17, Math.min(state.width - 17, node.x + node.vx));
      node.y = Math.max(17, Math.min(state.height - 17, node.y + node.vy));
    });
  }

  function isNodeActive(node) {
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
      const highlighted = focus !== null
        && (edge.source === focus && focusNeighbors.has(edge.target)
          || edge.target === focus && focusNeighbors.has(edge.source));
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.strokeStyle = highlighted ? state.palette[source.cluster] : edgeColor;
      context.globalAlpha = highlighted ? 0.7 : 0.18 + edge.similarity * 0.25;
      context.lineWidth = highlighted ? 1.6 : 0.8;
      context.stroke();
    }

    state.nodes.forEach((node) => {
      const active = isNodeActive(node);
      const selected = state.selected === node.index;
      const hovered = state.hovered === node.index;
      const degree = state.edges.filter((edge) => edge.source === node.index || edge.target === node.index).length;
      const radius = (selected ? 7.5 : hovered ? 6.8 : 4.3) + Math.min(1.8, degree * 0.12);
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fillStyle = state.palette[node.cluster];
      context.globalAlpha = active ? 0.94 : 0.12;
      context.fill();
      if (selected || hovered) {
        context.strokeStyle = labelColor;
        context.globalAlpha = 0.9;
        context.lineWidth = 1.5;
        context.stroke();
      }
      if (selected || hovered) {
        const paper = state.papers[node.index];
        context.globalAlpha = 1;
        context.fillStyle = labelColor;
        context.font = "500 12px Roboto, sans-serif";
        const label = paper.short_title;
        const labelWidth = context.measureText(label).width;
        const x = Math.min(state.width - labelWidth - 7, node.x + 10);
        const y = Math.max(14, node.y - 10);
        context.fillText(label, x, y);
      }
    });
    context.globalAlpha = 1;
  }

  function runSimulation() {
    const token = ++state.animationToken;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      for (let index = 0; index < 180; index += 1) forceStep();
      draw();
      return;
    }
    let iterations = 0;
    const frame = () => {
      if (token !== state.animationToken) return;
      for (let step = 0; step < 4; step += 1) forceStep();
      draw();
      iterations += 4;
      if (iterations < 220) requestAnimationFrame(frame);
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
    eyebrow.textContent = `${cluster.name} · ${CATEGORY_LABELS[paper.category]}`;
    const title = document.createElement("h3");
    title.textContent = paper.short_title;
    const fullTitle = document.createElement("p");
    fullTitle.className = "selection-full-title";
    fullTitle.textContent = paper.title;
    const summary = document.createElement("p");
    summary.textContent = paper.summary_zh;
    const links = document.createElement("div");
    links.className = "selection-links";
    links.append(link("arXiv ↗", paper.arxiv_url), link("PDF ↗", paper.pdf_url));

    const neighborTitle = document.createElement("h4");
    neighborTitle.textContent = "最接近的工作";
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
      label.querySelector("strong").textContent = info.name;
      label.querySelector("small").textContent = `${info.members.length} 篇 · ${info.topTags.join(" / ")}`;
      button.append(swatch, label);
      button.addEventListener("click", () => {
        state.activeCluster = state.activeCluster === cluster ? null : cluster;
        state.activeTag = null;
        renderLegend();
        renderTopicCloud();
        draw();
      });
      elements.legend.append(button);
    });
  }

  function renderTopicCloud() {
    const counts = new Map();
    state.papers.forEach((paper) => paperTags(paper).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    const tags = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 24);
    const max = Math.max(...tags.map(([, count]) => count));
    const min = Math.min(...tags.map(([, count]) => count));
    elements.cloud.replaceChildren();
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
        renderLegend();
        renderTopicCloud();
        draw();
      });
      elements.cloud.append(button);
    });
  }

  function renderBridges() {
    const pairs = [];
    for (let left = 0; left < state.papers.length; left += 1) {
      for (let right = left + 1; right < state.papers.length; right += 1) {
        if (state.papers[left].category === state.papers[right].category) continue;
        if (state.papers[left].window !== "in-window" || state.papers[right].window !== "in-window") continue;
        pairs.push({ left, right, similarity: state.similarities[left][right] });
      }
    }
    const selected = [];
    const signatures = new Set();
    pairs.sort((left, right) => right.similarity - left.similarity).forEach((pair) => {
      if (selected.length >= 6 || pair.similarity < 0.12) return;
      const signature = [state.papers[pair.left].category, state.papers[pair.right].category].sort().join(":");
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
      meta.textContent = `${CATEGORY_LABELS[state.papers[pair.left].category]} × ${CATEGORY_LABELS[state.papers[pair.right].category]} · ${Math.round(pair.similarity * 100)}%`;
      button.append(titles, meta);
      button.addEventListener("click", () => selectPaper(pair.left));
      elements.bridges.append(button);
    });
  }

  function pointerNode(event) {
    const rect = elements.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null;
    let nearestDistance = 14;
    state.nodes.forEach((node) => {
      if (!isNodeActive(node)) return;
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    });
    return { node: nearest, x, y };
  }

  function bindCanvas() {
    elements.canvas.addEventListener("pointermove", (event) => {
      const { node, x, y } = pointerNode(event);
      state.hovered = node?.index ?? null;
      elements.canvas.style.cursor = node ? "pointer" : "default";
      if (node) {
        const paper = state.papers[node.index];
        elements.tooltip.textContent = `${paper.short_title} · ${CATEGORY_LABELS[paper.category]}`;
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
    elements.canvas.addEventListener("pointerleave", () => {
      state.hovered = null;
      elements.tooltip.hidden = true;
      draw();
    });
    elements.canvas.addEventListener("click", (event) => {
      const { node } = pointerNode(event);
      if (node) selectPaper(node.index);
    });
  }

  function chooseInitialPaper() {
    let best = 0;
    let bestScore = -1;
    state.similarities.forEach((row, index) => {
      if (state.papers[index].window !== "in-window") return;
      const crossThemeScore = row.reduce((sum, similarity, other) =>
        sum + (state.papers[index].category !== state.papers[other].category ? similarity : 0), 0);
      if (crossThemeScore > bestScore) {
        best = index;
        bestScore = crossThemeScore;
      }
    });
    return best;
  }

  function reset() {
    state.activeCluster = null;
    state.activeTag = null;
    state.hovered = null;
    initializeNodes();
    renderLegend();
    renderTopicCloud();
    selectPaper(chooseInitialPaper());
    runSimulation();
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
    });
    if (Object.values(elements).some((element) => !element)) return;
    elements.context = elements.canvas.getContext("2d");
    state.papers = papers;
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
    selectPaper(chooseInitialPaper());
    bindCanvas();
    elements.reset.addEventListener("click", reset);
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

  window.DiTLandscape = { init, themeChanged };
})();
