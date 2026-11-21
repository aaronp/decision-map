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
const replaced = [];
const storage = new Map();
// A stand-in for the page's title field, so checks can see what got focused and selected.
const titleField = { focused: 0, selected: 0, focus() { this.focused++; }, select() { this.selected++; } };
const queried = [];
const document = { querySelector: (sel) => { queried.push(sel); return sel.includes('title') || sel.includes('Title') ? titleField : null; } };
const window = { document, localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) }, history: { replaceState: (a, b, url) => replaced.push(url) } };
const location = { search: '', hash: '', href: 'http://x/', origin: 'http://x', pathname: '/' };
// Every top-level name the checks use; a name not defined yet comes back undefined so its tests fail, not the load.
const NAMES = ['Component', 'parseMap', 'serializeMap', 'DEFAULT_META', 'newMapText', 'colorFor', 'THEMES', 'encodeShare', 'decodeShare',
  'sharePayload', 'nextName', 'composeGraph', 'refCycle', 'titlePath', 'compareMaps', 'spatialStep', 'questionRows', 'sizeOf', 'depthCells', 'borderResize'];
const app = new Function('DCLogic', 'location', 'window', m[1] + '\n;return Object.fromEntries(' + JSON.stringify(NAMES) +
  '.map((n) => { try { return [n, eval(n)]; } catch (e) { return [n, undefined]; } }));')(DCLogic, location, window);
const { Component, parseMap, serializeMap, DEFAULT_META, newMapText } = app;

let failed = 0;
let passed = 0;
// Tests run one at a time, in order, so async ones can't see each other's changes to location or window.
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

function boot(text) {
  window.TREE_START = text === undefined ? undefined : { text };
  return new Component({});
}

// Walks the template the way the runtime does and returns every {{binding}} that resolves to undefined.
const template = html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>')).replace(/<!--[\s\S]*?-->/g, '');
// Like the runtime (support.js), names resolve only from renderVals() and props, never from the component itself.
// The second argument is accepted for old call sites and ignored.
function unresolved(vals) {
  const out = new Set();
  const lookup = (scopes, expr) => {
    const e = expr.trim();
    if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(e)) return e;
    const [head, ...rest] = e.split('.');
    const scope = [...scopes].reverse().find((sc) => Object.prototype.hasOwnProperty.call(sc, head));
    if (!scope) return undefined;
    return rest.reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), scope[head]);
  };
  const scopes = [vals];
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

// ---------------------------------------------------------------- the template
test('every sc-if and sc-for in the template is closed', () => {
  const stack = [];
  for (const t of template.matchAll(/<(\/?)(sc-if|sc-for)\b[^>]*>/g)) {
    if (t[1] === '') stack.push(t[2]);
    else assert.equal(stack.pop(), t[2]);
  }
  assert.deepEqual(stack, []);
  assert.equal((template.match(/<div\b/g) || []).length, (template.match(/<\/div>/g) || []).length, 'every <div> is closed');
});

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
  assert.equal(app.sharePayload('https://a.org/x#data=abc'), 'abc');
  assert.equal(app.sharePayload('https://a.org/x#m=abc'), 'abc'); // links made before #data=
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
  assert.ok(copied.startsWith('http://x/#data='));
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
  assert.equal(d.state.nodes[0].title, 'root');
});

test('startup prefers a share link over ?src= and saved maps', async () => {
  const c = boot();
  c.store = fakeStore([{ name: 'Saved', text: '# Saved\n', updated: 1 }]);
  c.fetchMapText = async () => '# From src\n';
  location.hash = '#data=' + await app.encodeShare('# Shared\n');
  location.search = '?src=https://a.org/m.md';
  await c.start();
  assert.equal(c.state.nodes[0].title, 'Shared');
  location.hash = '';
  await c.start();
  assert.equal(c.state.nodes[0].title, 'From src');
  location.search = '';
});

test('Save writes back only to a map its server marked writable', async () => {
  const realFetch = globalThis.fetch;
  const puts = [];
  globalThis.fetch = async (url, opts = {}) => {
    if (opts.method === 'PUT') { puts.push([url, opts.body]); return { ok: true }; }
    const writable = url.endsWith('/mine.md');
    return { ok: true, text: async () => '# Mine\n', headers: { get: (h) => (writable && h === 'x-decision-map-writable' ? '1' : null) } };
  };
  try {
    const c = boot();
    c.store = fakeStore();
    await c.openUrl('http://x/theirs.md');
    assert.equal(c.state.fileUrl, null);
    assert.equal(c.renderVals().canSaveFile, false);
    await c.openUrl('http://x/mine.md');
    assert.equal(c.state.fileUrl, 'http://x/mine.md');
    assert.equal(c.renderVals().canSaveFile, true);
    c.setState({ dirty: true });
    await c.saveFile();
    assert.deepEqual(puts, [['http://x/mine.md', c.currentText()]]);
    assert.equal(c.state.dirty, false);
    c.openText('# Other\n', 'other', { force: true });
    assert.equal(c.state.fileUrl, null);
  } finally { globalThis.fetch = realFetch; }
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
  const link = 'https://elsewhere.org/app/#data=' + await app.encodeShare('# Shared\n');
  assert.equal(await c.fetchMapText(link), '# Shared\n');
});

// ---------------------------------------------------------------- questionnaire: the bar
const Q3 = '# R\n- A {x:0.1 y:0.9}\n  - A1 {x:0.5 y:0.2}\n  - A2 {x:0.5 y:0.8}\n- B {x:0.3 y:0.1}\n- C {x:0.6 y:0.5}\n';
const qBoot = (text = Q3) => { const c = boot(text); c.setState({ layout: 'questionnaire' }); return c; };
const byIdC = (c) => c.graph().find((n) => n.id === c.state.currentId);
const idOf = (c, title) => c.state.nodes.find((n) => n.title === title).id;
const cols = (c) => c.renderVals().chart.cols;

test('columns sorted by colour value with widths as shares', () => {
  const c = qBoot();
  const rows = app.questionRows(c.graph(), c.state.nodes[0].id, c.metaOf());
  assert.deepEqual(rows.map((r) => r.node.text), ['B', 'C', 'A']);
  assert.deepEqual(rows.map((r) => +r.share.toFixed(3)), [0.3, 0.6, 0.1]);
  assert.deepEqual(cols(c).map((x) => x.text), ['B', 'C', 'A']);
  assert.equal(cols(c)[0].bg, app.colorFor(0.1, c.metaOf()));
});

test('unset and zero sizes give shares with no NaN', () => {
  const c = qBoot('# R\n- A {x:0}\n- B {x:0}\n');
  assert.deepEqual(app.questionRows(c.graph(), c.state.nodes[0].id, c.metaOf()).map((r) => r.share), [0.5, 0.5]);
  const d = qBoot('# R\n- A\n- B {x:1}\n');
  assert.equal(app.sizeOf(d.graph(), idOf(d, 'A'), d.metaOf()), 0.5);
  assert.deepEqual(app.questionRows(d.graph(), d.state.nodes[0].id, d.metaOf()).map((r) => +r.share.toFixed(3)), [0.333, 0.667]);
});

test('depth cells line up under their parent column', () => {
  const c = qBoot();
  const cells = c.renderVals().chart.depth.cells;
  assert.deepEqual(cells.map((d) => d.title.split(' (')[0]), ['A1', 'A2']);
  assert.match(cells[0].left, /\* 0\.9 \+ 16px\)$/);
  assert.match(cells[1].left, /\* 0\.95 \+ 16px\)$/);
});

test('clicking a column or a cell opens it', () => {
  const c = qBoot();
  cols(c).find((x) => x.text === 'A').click();
  assert.equal(c.state.currentId, idOf(c, 'A'));
  c.setState({ currentId: c.state.nodes[0].id });
  c.renderVals().chart.depth.cells[0].open();
  assert.equal(c.state.currentId, idOf(c, 'A1'));
});

test('breadcrumbs list every level above', () => {
  const c = qBoot();
  c.setState({ currentId: idOf(c, 'A1') });
  const v = c.renderVals();
  assert.deepEqual(v.crumbs.map((x) => x.label), ['R', 'A']);
  v.crumbs[0].go();
  assert.equal(c.state.currentId, c.state.nodes[0].id);
});

test('the health bar shows the derived colour value', () => {
  const c = qBoot();
  c.setState({ currentId: idOf(c, 'A') });
  assert.equal(c.renderVals().health.value, '0.90');
  c.patchNode(idOf(c, 'A'), { y: null });
  assert.equal(c.renderVals().health.value, '0.50');
});

test('a pinned bar stays put while a column opens the details', () => {
  const c = qBoot();
  c.renderVals().pin.toggle();
  cols(c).find((x) => x.text === 'A').click();
  assert.equal(c.state.currentId, idOf(c, 'A'));
  assert.deepEqual(cols(c).map((x) => x.text), ['B', 'C', 'A']);
  assert.equal(cols(c).find((x) => x.text === 'A').isSelected, true);
});

test('the chart modes switch, and Width only is the short bar', () => {
  const c = qBoot();
  for (const m of c.renderVals().chart.views) { m.pick(); assert.equal(c.state.chartView, m.id); }
  c.setState({ chartView: 'width' });
  assert.equal(c.renderVals().chart.height, '120px');
});

test('questionnaire renders with no unresolved bindings: full, empty, ref and read-only', async () => {
  for (const [text, at] of [[Q3, null], ['# Alone\n', null], [REFMAP, 'Child']]) {
    const c = qBoot(text);
    if (at) c.setState({ currentId: idOf(c, at) });
    for (const chartView of ['width', 'tall', 'area']) {
      c.setState({ chartView });
      assert.deepEqual(unresolved(c.renderVals(), c), [], text + chartView);
    }
  }
  const r = refBoot({ 'https://a.org/theirs.md': '# Theirs\n- T1\n' });
  r.setState({ layout: 'questionnaire' });
  await r.loadRef(childId(r), 'https://a.org/theirs.md');
  r.setState({ currentId: r.graph().find((n) => n.title === 'Theirs').id });
  assert.deepEqual(unresolved(r.renderVals(), r), []);
  assert.equal(r.renderVals().add.canOpen, false);
});

test('an unloaded ref column loads on click', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs\n- T1\n' });
  c.setState({ layout: 'questionnaire', currentId: childId(c) });
  await cols(c)[0].click();
  assert.equal(c.fetches.length, 1);
});

// ---------------------------------------------------------------- questionnaire: editing
const MAPQ = '# R\n- A {x:0.1 y:0.25}\n- B {x:0.3 y:0.5}\n- C {x:0.6 y:0.75}\n';
const ev = (props = {}) => ({
  pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, metaKey: false, ctrlKey: false, shiftKey: false, key: '', button: 0,
  preventDefault() {}, currentTarget: { setPointerCapture() {}, blur() {}, closest: () => ({ getBoundingClientRect: () => ({ width: 1016 }) }) }, ...props,
});
const colOf = (c, t) => cols(c).find((x) => x.text === t);
const xs = (c) => ['A', 'B', 'C'].map((t) => c.state.nodes.find((n) => n.title === t).x);
const ys = (c, t) => c.state.nodes.find((n) => n.title === t).y;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' ≉ ' + b);
const dragDivider = (c, t, dx) => {
  colOf(c, t).dividerDown(ev({ clientX: 0 }));
  colOf(c, t).dividerMove(ev({ clientX: dx })); // width 1016 less two 8px dividers is 1000px
  colOf(c, t).dividerUp(ev());
};
const choose = (c, t) => colOf(c, t).down(ev({ metaKey: true }));

test('a divider drag changes only the two columns either side, as one undo step', () => {
  const c = qBoot(MAPQ);
  dragDivider(c, 'A', 500);
  assert.deepEqual(xs(c), [0.38, 0.02, 0.6]); // B stops at the 2% floor
  c.undo();
  assert.deepEqual(xs(c), [0.1, 0.3, 0.6]);
});

test('sizes past 1 scale the siblings down and keep the shares', () => {
  const c = qBoot('# R\n- A {x:0.9}\n- B {x:0.9}\n');
  colOf(c, 'A').dividerDown(ev({ clientX: 0 }));
  colOf(c, 'A').dividerMove(ev({ clientX: 302.4 })); // 1016 less one 8px divider is 1008px; 0.3 of it
  const [a, b] = ['A', 'B'].map((t) => c.state.nodes.find((n) => n.title === t).x);
  assert.equal(a, 1);
  near(b, 0.25);
});

test('chosen columns take a resize, and Clear drops them', () => {
  const c = qBoot(MAPQ);
  choose(c, 'C');
  assert.ok(colOf(c, 'C').isChosen);
  dragDivider(c, 'A', 100);
  assert.deepEqual(xs(c), [0.2, 0.3, 0.5]);
  c.renderVals().chart.clearChosen();
  assert.equal(colOf(c, 'C').isChosen, false);
});

test('a choose gesture does not open the column', () => {
  const c = qBoot(MAPQ);
  choose(c, 'A');
  colOf(c, 'A').click(ev({ metaKey: true }));
  assert.equal(c.state.currentId, c.state.nodes[0].id);
});

test('a vertical drag changes the colour value and re-sorts on release', () => {
  const c = qBoot(MAPQ);
  colOf(c, 'A').down(ev({ clientY: 200 }));
  colOf(c, 'A').move(ev({ clientY: 200 - 94.4 })); // 236px is the whole 0–1 range
  assert.equal(ys(c, 'A'), 0.65);
  assert.deepEqual(cols(c).map((x) => x.text), ['A', 'B', 'C']);
  assert.ok(c.renderVals().chart.thermo.has);
  colOf(c, 'A').up(ev());
  assert.deepEqual(cols(c).map((x) => x.text), ['B', 'A', 'C']);
  assert.equal(c.renderVals().chart.thermo.has, false);
  colOf(c, 'A').click(ev()); // the click that ends a drag doesn't open it
  assert.equal(c.state.currentId, c.state.nodes[0].id);
  c.undo();
  assert.equal(ys(c, 'A'), 0.25);
});

test('colour value stays within 0–1', () => {
  const c = qBoot(MAPQ);
  colOf(c, 'A').down(ev({ clientY: 0 }));
  colOf(c, 'A').move(ev({ clientY: 5000 }));
  assert.equal(ys(c, 'A'), 0);
});

test('keyboard: arrows change the colour value and hold the order until blur; Enter opens', () => {
  const c = qBoot(MAPQ);
  for (let n = 0; n < 6; n++) colOf(c, 'A').key(ev({ key: 'ArrowUp' }));
  near(ys(c, 'A'), 0.55);
  assert.deepEqual(cols(c).map((x) => x.text), ['A', 'B', 'C']);
  colOf(c, 'A').blur(ev());
  assert.deepEqual(cols(c).map((x) => x.text), ['B', 'A', 'C']);
  colOf(c, 'A').dividerKey(ev({ key: 'ArrowRight' }));
  assert.deepEqual(xs(c), [0.12, 0.3, 0.58]); // A now sits between B and C, so its divider trades with C
  colOf(c, 'B').key(ev({ key: 'Enter' }));
  assert.equal(c.state.currentId, idOf(c, 'B'));
});

test('touch does not start drags', () => {
  const c = qBoot(MAPQ);
  colOf(c, 'A').down(ev({ pointerType: 'touch', clientY: 200 }));
  colOf(c, 'A').move(ev({ pointerType: 'touch', clientY: 100 }));
  colOf(c, 'A').dividerDown(ev({ pointerType: 'touch' }));
  colOf(c, 'A').dividerMove(ev({ pointerType: 'touch', clientX: 100 }));
  assert.equal(ys(c, 'A'), 0.25);
  assert.deepEqual(xs(c), [0.1, 0.3, 0.6]);
});

test('the + buttons add at 0.25 and 0.75, sized like their siblings', () => {
  const c = qBoot(MAPQ);
  const add = (side, title) => {
    c.renderVals().add[side]();
    assert.deepEqual(unresolved(c.renderVals(), c), []);
    c.renderVals().add.onText({ target: { value: title } });
    c.renderVals().add.commit();
  };
  add('left', 'L');
  add('right', 'Rt');
  const L = c.state.nodes.find((n) => n.title === 'L');
  const Rt = c.state.nodes.find((n) => n.title === 'Rt');
  assert.equal(L.y, 0.25);
  assert.equal(Rt.y, 0.75);
  assert.equal(L.x, 0.333);
  assert.equal(c.state.currentId, c.state.nodes[0].id);
  assert.equal(c.state.adding, null);
});

test('a blank title cannot be added, and Escape cancels', () => {
  const c = qBoot(MAPQ);
  c.renderVals().add.left();
  assert.equal(c.renderVals().add.commitDisabled, true);
  c.renderVals().add.onDialogKey({ key: 'Escape' });
  assert.equal(c.state.adding, null);
});

test('an empty node offers one +, which adds with no values', () => {
  const c = qBoot('# Alone\n');
  const v = c.renderVals();
  assert.equal(v.chart.empty, true);
  v.add.wide();
  c.renderVals().add.onText({ target: { value: 'First' } });
  c.renderVals().add.onKey({ key: 'Enter', preventDefault() {} });
  const n = c.state.nodes.find((x) => x.title === 'First');
  assert.equal(n.x, null);
  assert.equal(n.y, null);
});

test('Recalculate sets the colour value to the mean of the children, as one undo step', () => {
  const c = qBoot(MAPQ);
  const h = c.renderVals().health;
  assert.equal(h.canRecalc, true);
  h.recalc();
  assert.equal(c.state.nodes[0].y, 0.5);
  c.undo();
  assert.equal(c.state.nodes[0].y, null);
  assert.equal(qBoot('# Alone\n').renderVals().health.canRecalc, false);
});

test('ref columns cannot be dragged, chosen or added to', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs\n- T1 {y:0.2}\n- T2 {y:0.8}\n' });
  c.setState({ layout: 'questionnaire' });
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  c.setState({ currentId: c.graph().find((n) => n.title === 'Theirs').id });
  const before = c.state.nodes;
  colOf(c, 'T1').down(ev({ clientY: 100 }));
  colOf(c, 'T1').move(ev({ clientY: 0 }));
  colOf(c, 'T1').up(ev());
  colOf(c, 'T1').dividerDown(ev());
  colOf(c, 'T1').dividerMove(ev({ clientX: 100 }));
  colOf(c, 'T1').key(ev({ key: 'ArrowUp' }));
  choose(c, 'T1');
  assert.equal(c.state.nodes, before);
  assert.equal(colOf(c, 'T1').isChosen, false);
  assert.equal(c.renderVals().health.canRecalc, false);
});

// ---------------------------------------------------------------- pie
const pBoot = (text = Q3) => { const c = boot(text); c.setState({ layout: 'pie' }); return c; };
const sliceOf = (c, t) => c.renderVals().pie.slices.find((x) => x.text === t);
const pieBox = { closest: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 520, height: 520 }) }), setPointerCapture() {}, blur() {} };

test('rings by depth, with angles as shares of size', () => {
  const c = pBoot();
  const sl = c.renderVals().pie.slices;
  assert.deepEqual(sl.map((x) => [x.text, x.depth]), [['B', 1], ['C', 1], ['A', 1], ['A1', 2], ['A2', 2]]);
  near(sliceOf(c, 'A').span, 0.1);
  near(sliceOf(c, 'A1').span, 0.05);
});

test('pie renders with no unresolved bindings, in and out of edit mode', () => {
  const c = pBoot();
  assert.deepEqual(unresolved(c.renderVals(), c), []);
  c.renderVals().pie.toggleEdit();
  sliceOf(c, 'C').enter();
  assert.deepEqual(unresolved(c.renderVals(), c), []);
  assert.deepEqual(unresolved(pBoot('# Alone\n').renderVals(), c), []);
});

test('edit mode off: hovering shows details but no + or handles', () => {
  const c = pBoot();
  sliceOf(c, 'C').enter();
  assert.equal(sliceOf(c, 'C').ctls.length, 0);
  assert.equal(sliceOf(c, 'C').moves.length, 0);
  assert.match(c.renderVals().pie.hint, /^C: /);
  c.renderVals().pie.toggleEdit();
  assert.equal(sliceOf(c, 'C').ctls.length, 3); // + either side and + outside a leaf
  assert.equal(sliceOf(c, 'C').moves.length, 2);
});

test('an edge drag resizes against siblings, as one undo step', () => {
  const c = pBoot();
  c.renderVals().pie.toggleEdit();
  sliceOf(c, 'B').enter();
  const m = sliceOf(c, 'B').moves[0];
  m.down({ ...ev(), currentTarget: pieBox, clientX: 260, clientY: 160 });
  m.move({ ...ev(), currentTarget: pieBox, clientX: 360, clientY: 260 }); // a quarter turn clockwise
  m.up({ ...ev(), currentTarget: pieBox });
  assert.deepEqual(xs(c), [0.1, 0.55, 0.35]);
  c.undo();
  assert.deepEqual(xs(c), [0.1, 0.3, 0.6]);
});

test('the handles take the arrow keys', () => {
  const c = pBoot();
  c.renderVals().pie.toggleEdit();
  sliceOf(c, 'B').enter();
  sliceOf(c, 'B').moves[0].key(ev({ key: 'ArrowRight' }));
  assert.deepEqual(xs(c), [0.1, 0.32, 0.58]);
});

test('the + beside a slice adds a sibling a step either side of it, and outside a leaf adds a child', () => {
  const c = pBoot();
  c.renderVals().pie.toggleEdit();
  sliceOf(c, 'C').enter();
  const [before, after, under] = sliceOf(c, 'C').ctls;
  before.add();
  assert.deepEqual(c.state.adding, { parent: c.state.nodes[0].id, v: 0.375 });
  after.add();
  assert.deepEqual(c.state.adding, { parent: c.state.nodes[0].id, v: 0.625 });
  under.add();
  assert.deepEqual(c.state.adding, { parent: idOf(c, 'C'), v: null });
  assert.deepEqual(unresolved(c.renderVals(), c), []);
});

test('clicking a slice opens it; a choose gesture chooses it instead', () => {
  const c = pBoot();
  sliceOf(c, 'A').down(ev({ metaKey: true }));
  sliceOf(c, 'A').pick();
  assert.equal(c.state.currentId, c.state.nodes[0].id);
  assert.ok(sliceOf(c, 'A').isChosen);
  sliceOf(c, 'A1').pick();
  assert.equal(c.state.currentId, idOf(c, 'A1'));
});

test('ref slices are read-only', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs\n- T1\n' });
  c.setState({ layout: 'pie' });
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  c.setState({ currentId: childId(c) });
  c.renderVals().pie.toggleEdit();
  sliceOf(c, 'T1').enter();
  assert.equal(sliceOf(c, 'T1').ctls.length, 0);
  assert.equal(sliceOf(c, 'T1').moves.length, 0);
  sliceOf(c, 'T1').down(ev({ metaKey: true }));
  assert.equal(sliceOf(c, 'T1').isChosen, false);
});

// ---------------------------------------------------------------- compare
const graphOf = (text) => app.composeGraph(parseMap(text).nodes, {});
const CA = '# Root\n- Alpha {x:0.5 y:0.2}\n  - Leaf {x:0.5 y:0.5}\n- Beta {x:0.5 y:0.6}\n- Gone {x:0.1 y:0.5}\n';
const CB = '# Root\n- alpha {x:0.5 y:0.9}\n  - Leaf {x:0.5 y:0.45}\n- Beta {x:0.2 y:0.6}\n- New one {y:0.3}\n';

test('titlePath: lower-cased title chain, same-named siblings kept apart', () => {
  const g = graphOf('# R\n- Dup\n- dup \n  - X\n');
  assert.deepEqual(g.map((n) => app.titlePath(g, n.id)), ['r', 'r / dup', 'r / dup #2', 'r / dup #2 / x']);
});

test('compare matches by title path, and lists nodes only on one side', () => {
  const rows = app.compareMaps(graphOf(CA), graphOf(CB), DEFAULT_META);
  const by = Object.fromEntries(rows.map((r) => [r.path, r]));
  assert.equal(by['root / alpha'].only, null);
  near(by['root / alpha'].dy, 0.7);
  assert.equal(by['root / gone'].only, 'a');
  assert.equal(by['root / new one'].only, 'b');
  assert.equal(by['root / alpha / leaf'].changed, true);
});

test('compare rows: biggest difference first, then one-sided, then unchanged', () => {
  const rows = app.compareMaps(graphOf(CA), graphOf(CB), DEFAULT_META);
  assert.deepEqual(rows.map((r) => r.path), ['root / alpha', 'root / beta', 'root / alpha / leaf', 'root / gone', 'root / new one', 'root']);
});

test('flipped only in left/right mode, when the colour value crosses 0.5', () => {
  const split = app.compareMaps(graphOf(CA), graphOf(CB), { ...DEFAULT_META, colorMode: 'split' });
  assert.equal(split.find((r) => r.path === 'root / alpha').flipped, true);
  assert.equal(split.find((r) => r.path === 'root / alpha / leaf').flipped, false);
  const scale = app.compareMaps(graphOf(CA), graphOf(CB), DEFAULT_META);
  assert.equal(scale.find((r) => r.path === 'root / alpha').flipped, false);
});

const cBoot = () => { const c = boot(CA); c.setState({ layout: 'compare' }); return c; };

test('compare renders with no unresolved bindings, with and without B, on every tab', () => {
  const c = cBoot();
  assert.deepEqual(unresolved(c.renderVals(), c), []);
  assert.equal(c.renderVals().cmp.hasB, false);
  assert.equal(c.setB(CB, 'b.md'), true);
  for (const t of c.renderVals().cmp.tabs) {
    t.pick();
    assert.deepEqual(unresolved(c.renderVals(), c), [], t.label);
  }
  assert.ok(c.renderVals().cmp.sankey.links.length > 0);
});

test('a broken B shows its error and keeps the old B', () => {
  const c = cBoot();
  c.setB(CB, 'b.md');
  assert.equal(c.setB('# R\n      - bad', 'bad.md'), false);
  assert.equal(c.state.mapB.name, 'b.md');
  assert.ok(c.renderVals().cmp.error.startsWith('Line 2:'));
});

test('B can be the current map as it is now, or a saved map', async () => {
  const c = cBoot();
  c.renderVals().cmp.useCurrent();
  assert.equal(c.state.mapB.name, 'Current map (copy)');
  c.store = fakeStore([{ name: 'Saved', text: CB, updated: 1 }]);
  await c.refreshSaved();
  c.renderVals().cmp.savedB[0].pick();
  assert.equal(c.state.mapB.name, 'Saved');
});

test('?theirs= loads B and opens Compare', async () => {
  location.search = '?theirs=https://a.org/b.md';
  const c = boot(CA);
  c.store = fakeStore();
  c.fetchMapText = async () => CB;
  await c.start();
  location.search = '';
  assert.equal(c.state.layout, 'compare');
  assert.equal(c.state.mapB.name, 'b.md');
});

test('compare never loads refs', () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs\n' });
  c.setState({ layout: 'compare' });
  c.setB(REFMAP, 'same.md');
  for (const t of c.renderVals().cmp.tabs) { t.pick(); c.renderVals(); }
  assert.equal(c.fetches.length, 0);
});

// ---------------------------------------------------------------- examples
test('examples parse and round-trip', () => {
  for (const f of ['examples/votes-at-16/map.md', 'examples/votes-at-16/obi.md', 'examples/event-store/map.md', 'examples/demo/sam.md', 'examples/demo/priya.md']) {
    const text = fs.readFileSync(f, 'utf8');
    const m = parseMap(text);
    assert.equal(serializeMap(m), text, f);
  }
});

// ---------------------------------------------------------------- review fixes
test('a blank or spaces-only title still saves as a file that opens', () => {
  const c = boot(SMALL);
  c.addChild(c.state.nodes[1].id);
  c.addChild(c.state.nodes[0].id);
  c.patchNode(c.state.currentId, { title: '   ' });
  const back = parseMap(c.currentText());
  assert.equal(back.nodes.length, 6);
});

test('typed tags are kept to letters, digits and dashes, so the file reopens', () => {
  const c = boot(SMALL);
  for (const t of ['To_do', 'Café', 'v1.2', 'Q&A', '-x', '#Big idea']) { c.setState({ tagDraft: t }); c.addTagToCurrent(); }
  const back = parseMap(c.currentText());
  assert.deepEqual(back.nodes[0].tags, ['todo', 'caf', 'v12', 'qa', 'x', 'big-idea']);
});

test('blank lines in a description survive a round trip', () => {
  const nodes = [{ id: 'p0', parent: null, title: 'R', x: null, y: null, tags: [], note: 'para1\n\npara2\n   \nend', refs: [] }];
  assert.equal(parseMap(serializeMap({ meta: DEFAULT_META, nodes })).nodes[0].note, 'para1\n\npara2\n   \nend');
});

test('Windows line endings open', () => {
  const m = parseMap('---\r\ntheme: night\r\n---\r\n# Root\r\n- child {x:0.5}\r\n  @ https://a.org/m.md\r\n');
  assert.equal(m.meta.theme, 'night');
  assert.equal(m.nodes[1].title, 'child');
  assert.deepEqual(m.nodes[1].refs, ['https://a.org/m.md']);
});

test('a ref to the map opened from a URL never fetches, and opening another map forgets that URL', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': REFMAP });
  await c.openUrl('https://a.org/theirs.md');
  const before = c.fetches.length;
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  assert.equal(c.fetches.length, before);
  c.openText(REFMAP, 'file.md', { force: true });
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  assert.equal(c.fetches.length, before + 1);
});

test('compare of a map with itself shows no differences, even with a ref open', async () => {
  const c = refBoot({ 'https://a.org/theirs.md': '# Theirs {x:0.3}\n- T1\n' });
  await c.loadRef(childId(c), 'https://a.org/theirs.md');
  c.setState({ layout: 'compare' });
  c.renderVals().cmp.useCurrent();
  assert.equal(c.renderVals().cmp.summary, '0 changed · 0 only in A · 0 only in B');
});

test('opening another map first saves a named map\'s pending edits', async () => {
  const c = boot(SMALL);
  c.store = fakeStore();
  await c.saveAs('Plan');
  c.patchNode(c.state.nodes[1].id, { title: 'Just typed' });
  c.componentDidUpdate();
  c.openText(FULL, 'other', { force: true });
  await new Promise((r) => setTimeout(r, 0));
  assert.match(c.store.db.get('Plan').text, /- Just typed/);
  clearTimeout(c.autosaveTimer);
});

test('a share link leaves the address bar once its map is open', async () => {
  const c = boot();
  c.store = fakeStore();
  location.hash = '#data=' + await app.encodeShare('# Shared\n');
  location.search = '?view=tree';
  replaced.length = 0;
  await c.start();
  location.hash = ''; location.search = '';
  assert.equal(c.state.nodes[0].title, 'Shared');
  assert.deepEqual(replaced, ['/?view=tree']);
});

// ---------------------------------------------------------------- drawer position
test('the drawer sits on the right by default, can move to the bottom, and is remembered in this browser', () => {
  storage.clear();
  const c = boot(SMALL);
  assert.equal(c.state.drawer, 'right');
  c.setState({ settingsOpen: true, settingsTab: 'theme' });
  c.renderVals().drawerOpts.find((o) => o.value === 'bottom').pick();
  assert.equal(c.state.drawer, 'bottom');
  assert.equal(storage.get('tree.drawer'), 'bottom');
  assert.equal(boot(SMALL).state.drawer, 'bottom');
  assert.equal(c.state.history.past.length, 0);
  storage.clear();
});

test('a hidden right drawer leaves a thin column that opens it again, in map and focus views', () => {
  for (const layout of ['radial', 'tree', 'questionnaire', 'pie']) {
    const c = boot(Q3);
    c.setState({ drawer: 'right', layout });
    assert.equal(c.renderVals().canHidePanel, true, layout);
    c.renderVals().togglePanel();
    const v = c.renderVals();
    assert.equal(v.panelVisible, false, layout);
    assert.equal(v.panelRail, true, layout);
    assert.equal(v.panelPill, false, layout);
    assert.deepEqual(unresolved(v, c), [], layout);
    v.togglePanel();
    assert.equal(c.renderVals().panelVisible, true, layout);
  }
});

test('a hidden bottom drawer keeps the pill on the map, and the focus views keep their bottom panel', () => {
  const c = boot(Q3);
  c.setState({ drawer: 'bottom', layout: 'radial', panelOpen: false });
  assert.equal(c.renderVals().panelPill, true);
  assert.equal(c.renderVals().panelRail, false);
  c.setState({ layout: 'questionnaire' });
  assert.equal(c.renderVals().panelVisible, true);
  assert.equal(c.renderVals().canHidePanel, false);
  c.setState({ layout: 'directory' });
  assert.equal(c.renderVals().panelVisible, true);
});

test('every view renders with the drawer in either place', () => {
  for (const drawer of ['bottom', 'right']) {
    for (const layout of ['radial', 'tree', 'directory', 'questionnaire', 'pie']) {
      const c = boot(Q3);
      c.setState({ drawer, layout });
      const v = c.renderVals();
      assert.deepEqual(unresolved(v, c), [], drawer + ' ' + layout);
      if (layout !== 'directory') assert.equal(v.panelBox.includes('flex: 0 0 400px'), drawer === 'right', drawer + ' ' + layout);
    }
  }
});

test('the demo pair shows every kind of difference Compare has', () => {
  const read = (f) => graphOf(fs.readFileSync(f, 'utf8'));
  const meta = parseMap(fs.readFileSync('examples/demo/sam.md', 'utf8')).meta;
  const rows = app.compareMaps(read('examples/demo/sam.md'), read('examples/demo/priya.md'), meta);
  const kinds = new Set(rows.map((r) => (r.only ? 'only ' + r.only : r.flipped ? 'flipped' : r.changed ? 'changed' : 'same')));
  assert.deepEqual([...kinds].sort(), ['changed', 'flipped', 'only a', 'only b', 'same']);
  assert.ok(rows.some((r) => r.only === 'a' && r.path.split(' / ').length === 3), 'a nested node only in A');
});

// ---------------------------------------------------------------- Ctrl+arrow: move by what's on screen
test('spatialStep picks the nearest node in that direction, preferring ones straight ahead', () => {
  const pos = { c: { x: 0, y: 0 }, left: { x: -100, y: 10 }, farLeft: { x: -300, y: 0 }, upLeft: { x: -60, y: -90 }, right: { x: 120, y: 0 }, down: { x: 5, y: 150 } };
  assert.equal(app.spatialStep(pos, 'c', 'ArrowLeft'), 'left');
  assert.equal(app.spatialStep(pos, 'c', 'ArrowRight'), 'right');
  assert.equal(app.spatialStep(pos, 'c', 'ArrowDown'), 'down');
  assert.equal(app.spatialStep(pos, 'c', 'ArrowUp'), 'upLeft');
  assert.equal(app.spatialStep(pos, 'right', 'ArrowRight'), null);
});

const key2 = (props) => ({ ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, preventDefault() { this.prevented = true; }, target: { value: 'x', selectionStart: 0, selectionEnd: 0 }, ...props });

test('Ctrl+arrow in Radial goes to the node on that side of the screen, whatever its place in the tree', () => {
  const c = boot('# R\n- A\n- B\n'); // radial puts A to the right of the root and B to the left
  c.setState({ layout: 'radial', currentId: c.state.nodes[0].id });
  const pos = c.positions();
  assert.ok(pos[idOf(c, 'A')].x > 0 && pos[idOf(c, 'B')].x < 0, 'layout as expected');
  const press = (k) => { const e = key2({ key: k }); c.handleKey(e, byIdC(c)); return e; };
  assert.ok(press('ArrowLeft').prevented);
  assert.equal(c.state.currentId, idOf(c, 'B')); // left from the root is a child
  press('ArrowLeft');
  assert.equal(c.state.currentId, idOf(c, 'B')); // nothing further left
  press('ArrowRight');
  assert.equal(c.state.currentId, c.state.nodes[0].id); // right from B is back to its parent
  press('ArrowRight');
  assert.equal(c.state.currentId, idOf(c, 'A'));
  press('ArrowLeft');
  assert.equal(c.state.currentId, c.state.nodes[0].id); // and left from A is its parent: the same key, the other way in the tree
});

test('Ctrl+arrow works with the caret anywhere in the title, and does nothing where there is no node', () => {
  const c = boot('# R\n- A\n');
  c.setState({ layout: 'tree', currentId: c.state.nodes[0].id });
  const e = key2({ key: 'ArrowRight', target: { value: 'Root', selectionStart: 2, selectionEnd: 2 } });
  c.handleKey(e, byIdC(c));
  assert.equal(c.state.currentId, idOf(c, 'A'));
  const f = key2({ key: 'ArrowRight' });
  c.handleKey(f, byIdC(c));
  assert.equal(c.state.currentId, idOf(c, 'A'));
  assert.ok(f.prevented, 'still keeps the caret from moving');
});

test('arrows reach the selected node when nothing has focus, as right after a map loads', () => {
  const c = boot('# R\n- A\n- B\n');
  c.setState({ layout: 'radial' });
  const body = { tagName: 'BODY' };
  const press = (key, extra = {}) => { const e = { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: body, preventDefault() { this.prevented = true; }, ...extra }; c.onGlobalKey(e); return e; };
  assert.ok(press('ArrowRight').prevented);
  assert.equal(c.state.currentId, idOf(c, 'A')); // plain → from the root goes into its first child
  press('ArrowLeft');
  assert.equal(c.state.currentId, c.state.nodes[0].id);
  press('ArrowLeft', { ctrlKey: true });
  assert.equal(c.state.currentId, idOf(c, 'B')); // Ctrl+← goes to the node on the left
  const slider = press('ArrowRight', { target: { tagName: 'INPUT', type: 'range' } });
  assert.equal(slider.prevented, undefined); // a focused slider keeps its arrows
  assert.equal(c.state.currentId, idOf(c, 'B'));
  c.setState({ layout: 'directory' });
  assert.equal(press('ArrowRight').prevented, undefined); // Directory has its own keys
});

// ---------------------------------------------------------------- map layout: no overlaps, no needless distance
const overlaps = (c) => {
  const pos = c.positions();
  const box = c.layoutBoxes();
  const ids = Object.keys(pos);
  const out = [];
  ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => {
    if (Math.abs(pos[a].x - pos[b].x) < box[a].hw + box[b].hw && Math.abs(pos[a].y - pos[b].y) < box[a].hh + box[b].hh) out.push(a + '/' + b);
  }));
  return out;
};
const BUSY = '# What are you deciding?\n- A {x:0.2}\n- B {x:1}\n- C\n- D {x:1}\n- Dave\n- New idea\n- Next {x:1}\n- Ide\n- Meh\n- Somewhere with a much longer title than the rest {x:1}\n  - next\n  - Whatever {x:0.9}\n  - x\n';

test('Radial and Tree: no two nodes overlap, with sizes scaled and any node selected', () => {
  for (const layout of ['radial', 'tree']) {
    const c = boot(BUSY);
    c.setState({ layout, colorDim: 'y', sizeOn: true });
    for (const n of c.state.nodes) {
      c.setState({ currentId: n.id });
      assert.deepEqual(overlaps(c).map((x) => x.split('/').map((id) => c.state.nodes.find((m) => m.id === id).title).join(' × ')), [], layout + ' with ' + n.title + ' selected');
    }
    c.setState({ sizeMax: 2.4 });
    assert.deepEqual(overlaps(c), [], layout + ' at the largest size range');
  }
});

test('Radial: a few short children sit close to the root, not on a fixed far ring', () => {
  const c = boot('# Root\n- A\n- B\n- C\n');
  c.setState({ layout: 'radial' });
  const pos = c.positions();
  const far = Math.max(...c.state.nodes.slice(1).map((n) => Math.hypot(pos[n.id].x, pos[n.id].y)));
  assert.ok(far < 160, 'furthest child is ' + far.toFixed(0) + 'px out');
  assert.deepEqual(overlaps(c), []);
});

// ---------------------------------------------------------------- a new map starts ready to type over
const tick = () => new Promise((r) => setTimeout(r, 5));
test('a new map is titled root, with the title selected so typing replaces it', async () => {
  assert.equal(parseMap(newMapText()).root.title, 'root');
  const c = boot();
  c.store = fakeStore();
  titleField.focused = 0; titleField.selected = 0;
  await c.start();
  await tick();
  assert.equal(c.state.nodes[0].title, 'root');
  assert.equal(titleField.focused, 1);
  assert.equal(titleField.selected, 1);
});

test('File → New selects the new title too', async () => {
  const c = boot(SMALL);
  titleField.focused = 0; titleField.selected = 0;
  c.renderVals().onNew();
  await tick();
  assert.equal(c.state.nodes[0].title, 'root');
  assert.equal(titleField.selected, 1);
});

test('a saved map that opens on start is not selected, so a stray key cannot wipe its title', async () => {
  const c = boot();
  c.store = fakeStore([{ name: 'Mine', text: '# Mine\n', updated: 1 }]);
  titleField.focused = 0; titleField.selected = 0;
  await c.start();
  await tick();
  assert.equal(c.state.nodes[0].title, 'Mine');
  assert.equal(titleField.selected, 0);
});

test('Radial: every child sits further from the centre than its parent, even under a long chain', () => {
  const deep = '# Hello\n- Next\n- Foo\n- Bar\n- Fiz\n- Buzz\n' +
    [1, 2, 3, 4, 5, 6].map((d) => '  '.repeat(d) + '- New idea\n').join('') +
    ['zeta', 'delta', 'tamma', 'pbeta', 'Alopha', 'New idea'].map((t) => '  '.repeat(7) + '- ' + t + '\n').join('');
  const c = boot(deep);
  c.setState({ layout: 'radial' });
  const pos = c.positions();
  const dist = (id) => Math.hypot(pos[id].x, pos[id].y);
  const inward = c.state.nodes.filter((n) => n.parent !== null && dist(n.id) <= dist(n.parent)).map((n) => n.title);
  assert.deepEqual(inward, []);
  assert.deepEqual(overlaps(c), []);
  const longest = Math.max(...c.state.nodes.filter((n) => n.parent !== null).map((n) => Math.hypot(pos[n.id].x - pos[n.parent].x, pos[n.id].y - pos[n.parent].y)));
  assert.ok(longest < 260, 'children fan out around their parent, not across the map: longest line ' + longest.toFixed(0) + 'px');
});

test('Fit shows every node whole, scaled ones included', () => {
  for (const layout of ['radial', 'tree']) {
    const c = boot(fs.readFileSync('examples/demo/sam.md', 'utf8'));
    c.setState({ layout, follow: false, vw: 900, vh: 700, panelOpen: false });
    c.fit();
    const pos = c.positions();
    const box = c.layoutBoxes();
    const view = c.visible();
    const { zoom, pan } = c.state;
    const out = Object.keys(pos).filter((id) => Math.abs(pos[id].x * zoom + pan.x) + box[id].hw * zoom > view.w / 2 + 1 || Math.abs(pos[id].y * zoom + pan.y) + box[id].hh * zoom > view.h / 2 + 1);
    assert.deepEqual(out.map((id) => c.state.nodes.find((n) => n.id === id).title), [], layout);
  }
});

test('opening a map fits it to the canvas, and Fit never zooms in past 100%', () => {
  const c = boot('# R\n');
  c.setState({ layout: 'radial', follow: false, vw: 1000, vh: 839 });
  c.didInitialFit = true; // what the canvas's ResizeObserver sets once it has measured the canvas
  c.fit();
  assert.equal(c.state.zoom, 1); // one small node would otherwise fill the screen at 300%
  c.openText(fs.readFileSync('examples/demo/sam.md', 'utf8'), 'sam.md', { force: true });
  const pos = c.positions();
  const box = c.layoutBoxes();
  const view = c.visible();
  const { zoom, pan } = c.state;
  assert.ok(zoom < 1);
  const out = Object.keys(pos).filter((id) => Math.abs(pos[id].x * zoom + pan.x) + box[id].hw * zoom > view.w / 2 + 1 || Math.abs(pos[id].y * zoom + pan.y) + box[id].hh * zoom > view.h / 2 + 1);
  assert.deepEqual(out, []);
});

(async () => {
  for (const { name, fn } of queue) {
    try { await fn(); passed++; } catch (e) { failed++; console.error(`FAIL ${name}\n  ${e.message}`); }
  }
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
