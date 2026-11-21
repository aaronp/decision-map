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

// ---------------------------------------------------------------- undo and redo
const key = (props) => ({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false, target: {}, preventDefault() {}, ...props });

test('undo and redo cover nodes and meta', () => {
  const c = boot(SMALL);
  const start = c.state.nodes;
  const a = c.state.nodes[1].id;
  c.patchNode(a, { title: 'Renamed' });
  c.setState({ dims: { ...c.state.dims, x: 'Cost' } });
  c.addChild(a);
  assert.equal(c.state.nodes.length, 5);
  c.undo(); c.undo(); c.undo();
  assert.equal(c.state.nodes, start);
  assert.equal(c.state.dims.x, 'Importance');
  c.redo(); c.redo(); c.redo();
  assert.equal(c.state.nodes.length, 5);
  assert.equal(c.state.nodes[1].title, 'Renamed');
  assert.equal(c.state.dims.x, 'Cost');
});

test('a drag is one step', () => {
  const c = boot(SMALL);
  const a = c.state.nodes[1].id;
  for (const x of [0.1, 0.2, 0.3]) c.edit((s) => ({ nodes: s.nodes.map((n) => (n.id === a ? { ...n, x } : n)) }), 'drag');
  c.endStep();
  assert.equal(c.state.nodes[1].x, 0.3);
  c.undo();
  assert.equal(c.state.nodes[1].x, 0.5);
  assert.equal(c.state.history.past.length, 0);
});

test('typing merges into one step, and the next kind of edit is its own step', () => {
  const c = boot(SMALL);
  const a = c.state.nodes[1].id;
  c.patchNode(a, { title: 'B' }, 'title:' + a);
  c.patchNode(a, { title: 'Bo' }, 'title:' + a);
  c.addChild(a);
  c.undo();
  assert.equal(c.state.nodes.length, 4);
  assert.equal(c.state.nodes[1].title, 'Bo');
  c.undo();
  assert.equal(c.state.nodes[1].title, 'A');
});

test('an edit marks the map changed', () => {
  const c = boot(SMALL);
  assert.equal(c.state.dirty, false);
  c.patchNode(c.state.nodes[1].id, { title: 'X' });
  assert.equal(c.state.dirty, true);
});

test('⌘Z and ⌘⇧Z, but not in a text field', () => {
  const c = boot(SMALL);
  c.patchNode(c.state.nodes[1].id, { title: 'X' });
  c.onGlobalKey(key({ target: { tagName: 'INPUT', type: 'text' } }));
  assert.equal(c.state.nodes[1].title, 'X');
  c.onGlobalKey(key());
  assert.equal(c.state.nodes[1].title, 'A');
  c.onGlobalKey(key({ shiftKey: true }));
  assert.equal(c.state.nodes[1].title, 'X');
});

// ---------------------------------------------------------------- colour and themes
test('colorFor', () => {
  const { colorFor } = app;
  const meta = (p) => ({ ...DEFAULT_META, ...p });
  assert.equal(colorFor(0, meta({})), '#EEF2FD');
  assert.equal(colorFor(1, meta({})), '#16307F');
  assert.equal(colorFor(0, meta({ colorMode: 'split' })), '#C0392B');
  assert.equal(colorFor(0.5, meta({ colorMode: 'split' })), '#DADAD3');
  assert.equal(colorFor(1, meta({ colorMode: 'split' })), '#1E8449');
  assert.equal(colorFor(0, meta({ colorMode: 'split', reverse: true })), '#1E8449');
  assert.equal(colorFor(1, meta({ reverse: true })), '#EEF2FD');
  assert.equal(colorFor(null, meta({})), '#DADAD3');
});

test('every theme renders, and sets the page colours', () => {
  for (const t of app.THEMES) {
    const c = boot(SMALL);
    c.setState({ theme: t.id, settingsOpen: true, settingsTab: 'theme' });
    const v = c.renderVals();
    assert.deepEqual(unresolved(v, c), [], t.id);
    assert.ok(v.themeVars.includes('--bg: ' + t.bg), t.id);
  }
});

test('?theme= overrides the map theme without saving it', () => {
  location.search = '?theme=night';
  const c = boot(SMALL);
  location.search = '';
  assert.ok(c.renderVals().themeVars.includes('--bg: #101216'));
  assert.equal(c.metaOf().theme, 'paper');
});

test('the colour mode settings render in both modes', () => {
  for (const colorMode of ['scale', 'split']) {
    const c = boot(SMALL);
    c.setState({ colorMode, settingsOpen: true, settingsTab: 'encoding' });
    assert.deepEqual(unresolved(c.renderVals(), c), [], colorMode);
  }
});

// ---------------------------------------------------------------- share links
test('share round trip, including non-ASCII text', async () => {
  const text = '# Ünïcødé 🌳 日本語\n- Ça va? #core {x:0.5}\n';
  const payload = await app.encodeShare(text);
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.equal(await app.decodeShare(payload), text);
});

test('sharePayload', () => {
  assert.equal(app.sharePayload('https://a.org/x#m=abc'), 'abc');
  assert.equal(app.sharePayload('https://a.org/x.md'), null);
  assert.equal(app.sharePayload('not a url'), null);
});

test('a broken share link keeps the current map', () => {
  const c = boot(SMALL);
  const before = c.state.nodes;
  assert.equal(c.openText('# R\n      - bad', 'x', { force: true }), false);
  assert.equal(c.state.nodes, before);
  assert.ok(c.state.loadError.startsWith('Line 2:'), c.state.loadError);
});

test('opening a map replaces the map, its settings and the history', () => {
  const c = boot(SMALL);
  c.patchNode(c.state.nodes[1].id, { title: 'X' });
  c.ask = () => true;
  assert.equal(c.openText(FULL, 'full'), true);
  assert.equal(c.state.nodes[0].title, 'Should we adopt X?');
  assert.equal(c.state.theme, 'night');
  assert.equal(c.state.history.past.length, 0);
  assert.equal(c.state.dirty, false);
  assert.equal(c.state.currentId, c.state.nodes[0].id);
});

test('unsaved, unnamed changes are only dropped after asking', () => {
  const c = boot(SMALL);
  c.patchNode(c.state.nodes[1].id, { title: 'X' });
  let asked = 0;
  c.ask = () => { asked++; return false; };
  assert.equal(c.openText(FULL, 'full'), false);
  assert.equal(asked, 1);
  assert.equal(c.state.nodes[1].title, 'X');
  c.setState({ savedName: 'Mine' });
  assert.equal(c.openText(FULL, 'full'), true);
  assert.equal(asked, 1);
});

test('the share link warns when long', async () => {
  const c = boot(SMALL);
  let copied = null;
  c.copy = async (t) => { copied = t; };
  await c.share();
  assert.ok(copied.startsWith('http://x/#m='));
  assert.equal(c.state.notice, 'Link copied');
  const big = '# R\n' + Array.from({ length: 2000 }, (_, i) => '- ' + Math.random().toString(36).repeat(3) + i).join('\n') + '\n';
  c.openText(big, 'big', { force: true });
  await c.share();
  assert.match(c.state.notice, /^Link copied, but it's \d+ characters/);
});

test('notices and load errors render', () => {
  const c = boot(SMALL);
  c.setState({ notice: 'Link copied', loadError: 'Line 2: bad' });
  const v = c.renderVals();
  assert.deepEqual(unresolved(v, c), []);
  assert.equal(v.hasNotice, true);
  assert.equal(v.hasLoadError, true);
});

// ---------------------------------------------------------------- saved maps and startup
function fakeStore(saved = []) {
  const db = new Map(saved.map((r) => [r.name, r]));
  return {
    db,
    list: async () => [...db.values()].sort((a, b) => b.updated - a.updated),
    put: async (name, text) => { db.set(name, { name, text, updated: Date.now() }); },
    del: async (name) => { db.delete(name); },
    rename: async (from, to) => { if (db.has(to)) throw new Error('taken'); db.set(to, { ...db.get(from), name: to }); db.delete(from); }
  };
}

test('nextName', () => {
  assert.equal(app.nextName('Plan', ['Plan', 'Plan 2']), 'Plan 3');
  assert.equal(app.nextName('Plan', []), 'Plan');
});

test('Save as stores the map and marks it saved', async () => {
  const c = boot(SMALL);
  c.store = fakeStore();
  c.patchNode(c.state.nodes[1].id, { title: 'X' });
  await c.saveAs('Plan');
  assert.equal(c.state.savedName, 'Plan');
  assert.equal(c.state.dirty, false);
  assert.equal(c.store.db.get('Plan').text, serializeMap({ meta: c.metaOf(), nodes: c.state.nodes }));
});

test('autosave writes a named map after an edit', async () => {
  const c = boot(SMALL);
  c.store = fakeStore();
  await c.saveAs('Plan');
  c.patchNode(c.state.nodes[1].id, { title: 'Later' });
  assert.equal(c.state.dirty, true);
  await c.autosave();
  assert.equal(c.state.dirty, false);
  assert.match(c.store.db.get('Plan').text, /- Later/);
});

test('startup opens the newest saved map, else a new map', async () => {
  const c = boot();
  c.store = fakeStore([{ name: 'Old', text: '# Old\n', updated: 1 }, { name: 'New', text: '# Newest\n', updated: 2 }]);
  await c.start();
  assert.equal(c.state.nodes[0].title, 'Newest');
  assert.equal(c.state.savedName, 'New');
  const d = boot();
  d.store = fakeStore();
  await d.start();
  assert.equal(d.state.nodes[0].title, 'What are you deciding?');
});

test('startup prefers a share link over ?src= and saved maps', async () => {
  const c = boot();
  c.store = fakeStore([{ name: 'Saved', text: '# Saved\n', updated: 1 }]);
  c.fetchMapText = async () => '# From src\n';
  location.hash = '#m=' + await app.encodeShare('# Shared\n');
  location.search = '?src=https://a.org/m.md';
  await c.start();
  assert.equal(c.state.nodes[0].title, 'Shared');
  location.hash = '';
  await c.start();
  assert.equal(c.state.nodes[0].title, 'From src');
  location.search = '';
});

test('?view= picks the starting view', () => {
  location.search = '?view=tree';
  const c = boot(SMALL);
  location.search = '';
  assert.equal(c.state.layout, 'tree');
});

test('the Open panel renders with saved maps', () => {
  const c = boot(SMALL);
  c.setState({ openPanel: true, saved: [{ name: 'Plan', text: '# P\n', updated: 1 }] });
  const v = c.renderVals();
  assert.deepEqual(unresolved(v, c), []);
  assert.equal(v.savedRows.length, 1);
});

// ---------------------------------------------------------------- refs
const REFMAP = '# Mine\n- Child\n  @ https://a.org/theirs.md\n';
function refBoot(texts) {
  const c = boot(REFMAP);
  c.fetches = [];
  c.fetchMapText = async (url) => { c.fetches.push(url); if (!(url in texts)) throw new Error(url + ': HTTP 404'); return texts[url]; };
  return c;
}
const childId = (c) => c.state.nodes[1].id;

test('a ref loads only when asked', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs #theirs\n- T1\n' });
  for (const layout of ['radial', 'tree', 'directory']) { c.setState({ layout }); c.renderVals(); }
  c.setState({ q: 'T1', searchOpen: true }); c.renderVals();
  c.currentText();
  assert.equal(c.fetches.length, 0);
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  assert.equal(c.fetches.length, 1);
  assert.deepEqual(c.graph().map((n) => n.title), ['Mine', 'Child', 'Theirs', 'T1']);
});

test('refs inside a loaded ref are refs too, and load only when asked', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs\n- T1\n  @ https://b.org/deeper.md\n', 'https://b.org/deeper.md': '# Deeper\n' });
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  const t1 = c.graph().find((n) => n.title === 'T1');
  assert.deepEqual(t1.refs, ['https://b.org/deeper.md']);
  const inner = c.graph().find((n) => n.kind === 'refRoot' && n.source === 'https://b.org/deeper.md');
  assert.equal(inner.loadStatus, 'idle');
  assert.equal(c.fetches.length, 1);
  await c.loadRef(t1.id, 'https://b.org/deeper.md');
  assert.ok(c.graph().some((n) => n.title === 'Deeper'));
});

test('a cycle never fetches', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs\n- T1\n  @ https://a.org/theirs.md\n' });
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  const t1 = c.graph().find((n) => n.title === 'T1');
  await c.loadRef(t1.id, 'https://a.org/theirs.md');
  assert.equal(c.fetches.length, 1);
  const r = c.graph().find((n) => n.parent === t1.id && n.kind === 'refRoot');
  assert.equal(r.loadStatus, 'error');
  assert.equal(c.state.refLoads[t1.id + ' https://a.org/theirs.md'].error, 'This map is already open above here');
});

test('a ref to the open map itself never fetches', async () => {
  const c = refBoot({});
  c.srcUrl = 'https://a.org/theirs.md';
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  assert.equal(c.fetches.length, 0);
  assert.equal(c.state.refLoads[childId(c) + ' https://a.org/theirs.md'].status, 'error');
});

test('a broken ref shows the line error', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# R\n      - bad' });
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  assert.ok(c.state.refLoads[childId(c) + ' https://a.org/theirs.md'].error.startsWith('Line 2:'));
});

test('ref tag styles stay out of the file, and loading a ref is not an edit', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '---\ntag.theirs: fill #F6DADA; border none solid; opacity 1\n---\n# Theirs #theirs\n- T1 #other\n' });
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  assert.doesNotMatch(c.currentText(), /tag\.theirs|tag\.other/);
  assert.equal(c.state.dirty, false);
  assert.equal(c.state.history.past.length, 0);
  for (const layout of ['radial', 'tree', 'directory']) { c.setState({ layout, currentId: c.graph().find((n) => n.title === 'T1').id }); assert.deepEqual(unresolved(c.renderVals(), c), [], layout); }
});

test('expanding an unloaded ref on the map loads it', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs\n- T1\n' });
  const node = c.renderVals().nodes.find((n) => n.title.includes('theirs'));
  assert.equal(node.hasKids, true);
  assert.equal(node.collapsed, true);
  await node.toggle();
  assert.equal(c.fetches.length, 1);
  assert.ok(c.graph().some((n) => n.title === 'T1'));
});

test('the share link of a ref is decoded, not fetched', async () => {
  const c = boot(SMALL);
  const link = 'https://elsewhere.org/app/#m=' + await app.encodeShare('# Shared\n');
  assert.equal(await c.fetchMapText(link), '# Shared\n');
});

Promise.all(pending).then(() => {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
});
