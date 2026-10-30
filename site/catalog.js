(() => {
  let pending;
  function parseCSV(text) {
    const rows = []; let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ""; }
      else if (char === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
      else field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const headers = rows.shift() || [];
    return rows.filter(values => values.some(Boolean)).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  }
  async function load() {
    if (pending) return pending;
    pending = (async () => {
      const version = document.querySelector('meta[name="deploy-version"]')?.content || "local";
      async function get(name, kind = "json") {
        const response = await fetch(`./data/${name}?v=${encodeURIComponent(version)}`, {cache:"no-store"});
        if (!response.ok) throw new Error(`Catalog ${name}: HTTP ${response.status}`);
        return response[kind]();
      }
      const [csv, summaries, abstracts, details, taxonomy, classifications, aliases] = await Promise.all([
        get("papers.csv", "text"), get("summaries_en.json"), get("abstracts.json"),
        get("paper_details.json"), get("taxonomy.json"), get("paper_taxonomy.json"), get("id_aliases.json"),
      ]);
      const topics = new Set(taxonomy.topics.map(topic => topic.id));
      const papers = parseCSV(csv).map(paper => {
        const classification = classifications.papers[paper.arxiv_id];
        if (!classification || !topics.has(classification.primary_topic)) throw new Error(`Missing classification: ${paper.arxiv_id}`);
        const abstract = abstracts.papers[paper.arxiv_id] || {};
        return {...paper, summary_en:summaries[paper.arxiv_id] || "", abstract_en:abstract.en || "", abstract_zh:abstract.zh || "",
          abstract_source_url:abstract.source_url || "", abstract_source:abstract.source || "", abstract_zh_kind:abstract.zh_kind || "",
          details:details.papers[paper.arxiv_id] || null, taxonomy:classification, primary_topic:classification.primary_topic};
      });
      return {papers, taxonomy, aliases:aliases.aliases || {}, abstracts:abstracts.papers};
    })().catch(error => { pending = null; throw error; });
    return pending;
  }
  window.DiTCatalog = {load, parseCSV};
})();
