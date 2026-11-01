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
  preventDefault() {}, currentTarget: { setPointerCapture() {}, blur() {}, closest: () => ({ getBoundingClientRect: () => ({ width: 1016 }) }) }, ...props,
});

test('impact colour helpers', () => {
  assert.equal(Component.signed(0.8), '+0.80');
  assert.equal(Component.signed(-0.6), '−0.60');
  assert.equal(Component.signed(0), '0.00');
  assert.ok(Component.impactFill(-1).includes('--con') && Component.impactFill(-1).includes('100%'));
  assert.ok(Component.impactFill(0).includes('12%'));
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

// Shared fixtures for the focus view. DEEP_MAP is r > level-1 > ... > level-6.
const PREMISE_MAP = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: 1\n\n## Q\nslug: q\nkind: premise\n\n### G\nslug: g\nimportance: 1\nimpact: -0.5\n`;
const DEEP_MAP = `---\ntitle: T\n---\n\n# R\nslug: r\n` + [1, 2, 3, 4, 5, 6].map((n) => `\n${'#'.repeat(n + 1)} L${n}\nslug: level-${n}\nimportance: 1\nimpact: 0.5\n`).join('');
const imps = (c) => ['a', 'b', 'c'].map((sl) => nodeOf(c, sl).importance);
const dragDivider = (c, slug, dx) => {
  colOf(c, slug).dividerDown(ev({ clientX: 0 }));
  colOf(c, slug).dividerMove(ev({ clientX: dx })); // width 1016 less two dividers is 1000px
  colOf(c, slug).dividerUp(ev());
};
const lock = (c, slug) => colOf(c, slug).down(ev({ metaKey: true }));

test('clicking a column opens it', () => {
  const c = boot(MAP3);
  colOf(c, 'b').click(ev());
  assert.equal(c.state.focus, 'b');
});

test('a locked column keeps its size and the unlocked ones absorb the resize', () => {
  const c = boot(MAP3);
  lock(c, 'c');
  assert.ok(colOf(c, 'c').isLocked);
  dragDivider(c, 'a', 100);
  assert.deepEqual(imps(c), [20, 20, 60]);
});

test('with only the left column locked, the divider resizes the right one', () => {
  const c = boot(MAP3);
  lock(c, 'a');
  dragDivider(c, 'a', 100);
  assert.deepEqual(imps(c), [10, 20, 70]);
});

test('a divider between two locked columns does nothing, and neither does one with no unlocked column left', () => {
  const c = boot(MAP3);
  lock(c, 'a'); lock(c, 'b');
  dragDivider(c, 'a', 100);
  assert.deepEqual(imps(c), [10, 30, 60]);
  const d = boot(MAP3);
  lock(d, 'b'); lock(d, 'c');
  dragDivider(d, 'a', 100);
  assert.deepEqual(imps(d), [10, 30, 60]);
  colOf(d, 'a').dividerKey(ev({ key: 'ArrowRight' }));
  assert.deepEqual(imps(d), [10, 30, 60]);
});

test('with nothing locked, a drag changes only the resized fact', () => {
  const c = boot(MAP3);
  dragDivider(c, 'a', 500);
  assert.equal(nodeOf(c, 'b').importance, 30);
  assert.equal(nodeOf(c, 'c').importance, 60);
});

test('Clear removes locks, and moving level clears them too', () => {
  const c = boot(MAP3);
  lock(c, 'a');
  assert.equal(chartOf(c).lockCount, 1);
  chartOf(c).clearLocks();
  assert.equal(chartOf(c).lockCount, 0);
  lock(c, 'a');
  c.setFocus('b');
  assert.deepEqual(c.state.lockedFacts, []);
});

test('a lock on a point that no longer exists is ignored', () => {
  const c = boot(MAP3);
  c.setState({ lockedFacts: ['gone'] });
  assert.equal(chartOf(c).lockCount, 0);
  dragDivider(c, 'a', 500);
  assert.equal(nodeOf(c, 'b').importance, 30);
});

test('all-zero siblings resize to nothing, with no NaN', () => {
  const raws = [0, 0, 0];
  assert.deepEqual(Component.resizeImportance(raws, { divider: 0, resized: 0, move: 0.1, mode: 'trade', pool: [1, 2] }), raws);
});

test('premises can be opened but not locked', () => {
  const c = boot(PREMISE_MAP);
  chartOf(c).cols[0].down(ev({ metaKey: true }));
  assert.deepEqual(c.state.lockedFacts, []);
});

test('L toggles a lock from the keyboard, and Ctrl-click stays out of the context menu', () => {
  const c = boot(MAP3);
  colOf(c, 'c').key(ev({ key: 'l' }));
  assert.deepEqual(c.state.lockedFacts, ['c']);
  colOf(c, 'c').key(ev({ key: 'L' }));
  assert.deepEqual(c.state.lockedFacts, []);
  let prevented = false;
  colOf(c, 'a').menu({ ctrlKey: true, preventDefault() { prevented = true; } });
  assert.ok(prevented);
});

test('a lock gesture doesn\'t open the column', () => {
  const c = boot(MAP3);
  lock(c, 'a');
  colOf(c, 'a').click(ev({ metaKey: true }));
  assert.equal(c.state.focus, 'r');
});

test('vertical drag changes impact, and re-sorts only on release', () => {
  const c = boot(MAP3);
  colOf(c, 'a').down(ev({ clientY: 200 }));
  colOf(c, 'a').move(ev({ clientY: 200 - 118 })); // up by one unit: −0.5 to +0.5, past b
  assert.equal(nodeOf(c, 'a').impact, 0.5);
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['a', 'b', 'c']);
  assert.ok(chartOf(c).thermo.has);
  colOf(c, 'a').up(ev());
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['b', 'a', 'c']);
  assert.equal(chartOf(c).thermo.has, false);
  colOf(c, 'a').click(ev()); // the click that ends a drag doesn't open it
  assert.equal(c.state.focus, 'r');
});

test('impact stays within range when dragged far', () => {
  const c = boot(MAP3);
  colOf(c, 'a').down(ev({ clientY: 0 }));
  colOf(c, 'a').move(ev({ clientY: 5000 }));
  assert.equal(nodeOf(c, 'a').impact, -1);
});

test('keyboard impact holds the order until the column loses focus', () => {
  const c = boot(MAP3);
  for (let n = 0; n < 12; n++) colOf(c, 'a').key(ev({ key: 'ArrowUp' }));
  near(nodeOf(c, 'a').impact, 0.1);
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['a', 'b', 'c']);
  colOf(c, 'a').blur(ev());
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['b', 'a', 'c']);
  colOf(c, 'b').key(ev({ key: 'Enter' }));
  assert.equal(c.state.focus, 'b');
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

test('premise columns can be opened but not dragged', () => {
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
  assert.match(c.renderVals().health.label, /^Leading: /);
  colOf(c, 'q').click(ev());
  assert.equal(c.state.focus, 'q');
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

test('the chart view switch only shows on the bar view', () => {
  const c = boot(MAP3);
  assert.equal(c.renderVals().chartViewsShown, true);
  for (const view of ['pie', 'source', 'diff']) { c.setState({ view }); assert.equal(c.renderVals().chartViewsShown, false, view); }
});

test('the header menu opens, and closes after a choice', () => {
  const c = boot(MAP3);
  c.renderVals().menu.toggle();
  assert.equal(c.renderVals().menu.open, true);
  c.renderVals().menu.fresh();
  assert.equal(c.renderVals().menu.open, false);
  assert.equal(c.state.newOpen, true);
});

test('the "+" buttons start at the agreed impacts, with importance 50', () => {
  const start = (pick) => { const c = boot(MAP3); pick(c.renderVals().add); return c.state.adding.impact; };
  assert.equal(start((a) => a.left()), -0.5);
  assert.equal(start((a) => a.right()), 0.5);
  const c = boot(MAP3);
  c.renderVals().add.left();
  c.setState({ draftText: 'New point', draftImpact: -0.25 });
  c.commitAdd();
  const n = nodeOf(c, 'new-point');
  assert.equal(n.importance, 50);
  assert.equal(n.impact, -0.25);
  assert.equal(chartOf(c).cols[1].slug, 'new-point'); // between a (-0.5) and b (0)
  assert.equal(c.state.adding, null);
  assert.deepEqual(Component.parse(c.state.src).map, c.state.map);
});

test('an empty point offers one wide "+", starting at 0', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n`);
  assert.equal(chartOf(c).hasCols, false);
  assert.equal(chartOf(c).empty, true);
  assert.equal(c.renderVals().add.wideLabel, 'Add the first point');
  c.renderVals().add.wide();
  assert.equal(c.state.adding.impact, 0);
});

test('on premises every "+" adds an option, with no impact', () => {
  const c = boot(PREMISE_MAP);
  c.renderVals().add.left();
  assert.equal(c.state.adding.isPremise, true);
  assert.equal(c.renderVals().add.isFact, false);
  c.setState({ draftText: 'Another' });
  c.commitAdd();
  const n = c.state.map.root.children.find((k) => k.text === 'Another');
  assert.deepEqual([n.kind, n.importance, n.impact], ['premise', null, null]);
  assert.deepEqual(Component.parse(c.state.src).map, c.state.map);
});

test('Add option starts the first option on an empty root', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n`);
  c.renderVals().tb.addPremise();
  assert.equal(c.state.adding.isPremise, true);
  c.setState({ draftText: 'One' });
  c.commitAdd();
  assert.equal(c.state.map.root.children[0].kind, 'premise');
});

test('a description is kept, a blank title cannot be added, and read-only maps offer no "+"', () => {
  const c = boot(MAP3);
  c.renderVals().add.right();
  c.setState({ draftText: 'X1', draftDetails: 'Why' });
  c.commitAdd();
  assert.equal(nodeOf(c, 'x1').details, 'Why');
  c.renderVals().add.right();
  c.setState({ draftText: '   ' });
  assert.equal(c.renderVals().add.commitDisabled, true);
  c.setState({ draftText: '?!' });
  assert.equal(c.renderVals().add.commitDisabled, true);
  const bad = boot(MAP3);
  bad.onSrc('not a map');
  assert.equal(bad.renderVals().add.canOpen, false);
});

test('Escape cancels the dialog, and Enter in the title commits it', () => {
  const c = boot(MAP3);
  c.renderVals().add.right();
  c.renderVals().add.onDialogKey(ev({ key: 'Escape' }));
  assert.equal(c.state.adding, null);
  c.renderVals().add.right();
  c.renderVals().add.onText({ target: { value: 'Kept' } });
  c.renderVals().add.onKey(ev({ key: 'Enter' }));
  assert.ok(nodeOf(c, 'kept'));
});

// ---------------------------------------------------------------- the details panel
const panelOf = (c) => c.renderVals().pn;
const reloaded = (c) => assert.deepEqual(Component.parse(c.state.src).map, c.state.map);
const NESTED = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 10\nimpact: -0.5\n\n### Kid\nslug: kid\nimportance: 1\nimpact: 1\n\n## B\nslug: b\nimportance: 30\nimpact: 0.5\n`;

test('the share slider changes only this fact, and clamps', () => {
  near(Component.importanceForShare([10, 30, 60], 0, 0.5), 90);
  near(Component.importanceForShare([10, 30, 60], 0, 0.99), 810); // clamped to 90%
  near(Component.importanceForShare([10, 30, 60], 0, 0), 90 * 0.02 / 0.98);
  assert.equal(Component.importanceForShare([10, 0, 0], 0, 0.5), 10); // no siblings with weight to scale against
});

test('the slider on the open point writes only its own importance', () => {
  const c = boot(MAP3);
  c.setFocus('a');
  panelOf(c).onShare({ target: { value: '50' } });
  assert.deepEqual(['a', 'b', 'c'].map((sl) => nodeOf(c, sl).importance), [90, 30, 60]);
  assert.equal(panelOf(c).pct, '50');
});

test('an only child can\'t change its share', () => {
  const c = boot(DEEP_MAP);
  c.setFocus('level-2');
  assert.equal(panelOf(c).shareDisabled, true);
  c.setFocus('r');
});

test('the health label follows the score, ignoring small values', () => {
  const label = (n) => Component.healthLabel(n);
  assert.equal(label(0.05), 'Balanced');
  assert.equal(label(-0.1), 'Balanced');
  assert.equal(label(0.4), 'Mostly supported');
  assert.equal(label(-0.4), 'Mostly contrary');
});

test('a point with no children reads No points yet, and options show the leader', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n`);
  assert.equal(c.renderVals().health.label, 'No points yet');
  assert.equal(c.renderVals().health.has, false);
  const p = boot(PREMISE_MAP);
  assert.equal(p.renderVals().health.label, 'Leading: P');
  assert.equal(p.renderVals().health.signed, '+1.00');
});

test('the health bar grows from the centre on the side of the score', () => {
  const c = boot(MAP3); // score is (10 × -0.5 + 60 × 0.5) ÷ 100 = 0.25
  const h = c.renderVals().health;
  assert.equal(h.signed, '+0.25');
  assert.equal(h.left, '50.0');
  assert.equal(h.width, '12.5');
  assert.equal(h.fill, 'var(--pro-fill)');
});

test('editing the root title follows the file title only if they matched', () => {
  const c = boot(`---\ntitle: R\n---\n\n# R\nslug: r\n`);
  c.renderVals().pn.onText({ target: { value: 'New' } });
  assert.equal(c.state.map.title, 'New');
  const d = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n`);
  d.renderVals().pn.onText({ target: { value: 'New' } });
  assert.equal(d.state.map.title, 'T');
});

test('a slug never changes when text is edited', () => {
  const c = boot(MAP3);
  c.setFocus('a');
  c.renderVals().pn.onText({ target: { value: 'Different' } });
  assert.equal(nodeOf(c, 'a').slug, 'a');
});

test('breadcrumbs list every level above, with the whole title and the point\'s values', () => {
  const c = boot(DEEP_MAP);
  c.setFocus('level-6');
  const v = c.renderVals();
  assert.equal(v.crumbs.length, 6);
  assert.equal(v.crumbs[0].title, 'R');
  assert.equal(v.crumbCurrent, 'L6');
  assert.equal(v.crumbMeta, '+0.50 · 100% of this level');
  v.crumbs[2].go();
  assert.equal(c.state.focus, 'level-2');
  assert.equal(boot(DEEP_MAP).renderVals().hasParent, false);
});

test('safeFocus falls back to what exists', () => {
  const t2 = rootOf([fact('a', 1, 0, [fact('b', 1, 0)])]);
  assert.equal(Component.safeFocus(t2, 'b'), 'b');
  assert.equal(Component.safeFocus(t2, 'gone'), 'r');
});

test('the panel shows the point in focus', () => {
  const c = boot(NESTED);
  assert.equal(panelOf(c).slug, 'r');
  colOf(c, 'a').click(ev());
  assert.equal(panelOf(c).slug, 'a');
  assert.equal(panelOf(c).text, 'A');
  assert.deepEqual(unresolved(c.renderVals()), []);
});

test('the panel edits the point in focus and saves it', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  panelOf(c).onText({ target: { value: 'A edited' } });
  panelOf(c).onBy({ target: { value: 'Sam' } });
  panelOf(c).onDetails({ target: { value: 'Some detail\n\n# hash line' } });
  panelOf(c).onImpact({ target: { value: '0.75' } });
  c.renderVals().bc.onBasis({ target: { value: 'Because' } });
  c.renderVals().bc.stars[2].pick();
  const n = nodeOf(c, 'a');
  assert.deepEqual([n.text, n.by, n.details, n.impact, n.basis, n.confidence], ['A edited', 'Sam', 'Some detail\n\n# hash line', 0.75, 'Because', 3]);
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
  for (const value of ['', 'abc']) panelOf(c).onShare({ target: { value } });
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

test('evidence attaches to the point in focus', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  c.renderVals().ev.openAdd();
  c.renderVals().ev.onName({ target: { value: 'Src' } });
  c.renderVals().ev.save();
  assert.equal(nodeOf(c, 'a').refs[0].name, 'Src');
  reloaded(c);
});

test('add puts a child under the point in focus', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  c.renderVals().add.right();
  c.renderVals().add.onText({ target: { value: 'New kid' } });
  c.renderVals().add.commit();
  assert.deepEqual(nodeOf(c, 'a').children.map((k) => k.slug), ['kid', 'new-kid']);
  assert.equal(c.state.focus, 'a');
  reloaded(c);
});

test('opening a point makes its children the chart', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  assert.deepEqual(chartOf(c).cols.map((x) => x.slug), ['kid']);
});

test('delete removes the point in focus and moves up to its parent', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  panelOf(c).askDel();
  panelOf(c).doDel();
  assert.equal(nodeOf(c, 'a'), undefined);
  assert.equal(c.state.focus, 'r');
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

test('a focused point removed from the source falls back cleanly', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  c.onSrc(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## B\nslug: b\nimportance: 30\nimpact: 0.5\n`);
  assert.equal(panelOf(c).slug, 'r');
  assert.deepEqual(unresolved(c.renderVals()), []);
});

test('a stale focus never crashes the render', () => {
  const c = boot(NESTED);
  c.setState({ focus: 'gone' });
  assert.equal(panelOf(c).slug, 'r');
});

test('locked maps still open points but can\'t edit', () => {
  const c = boot(NESTED);
  colOf(c, 'a').click(ev());
  c.onSrc('not a map');
  assert.ok(c.state.srcErrors.length > 0);
  const v = c.renderVals();
  assert.equal(v.add.canOpen, false);
});

test('a new map\'s title can\'t end in a slug block', () => {
  const c = boot(NESTED);
  c.renderVals().nm.onTitle({ target: { value: 'Fine' } });
  c.renderVals().nm.onTitle({ target: { value: 'Bad {slug: x}' } });
  assert.equal(c.state.newTitle, 'Fine');
});

// ---------------------------------------------------------------- overview, sunburst and diff
const mapOf = (root) => ({ title: 'T', display: {}, root });
const rowsFor = (a, b) => Component.diff(mapOf(rootOf(a)), mapOf(rootOf(b)), 10).rows;
const rowOf = (rows, slug) => rows.find((r) => r.slug === slug);

test('an impact change alone counts as changed, at threshold ÷ 100', () => {
  const d = rowOf(rowsFor([fact('a', 1, 0.8)], [fact('a', 1, 0.1)]), 'a');
  assert.ok(d.changed && !d.flipped);
  near(d.impactDelta, -0.7);
  assert.equal(rowOf(rowsFor([fact('a', 1, 0.8)], [fact('a', 1, 0.75)]), 'a').changed, false);
});

test('a share change counts as changed, in percentage points', () => {
  const d = rowOf(rowsFor([fact('a', 50, 0), fact('b', 50, 0)], [fact('a', 70, 0), fact('b', 30, 0)]), 'a');
  assert.ok(d.changed);
  near(d.shareDelta, 20);
  near(d.shareA, 50);
  near(d.shareB, 70);
});

test('flipped needs strictly opposite signs', () => {
  assert.equal(rowOf(rowsFor([fact('a', 1, 0.5)], [fact('a', 1, -0.5)]), 'a').flipped, true);
  const d = rowOf(rowsFor([fact('a', 1, 0.5)], [fact('a', 1, 0)]), 'a');
  assert.ok(d.changed && !d.flipped);
});

test('a premise compares on its calculated values', () => {
  const d = rowOf(rowsFor([prem('p', [fact('x', 1, 1)]), prem('q', [])], [prem('p', [fact('x', 1, -1)]), prem('q', [])]), 'p');
  assert.equal(d.flipped, true);
});

test('rows for a fact only on one side have no deltas', () => {
  const rows = rowsFor([fact('a', 1, 1)], [fact('a', 1, 1), fact('b', 1, 1)]);
  assert.equal(rowOf(rows, 'b').status, 'onlyB');
  assert.equal(rowOf(rows, 'b').shareDelta, null);
  assert.equal(rowOf(rows, 'b').changed, false);
  assert.equal(rowOf(rows, 'r').changed, false);
});

test('layout values never collapse', () => {
  const lv = Component.allValues(rootOf([fact('a', 0, 1), fact('b', 10, 1)]));
  near(Component.layoutWeight({ slug: 'a' }, lv), 0.01);
});

test('whole-map shares add up', () => {
  const root = rootOf([fact('a', 1, 1, [fact('x', 1, 1), fact('y', 3, 1)]), fact('b', 1, -1)]);
  const sh = Component.shares(mapOf(root), Component.allValues(root));
  near(sh.get('a'), 0.5);
  near(sh.get('y'), 0.375);
});

test('the overview and sunburst colour by impact', () => {
  const c = boot(MAP3);
  const v = c.renderVals();
  assert.ok(v.ice.boxes.some((b) => b.bg === Component.impactFill(0.5)));
  c.setState({ view: 'pie' });
  const p = c.renderVals();
  assert.ok(p.pie.slices.some((b) => b.fill === Component.impactFill(-0.5)));
  assert.equal(p.pie.legend.length, 3);
  assert.equal(p.pie.legend[0].swatch, Component.impactFill(-0.5));
  assert.deepEqual(unresolved(p), []);
});

test('every diff tab, chip and selection renders', () => {
  for (const diffTab of ['sankey', 'table', 'structure']) {
    for (const diffFilter of ['all', 'changed', 'onlyA', 'onlyB', 'flipped', 'moved', 'text']) {
      const c = boot(LEGACY_A, LEGACY_B);
      c.setState({ view: 'diff', diffTab, diffFilter });
      assert.deepEqual(unresolved(c.renderVals()), [], `${diffTab}/${diffFilter}`);
    }
    const c = boot(LEGACY_A, LEGACY_B);
    c.setState({ view: 'diff', diffTab, diffSel: 'pay-tax', diffHover: 'pay-tax' });
    assert.deepEqual(unresolved(c.renderVals()), [], `${diffTab} selected`);
  }
});

test('a diff can compare premises', () => {
  const src = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: 1\n`;
  const c = boot(src, src.replace('impact: 1', 'impact: -1'));
  c.setState({ view: 'diff', diffSel: 'p' });
  const v = c.renderVals();
  assert.deepEqual(unresolved(v), []);
  assert.equal(v.diff.leans[0].signed, '—');
  c.setState({ diffTab: 'table', diffSel: null });
  assert.ok(c.renderVals().diff.rows.some((r) => r.badges.some((b) => b.label === 'Flipped')));
});

test('the diff table has no NaN', () => {
  const c = boot(LEGACY_A, LEGACY_B);
  c.setState({ view: 'diff', diffTab: 'table' });
  assert.ok(!JSON.stringify(c.renderVals().diff.rows).includes('NaN'));
});

// ---------------------------------------------------------------- the port is complete
const HELPERS = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## Bad fact\nslug: a\nimportance: 1\nimpact: -0.5\n\n## Zero fact\nslug: b\nimportance: 1\nimpact: 0\n\n## Good fact\nslug: c\nimportance: 1\nimpact: 0.5\n`;
function capturingFetch(run) {
  const bodies = [];
  const real = globalThis.fetch;
  globalThis.fetch = (url, o) => { bodies.push(String(o && o.body)); return new Promise(() => {}); };
  try { run(); } finally { globalThis.fetch = real; }
  return bodies.join('\n');
}

test('check rationale splits by the sign of impact and skips zero', () => {
  const c = boot(HELPERS);
  c.setState({ apiKeySaved: 'k' });
  assert.ok(c.renderVals().rat.show);
  const sent = capturingFetch(() => c.renderVals().rat.run());
  assert.ok(sent.includes('Bad fact') && sent.includes('Good fact'), sent);
  assert.ok(!sent.includes('Zero fact'), sent);
});

test('research describes a fact by the sign of its impact', () => {
  const c = boot(HELPERS);
  c.setState({ orKeySaved: 'k' });
  colOf(c, 'a').click(ev());
  assert.ok(capturingFetch(() => c.renderVals().ev.research()).includes('against'));
  c.setFocus('r');
  colOf(c, 'c').click(ev());
  assert.ok(capturingFetch(() => c.renderVals().ev.research()).includes('for'));
});

test('no pro/con model remains outside the old-format reader', () => {
  const live = m[1].replace(/  static parseLegacy[\s\S]*?  static parseRef/, '  static parseRef').replace(/  static parseAttrs[\s\S]*?  static serialize/, '  static serialize');
  // l.side and b.side are the Sankey's A/B side of a link or bar, not a node's pro/con.
  for (const dead of [/(?<!\b[lb])\.side\b/, /\.weight\b/, /withLegacyFields/, /scoreAll/, /orderedKids/, /pros and cons/i]) assert.ok(!dead.test(live), String(dead));
});

test('the format help describes the current format', () => {
  const tpl = template;
  assert.ok(tpl.includes('importance: 60') && tpl.includes('kind: premise'));
  assert.ok(!tpl.includes('[+]') && !tpl.includes('[*]'));
  assert.ok(tpl.includes('Compare options instead of one thesis'));
});

test('a new map takes its slug from the title, with an optional description', () => {
  const c = boot();
  c.setState({ newTitle: 'Where to?', newDesc: '', newOptions: [] });
  c.createMap();
  assert.equal(c.state.map.root.slug, 'where-to');
  assert.equal(c.state.map.root.text, 'Where to?');
  assert.equal(c.state.map.title, 'Where to?');
  assert.equal(c.state.map.root.details, null);
  assert.equal(Component.parse(c.state.src).errors.length, 0);
  reloaded(c);
});

test('a description becomes the root details', () => {
  const c = boot();
  c.setState({ newTitle: 'T1', newDesc: 'Why it matters', newOptions: [] });
  c.createMap();
  assert.equal(c.state.map.root.details, 'Why it matters');
});

test('options become premises with unique slugs, and blanks are ignored', () => {
  const c = boot();
  c.setState({ newTitle: 'Lisbon', newDesc: '', newOptions: ['Lisbon', 'lisbon', '  ', 'Berlin'] });
  c.createMap();
  const kids = c.state.map.root.children;
  assert.deepEqual(kids.map((k) => k.kind), ['premise', 'premise', 'premise']);
  const slugs = [c.state.map.root.slug, ...kids.map((k) => k.slug)];
  assert.equal(new Set(slugs).size, 4);
  assert.equal(Component.parse(c.state.src).errors.length, 0);
  reloaded(c);
});

test('Create is disabled until the title has a letter or digit', () => {
  const c = boot();
  c.setState({ newOpen: true, newTitle: '?!' });
  assert.equal(c.renderVals().nm.createDisabled, true);
  c.setState({ newTitle: 'a' });
  assert.equal(c.renderVals().nm.createDisabled, false);
});

test('the card can add and remove options', () => {
  const c = boot();
  c.renderVals().nm.startOptions();
  assert.equal(c.renderVals().nm.options.length, 2);
  c.renderVals().nm.addOption();
  c.renderVals().nm.options[1].onChange({ target: { value: 'Mid' } });
  c.renderVals().nm.options[0].remove();
  assert.deepEqual(c.state.newOptions, ['Mid', '']);
});

test('with no map open the new-map card shows without Cancel', () => {
  const c = boot('');
  assert.equal(c.renderVals().hasMap, false);
  assert.equal(c.renderVals().nm.open, true);
  assert.equal(c.renderVals().nm.canCancel, false);
  const d = boot(MAP3);
  assert.equal(d.renderVals().nm.open, false);
  d.setState({ newOpen: true });
  assert.equal(d.renderVals().nm.canCancel, true);
  assert.equal(d.renderVals().pageDisplay, 'none');
});

test('an edit turns an old-format source into the new format', () => {
  const c = boot(LEGACY_A);
  assert.ok(c.state.src.includes('[+]'));
  colOf(c, 'pay-tax').click(ev());
  panelOf(c).onImpact({ target: { value: '0.5' } });
  assert.ok(!c.state.src.includes('[+]') && c.state.src.includes('impact: 0.5'));
  reloaded(c);
});

test('the examples are migrated and keep every fact', () => {
  for (const [f, fixture] of [['map', LEGACY_A], ['obi', LEGACY_B]]) {
    const src = fs.readFileSync(`examples/votes-at-16/${f}.md`, 'utf8');
    assert.ok(!src.includes('[+]') && !src.includes('[-]'), f);
    const { map, errors } = Component.parse(src);
    assert.deepEqual(errors, []);
    assert.deepEqual(map, Component.parse(fixture).map, f);
  }
});

// ---------------------------------------------------------------- findings from the whole-branch review
test('deleting a pinned claim falls back instead of crashing', () => {
  const c = boot(NESTED);
  c.setFocus('a');
  c.setState({ pinned: 'a' });
  panelOf(c).doDel();
  assert.doesNotThrow(() => c.renderVals());
  c.setState({ pinned: 'gone' });
  assert.equal(c.renderVals().pie.pinPressed, 'false');
});

test('column text stays on a readable backing at every impact', () => {
  const c = boot(MAP3.replace('impact: 0.5', 'impact: 0.6'));
  const col = colOf(c, 'c');
  assert.equal(col.ink, 'var(--ink)');
  const filled = template.slice(template.indexOf('{{c.isFilled}}'), template.indexOf('{{c.hasDivider}}'));
  assert.equal((filled.match(/color-mix\(in srgb, var\(--card\) 80%, transparent\)/g) || []).length, 2);
  const slice = template.slice(template.indexOf('{{pie.labels}}'), template.indexOf('{{pie.centerClick}}'));
  assert.ok(slice.includes('color-mix(in srgb, var(--card) 80%, transparent)'));
});

test('ending an impact drag drops keyboard focus, so arrows can\'t edit a neighbour', () => {
  const c = boot(MAP3);
  let blurred = 0;
  const target = { setPointerCapture() {}, blur() { blurred++; } };
  colOf(c, 'a').down(ev({ clientY: 200, currentTarget: target }));
  colOf(c, 'a').move(ev({ clientY: 82, currentTarget: target }));
  colOf(c, 'a').up(ev({ currentTarget: target }));
  assert.equal(blurred, 1);
  const plain = boot(MAP3);
  colOf(plain, 'a').down(ev({ clientY: 200, currentTarget: target }));
  colOf(plain, 'a').up(ev({ currentTarget: target }));
  assert.equal(blurred, 1); // a plain click keeps focus
});

test('scale resize does nothing when nothing past the divider has importance', () => {
  const scale = (raws, divider, resized, move) => Component.resizeImportance(raws, { divider, resized, move, mode: 'scale' });
  assert.deepEqual(scale([0, 10, 5], 0, 1, 0), [0, 10, 5]);
  assert.deepEqual(scale([0, 10, 5], 0, 1, 0.01), [0, 10, 5]);
  assert.deepEqual(scale([5, 10, 0, 0], 1, 1, 0.01), [5, 10, 0, 0]);
});

test('opening a diff row goes through the normal focus change', () => {
  const c = boot(LEGACY_A, LEGACY_B);
  c.setState({ view: 'map' });
  colOf(c, 'pay-tax').click(ev());
  c.setState({ view: 'diff', diffTab: 'table', lockedFacts: ['pay-tax'] });
  c.renderVals().diff.rows.find((r) => r.text.startsWith('Teenagers don')).open();
  assert.equal(c.state.view, 'map');
  assert.equal(c.state.focus, 'inexperience');
  assert.deepEqual(c.state.lockedFacts, []);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
