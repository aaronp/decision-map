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
const Component = new Function('DCLogic', 'location', 'window', m[1] + '\n;return Component;')(DCLogic, { search: '', href: 'http://x/' }, window);

let failed = 0;
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; console.error(`FAIL ${name}\n  ${e.message}`); }
}

const NEW = `---\ntitle: T\n---\n\n# Root claim\nslug: root\nby: Me\n\nRoot details.\n\n## Good: a fact\nslug: a\nimportance: 60\nimpact: 0.8\nby: Sam\nconfidence: 4\nbasis: Would change if X\n\nLine one.\n\nLine two.\n\n- [ref] [Src](https://example.com) — shows it\n\n### Child\nslug: b\nimportance: 45.5\nimpact: -0.6\n`;
const parsed = () => Component.parse(NEW).map;

test('parses the heading format', () => {
  const { map, errors } = Component.parse(NEW);
  assert.deepEqual(errors, []);
  assert.equal(map.root.kind, 'root');
  assert.equal(map.root.details, 'Root details.');
  const a = map.root.children[0];
  assert.equal(a.text, 'Good: a fact');
  assert.deepEqual([a.importance, a.impact, a.by, a.confidence, a.basis], [60, 0.8, 'Sam', 4, 'Would change if X']);
  assert.equal(a.details, 'Line one.\n\nLine two.');
  assert.equal(a.refs[0].name, 'Src');
  assert.deepEqual([a.children[0].importance, a.children[0].impact], [45.5, -0.6]);
});

test('round trips the heading format', () => {
  assert.deepEqual(Component.parse(Component.serialize(parsed())).map, parsed());
});

test('rejects bad properties', () => {
  for (const [bad, word] of [['impact: 1.5', 'impact'], ['impact: abc', 'impact'], ['importance: -1', 'importance'], ['colour: red', 'colour']]) {
    const r = Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## F\nslug: f\nimportance: 1\nimpact: 0\n${bad}\n`);
    assert.ok(r.errors.some((e) => e.msg.includes(word)), bad);
  }
  assert.ok(Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## F\nslug: f\nimportance: 1\n`).errors.some((e) => e.msg.includes('impact')));
});

test('a heading may go only one level deeper than its parent', () => {
  assert.ok(Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n### Too deep\nslug: f\nimportance: 1\nimpact: 0\n`).errors.length > 0);
});

test('accepts more than six heading levels', () => {
  const deep = ['---', 'title: T', '---', '', '# R', 'slug: r', ''];
  for (let d = 2; d <= 8; d++) deep.push(`${'#'.repeat(d)} L${d}`, `slug: l${d}`, 'importance: 1', 'impact: 0', '');
  assert.deepEqual(Component.parse(deep.join('\n')).errors, []);
});

test('premises', () => {
  const P = Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: 1\n`).map;
  assert.equal(P.root.children[0].kind, 'premise');
  assert.equal(P.root.children[0].importance, null);
  assert.ok(Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n## F\nslug: f\nimportance: 1\nimpact: 1\n`).errors.length > 0);
  assert.ok(Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## F\nslug: f\nimportance: 1\nimpact: 1\n\n### P\nslug: p\nkind: premise\n`).errors.length > 0);
});

test('details that look like structure survive', () => {
  const tricky = parsed();
  tricky.root.children[0].details = '# not a heading\n- [ref] not evidence\n\\# already slashed';
  const back = Component.parse(Component.serialize(tricky)).map.root.children[0];
  assert.equal(back.details, tricky.root.children[0].details);
  assert.equal(back.refs.length, 1);
});

test('imports the legacy format', () => {
  const old = `---\ntitle: T\n---\n\n# R {slug: r}\n\n- [+] Pay {slug: pay-tax, weight: 60}\n  - [-] Sub {slug: sub, weight: 45}\n- [-] Inexp {slug: inexperience, weight: 70}\n`;
  const L = Component.parse(old).map;
  const pay = L.root.children.find((c) => c.slug === 'pay-tax');
  assert.deepEqual([pay.kind, pay.importance, pay.impact], ['fact', 60, 1]);
  assert.equal(L.root.children.find((c) => c.slug === 'inexperience').impact, -1);
  assert.deepEqual(Component.parse(old.replace(/\n/g, '\r\n')).map, L);
});

test('legacy weight 0, premises and evidence survive a save', () => {
  const zero = Component.parse(`---\ntitle: T\n---\n\n# R {slug: r}\n\n- [*] P {slug: p}\n  - [+] F {slug: f, weight: 0}\n    - [ref] Src — note\n    - [basis] Because\n`).map;
  assert.equal(zero.root.children[0].kind, 'premise');
  const f = zero.root.children[0].children[0];
  assert.deepEqual([f.importance, f.impact, f.basis, f.refs[0].name], [0, 1, 'Because', 'Src']);
  assert.deepEqual(Component.parse(Component.serialize(zero)).map, zero);
});

test('saved numbers are rounded', () => {
  const rounded = parsed();
  rounded.root.children[0].importance = 38.5714;
  rounded.root.children[0].impact = -0.004;
  const out = Component.serialize(rounded);
  assert.ok(out.includes('importance: 38.6\n') && out.includes('impact: 0\n'));
});

// ---------------------------------------------------------------- scoring and resizing
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const fact = (slug, importance, impact, children = []) => ({ slug, text: slug, kind: 'fact', importance, impact, by: null, basis: null, confidence: null, details: null, refs: [], children });
const prem = (slug, children) => ({ ...fact(slug, null, null, children), kind: 'premise' });
const rootOf = (children) => ({ ...fact('r', null, null, children), kind: 'root' });

test('score uses direct children and leaves a parent impact alone', () => {
  const tree = rootOf([fact('a', 60, 0.5, [fact('x', 1, -1)]), fact('b', 40, -1)]);
  const v = Component.allValues(tree);
  near(v.get('r').score, 0.5 * 0.6 - 0.4);
  near(v.get('a').impact, 0.5);
  near(v.get('a').score, -1);
  near(v.get('a').share, 0.6);
  const rows = Component.factRows(tree, v);
  assert.deepEqual(rows.map((r) => r.node.slug), ['b', 'a']);
  near(rows[1].contribution, 0.3);
  assert.equal(rows[1].calculated, false);
});

test('all-zero importance and single children give equal shares and no NaN', () => {
  const z = rootOf([fact('a', 0, 1), fact('b', 0, -1)]);
  const vz = Component.allValues(z);
  near(vz.get('r').score, 0);
  near(vz.get('a').share, 0.5);
  near(Component.allValues(rootOf([fact('a', 7, 0.2)])).get('a').share, 1);
  near(Component.allValues(rootOf([])).get('r').score, 0);
});

test('premise values are calculated from children', () => {
  const pt = rootOf([prem('p1', [fact('x', 1, 1)]), prem('p2', []), prem('p3', [fact('y', 1, -1)])]);
  const vp = Component.allValues(pt);
  assert.equal(vp.get('r').score, null);
  near(vp.get('p1').impact, 1);
  near(vp.get('p1').share, 2 / 3);
  near(vp.get('p2').share, 1 / 3);
  near(vp.get('p3').share, 0);
  assert.equal(Component.factRows(pt, vp)[0].calculated, true);
  near(Component.allValues(rootOf([prem('p', [fact('y', 1, -1)])])).get('p').share, 1);
});

test('a frozen order is respected and tolerates changed children', () => {
  const ord = rootOf([fact('a', 1, 0.9), fact('b', 1, -0.9), fact('c', 1, 0)]);
  assert.deepEqual(Component.factRows(ord, Component.allValues(ord), ['a', 'gone', 'b']).map((r) => r.node.slug), ['a', 'b', 'c']);
});

test('scale mode resize', () => {
  const scale = (raws, divider, resized, move) => Component.resizeImportance(raws, { divider, resized, move, mode: 'scale' });
  const shareAt = (r, i) => r[i] / r.reduce((t, x) => t + x, 0);
  near(shareAt(scale([10, 30, 60], 0, 0, 0.2), 0), 0.3);
  assert.deepEqual(scale([10, 30, 60], 0, 0, 0.2).slice(1), [30, 60]);
  near(shareAt(scale([10, 30, 60], 0, 0, 0.6), 0), 0.7); // past the neighbour
  near(shareAt(scale([10, 30, 60], 0, 0, 0.95), 0), 0.9); // upper limit
  near(shareAt(scale([10, 30, 60], 0, 0, -0.09), 0), 0.02); // lower limit
  near(shareAt(scale([10, 30, 60], 0, 1, 0.01), 1), 0.23); // column right of the divider
  assert.deepEqual(scale([0, 0], 0, 0, 0.2), [0, 0]); // nothing to measure against
  assert.deepEqual(scale([5, 0], 0, 0, 0.2), [5, 0]);
});

test('trade mode resize', () => {
  const trade = (raws, divider, resized, move, pool) => Component.resizeImportance(raws, { divider, resized, move, mode: 'trade', pool });
  assert.deepEqual(trade([50, 50, 100], 0, 0, 0.1, [2]), [70, 50, 80]);
  assert.deepEqual(trade([50, 50, 100], 0, 0, 0.1, []), [70, 30, 100]); // defaults to across the divider
  assert.deepEqual(trade([50, 50, 100], 0, 1, 0.1, []), [70, 30, 100]); // moving right shrinks the right column
  assert.deepEqual(trade([50, 50, 100], 0, 0, 0.9, [1]), [96, 4, 100]); // floor on the trade column
  assert.deepEqual(trade([50, 50, 100], 0, 0, -0.9, [1]), [4, 96, 100]); // floor on the resized column
  assert.deepEqual(trade([50, 50, 100], 0, 0, 0.1, [0]), [70, 30, 100]); // the resized column can't trade with itself
  assert.deepEqual(trade([40, 20, 60, 80], 0, 0, 0.1, [1, 3]), [60, 16, 60, 64]); // in proportion
});

// ---------------------------------------------------------------- whole-app checks, no browser needed
const LEGACY_A = fs.readFileSync('check-fixtures/legacy-a.md', 'utf8');
const LEGACY_B = fs.readFileSync('check-fixtures/legacy-b.md', 'utf8');
function boot(a = LEGACY_A, b = '') {
  window.AM_A = { name: 'a.md', text: a, url: null };
  window.AM_B = b === '' ? undefined : { name: 'b.md', text: b, url: null };
  return new Component({});
}

// Walks the template the way the runtime does and returns every {{binding}} that resolves to undefined.
const template = html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>')).replace(/<!--[\s\S]*?-->/g, '');
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

test('every view renders with no unresolved bindings', () => {
  for (const view of ['map', 'pie', 'source', 'diff']) {
    const c = boot(LEGACY_A, LEGACY_B);
    c.setState({ view });
    assert.deepEqual(unresolved(c.renderVals()), [], view);
  }
});

// ---------------------------------------------------------------- the chart
const MAP3 = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 10\nimpact: -0.5\n\n## B\nslug: b\nimportance: 30\nimpact: 0\n\n## C\nslug: c\nimportance: 60\nimpact: 0.5\n`;
const chartOf = (c) => c.renderVals().chart;
const colOf = (c, slug) => chartOf(c).cols.find((x) => x.slug === slug);
const nodeOf = (c, slug) => c.state.map.root.children.find((n) => n.slug === slug);
const ev = (props = {}) => ({
  pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, metaKey: false, shiftKey: false, key: '',
  preventDefault() {}, currentTarget: { setPointerCapture() {}, closest: () => ({ getBoundingClientRect: () => ({ width: 1016 }) }) }, ...props,
});

test('impact colour helpers', () => {
  assert.equal(Component.signed(0.8), '+0.80');
  assert.equal(Component.signed(-0.6), '−0.60');
  assert.equal(Component.signed(0), '0.00');
  assert.ok(Component.impactFill(-1).includes('--con') && Component.impactFill(-1).includes('100%'));
  assert.ok(Component.impactFill(0).includes('12%'));
  assert.equal(Component.impactInk(0.2), 'var(--ink)');
  assert.equal(Component.impactInk(-0.8), 'var(--on-fill)');
});

test('columns are sorted by impact with widths as shares', () => {
  const cols = chartOf(boot(MAP3)).cols;
  assert.deepEqual(cols.map((x) => x.slug), ['a', 'b', 'c']);
  near(cols[2].share, 0.6);
  assert.deepEqual(cols.map((x) => x.hasDivider), [true, true, false]);
});

test('scale drag changes only the resized fact, even past its neighbour', () => {
  const c = boot(MAP3);
  const before = Component.serialize(c.state.map);
  // Width 1016 less two 8px dividers leaves 1000px of columns, so 500px is half.
  const d = colOf(c, 'a');
  d.dividerDown(ev({ clientX: 100 }));
  colOf(c, 'a').dividerMove(ev({ clientX: 600 }));
  colOf(c, 'a').dividerUp(ev());
  assert.equal(nodeOf(c, 'b').importance, 30);
  assert.equal(nodeOf(c, 'c').importance, 60);
  assert.ok(nodeOf(c, 'a').importance > 100, 'grew past both neighbours');
  const changed = Component.serialize(c.state.map).split('\n').filter((l, i) => l !== before.split('\n')[i]);
  assert.equal(changed.length, 1);
  assert.ok(changed[0].startsWith('importance: '));
});

test('a divider resizes the selected column when it touches it', () => {
  const c = boot(MAP3);
  colOf(c, 'b').click(ev());
  colOf(c, 'a').dividerDown(ev({ clientX: 0 }));
  colOf(c, 'a').dividerMove(ev({ clientX: 10 }));
  assert.equal(nodeOf(c, 'a').importance, 10);
  assert.ok(nodeOf(c, 'b').importance < 30);
});

test('trade drag moves importance only between chosen columns', () => {
  const c = boot(MAP3);
  chartOf(c).modes.find((x) => x.id === 'trade').pick();
  colOf(c, 'c').click(ev({ metaKey: true }));
  assert.equal(c.state.selectedFact, null);
  assert.ok(colOf(c, 'c').inPool);
  colOf(c, 'a').dividerDown(ev({ clientX: 0 }));
  colOf(c, 'a').dividerMove(ev({ clientX: 100 })); // a tenth of the width, 10 of 100 total
  colOf(c, 'a').dividerUp(ev());
  assert.deepEqual(['a', 'b', 'c'].map((s) => nodeOf(c, s).importance), [20, 30, 50]);
});

test('vertical drag changes impact, and re-sorts only on release', () => {
  const c = boot(MAP3);
  colOf(c, 'a').down(ev({ clientY: 200 }));
  colOf(c, 'a').move(ev({ clientY: 200 - 118 })); // up by one unit: −0.5 to +0.5, past b
  assert.equal(nodeOf(c, 'a').impact, 0.5);
  assert.equal(c.state.selectedFact, 'a');
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['a', 'b', 'c']);
  assert.ok(chartOf(c).thermo.has);
  colOf(c, 'a').up(ev());
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['b', 'a', 'c']);
  assert.equal(chartOf(c).thermo.has, false);
  colOf(c, 'a').click(ev()); // the click that ends a drag doesn't toggle selection
  assert.equal(c.state.selectedFact, 'a');
});

test('impact stays within range when dragged far', () => {
  const c = boot(MAP3);
  colOf(c, 'a').down(ev({ clientY: 0 }));
  colOf(c, 'a').move(ev({ clientY: 5000 }));
  assert.equal(nodeOf(c, 'a').impact, -1);
});

test('clicking selects, and clicking again deselects', () => {
  const c = boot(MAP3);
  colOf(c, 'b').click(ev());
  assert.equal(c.state.selectedFact, 'b');
  assert.ok(colOf(c, 'b').selected);
  colOf(c, 'b').click(ev());
  assert.equal(c.state.selectedFact, null);
});

test('keyboard impact holds the order until the column loses focus', () => {
  const c = boot(MAP3);
  for (let n = 0; n < 12; n++) colOf(c, 'a').key(ev({ key: 'ArrowUp' }));
  near(nodeOf(c, 'a').impact, 0.1);
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['a', 'b', 'c']);
  colOf(c, 'a').blur(ev());
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['b', 'a', 'c']);
  colOf(c, 'b').key(ev({ key: 'Enter' }));
  assert.equal(c.state.selectedFact, 'b');
});

test('keyboard on a divider changes importance', () => {
  const c = boot(MAP3);
  colOf(c, 'a').dividerKey(ev({ key: 'ArrowRight' }));
  assert.ok(nodeOf(c, 'a').importance > 10);
  assert.equal(nodeOf(c, 'b').importance, 30);
});

test('touch doesn\'t start drags', () => {
  const c = boot(MAP3);
  colOf(c, 'a').down(ev({ pointerType: 'touch', clientY: 200 }));
  colOf(c, 'a').move(ev({ pointerType: 'touch', clientY: 100 }));
  assert.equal(nodeOf(c, 'a').impact, -0.5);
  colOf(c, 'a').dividerDown(ev({ pointerType: 'touch', clientX: 0 }));
  colOf(c, 'a').dividerMove(ev({ pointerType: 'touch', clientX: 100 }));
  assert.equal(nodeOf(c, 'a').importance, 10);
});

test('premise columns can be selected but not dragged', () => {
  const src = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: 1\n\n## Q\nslug: q\nkind: premise\n`;
  const c = boot(src);
  const before = c.state.src;
  colOf(c, 'q').down(ev({ clientY: 100 }));
  colOf(c, 'q').move(ev({ clientY: 0 }));
  colOf(c, 'q').up(ev());
  colOf(c, 'q').dividerDown(ev({ clientX: 0 }));
  colOf(c, 'q').dividerMove(ev({ clientX: 100 }));
  colOf(c, 'q').key(ev({ key: 'ArrowUp' }));
  colOf(c, 'q').dividerKey(ev({ key: 'ArrowRight' }));
  assert.equal(c.state.src, before);
  assert.equal(chartOf(c).thermo.has, false);
  colOf(c, 'q').click(ev());
  assert.equal(c.state.selectedFact, 'q');
  assert.equal(c.renderVals().score.has, false);
});

test('a filter dims columns and keeps shares', () => {
  const c = boot(MAP3);
  c.setState({ q: 'zzz-no-match' });
  const cols = chartOf(c).cols;
  assert.equal(cols.length, 3);
  near(cols[2].share, 0.6);
  assert.equal(cols[2].op, 0.22);
});

test('overlays are markers on the column', () => {
  const src = MAP3.replace('title: T', 'title: T\nshow-confidence: true\nshow-evidence: true\nshow-good-faith: true').replace('importance: 10', 'importance: 10\nconfidence: 3');
  const marks = colOf(boot(src), 'a').marks;
  assert.ok(marks.includes('★★★☆☆') && marks.includes('0') && marks.includes('no basis'), marks);
});

test('views and resize behaviours switch and show bindings', () => {
  for (const id of ['width', 'tall', 'area']) {
    const c = boot(MAP3);
    chartOf(c).views.find((x) => x.id === id).pick();
    assert.equal(c.state.chartView, id);
    assert.deepEqual(unresolved(c.renderVals()), [], id);
    colOf(c, 'a').down(ev({ clientY: 100 }));
    colOf(c, 'a').move(ev({ clientY: 0 }));
    assert.deepEqual(unresolved(c.renderVals()), [], `${id} with thermometer`);
  }
});

test('adding a fact defaults to impact 0 and importance 50', () => {
  const c = boot(MAP3);
  const a0 = c.renderVals().add;
  a0.open();
  c.renderVals().add.onDraftText({ target: { value: 'New one' } });
  c.renderVals().add.save();
  const n = nodeOf(c, 'new-one');
  assert.deepEqual([n.importance, n.impact, n.kind], [50, 0, 'fact']);
});

// ---------------------------------------------------------------- the details panel
const panelOf = (c) => c.renderVals().pn;
const reloaded = (c) => assert.deepEqual(Component.parse(c.state.src).map, c.state.map);
const NESTED = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 10\nimpact: -0.5\n\n### Kid\nslug: kid\nimportance: 1\nimpact: 1\n\n## B\nslug: b\nimportance: 30\nimpact: 0.5\n`;

test('panelSlug and safeFocus fall back to what exists', () => {
  const t2 = rootOf([fact('a', 1, 0, [fact('b', 1, 0)])]);
  assert.equal(Component.panelSlug(t2, 'a', 'b'), 'b');
  assert.equal(Component.panelSlug(t2, 'a', 'gone'), 'a');
  assert.equal(Component.panelSlug(t2, 'gone', 'gone'), 'r');
  assert.equal(Component.panelSlug(t2, 'a', null), 'a');
  assert.equal(Component.safeFocus(t2, 'gone'), 'r');
});

test('the panel shows the selected fact, else the focused claim', () => {
  const c = boot(NESTED);
  assert.equal(panelOf(c).slug, 'r');
  colOf(c, 'a').click(ev());
  assert.equal(panelOf(c).slug, 'a');
  assert.equal(panelOf(c).text, 'A');
  assert.equal(c.renderVals().fc.text, 'R');
  assert.deepEqual(unresolved(c.renderVals()), []);
});

test('the panel edits the selected fact and saves it', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  panelOf(c).onText({ target: { value: 'A edited' } });
  panelOf(c).onBy({ target: { value: 'Sam' } });
  panelOf(c).onDetails({ target: { value: 'Some detail\n\n# hash line' } });
  panelOf(c).onImportance({ target: { value: '25.5' } });
  panelOf(c).onImpact({ target: { value: '0.75' } });
  c.renderVals().bc.onBasis({ target: { value: 'Because' } });
  c.renderVals().bc.stars[2].pick();
  const n = nodeOf(c, 'a');
  assert.deepEqual([n.text, n.by, n.details, n.importance, n.impact, n.basis, n.confidence], ['A edited', 'Sam', 'Some detail\n\n# hash line', 25.5, 0.75, 'Because', 3]);
  assert.equal(c.state.map.root.text, 'R');
  reloaded(c);
  panelOf(c).onBy({ target: { value: '' } });
  panelOf(c).onDetails({ target: { value: '' } });
  assert.deepEqual([nodeOf(c, 'a').by, nodeOf(c, 'a').details], [null, null]);
  reloaded(c);
});

test('bad number input is ignored', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  for (const value of ['', '-3', 'abc']) panelOf(c).onImportance({ target: { value } });
  panelOf(c).onImpact({ target: { value: '' } });
  assert.deepEqual([nodeOf(c, 'a').importance, nodeOf(c, 'a').impact], [10, -0.5]);
  panelOf(c).onImpact({ target: { value: '7' } });
  assert.equal(nodeOf(c, 'a').impact, 1);
});

test('text can hold braces but not end in a slug block', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  panelOf(c).onText({ target: { value: 'Uses {braces} fine' } });
  assert.equal(nodeOf(c, 'a').text, 'Uses {braces} fine');
  panelOf(c).onText({ target: { value: 'Bad {slug: x}' } });
  assert.equal(nodeOf(c, 'a').text, 'Uses {braces} fine');
  assert.ok(c.state.notice);
});

test('evidence attaches to the selected fact', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  c.renderVals().ev.openAdd();
  c.renderVals().ev.onName({ target: { value: 'Src' } });
  c.renderVals().ev.save();
  assert.equal(nodeOf(c, 'a').refs[0].name, 'Src');
  reloaded(c);
});

test('add puts a child under the panel target and keeps the selection', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  c.renderVals().add.open();
  c.renderVals().add.onDraftText({ target: { value: 'New kid' } });
  c.renderVals().add.save();
  assert.deepEqual(nodeOf(c, 'a').children.map((k) => k.slug), ['kid', 'new-kid']);
  assert.equal(c.state.selectedFact, 'a');
  assert.equal(panelOf(c).kids.length, 2);
  reloaded(c);
});

test('Open focuses the fact and its children become the chart', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  panelOf(c).open();
  assert.equal(c.state.focus, 'a');
  assert.equal(c.state.selectedFact, null);
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['kid']);
});

test('delete removes the selected fact and keeps the focus', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  panelOf(c).askDel();
  panelOf(c).doDel();
  assert.equal(nodeOf(c, 'a'), undefined);
  assert.equal(c.state.focus, 'r');
  assert.equal(c.state.selectedFact, null);
  assert.equal(panelOf(c).slug, 'r');
});

test('deleting the focused claim moves up to its parent', () => {
  const c = boot(NESTED);
  c.setFocus('a');
  panelOf(c).doDel();
  assert.equal(c.state.focus, 'r');
});

test('the root and premises offer only what they can hold', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: 1\n`);
  let v = c.renderVals();
  assert.deepEqual([v.pn.canDelete, v.pn.isFact, v.bc.show, v.ev.show], [false, false, false, false]);
  colOf(c, 'p').click(ev());
  v = c.renderVals();
  assert.deepEqual([v.pn.canDelete, v.pn.isFact, v.pn.calculated, v.bc.show, v.ev.show], [true, false, true, false, false]);
  assert.equal(v.pn.signed, '+1.00');
  v.pn.onDetails({ target: { value: 'About the premise' } });
  assert.equal(c.state.map.root.children[0].details, 'About the premise');
  reloaded(c);
});

test('a selected fact removed from the source falls back cleanly', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  c.onSrc(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## B\nslug: b\nimportance: 30\nimpact: 0.5\n`);
  assert.equal(c.state.selectedFact, null);
  assert.equal(panelOf(c).slug, 'r');
  assert.deepEqual(unresolved(c.renderVals()), []);
});

test('a stale focus never crashes the render', () => {
  const c = boot(NESTED);
  c.setState({ focus: 'gone', selectedFact: 'gone-too' });
  assert.equal(panelOf(c).slug, 'r');
});

test('locked maps still select but can\'t edit', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  c.onSrc('not a map');
  assert.ok(c.state.srcErrors.length > 0);
  const v = c.renderVals();
  assert.equal(v.add.canOpen, false);
});

test('a new map\'s root text can\'t end in a slug block', () => {
  const c = boot(NESTED);
  c.renderVals().nm.onText({ target: { value: 'Fine' } });
  c.renderVals().nm.onText({ target: { value: 'Bad {slug: x}' } });
  assert.equal(c.state.newText, 'Fine');
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
