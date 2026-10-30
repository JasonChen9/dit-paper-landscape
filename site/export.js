(() => {
const t = (key, values) => window.DiTI18n.t(key, values);
const noteLabel = () => window.DiTI18n.language === "zh" ? "我的批注" : "My notes";
const relationLabel = value => t(`relation.${value}`);
const clusterLabelForPaper = paper => paper.primary_topic ? t(`cluster.${paper.primary_topic}`) : "—";
function facetLabels(paper, dimension, taxonomy) {
  const definition = taxonomy?.facets?.[dimension];
  if (!definition) return [];
  const values = dimension === "collections" ? (paper.collection_tags || "").split(";") : paper.taxonomy?.[definition.field] || [];
  return definition.options.filter(option => values.includes(option.id)).map(option => option.label[window.DiTI18n.language] || option.label.en);
}
function safeURL(value) { return /^https?:\/\//i.test(value || "") ? value : ""; }
function paperSource(paper) { return {url:safeURL(paper.venue_url || paper.arxiv_url), label:paper.venue_url ? paper.venue : paper.source_label || t("paper.source")}; }
function paperSummary(paper) { return window.DiTI18n.language === "zh" ? paper.summary_zh : paper.summary_en || paper.summary_zh; }
function paperDetails(paper) { return ["background", "challenge", "method", "result"].map(key => ({key, text:paper.details?.[key]?.[window.DiTI18n.language] || ""})).filter(item => item.text); }
function escapeMarkdown(value) {
  return String(value ?? "").replace(/([\\[\]*_`])/g, "\\$1");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function detailMarkdown(paper) {
  const details = paperDetails(paper);
  return details.length ? details.map(({ key, text }) => `- **${t(`paper.${key}`)}:** ${escapeMarkdown(text)}`).join("\n")
    : escapeMarkdown(paperSummary(paper));
}

function detailHTML(paper) {
  const details = paperDetails(paper);
  return details.length ? details.map(({ key, text }) => `<p><strong>${escapeHTML(t(`paper.${key}`))}:</strong> ${escapeHTML(text)}</p>`).join("")
    : `<p>${escapeHTML(paperSummary(paper))}</p>`;
}

function exportFilename(extension, count) {
  const date = new Date().toISOString().slice(0, 10);
  return `diffusion-intelligence-papers-${date}-${count}.${extension}`;
}

function downloadText(content, filename, mimeType) {
  const blob = new Blob(["\ufeff", content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function markdownExport(papers, options = {}) {
  const generated = new Date().toISOString();
  const separator = window.DiTI18n.language === "zh" ? "：" : ": ";
  const sections = papers.map((paper, index) => {
    const tags = paper.topic_tags.split(";").filter(Boolean).map((tag) => `\`${escapeMarkdown(tag)}\``).join(" · ");
    return [
      `## ${index + 1}. [${escapeMarkdown(paper.title)}](${paperSource(paper).url || ""})`,
      "",
      `- ${t("export.shortTitle")}${separator}${escapeMarkdown(paper.short_title)}`,
      `- ${t("export.authors")}${separator}${escapeMarkdown(paper.authors)}`,
      `- ${t("export.keyAuthors")}${separator}${escapeMarkdown(paper.key_authors || "-")}`,
      `- ${t("export.published")}${separator}${paper.published}`,
      `- ${t("export.cluster")}${separator}${escapeMarkdown(clusterLabelForPaper(paper))}`,
      ...Object.keys(options.taxonomy?.facets || {}).map((dimension) => `- ${t(`facet.${dimension}`)}${separator}${escapeMarkdown(facetLabels(paper, dimension, options.taxonomy).join(" / ") || "—")}`),
      `- ${t("export.relation")}${separator}${escapeMarkdown(relationLabel(paper.dit_relation))}`,
      `- ${t("export.source")}${separator}${escapeMarkdown(paper.venue)}`,
      `- ${t("export.tags")}${separator}${tags || "-"}`,
      ...(paper.venue_url ? [`- ${escapeMarkdown(paper.venue)}${separator}[${paper.venue_url}](${paper.venue_url})`] : []),
      `- ${escapeMarkdown(paper.source_label || "arXiv")}${separator}[${paper.arxiv_url}](${paper.arxiv_url})`,
      `- PDF${separator}[${paper.pdf_url}](${paper.pdf_url})`,
      "",
      detailMarkdown(paper),
      ...(options.notes?.[paper.arxiv_id] ? ["", `### ${noteLabel()}`, "", escapeMarkdown(options.notes[paper.arxiv_id])] : []),
    ].join("\n");
  });
  return [
    `# ${t("export.title")}`,
    "",
    `- ${t("export.paperCount", { count: papers.length })}`,
    `- ${t("export.conditions", { value: escapeMarkdown((options.description || "")) })}`,
    `- ${t("export.generated", { value: generated })}`,
    "",
    ...sections,
    "",
  ].join("\n");
}

function htmlExport(papers, options = {}) {
  const generated = new Date().toISOString();
  const cards = papers.map((paper, index) => {
    const tags = paper.topic_tags.split(";").filter(Boolean).map((tag) => `<li>${escapeHTML(tag)}</li>`).join("");
    return `
      <article>
        <p class="meta">${index + 1} · ${escapeHTML(paper.published)} · ${escapeHTML(paper.venue)} · ${escapeHTML(relationLabel(paper.dit_relation))}</p>
        <h2><a href="${escapeHTML(paperSource(paper).url || "")}">${escapeHTML(paper.title)}</a></h2>
        <p class="short-title">${escapeHTML(paper.short_title)} · ${escapeHTML(clusterLabelForPaper(paper))}</p>
        <p class="authors">${escapeHTML(paper.authors)}</p>
        ${Object.keys(options.taxonomy?.facets || {}).map((dimension) => `<p class="meta">${escapeHTML(t(`facet.${dimension}`))}: ${escapeHTML(facetLabels(paper, dimension, options.taxonomy).join(" / ") || "—")}</p>`).join("")}
        ${detailHTML(paper)}
        ${options.notes?.[paper.arxiv_id] ? `<section><h3>${noteLabel()}</h3><p style="white-space:pre-wrap">${escapeHTML(options.notes[paper.arxiv_id])}</p></section>` : ""}
        <ul class="tags">${tags}</ul>
        <p class="links"><a href="${escapeHTML(paperSource(paper).url || "")}">${escapeHTML(paperSource(paper).label)}</a>${paper.venue_url && paper.arxiv_url !== paper.venue_url ? `<a href="${escapeHTML(paper.arxiv_url)}">${escapeHTML(paper.source_label || "Preprint")}</a>` : ""}${paper.pdf_url ? `<a href="${escapeHTML(paper.pdf_url)}">PDF</a>` : ""}</p>
      </article>`;
  }).join("");

  return `<!doctype html>
<html lang="${window.DiTI18n.language === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(t("export.title"))}</title>
  <style>
    :root { color-scheme: light dark; --bg: #fff; --text: #242424; --muted: #6c757d; --border: #d9d9d9; --accent: #2698ba; --tag: #f3f5f6; }
    @media (prefers-color-scheme: dark) { :root { --bg: #191919; --text: #e8e8e8; --muted: #a8a8a8; --border: #3b3b3b; --accent: #58b7d3; --tag: #25292b; } }
    * { box-sizing: border-box; }
    body { max-width: 900px; margin: 0 auto; padding: 48px 24px 80px; background: var(--bg); color: var(--text); font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { padding-bottom: 24px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0 0 8px; font-size: 2rem; }
    h2 { margin: 4px 0 5px; font-size: 1.2rem; line-height: 1.4; }
    a { color: var(--accent); }
    article { padding: 25px 0; border-bottom: 1px solid var(--border); }
    .meta, .short-title, .authors, header p { margin: 0; color: var(--muted); font-size: .85rem; }
    article > p { margin: 9px 0; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; padding: 0; list-style: none; }
    .tags li { padding: 2px 7px; border: 1px solid var(--border); border-radius: 3px; background: var(--tag); font-size: .75rem; }
    .links { display: flex; gap: 12px; }
    @media print { body { max-width: none; padding: 0; } article { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHTML(t("export.title"))}</h1>
    <p>${escapeHTML(t("export.paperCount", { count: papers.length }))}</p>
    <p>${escapeHTML((options.description || ""))}</p>
    <p>${escapeHTML(t("export.generated", { value: generated }))}</p>
  </header>
  <main>${cards}</main>
</body>
</html>`;
}


function download(papers, format, options = {}) {
  if (!papers.length) return null;
  if (!["markdown", "html"].includes(format)) throw new Error("Unknown export format");
  const safePapers = papers.map(p => ({...p, topic_tags:p.topic_tags || "", arxiv_url:safeURL(p.arxiv_url), venue_url:safeURL(p.venue_url), pdf_url:safeURL(p.pdf_url)}));
  const html = format === "html";
  const filename = exportFilename(html ? "html" : "md", papers.length);
  downloadText(html ? htmlExport(safePapers, options) : markdownExport(safePapers, options), filename, html ? "text/html" : "text/markdown");
  return {filename, count:papers.length, format:html ? "HTML" : "Markdown"};
}
window.DiTExport = {download, markdown:markdownExport, html:htmlExport, downloadText};
})();
