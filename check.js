// Logic checks for the app. Run with: make check
const assert = require('node:assert');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(update, done) {
    const next = typeof update === 'function' ? update(this.state) : update;
    if (next) this.state = { ...this.state, ...next };
    if (done) done();
  }
}
const window = {};
const location = { search: '', hash: '', href: 'http://x/', origin: 'http://x', pathname: '/' };
// Every top-level name the checks use; a name not defined yet comes back undefined so its tests fail, not the load.
const NAMES = ['Component', 'parseMap', 'serializeMap', 'DEFAULT_META', 'newMapText', 'colorFor', 'THEMES', 'encodeShare', 'decodeShare',
  'sharePayload', 'nextName', 'composeGraph', 'refCycle', 'titlePath', 'compareMaps', 'questionRows', 'sizeOf'];
const app = new Function('DCLogic', 'location', 'window', m[1] + '\n;return Object.fromEntries(' + JSON.stringify(NAMES) +
  '.map((n) => { try { return [n, eval(n)]; } catch (e) { return [n, undefined]; } }));')(DCLogic, location, window);
const { Component, parseMap, serializeMap, DEFAULT_META, newMapText } = app;

let failed = 0;
let passed = 0;
const pending = [];
function test(name, fn) {
  const fail = (e) => { failed++; console.error(`FAIL ${name}\n  ${e.message}`); };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') pending.push(r.then(() => { passed++; }, fail));
    else passed++;
  } catch (e) { fail(e); }
}

function boot(text) {
  window.TREE_START = text === undefined ? undefined : { text };
  return new Component({});
}

// Walks the template the way the runtime does and returns every {{binding}} that resolves to undefined.
const template = html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>')).replace(/<!--[\s\S]*?-->/g, '');
// The runtime also resolves names on the component itself (e.g. ref callbacks), so pass it as `c`.
function unresolved(vals, c = {}) {
  const out = new Set();
  const lookup = (scopes, expr) => {
    const e = expr.trim();
    if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(e)) return e;
    const [head, ...rest] = e.split('.');
    const scope = [...scopes].reverse().find((sc) => (sc === c ? head in sc : Object.prototype.hasOwnProperty.call(sc, head)));
    if (!scope) return undefined;
    return rest.reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), scope[head]);
  };
  const scopes = [c, vals];
  const blocks = [];
  let dead = 0;
  const re = /<(\/?)(sc-for|sc-if)\b([^>]*)>|\{\{([^}]+)\}\}/g;
  for (let t; (t = re.exec(template)) !== null;) {
    if (t[4] !== undefined) {
      if (!dead && lookup(scopes, t[4]) === undefined) out.add(t[4].trim());
    } else if (t[1] === '/') {
      const b = blocks.pop();
      if (b.dead) dead--;
      if (b.scoped) scopes.pop();
    } else if (dead) {
      blocks.push({ dead: true, scoped: false }); dead++;
    } else if (t[2] === 'sc-if') {
      const expr = t[3].match(/value="\{\{([^}]+)\}\}"/)[1];
      const v = lookup(scopes, expr);
      if (v === undefined) out.add(expr.trim());
      if (v) blocks.push({ dead: false, scoped: false });
      else { blocks.push({ dead: true, scoped: false }); dead++; }
    } else {
      const expr = t[3].match(/list="\{\{([^}]+)\}\}"/)[1];
      const as = t[3].match(/as="([^"]+)"/)[1];
      const v = lookup(scopes, expr);
      if (!Array.isArray(v)) out.add(expr.trim());
      if (Array.isArray(v) && v.length) { scopes.push({ [as]: v[0] }); blocks.push({ dead: false, scoped: true }); }
      else { blocks.push({ dead: true, scoped: false }); dead++; }
    }
  }
  return [...out];
}

// ---------------------------------------------------------------- boot and layouts
const SMALL = '# Root\n- A {x:0.5 y:0.7}\n  - A1\n- B #core\n';

test('every layout renders with no unresolved bindings', () => {
  for (const layout of ['radial', 'tree', 'directory']) {
    const c = boot(SMALL);
    c.setState({ layout });
    assert.deepEqual(unresolved(c.renderVals(), c), [], layout);
    assert.equal(c.state.nodes.length, 4, layout);
  }
});

// ---------------------------------------------------------------- the file format
const FULL = `---
x: Importance
y: Support
color: y
colorMode: split
colorLeft: #C0392B
colorRight: #1E8449
reverse: true
theme: night
tag.evidence: fill #E3F1F6; border none solid; opacity 1
tag.risk: fill none; border #B4500A dashed; opacity 0.6
tag.core: fill none; border none solid; opacity 1
---

# Should we adopt X? #core {x:1}
Line one
line two
@ https://example.org/a.md
- Faster onboarding {x:0.8 y:0.9}
  - Survey of 40 new hires #evidence
    https://example.org/survey
  - Only x {x:0.25}
- Migration cost #risk {y:0.2}
  Unset values
`;

test('round trips a full map', () => {
  const m = parseMap(FULL);
  assert.equal(serializeMap(m), FULL);
  assert.deepEqual(parseMap(serializeMap(m)), m);
  assert.equal(m.nodes[0], m.root);
  assert.equal(m.root.note, 'Line one\nline two');
  assert.deepEqual(m.root.refs, ['https://example.org/a.md']);
  assert.equal(m.meta.theme, 'night');
  assert.deepEqual(m.meta.tagStyles.risk, { fill: null, border: '#B4500A', borderStyle: 'dashed', opacity: 0.6 });
});

test('titles that look like syntax survive', () => {
  for (const title of ['Issue #12', 'Budget {draft}', 'C# and F#']) {
    const nodes = [{ id: 'p0', parent: null, title: 'R', x: null, y: null, tags: [], note: '', refs: [] },
      { id: 'p1', parent: 'p0', title, x: null, y: null, tags: [], note: '', refs: [] }];
    const back = parseMap(serializeMap({ meta: DEFAULT_META, nodes }));
    assert.equal(back.nodes[1].title, title);
    assert.deepEqual(back.nodes[1].tags, []);
  }
});

test('notes that look like structure survive', () => {
  const note = '- not a child\n@ https://x.org/a.md\n# not a root\n\\back\n  indented';
  for (const parent of [null, 'p0']) {
    const nodes = [{ id: 'p0', parent: null, title: 'R', x: null, y: null, tags: [], note: parent === null ? note : '', refs: [] },
      { id: 'p1', parent: 'p0', title: 'A', x: null, y: null, tags: [], note: parent === null ? '' : note, refs: [] }];
    const back = parseMap(serializeMap({ meta: DEFAULT_META, nodes }));
    assert.equal(back.nodes.length, 2);
    assert.equal(back.nodes[parent === null ? 0 : 1].note, note);
    assert.deepEqual(back.nodes[0].refs, []);
  }
});

test('unknown front matter key is a line-numbered error', () => {
  assert.throws(() => parseMap('---\nfoo: 1\n---\n# R'), (e) => e.message.startsWith('Line 2:'));
  assert.throws(() => parseMap('---\ncolorMode: rainbow\n---\n# R'), (e) => e.message.startsWith('Line 2:'));
  assert.throws(() => parseMap('---\ntag.x: fill red\n---\n# R'), (e) => e.message.startsWith('Line 2:'));
});

test('defaults', () => {
  assert.deepEqual(parseMap(newMapText()).meta, DEFAULT_META);
  assert.deepEqual(DEFAULT_META.dims, { x: 'Importance', y: 'Support' });
  assert.equal(DEFAULT_META.colorDim, 'y');
  assert.equal(DEFAULT_META.colorMode, 'scale');
  assert.equal(DEFAULT_META.reverse, false);
  assert.equal(DEFAULT_META.theme, 'paper');
  assert.deepEqual(Object.keys(DEFAULT_META.tagStyles), ['evidence']);
});

test('the app starts on the map it was given, with its settings', () => {
  const c = boot(FULL);
  assert.deepEqual(c.state.dims, { x: 'Importance', y: 'Support' });
  assert.equal(c.state.colorDim, 'y');
  assert.equal(c.state.theme, 'night');
  assert.deepEqual(app.Component.prototype.metaOf.call(c), parseMap(FULL).meta);
});

test('a loaded ref adds its nodes once, under the ref root', () => {
  const own = parseMap('# R\n@ https://a.org/m.md\n').nodes;
  const tree = parseMap('# Theirs\n- T1\n');
  const g = app.composeGraph(own, { [own[0].id + ' https://a.org/m.md']: { status: 'loaded', tree } });
  assert.deepEqual(g.map((n) => n.title), ['R', 'Theirs', 'T1']);
});

Promise.all(pending).then(() => {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
});
