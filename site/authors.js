(() => {
  const t = (key, values) => window.DiTI18n.t(key, values);
  const CLUSTER_COUNT = 7;
  const state = {
    papers: [],
    profiles: [],
    paperClusters: new Map(),
    similarities: [],
    edges: [],
    nodes: [],
    palette: [],
    selected: null,
    hovered: null,
    activeFilterName: null,
    externalIds: null,
    timeStart: -Infinity,
    timeEnd: Infinity,
    width: 0,
    height: 0,
    virtualWidth: 0,
    virtualHeight: 0,
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
    viewAnimationFrame: null,
    animationToken: 0,
    search: "",
    precomputedPositions: null,
  };
  const elements = {};

  function publishedDay(value) {
    return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
  }

  function splitValues(value) {
    return String(value || "").split(";").map((item) => item.trim()).filter(Boolean);
  }

  function parseKeyAuthors(paper) {
    return splitValues(paper.key_authors).map((entry) => {
      const [name, roleText = "first"] = entry.split("|", 2);
      return {
        name: name.trim(),
        roles: roleText.split("+").map((role) => role.trim()).filter(Boolean),
      };
    }).filter(({ name }) => name);
  }

  function hashNumber(value) {
    let hash = 2166136261;
    for (const char of value) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function buildProfiles({ computeSimilarity = true } = {}) {
    const profiles = new Map();
    state.papers.forEach((paper, paperIndex) => {
      const tags = splitValues(paper.topic_tags).map((tag) => tag.toLowerCase());
      parseKeyAuthors(paper).forEach(({ name, roles }) => {
        if (!profiles.has(name)) {
          profiles.set(name, {
            name,
            papers: [],
            paperIds: new Set(),
            tagCounts: new Map(),
            roleCounts: new Map(),
            clusterCounts: new Map(),
            cluster: 0,
          });
        }
        const profile = profiles.get(name);
        profile.papers.push({ paper, paperIndex, roles });
        profile.paperIds.add(paper.arxiv_id);
        tags.forEach((tag) => profile.tagCounts.set(tag, (profile.tagCounts.get(tag) || 0) + 1));
        roles.forEach((role) => profile.roleCounts.set(role, (profile.roleCounts.get(role) || 0) + 1));
        const cluster = state.paperClusters.get(paper.arxiv_id);
        if (Number.isInteger(cluster)) {
          profile.clusterCounts.set(cluster, (profile.clusterCounts.get(cluster) || 0) + 1);
        }
      });
    });
    state.profiles = [...profiles.values()].sort(
      (left, right) => right.papers.length - left.papers.length || left.name.localeCompare(right.name, "en"),
    );
    updateProfileClusters();
    if (computeSimilarity) buildSimilarityModel();
  }

  function updateProfileClusters() {
    state.profiles.forEach((profile) => {
      profile.clusterCounts = new Map();
      profile.papers.forEach(({ paper }) => {
        const cluster = state.paperClusters.get(paper.arxiv_id);
        if (Number.isInteger(cluster)) {
          profile.clusterCounts.set(cluster, (profile.clusterCounts.get(cluster) || 0) + 1);
        }
      });
      profile.cluster = [...profile.clusterCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? 0;
    });
  }

  function buildSimilarityModel() {
    const vocabulary = [...new Set(state.profiles.flatMap((profile) => [...profile.tagCounts.keys()]))].sort();
    const frequencies = new Map(vocabulary.map((tag) => [tag, 0]));
    state.profiles.forEach((profile) => profile.tagCounts.forEach((_, tag) => frequencies.set(tag, frequencies.get(tag) + 1)));
    const vectors = state.profiles.map((profile) => {
      const values = vocabulary.map((tag) => {
        const count = profile.tagCounts.get(tag) || 0;
        if (!count) return 0;
        return (1 + Math.log(count)) * (Math.log((state.profiles.length + 1) / (frequencies.get(tag) + 1)) + 1);
      });
      const norm = Math.hypot(...values) || 1;
      return values.map((value) => value / norm);
    });
    state.similarities = vectors.map((vector, left) => vectors.map((other, right) => {
      if (left === right) return 1;
      let similarity = 0;
      for (let dimension = 0; dimension < vector.length; dimension += 1) similarity += vector[dimension] * other[dimension];
      const sharedPaper = state.profiles[left].papers.some(({ paper }) => state.profiles[right].paperIds.has(paper.arxiv_id));
      return Math.min(1, similarity + (sharedPaper ? 0.3 : 0));
    }));
    const edgeMap = new Map();
    state.similarities.forEach((row, source) => {
      row.map((similarity, target) => ({ target, similarity }))
        .filter(({ target, similarity }) => target !== source && similarity >= 0.1)
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, 3)
        .forEach(({ target, similarity }) => {
          const left = Math.min(source, target);
          const right = Math.max(source, target);
          const key = `${left}:${right}`;
          if (!edgeMap.has(key) || edgeMap.get(key).similarity < similarity) {
            edgeMap.set(key, { source: left, target: right, similarity });
          }
        });
    });
    state.edges = [...edgeMap.values()];
  }

  function readPalette() {
    const styles = getComputedStyle(document.documentElement);
    state.palette = Array.from({ length: CLUSTER_COUNT }, (_, index) => styles.getPropertyValue(`--cluster-${index + 1}`).trim());
  }

  function setDimensions() {
    const rect = elements.plot.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width));
    const height = Math.max(390, Math.min(540, Math.round(width * 0.62)));
    if (Math.abs(width - state.width) < 4 && state.nodes.length) return false;
    state.width = width;
    state.height = height;
    const authorScale = Math.sqrt(Math.max(1, state.profiles.length));
    state.virtualHeight = Math.max(980, height * 1.9, authorScale * 84);
    state.virtualWidth = Math.max(1520, width * 1.55, state.virtualHeight * 1.9);
    state.view.initialized = false;
    state.view.manual = false;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    elements.canvas.width = Math.round(width * ratio);
    elements.canvas.height = Math.round(height * ratio);
    elements.canvas.style.height = `${height}px`;
    elements.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return true;
  }

  function initializeNodes() {
    const slots = [
      [0.5, 0.27], [0.25, 0.31], [0.75, 0.31], [0.13, 0.72],
      [0.38, 0.7], [0.63, 0.7], [0.87, 0.72],
    ];
    const clusterCounts = Array(CLUSTER_COUNT).fill(0);
    state.profiles.forEach((profile) => { clusterCounts[profile.cluster] += 1; });
    const ranks = Array(CLUSTER_COUNT).fill(0);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    state.nodes = state.profiles.map((profile, index) => {
      const rank = ranks[profile.cluster]++;
      const count = Math.max(1, clusterCounts[profile.cluster]);
      const angle = rank * goldenAngle + hashNumber(profile.name) * 0.6;
      const radius = Math.min(state.virtualHeight * 0.21, Math.max(120, Math.sqrt(count) * 36));
      const distance = radius * 0.84 * Math.sqrt((rank + 0.65) / count);
      const [slotX, slotY] = slots[profile.cluster];
      const precomputed = state.precomputedPositions?.[index];
      const x = Number.isFinite(precomputed?.x)
        ? precomputed.x * state.virtualWidth
        : state.virtualWidth * slotX + Math.cos(angle) * distance;
      const y = Number.isFinite(precomputed?.y)
        ? precomputed.y * state.virtualHeight
        : state.virtualHeight * slotY + Math.sin(angle) * distance;
      return {
        index, cluster: profile.cluster, x, y, anchorX: x, anchorY: y, vx: 0, vy: 0,
        driftPhase: hashNumber(`${profile.name}:phase`) * Math.PI * 2,
        driftSpeed: 0.00135 + hashNumber(`${profile.name}:speed`) * 0.00085,
        driftAmplitude: 2.8 + hashNumber(`${profile.name}:amplitude`) * 1.8,
      };
    });
    if (!state.precomputedPositions) {
      for (let iteration = 0; iteration < 110; iteration += 1) forceStep(slots);
    }
    state.nodes.forEach((node) => { node.anchorX = node.x; node.anchorY = node.y; });
    updateViewTarget(true, true);
  }

  function forceStep(slots) {
    for (let left = 0; left < state.nodes.length; left += 1) {
      for (let right = left + 1; right < state.nodes.length; right += 1) {
        const a = state.nodes[left];
        const b = state.nodes[right];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.max(1, Math.hypot(dx, dy));
        const minimum = 27 + Math.sqrt(state.profiles[left].papers.length + state.profiles[right].papers.length) * 3;
        if (distance < minimum) {
          const push = (minimum - distance) * 0.08;
          dx /= distance;
          dy /= distance;
          a.vx -= dx * push;
          a.vy -= dy * push;
          b.vx += dx * push;
          b.vy += dy * push;
        }
      }
    }
    state.edges.forEach((edge) => {
      const source = state.nodes[edge.source];
      const target = state.nodes[edge.target];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const desired = 68 + (1 - edge.similarity) * 116;
      const force = (distance - desired) * (0.001 + edge.similarity * 0.0035);
      source.vx += (dx / distance) * force;
      source.vy += (dy / distance) * force;
      target.vx -= (dx / distance) * force;
      target.vy -= (dy / distance) * force;
    });
    state.nodes.forEach((node) => {
      const [slotX, slotY] = slots[node.cluster];
      node.vx += (state.virtualWidth * slotX - node.x) * 0.0008;
      node.vy += (state.virtualHeight * slotY - node.y) * 0.0008;
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x += node.vx;
      node.y += node.vy;
    });
  }

  function updateViewTarget(immediate = false, force = false) {
    if (!state.nodes.length) return;
    const padding = 90;
    const minX = Math.min(...state.nodes.map((node) => node.x)) - padding;
    const maxX = Math.max(...state.nodes.map((node) => node.x)) + padding;
    const minY = Math.min(...state.nodes.map((node) => node.y)) - padding;
    const maxY = Math.max(...state.nodes.map((node) => node.y)) + padding;
    const scale = Math.min((state.width - 72) / (maxX - minX), (state.height - 62) / (maxY - minY), 1.15);
    state.view.fitScale = scale;
    state.view.fitOffsetX = state.width / 2 - ((minX + maxX) / 2) * scale;
    state.view.fitOffsetY = state.height / 2 - ((minY + maxY) / 2) * scale;
    if (state.view.manual && !force) return;
    state.view.targetScale = scale;
    state.view.targetOffsetX = state.view.fitOffsetX;
    state.view.targetOffsetY = state.view.fitOffsetY;
    if (immediate || !state.view.initialized) {
      state.view.scale = scale;
      state.view.offsetX = state.view.fitOffsetX;
      state.view.offsetY = state.view.fitOffsetY;
      state.view.initialized = true;
    }
  }

  function screenPosition(node) {
    return { x: node.x * state.view.scale + state.view.offsetX, y: node.y * state.view.scale + state.view.offsetY };
  }

  function startViewAnimation() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.view.scale = state.view.targetScale;
      state.view.offsetX = state.view.targetOffsetX;
      state.view.offsetY = state.view.targetOffsetY;
      draw();
      return;
    }
    if (state.viewAnimationFrame !== null) return;
    const frame = () => {
      state.view.scale += (state.view.targetScale - state.view.scale) * 0.17;
      state.view.offsetX += (state.view.targetOffsetX - state.view.offsetX) * 0.17;
      state.view.offsetY += (state.view.targetOffsetY - state.view.offsetY) * 0.17;
      const settled = Math.abs(state.view.targetScale - state.view.scale) < 0.0002
        && Math.abs(state.view.targetOffsetX - state.view.offsetX) < 0.05
        && Math.abs(state.view.targetOffsetY - state.view.offsetY) < 0.05;
      if (settled) {
        state.view.scale = state.view.targetScale;
        state.view.offsetX = state.view.targetOffsetX;
        state.view.offsetY = state.view.targetOffsetY;
        state.viewAnimationFrame = null;
        draw();
        return;
      }
      draw();
      state.viewAnimationFrame = requestAnimationFrame(frame);
    };
    state.viewAnimationFrame = requestAnimationFrame(frame);
  }

  function zoomAt(screenX, screenY, factor, smooth = false) {
    const animate = smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const currentScale = animate ? state.view.targetScale : state.view.scale;
    const currentOffsetX = animate ? state.view.targetOffsetX : state.view.offsetX;
    const currentOffsetY = animate ? state.view.targetOffsetY : state.view.offsetY;
    const nextScale = Math.max(state.view.fitScale * 0.7, Math.min(state.view.fitScale * 6, currentScale * factor));
    const worldX = (screenX - currentOffsetX) / currentScale;
    const worldY = (screenY - currentOffsetY) / currentScale;
    state.view.targetScale = nextScale;
    state.view.targetOffsetX = screenX - worldX * nextScale;
    state.view.targetOffsetY = screenY - worldY * nextScale;
    state.view.manual = true;
    if (!animate) {
      state.view.scale = nextScale;
      state.view.offsetX = state.view.targetOffsetX;
      state.view.offsetY = state.view.targetOffsetY;
    }
    draw();
    if (animate) startViewAnimation();
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
    if (!state.nodes.length) return;
    state.view.manual = false;
    const immediate = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    updateViewTarget(immediate, true);
    draw();
    if (!immediate) startViewAnimation();
  }

  function availablePapers(profile) {
    return profile.papers.filter(({ paper }) => {
      const day = publishedDay(paper.published);
      return day >= state.timeStart && day <= state.timeEnd
        && (state.externalIds === null || state.externalIds.has(paper.arxiv_id));
    });
  }

  function isNodeActive(node) {
    return availablePapers(state.profiles[node.index]).length > 0;
  }

  function nearestAuthors(index, limit = 5) {
    return state.similarities[index].map((similarity, candidate) => ({ candidate, similarity }))
      .filter(({ candidate }) => candidate !== index)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit);
  }

  function draw() {
    if (!elements.context) return;
    const context = elements.context;
    const styles = getComputedStyle(document.documentElement);
    const edgeColor = styles.getPropertyValue("--landscape-edge").trim();
    const labelColor = styles.getPropertyValue("--text").trim();
    const zoomRatio = state.view.scale / Math.max(0.001, state.view.fitScale);
    context.clearRect(0, 0, state.width, state.height);
    const focus = state.hovered ?? state.selected;
    const neighbors = new Set(focus === null ? [] : nearestAuthors(focus, 5).map(({ candidate }) => candidate));
    const labelBoxes = [];
    state.edges.forEach((edge) => {
      const source = state.nodes[edge.source];
      const target = state.nodes[edge.target];
      const a = screenPosition(source);
      const b = screenPosition(target);
      const active = isNodeActive(source) && isNodeActive(target);
      const highlighted = active && focus !== null
        && (edge.source === focus && neighbors.has(edge.target) || edge.target === focus && neighbors.has(edge.source));
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.strokeStyle = highlighted ? state.palette[source.cluster] : edgeColor;
      context.globalAlpha = active ? (highlighted ? 0.72 : 0.13 + edge.similarity * 0.18) : 0.02;
      context.lineWidth = highlighted ? 1.6 : 0.75;
      context.stroke();
    });
    state.nodes.forEach((node) => {
      const point = screenPosition(node);
      const profile = state.profiles[node.index];
      const activeCount = availablePapers(profile).length;
      const active = activeCount > 0;
      const selected = node.index === state.selected;
      const hovered = node.index === state.hovered;
      const radius = (selected ? 8.4 : hovered ? 7.2 : 4.4) + Math.min(4, Math.sqrt(profile.papers.length) * 1.25);
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fillStyle = state.palette[node.cluster] || state.palette[0];
      context.globalAlpha = active ? 0.96 : 0.09;
      context.fill();
      if (selected || hovered) {
        context.lineWidth = selected ? 2 : 1.4;
        context.strokeStyle = labelColor;
        context.globalAlpha = active ? 0.94 : 0.25;
        context.stroke();
      }
      const showLabel = selected
        || hovered
        || profile.papers.length >= 3
        || (zoomRatio >= 1.4 && profile.papers.length >= 2)
        || zoomRatio >= 1.9;
      const inViewport = point.x >= 0 && point.x <= state.width && point.y >= 0 && point.y <= state.height;
      if (active && showLabel && inViewport) {
        const fontSize = selected ? 12 : 10;
        const fontWeight = selected ? 600 : 500;
        const align = point.x > state.width - 130 ? "right" : "left";
        const labelX = point.x + (align === "right" ? -radius - 6 : radius + 6);
        context.font = `${fontWeight} ${fontSize}px Roboto, sans-serif`;
        const textWidth = context.measureText(profile.name).width;
        const box = {
          left: align === "right" ? labelX - textWidth : labelX,
          right: align === "right" ? labelX : labelX + textWidth,
          top: point.y - fontSize * 0.62,
          bottom: point.y + fontSize * 0.62,
        };
        const overlaps = labelBoxes.some((placed) => !(box.right + 4 < placed.left
          || box.left - 4 > placed.right
          || box.bottom + 3 < placed.top
          || box.top - 3 > placed.bottom));
        if (overlaps && !selected && !hovered) return;
        labelBoxes.push(box);
        context.fillStyle = labelColor;
        context.globalAlpha = selected || hovered ? 1 : 0.72;
        context.textAlign = align;
        context.textBaseline = "middle";
        context.fillText(profile.name, labelX, point.y);
      }
    });
    context.globalAlpha = 1;
  }

  function topTags(profile) {
    return [...profile.tagCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6)
      .map(([tag]) => tag);
  }

  function roleLabel(role) {
    return t({ first: "authors.roleFirst", "co-first": "authors.roleCoFirst", corresponding: "authors.roleCorresponding" }[role] || role);
  }

  function selectAuthor(index) {
    if (!Number.isInteger(index) || !state.profiles[index]) return;
    state.selected = index;
    const profile = state.profiles[index];
    const papers = availablePapers(profile);
    elements.selection.replaceChildren();
    const eyebrow = document.createElement("p");
    eyebrow.className = "selection-eyebrow";
    eyebrow.textContent = t(papers.length === 1 ? "authors.paperCountOne" : "authors.paperCount", { count: papers.length });
    const title = document.createElement("h3");
    title.textContent = profile.name;
    const roles = document.createElement("p");
    roles.textContent = [...profile.roleCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([role, count]) => `${roleLabel(role)} ${count}`)
      .join(" · ");
    const tags = document.createElement("p");
    tags.className = "selection-full-title";
    tags.textContent = topTags(profile).join(" / ");
    const paperHeading = document.createElement("h4");
    paperHeading.textContent = t("authors.papersHeading");
    const list = document.createElement("div");
    list.className = "neighbor-list";
    (papers.length ? papers : profile.papers).slice().sort((left, right) => right.paper.published.localeCompare(left.paper.published)).forEach(({ paper }) => {
      const link = document.createElement("a");
      link.href = paper.arxiv_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = paper.short_title;
      list.append(link);
    });
    const relatedHeading = document.createElement("h4");
    relatedHeading.textContent = t("authors.relatedHeading");
    const related = document.createElement("div");
    related.className = "neighbor-list";
    nearestAuthors(index, 4).forEach(({ candidate, similarity }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${state.profiles[candidate].name} · ${Math.round(similarity * 100)}%`;
      button.addEventListener("click", () => selectAuthor(candidate));
      related.append(button);
    });
    elements.selection.append(eyebrow, title, roles, tags, paperHeading, list, relatedHeading, related);
    renderIndex();
    draw();
  }

  function emitAuthorFilter(profile) {
    window.dispatchEvent(new CustomEvent("dit:landscape-topic-filter", {
      detail: profile ? { ids: [...profile.paperIds], label: profile.name, source: "author", cluster: null }
        : { ids: null, label: "", source: null, cluster: null },
    }));
  }

  function toggleAuthor(index) {
    const profile = state.profiles[index];
    const clearing = state.activeFilterName === profile.name;
    state.activeFilterName = clearing ? null : profile.name;
    selectAuthor(index);
    emitAuthorFilter(clearing ? null : profile);
  }

  function renderIndex() {
    if (!elements.index) return;
    const query = state.search.toLocaleLowerCase("en");
    const entries = state.profiles.map((profile, index) => ({ profile, index, count: availablePapers(profile).length }))
      .filter(({ profile, count }) => count > 0 && profile.name.toLocaleLowerCase("en").includes(query))
      .sort((left, right) => right.count - left.count || left.profile.name.localeCompare(right.profile.name, "en"));
    elements.index.replaceChildren(...entries.map(({ profile, index, count }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "author-index-entry";
      button.classList.toggle("active", state.activeFilterName === profile.name);
      button.setAttribute("aria-pressed", String(state.activeFilterName === profile.name));
      const name = document.createElement("strong");
      name.textContent = profile.name;
      const total = document.createElement("span");
      total.textContent = String(count);
      button.append(name, total);
      button.addEventListener("click", () => toggleAuthor(index));
      return button;
    }));
    elements.indexCount.textContent = t("authors.indexCount", { count: entries.length, total: state.profiles.length });
    const availablePaperIds = new Set();
    const availableAuthors = state.profiles.filter((profile) => {
      const papers = availablePapers(profile);
      papers.forEach(({ paper }) => availablePaperIds.add(paper.arxiv_id));
      return papers.length;
    }).length;
    elements.mapCount.textContent = t("authors.mapCount", { authors: availableAuthors, papers: availablePaperIds.size });
  }

  function pointerNode(event) {
    const rect = elements.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null;
    let distance = Infinity;
    state.nodes.forEach((node) => {
      const point = screenPosition(node);
      const nextDistance = Math.hypot(point.x - x, point.y - y);
      if (nextDistance < distance && nextDistance < 16) {
        nearest = node;
        distance = nextDistance;
      }
    });
    return { node: nearest, x, y };
  }

  function bindCanvas() {
    let pan = null;
    let suppressClick = false;
    let lastWheelAt = 0;
    let trackpadSeries = false;
    elements.canvas.addEventListener("pointermove", (event) => {
      if (pan) {
        const dx = event.clientX - pan.x;
        const dy = event.clientY - pan.y;
        if (Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY) > 3) pan.moved = true;
        pan.x = event.clientX;
        pan.y = event.clientY;
        panView(dx, dy);
        return;
      }
      const { node, x, y } = pointerNode(event);
      state.hovered = node?.index ?? null;
      elements.canvas.style.cursor = node ? "pointer" : "grab";
      if (node) {
        const profile = state.profiles[node.index];
        elements.tooltip.textContent = `${profile.name} · ${t(profile.papers.length === 1 ? "authors.paperCountOne" : "authors.paperCount", { count: profile.papers.length })}`;
        elements.tooltip.style.left = `${Math.min(state.width - 225, x + 12)}px`;
        elements.tooltip.style.top = `${Math.max(8, y - 28)}px`;
        elements.tooltip.hidden = false;
      } else {
        elements.tooltip.hidden = true;
      }
      draw();
    });
    elements.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || pointerNode(event).node) return;
      pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      elements.canvas.setPointerCapture(event.pointerId);
      elements.canvas.classList.add("is-panning");
    });
    const finishPan = (event) => {
      if (!pan || event.pointerId !== pan.pointerId) return;
      suppressClick = pan.moved;
      if (elements.canvas.hasPointerCapture(event.pointerId)) elements.canvas.releasePointerCapture(event.pointerId);
      pan = null;
      elements.canvas.classList.remove("is-panning");
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
      if (suppressClick) { suppressClick = false; return; }
      const { node } = pointerNode(event);
      if (node) toggleAuthor(node.index);
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
        if (event.deltaMode === 0 && (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 50)) trackpadSeries = true;
        if (trackpadSeries) panView(-event.deltaX, -event.deltaY);
        else zoomAt(x, y, event.deltaY > 0 ? 0.86 : 1.16);
      }
      state.hovered = null;
      elements.tooltip.hidden = true;
    }, { passive: false });
  }

  function startAmbientMotion() {
    const token = ++state.animationToken;
    let previous = performance.now();
    const frame = (now) => {
      if (token !== state.animationToken) return;
      const elapsed = Math.min(50, now - previous);
      previous = now;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        state.nodes.forEach((node) => {
          node.driftPhase += elapsed * node.driftSpeed;
          node.x = node.anchorX + Math.sin(node.driftPhase) * node.driftAmplitude;
          node.y = node.anchorY + Math.cos(node.driftPhase * 0.81) * node.driftAmplitude * 0.72;
        });
        draw();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function setExternalFilter(ids) {
    state.externalIds = Array.isArray(ids) ? new Set(ids) : null;
    renderIndex();
    if (state.selected !== null) selectAuthor(state.selected);
    draw();
  }

  function setTimeRange(start, end) {
    const from = publishedDay(start);
    const to = publishedDay(end);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      state.timeStart = from;
      state.timeEnd = to;
      renderIndex();
      if (state.selected !== null) selectAuthor(state.selected);
      draw();
    }
  }

  function setTimePreset(preset) {
    if (!state.papers.length) return;
    const selected = preset === "all" || preset === "custom" ? state.papers : state.papers.filter((paper) => paper.window === preset);
    const days = selected.map((paper) => publishedDay(paper.published)).filter(Number.isFinite);
    if (days.length) {
      state.timeStart = Math.min(...days);
      state.timeEnd = Math.max(...days);
      renderIndex();
      if (state.selected !== null) selectAuthor(state.selected);
      draw();
    }
  }

  function setClusters(clusters) {
    if (!Array.isArray(clusters)) return;
    state.paperClusters = new Map();
    clusters.forEach((cluster) => cluster.ids?.forEach((id) => state.paperClusters.set(id, Number(cluster.id))));
    if (!state.profiles.length) return;
    updateProfileClusters();
    setDimensions();
    initializeNodes();
    startAmbientMotion();
    renderIndex();
    draw();
  }

  function resetFilters() {
    state.activeFilterName = null;
    state.search = "";
    elements.search.value = "";
    state.externalIds = null;
    setTimePreset("all");
    selectAuthor(0);
    renderIndex();
    fitView();
  }

  function clearAuthorFilter() {
    if (state.activeFilterName === null) return;
    state.activeFilterName = null;
    renderIndex();
    draw();
  }

  function themeChanged() {
    readPalette();
    draw();
  }

  function languageChanged() {
    renderIndex();
    if (state.selected !== null) selectAuthor(state.selected);
  }

  function validPrecomputed(papers, payload) {
    return payload?.algorithmVersion === 1
      && Array.isArray(payload.paperIds)
      && payload.paperIds.length === papers.length
      && payload.paperIds.every((id, index) => id === papers[index].arxiv_id)
      && Array.isArray(payload.authors?.names)
      && Array.isArray(payload.authors?.similarities)
      && Array.isArray(payload.authors?.edges)
      && Array.isArray(payload.authors?.positions);
  }

  function init(papers, precomputedPayload = null) {
    if (!papers?.length || state.papers.length) return;
    Object.assign(elements, {
      canvas: document.querySelector("#author-landscape-canvas"),
      plot: document.querySelector("#landscape-plot"),
      tooltip: document.querySelector("#author-landscape-tooltip"),
      selection: document.querySelector("#author-landscape-selection"),
      mapCount: document.querySelector("#author-map-count"),
      index: document.querySelector("#author-index"),
      indexCount: document.querySelector("#author-index-count"),
      search: document.querySelector("#author-search-input"),
      zoomOut: document.querySelector("#author-zoom-out"),
      zoomIn: document.querySelector("#author-zoom-in"),
      zoomFit: document.querySelector("#author-zoom-fit"),
    });
    if (Object.values(elements).some((element) => !element)) return;
    elements.context = elements.canvas.getContext("2d");
    state.papers = papers;
    const usePrecomputed = validPrecomputed(papers, precomputedPayload);
    buildProfiles({ computeSimilarity: !usePrecomputed });
    const authorDataMatches = usePrecomputed
      && precomputedPayload.authors.names.length === state.profiles.length
      && precomputedPayload.authors.names.every((name, index) => name === state.profiles[index].name)
      && precomputedPayload.authors.similarities.length === state.profiles.length
      && precomputedPayload.authors.positions.length === state.profiles.length;
    document.documentElement.dataset.authorData = authorDataMatches ? "precomputed" : "client";
    if (authorDataMatches) {
      state.similarities = precomputedPayload.authors.similarities;
      state.edges = precomputedPayload.authors.edges;
      state.precomputedPositions = precomputedPayload.authors.positions;
    } else if (usePrecomputed) {
      buildSimilarityModel();
    }
    readPalette();
    setDimensions();
    initializeNodes();
    selectAuthor(0);
    renderIndex();
    bindCanvas();
    elements.search.addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      renderIndex();
    });
    elements.zoomOut.addEventListener("click", () => zoomAt(state.width / 2, state.height / 2, 0.8, true));
    elements.zoomIn.addEventListener("click", () => zoomAt(state.width / 2, state.height / 2, 1.25, true));
    elements.zoomFit.addEventListener("click", fitView);
    new ResizeObserver(() => {
      if (setDimensions()) {
        initializeNodes();
        startAmbientMotion();
      }
    }).observe(elements.plot);
    startAmbientMotion();
  }

  window.addEventListener("dit:landscape-clusters-ready", (event) => setClusters(event.detail?.clusters));
  window.addEventListener("dit:language-change", languageChanged);

  window.DiTAuthors = {
    init,
    clearAuthorFilter,
    fitView,
    resetFilters,
    setClusters,
    setExternalFilter,
    setTimePreset,
    setTimeRange,
    themeChanged,
  };
})();
