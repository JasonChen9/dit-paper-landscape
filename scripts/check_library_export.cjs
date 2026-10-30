/* Offline contract check. Pass a pre-refactor app.js path to compare all catalog exports. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(read(name));
const downloads = [];
let currentBlob;
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-30T08:00:00.000Z'])); }
}
const document = {
  documentElement: {},
  querySelector: () => null,
  querySelectorAll: () => [],
  body: {append() {}},
  createElement: () => ({click() { downloads.push({filename:this.download, blob:currentBlob}); }, remove() {}}),
};
const context = vm.createContext({
  document, Date:FixedDate, console, Blob,
  URL:{createObjectURL(blob) { currentBlob=blob; return 'blob:offline-export'; }, revokeObjectURL() {}},
  localStorage:{getItem:() => 'en', setItem() {}},
  CustomEvent:class { constructor(type, details) { this.type=type;this.detail=details?.detail; } },
  window:{addEventListener() {}, dispatchEvent() {}, setTimeout() {}},
});
vm.runInContext(read('site/i18n.js'), context);
vm.runInContext(read('site/catalog.js'), context);
vm.runInContext(read('site/export.js'), context);
const taxonomy=json('catalog/taxonomy.json');
const summaries=json('catalog/summaries_en.json');
const details=json('catalog/paper_details.json').papers;
const classes=json('catalog/paper_taxonomy.json').papers;
const papers=context.window.DiTCatalog.parseCSV(read('catalog/papers.csv')).map(paper => ({
  ...paper, summary_en:summaries[paper.arxiv_id], details:details[paper.arxiv_id],
  taxonomy:classes[paper.arxiv_id], primary_topic:classes[paper.arxiv_id].primary_topic,
}));
const api=context.window.DiTExport;
const checks=[];
const check=(name, run) => { run(); checks.push(name); };
const normalizeHTML=value => value.replace(/>\s+</g, '><');
let baseline;
if (process.argv[2] && fs.existsSync(path.resolve(process.argv[2]))) {
  const source=fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
  assert.match(source, /\ninitialize\(\);\s*$/);
  vm.runInContext(source.replace(/\ninitialize\(\);\s*$/, '\n')+'\nglobalThis.baseline={state,markdownExport,htmlExport,filterDescription};', context);
  baseline=context.baseline;
  baseline.state.taxonomy=taxonomy;
}
const representative={arxiv_id:'fixture',short_title:'Example',title:'Example Paper',authors:'Author A;Author B',key_authors:'Author A|first',published:'2026-01-02',primary_topic:'systems',dit_relation:'system',venue:'Example Conf',venue_url:'https://example.org/paper',source_label:'arXiv',arxiv_url:'https://arxiv.org/abs/2601.00001',pdf_url:'https://example.org/paper.pdf',topic_tags:'training;serving',details:{background:{en:'A setting.',zh:'应用场景。'},challenge:{en:'A problem.',zh:'关键问题。'},method:{en:'A method.',zh:'解决方法。'},result:{en:'A reported result.',zh:'报告结果。'}}};
const expectedMarkdown={
  en:[
    '# Diffusion Intelligence Atlas Export','',
    '- Paper count: 1','- Filters: Fixture collection','- Generated: 2026-10-30T08:00:00.000Z','',
    '## 1. [Example Paper](https://example.org/paper)','',
    '- Short title: Example','- Authors: Author A;Author B','- Key authors: Author A|first','- Published: 2026-01-02',
    '- Primary topic: Systems & Execution Efficiency','- DiT relationship: Systems optimization','- Venue: Example Conf',
    '- Tags: `training` · `serving`','- Example Conf: [https://example.org/paper](https://example.org/paper)',
    '- arXiv: [https://arxiv.org/abs/2601.00001](https://arxiv.org/abs/2601.00001)',
    '- PDF: [https://example.org/paper.pdf](https://example.org/paper.pdf)','',
    '- **Background:** A setting.','- **Challenge:** A problem.','- **Method:** A method.','- **Results:** A reported result.','',
  ].join('\n'),
  zh:[
    '# Diffusion Intelligence Atlas 导出','',
    '- 论文数量：1','- 筛选条件：Fixture collection','- 生成时间：2026-10-30T08:00:00.000Z','',
    '## 1. [Example Paper](https://example.org/paper)','',
    '- 简称：Example','- 作者：Author A;Author B','- 关键作者：Author A|first','- 发表日期：2026-01-02',
    '- 主类：系统与执行效率','- DiT 关系：系统优化','- 来源：Example Conf',
    '- 标签：`training` · `serving`','- Example Conf：[https://example.org/paper](https://example.org/paper)',
    '- arXiv：[https://arxiv.org/abs/2601.00001](https://arxiv.org/abs/2601.00001)',
    '- PDF：[https://example.org/paper.pdf](https://example.org/paper.pdf)','',
    '- **背景:** 应用场景。','- **挑战:** 关键问题。','- **方法:** 解决方法。','- **结果:** 报告结果。','',
  ].join('\n'),
};
for(const language of ['en','zh']) {
  context.window.DiTI18n.setLanguage(language);
  check(`${language}: representative Markdown retains the established format`,()=>assert.equal(api.markdown([representative],{taxonomy:{facets:{}},description:'Fixture collection'}),expectedMarkdown[language]));
  const options={taxonomy,description:baseline?baseline.filterDescription():'Selected library papers'};
  if(baseline) {
    check(`${language}: all ${papers.length} Markdown records match prior export`,()=>assert.equal(api.markdown(papers, options),baseline.markdownExport(papers)));
    check(`${language}: all ${papers.length} HTML records match prior export`,()=>assert.equal(normalizeHTML(api.html(papers, options)),normalizeHTML(baseline.htmlExport(papers))));
  }
  const selected=papers.slice(0,2);
  const note='Private note sentinel <img src=x onerror="alert(1)"> & <script>alert(1)</script>';
  const noted={...selected[0],note};
  check(`${language}: paper-attached notes never leak without explicit options`,()=>{
    assert.ok(!api.markdown([noted],options).includes('Private note sentinel'));
    assert.ok(!api.html([noted],options).includes('Private note sentinel'));
  });
  const withNotes={...options,notes:{[selected[0].arxiv_id]:note}};
  check(`${language}: explicit notes included only in matching selected paper`,()=>{
    const output=api.markdown(selected,withNotes);
    assert.equal(output.split('Private note sentinel').length-1,1);
    assert.ok(!api.markdown([selected[1]],withNotes).includes('Private note sentinel'));
  });
  check(`${language}: HTML treats notes as text`,()=>{
    const output=api.html(selected,withNotes);
    assert.ok(output.includes('&lt;img'));
    assert.ok(!output.includes('<img'));
    assert.ok(!output.includes('<script>'));
  });
}
(async()=>{
  const paper={...papers[0],venue_url:'javascript:alert(1)',arxiv_url:'data:text/html,evil',pdf_url:'javascript:evil()'};
  api.download([paper],'html',{taxonomy,description:'Selected papers'});
  const downloaded=await downloads.at(-1).blob.text();
  check('downloaded HTML strips non-http source links',()=>{
    assert.ok(!downloaded.includes('href="javascript:'));
    assert.ok(!downloaded.includes('href="data:'));
  });
  check('filename retains existing naming and selected paper count',()=>assert.equal(downloads.at(-1).filename,'diffusion-intelligence-papers-2026-10-30-1.html'));
  check('empty selection emits no download',()=>{const before=downloads.length;assert.equal(api.download([],'html'),null);assert.equal(downloads.length,before);});
  console.log(JSON.stringify({passed:true,checks:checks.length,baseline:baseline?process.argv[2]:null,legacyComparison:baseline?'passed':'skipped (optional pre-refactor snapshot unavailable)',details:checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
