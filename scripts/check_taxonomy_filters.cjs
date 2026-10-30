const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const original = fs.readFileSync(`${root}/site/app.js`, 'utf8');
if (!/\ninitialize\(\);\s*$/.test(original)) throw new Error('Cannot safely remove initialization entry point');
const source = original.replace(/\ninitialize\(\);\s*$/, '\n');
class NodeStub {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this.classList = { toggle() {} }; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener() {}
}
const elements = new Map();
const context = vm.createContext({
  document: {
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new NodeStub()); return elements.get(selector); },
    createElement(tag) { return new NodeStub(tag); },
    createTextNode(text) { const node = new NodeStub('#text'); node.textContent = text; return node; },
  },
  window: { DiTI18n: { t: (key) => key, language: 'en' } },
  console,
});
vm.runInContext(`${source}\nglobalThis.probe = { state, matchesPaper, facetValues, renderFacetFilters };`, context, { filename: `${root}/site/app.js` });
const {state, matchesPaper, renderFacetFilters} = context.probe;
state.taxonomy = JSON.parse(fs.readFileSync(`${root}/catalog/taxonomy.json`, 'utf8'));
const fixture = [
  ['P1', 'systems', ['video'], ['serving', 'memory'], 'systems-research'],
  ['P2', 'systems', ['language'], ['runtime'], 'systems-research;robotics-library'],
  ['P3', 'vla', ['robotics'], ['serving'], 'robotics-library'],
  ['P4', 'agent', ['language'], [], 'original'],
  ['P5', 'systems', ['video', 'robotics'], ['training', 'memory'], 'original;robotics-library'],
  ['P6', 'foundation', ['general'], [], 'original'],
].map(([id, primary_topic, application_domains, system_layers, collection_tags]) => ({ arxiv_id:id, primary_topic, taxonomy:{ primary_topic, application_domains, system_layers }, collection_tags, dit_relation:'direct', published:'2026-01-01', window:'in-window' }));
state.papers = fixture;
const report = { source: 'site/app.js matchesPaper and renderFacetFilters executed in Node vm; only final initialize() call removed', source_sha256: crypto.createHash('sha256').update(original).digest('hex'), network_calls: 0, fixture, checks: [] };
function reset() {
  Object.assign(state, {cluster:'all', query:'', relation:'all', window:'all', topicIds:null, topicSource:null});
  for (const key of Object.keys(state.facets)) state.facets[key] = new Set();
}
function ids(options = {}) { return fixture.filter((paper) => matchesPaper(paper, options)).map((paper) => paper.arxiv_id); }
function check(name, expected, actual, explanation) {
  try { assert.deepEqual(actual, expected); report.checks.push({name, passed:true, expected, actual, explanation}); }
  catch (error) { report.checks.push({name, passed:false, expected, actual, explanation, error:error.message}); }
}
reset();
check('empty selections impose no restrictions', ['P1','P2','P3','P4','P5','P6'], ids(), 'All primary, facet, secondary and time selectors are empty/all.');
state.facets.domains = new Set(['video','robotics']);
check('OR within application domains', ['P1','P3','P5'], ids(), 'A multi-domain paper is emitted once.');
reset(); state.facets.layers = new Set(['serving','runtime']);
check('OR within system layers', ['P1','P2','P3'], ids());
reset(); state.facets.collections = new Set(['systems-research','robotics-library']);
check('OR within source collections', ['P1','P2','P3','P5'], ids());
state.facets.domains = new Set(['video','robotics']);
state.facets.layers = new Set(['serving','runtime']);
state.facets.collections = new Set(['systems-research']);
check('AND across three dimensions', ['P1'], ids(), 'Video or robotics AND serving or runtime AND systems-research.');
reset(); state.cluster = '3'; state.topicSource = 'tag'; state.topicIds = new Set(['P1','P3','P4']);
check('primary topic intersects tag paper IDs', ['P1'], ids(), 'Cross-topic tag matches cannot overwrite systems primary selection.');
state.topicSource = 'author'; state.topicIds = new Set(['P2','P3','P5']);
check('primary topic intersects author paper IDs', ['P2','P5'], ids());
state.facets.domains = new Set(['video']);
check('primary plus author plus facet intersect', ['P5'], ids());
reset(); state.cluster = '3'; state.facets.domains = new Set(['video']); state.facets.layers = new Set(['runtime']); state.facets.collections = new Set(['systems-research']);
check('incompatible filters yield empty result', [], ids());
check('excludeFacet domains preserves other filters', ['P2'], ids({excludeFacet:'domains'}));
check('excludeFacet layers preserves other filters', ['P1'], ids({excludeFacet:'layers'}));
check('excludeFacet collections does not relax other dimensions', [], ids({excludeFacet:'collections'}));
renderFacetFilters();
const counts = {};
const visit = (node) => { if (node.dataset.facet) counts[`${node.dataset.facet}:${node.dataset.value}`] = Number(node.children.find((child) => child.className === 'facet-count').textContent); for (const child of node.children) visit(child); };
visit(elements.get('#facet-filters'));
check('rendered domain option counts exclude only current dimension', {video:0,robotics:0,language:1}, {video:counts['domains:video'],robotics:counts['domains:robotics'],language:counts['domains:language']});
check('rendered layer option counts exclude only current dimension', {serving:1,memory:1,runtime:0}, {serving:counts['layers:serving'],memory:counts['layers:memory'],runtime:counts['layers:runtime']});
check('rendered source counts preserve incompatible other filters', {'original':0,'systems-research':0,'robotics-library':0}, Object.fromEntries(['original','systems-research','robotics-library'].map((key) => [key,counts[`collections:${key}`]])));
reset(); state.cluster='3'; state.topicSource='author'; state.topicIds=new Set(['P2','P3','P5']);
check('primary category counts can omit only primary selection', ['P2','P3','P5'], ids({includePrimary:false}));
check('omit secondary IDs retains primary selection', ['P1','P2','P5'], ids({includeTopic:false}));
reset(); state.topicIds=new Set();
check('empty secondary result set is distinct from no selection', [], ids());
report.passed = report.checks.every((item) => item.passed);
report.check_count = report.checks.length;
if (process.argv[2]) fs.writeFileSync(process.argv[2], `${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({passed:report.passed, checks:report.check_count, failures:report.checks.filter((item) => !item.passed), result:process.argv[2] || null}));
if (!report.passed) process.exitCode=1;
