(() => {
  let catalog;
  let entries = new Map();
  const expansionOverrides = new Map();
  const t = (key, values) => window.DiTI18n.t(key, values);
  const localized = value => typeof value === "string" ? value : value?.[window.DiTI18n.language] || value?.en || "";
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function externalLink(label, url) {
    if (!/^https?:\/\//.test(url || "")) return element("span", "", label);
    const link = element("a", "", label);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }
  function relatedLinks(id) {
    const matches = (catalog?.relatedWork || []).filter(edge => edge.source_id === id || edge.target_id === id);
    if (!matches.length) return null;
    const section = element("div", "technical-related");
    section.append(element("span", "technical-related-label", t("resources.related")));
    for (const edge of matches) {
      const targetId = edge.source_id === id ? edge.target_id : edge.source_id;
      const target = entries.get(targetId);
      if (!target) continue;
      const link = element("a", "", target.short_title || (window.DiTI18n.language === "zh" ? target.title_zh : target.title) || target.title);
      link.href = target.arxiv_id ? `./?q=${encodeURIComponent(targetId)}#papers`
        : `./?q=${encodeURIComponent(targetId)}#resource-${encodeURIComponent(targetId)}`;
      link.title = localized(edge.reason);
      section.append(link);
    }
    return section;
  }
  function resourceCard(resource, query) {
    const card = element("details", "resource-card");
    card.id = `resource-${resource.id}`;
    card.dataset.resourceId = resource.id;
    card.open = expansionOverrides.get(resource.id) ?? (Boolean(query) || location.hash === `#${card.id}`);
    const heading = element("summary", "resource-heading");
    const title = window.DiTI18n.language === "zh" ? resource.title_zh || resource.title : resource.title;
    heading.append(element("span", "resource-title", title));
    heading.append(element("span", "resource-kind", t(resource.kind === "research-artifact" ? "resources.artifact" : "resources.article")));
    // Only user toggles override the query's default; programmatic open events do not.
    heading.addEventListener("click", event => {
      event.preventDefault();
      card.open = !card.open;
      expansionOverrides.set(resource.id, card.open);
    });
    card.append(heading);
    const body = element("div", "resource-body");
    const classification = element("div", "paper-classification");
    if (resource.published) classification.append(element("span", "", resource.published));
    if (resource.primary_topic) classification.append(element("span", "primary-topic-badge", t(`cluster.${resource.primary_topic}`)));
    for (const [dimension, field] of [["domains", "application_domains"], ["layers", "system_layers"]]) {
      const labels = catalog.taxonomy.facets[dimension].options
        .filter(option => (resource[field] || []).includes(option.id)).map(option => localized(option.label));
      if (labels.length) classification.append(element("span", "", `${t(`facet.${dimension}`)}: ${labels.join(" / ")}`));
    }
    body.append(classification);
    if (["background", "challenge", "method", "result"].every(key => localized(resource.details?.[key]))) {
      const details = element("dl", "paper-details");
      for (const key of ["background", "challenge", "method", "result"]) {
        details.append(element("dt", "", t(`paper.${key}`)), element("dd", "", localized(resource.details[key])));
      }
      body.append(details);
    } else body.append(element("p", "summary", localized(resource.description)));
    if (resource.source_notes) body.append(element("p", "resource-note", localized(resource.source_notes)));
    const links = element("div", "card-links");
    links.append(externalLink(`${t("paper.source")} ↗`, resource.url));
    for (const link of resource.supplementary_links || []) {
      links.append(externalLink(`${localized(link.label || link.title) || t("resources.supplement")} ↗`, link.url));
    }
    body.append(links);
    const related = relatedLinks(resource.id);
    if (related) body.append(related);
    card.append(body);
    return card;
  }
  function render(query = "") {
    if (!catalog) return;
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const resources = catalog.resources.filter(resource => {
      const text = JSON.stringify(resource).toLowerCase();
      return words.every(word => text.includes(word));
    }).sort((a, b) => (b.published || "").localeCompare(a.published || ""));
    document.querySelector("#resource-count").textContent = t("resources.count", {count:resources.length, total:catalog.resources.length});
    document.querySelector("#resource-list").replaceChildren(...resources.map(resource => resourceCard(resource, query)));
    document.querySelector("#resource-empty").hidden = resources.length > 0;
  }
  function init(value) {
    catalog = value;
    entries = new Map([...value.papers.map(paper => [paper.arxiv_id, paper]), ...value.resources.map(resource => [resource.id, resource])]);
    if (location.hash.startsWith("#resource-")) {
      requestAnimationFrame(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());
    }
  }
  window.DiTResources = {init, render, relatedLinks};
})();
