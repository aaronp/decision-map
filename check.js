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
const pending = [];
function test(name, fn) {
  const fail = (e) => { failed++; console.error(`FAIL ${name}\n  ${e.message}`); };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') pending.push(r.then(() => { passed++; }, fail));
    else passed++;
  } catch (e) { fail(e); }
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
const nodeOf = (c, slug) => (Component.findPath(c.state.map.root, slug) ?? [undefined]).at(-1);
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

test('a drag changes only the two columns either side of the border', () => {
  const c = boot(MAP3);
  const before = Component.serialize(c.state.map);
  // Width 1016 less two 8px dividers leaves 1000px of columns, so 500px is half the total.
  colOf(c, 'a').dividerDown(ev({ clientX: 100 }));
  colOf(c, 'a').dividerMove(ev({ clientX: 600 }));
  colOf(c, 'a').dividerUp(ev());
  assert.deepEqual(['a', 'b', 'c'].map((x) => nodeOf(c, x).importance), [38, 2, 60]); // b stops at the 2% floor
  const changed = Component.serialize(c.state.map).split('\n').filter((l, i) => l !== before.split('\n')[i]);
  assert.equal(changed.length, 2);
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
const choose = (c, slug) => colOf(c, slug).down(ev({ metaKey: true }));

test('clicking a column opens it', () => {
  const c = boot(MAP3);
  colOf(c, 'b').click(ev());
  assert.equal(c.state.focus, 'b');
});

test('chosen columns absorb a resize and the others keep their size', () => {
  const c = boot(MAP3);
  choose(c, 'c');
  assert.ok(colOf(c, 'c').isChosen);
  dragDivider(c, 'a', 100);
  assert.deepEqual(imps(c), [20, 30, 50]);
});

test('with only the left column chosen, the divider resizes the right one from it', () => {
  const c = boot(MAP3);
  choose(c, 'a');
  dragDivider(c, 'a', 100);
  assert.deepEqual(imps(c), [20, 20, 60]);
});

test('a border away from the chosen column: the far neighbour and the chosen one change', () => {
  const c = boot(MAP3);
  choose(c, 'a');
  dragDivider(c, 'b', 100);
  assert.deepEqual(imps(c), [20, 30, 50]); // c shrinks, a grows, b slides
});

test('with nothing chosen, a drag leaves the columns away from the border alone', () => {
  const c = boot(MAP3);
  dragDivider(c, 'a', 500);
  assert.equal(nodeOf(c, 'c').importance, 60);
  assert.equal(nodeOf(c, 'b').importance, 2);
});

test('depth cells line up under their parent column, at every level', () => {
  const c = boot(DEEP_MAP);
  const values = Component.allValues(c.state.map.root);
  const rows = Component.factRows(c.state.map.root, values);
  const cells = Component.depthCells(rows, values);
  assert.equal(Math.max(...cells.map((x) => x.row)), 4); // level-2 to level-6, past the old overview's limit of 5 levels
  for (const cell of cells) assert.ok(cell.x >= 0 && cell.x + cell.w <= 1 + 1e-9);
});

test('siblings in a depth row share their parent width, sorted by impact', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 50\nimpact: 0\n\n### P\nslug: p\nimportance: 1\nimpact: 1\n\n### Q\nslug: q\nimportance: 3\nimpact: -1\n\n## B\nslug: b\nimportance: 50\nimpact: 1\n`);
  const values = Component.allValues(c.state.map.root);
  const cells = Component.depthCells(Component.factRows(c.state.map.root, values), values);
  assert.deepEqual(cells.map((x) => x.node.slug), ['q', 'p']);
  near(cells[0].w, 0.375);
  near(cells[1].x, 0.375);
  assert.deepEqual(cells.map((x) => x.topIndex), [0, 0]);
});

test('zero-importance children produce no NaN', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 50\nimpact: 0\n\n### P\nslug: p\nimportance: 0\nimpact: 1\n\n### Q\nslug: q\nimportance: 0\nimpact: -1\n`);
  const values = Component.allValues(c.state.map.root);
  for (const cell of Component.depthCells(Component.factRows(c.state.map.root, values), values)) assert.ok(Number.isFinite(cell.x) && Number.isFinite(cell.w));
});

test('clicking a depth cell opens it', () => {
  const c = boot(DEEP_MAP);
  chartOf(c).depth.cells[0].open();
  assert.equal(c.state.focus, 'level-2');
});

test('depth cells line up with the dividers and dim under a filter', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 1\nimpact: -1\n\n## B\nslug: b\nimportance: 1\nimpact: 1\n\n### K\nslug: k\nimportance: 1\nimpact: 1\n`);
  const d = chartOf(c).depth;
  assert.equal(d.has, true);
  assert.equal(d.height, 30);
  assert.equal(d.cells[0].left, 'calc((100% - 8px) * 0.5 + 8px)');
  assert.equal(d.cells[0].width, 'calc((100% - 8px) * 0.5 - 1px)');
  c.setState({ q: 'zzz-no-match' });
  assert.equal(chartOf(c).depth.cells[0].op, 0.22);
  assert.equal(chartOf(boot(MAP3)).depth.has, false);
});

test('choices are kept across levels until Clear', () => {
  const c = boot(MAP3);
  choose(c, 'a');
  assert.equal(chartOf(c).chosenCount, 1);
  c.setFocus('b');
  assert.deepEqual(c.state.chosenFacts, ['a']);
  assert.equal(chartOf(c).chosenCount, 1, 'counted from any level');
  chartOf(c).clearChosen();
  assert.equal(chartOf(c).chosenCount, 0);
});

test('a choose on a point that no longer exists is ignored', () => {
  const c = boot(MAP3);
  c.setState({ chosenFacts: ['gone'] });
  assert.equal(chartOf(c).chosenCount, 0);
  dragDivider(c, 'a', 500);
  assert.equal(nodeOf(c, 'c').importance, 60);
});

test('all-zero siblings resize to nothing, with no NaN', () => {
  assert.deepEqual(Component.borderResize([0, 0, 0], 0, 0.1, []), [0, 0, 0]);
  assert.deepEqual(Component.borderResize([0, 10, 5], 0, -0.01, []), [0, 10, 5]); // a zero column can't give any up
});

test('premises can be opened but not chosen', () => {
  const c = boot(PREMISE_MAP);
  chartOf(c).cols[0].down(ev({ metaKey: true }));
  assert.deepEqual(c.state.chosenFacts, []);
});

test('L toggles a choose from the keyboard, and Ctrl-click stays out of the context menu', () => {
  const c = boot(MAP3);
  colOf(c, 'c').key(ev({ key: 'l' }));
  assert.deepEqual(c.state.chosenFacts, ['c']);
  colOf(c, 'c').key(ev({ key: 'L' }));
  assert.deepEqual(c.state.chosenFacts, []);
  let prevented = false;
  colOf(c, 'a').menu({ ctrlKey: true, preventDefault() { prevented = true; } });
  assert.ok(prevented);
});

test('a choose gesture doesn\'t open the column', () => {
  const c = boot(MAP3);
  choose(c, 'a');
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
  assert.deepEqual(imps(c), [12, 28, 60]);
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

test('depth cells colour by impact', () => {
  assert.equal(chartOf(boot(NESTED)).depth.cells[0].bg, Component.impactFill(1));
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

test('the sunburst colours by impact', () => {
  const c = boot(MAP3);
  c.setState({ view: 'pie' });
  const p = c.renderVals();
  assert.ok(p.pie.slices.some((b) => b.fill === Component.impactFill(-0.5)));
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
const pieOf = (c) => { c.setState({ view: 'pie' }); return c.renderVals().pie; };
const ctlsOf = (c) => pieOf(c).slices.flatMap((x) => x.ctls);
const editing = (c) => { pieOf(c).toggleEdit(); return c; };
const movesOf = (c, slug) => { pieOf(c).slices.find((x) => x.slug === slug).enter(); return pieOf(c).slices.find((x) => x.slug === slug).moves; };

test('the hover buttons only show in edit mode, toggled next to the pin', () => {
  const c = boot(MAP3);
  assert.equal(pieOf(c).editPressed, 'false');
  assert.equal(movesOf(c, 'b').length, 0);
  assert.equal(ctlsOf(c).length, 0);
  editing(c);
  assert.equal(pieOf(c).editPressed, 'true');
  assert.equal(ctlsOf(c).length, 3);
  assert.equal(pieOf(c).slices.find((x) => x.slug === 'b').moves.length, 2);
  const at = template.indexOf('{{pie.toggleEdit}}');
  assert.ok(at > 0 && Math.abs(at - template.indexOf('{{pie.togglePin}}')) < 2000);
  assert.ok(!template.includes('{{pie.edges}}'), 'no hot zone on the edges');
});

test('a hovered inner slice gets a move handle at each edge it shares, none at the wrap', () => {
  const c = editing(boot(MAP3));
  assert.deepEqual(['a', 'b', 'c'].map((x) => movesOf(c, x).length), [1, 2, 1]);
  const p = editing(boot(PREMISE_MAP));
  assert.equal(movesOf(p, pieOf(p).slices[0].slug).length, 0);
  const d = editing(boot(DEEP_MAP));
  assert.equal(movesOf(d, pieOf(d).slices.find((x) => x.depth > 1).slug).length, 0);
});

test('a move handle moves its edge: the two slices either side trade', () => {
  const c = editing(boot(MAP3));
  movesOf(c, 'b')[0].key(ev({ key: 'ArrowRight' }));
  assert.deepEqual(imps(c), [12, 28, 60]);
});

test('angleDelta takes the short way around', () => {
  near(Component.angleDelta(3, -3), 2 * Math.PI - 6);
  near(Component.angleDelta(-3, 3), 6 - 2 * Math.PI);
  near(Component.angleDelta(0, 0.5), 0.5);
});

test('dragging a slice edge takes from the chosen slices only', () => {
  const c = boot(MAP3);
  pieOf(c).slices.find((x) => x.slug === 'c').down(ev({ metaKey: true }));
  assert.deepEqual(c.state.chosenFacts, ['c']);
  editing(c);
  const rect = { left: 0, top: 0, width: 200, height: 200 };
  const e = (x, y) => ev({ clientX: x, clientY: y, currentTarget: { setPointerCapture() {}, closest: () => ({ getBoundingClientRect: () => rect }) } });
  const handle = movesOf(c, 'a')[0];
  handle.down(e(100, 0)); // straight up from the centre
  c.renderVals().pie.leave();
  assert.equal(pieOf(c).slices.find((x) => x.slug === 'a').moves.length, 1, 'the handle stays while dragging');
  handle.move(e(200, 100)); // a quarter turn clockwise, or 0.25 of the total
  handle.up(e(200, 100));
  assert.equal(nodeOf(c, 'b').importance, 30);
  near(nodeOf(c, 'a').importance + nodeOf(c, 'c').importance, 70);
  assert.ok(nodeOf(c, 'a').importance > 10);
});

test('with nothing chosen, a slice edge trades its two slices, and arrows work', () => {
  const c = editing(boot(MAP3));
  movesOf(c, 'a')[0].key(ev({ key: 'ArrowRight' }));
  assert.deepEqual(imps(c), [12, 28, 60]);
});

test('slices on any ring can be chosen, and a chosen slice shows it', () => {
  const c = boot(DEEP_MAP);
  const deep = pieOf(c).slices.find((x) => x.depth > 1);
  deep.down(ev({ metaKey: true }));
  assert.deepEqual(c.state.chosenFacts, [deep.slug]);
  const inner = pieOf(c).slices.find((x) => x.depth === 1);
  inner.key(ev({ key: 'l' }));
  assert.deepEqual(c.state.chosenFacts, [deep.slug, 'level-1']);
  assert.equal(pieOf(c).slices.find((x) => x.slug === deep.slug).isChosen, true);
  assert.equal(pieOf(c).hatches.length, 2);
});

const TWO_DEEP = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 50\nimpact: -0.5\n\n### X\nslug: x\nimportance: 10\nimpact: -0.6\n\n### Y\nslug: y\nimportance: 30\nimpact: 0\n\n### Z\nslug: z\nimportance: 60\nimpact: 0.6\n\n## B\nslug: b\nimportance: 50\nimpact: 0.5\n`;

test('a deeper ring gets move handles that trade only among its own chosen siblings', () => {
  const c = editing(boot(TWO_DEEP));
  assert.deepEqual(['x', 'y', 'z'].map((v) => movesOf(c, v).length), [1, 2, 1]);
  pieOf(c).slices.find((v) => v.slug === 'z').down(ev({ metaKey: true }));
  movesOf(c, 'x')[0].key(ev({ key: 'ArrowRight' }));
  assert.equal(nodeOf(c, 'y').importance, 30);
  assert.equal(nodeOf(c, 'a').importance, 50);
  near(nodeOf(c, 'x').importance + nodeOf(c, 'z').importance, 70);
  assert.ok(nodeOf(c, 'x').importance > 10);
});

test('dragging a deeper handle follows the pointer around its parent\'s arc', () => {
  const c = editing(boot(TWO_DEEP));
  pieOf(c).slices.find((v) => v.slug === 'z').down(ev({ metaKey: true }));
  const rect = { left: 0, top: 0, width: 200, height: 200 };
  const e = (x, y) => ev({ clientX: x, clientY: y, currentTarget: { setPointerCapture() {}, closest: () => ({ getBoundingClientRect: () => rect }) } });
  const handle = movesOf(c, 'x')[0];
  handle.down(e(100, 0));
  handle.move(e(200, 100)); // a quarter turn: half of A's half of the circle
  handle.up(e(200, 100));
  near(nodeOf(c, 'x').importance, 60);
  near(nodeOf(c, 'z').importance, 10);
});

test('a depth-row cell can be chosen with Ctrl-click without opening it', () => {
  const c = boot(TWO_DEEP);
  c.setState({ view: 'map' });
  const cellOf = (slug) => chartOf(c).depth.cells.find((d) => d.slug === slug);
  cellOf('y').down(ev({ metaKey: true }));
  cellOf('y').open(ev({ metaKey: true }));
  assert.equal(c.state.focus, 'r');
  assert.deepEqual(c.state.chosenFacts, ['y']);
  assert.equal(cellOf('y').pressed, 'true');
  cellOf('y').key(ev({ key: 'l' }));
  assert.deepEqual(c.state.chosenFacts, []);
  cellOf('y').down(ev());
  cellOf('y').open(ev());
  assert.equal(c.state.focus, 'y');
});

test('a choose gesture on a slice doesn\'t open it, but a click does', () => {
  const c = boot(MAP3);
  const a = pieOf(c).slices.find((x) => x.slug === 'a');
  a.down(ev({ metaKey: true }));
  a.pick(ev({ metaKey: true }));
  assert.equal(c.state.focus, 'r');
  a.down(ev());
  a.pick(ev());
  assert.equal(c.state.focus, 'a');
});

test('hovering shows a "+" each side, and a leaf gets one more for a first child', () => {
  const c = editing(boot(MAP3));
  pieOf(c).slices[0].enter();
  const ctls = ctlsOf(c);
  assert.equal(ctls.length, 3);
  ctls[0].add();
  assert.equal(c.state.adding.parent, 'r');
  assert.equal(c.state.adding.impact, -0.75);
  c.setState({ adding: null });
  ctlsOf(c)[1].add();
  assert.equal(c.state.adding.impact, -0.25);
  c.setState({ adding: null });
  ctlsOf(c)[2].add();
  assert.equal(c.state.adding.parent, 'a');
  assert.equal(c.state.adding.impact, 0);
});

test('a slice with children gets no leaf "+"; premise siblings have no impact', () => {
  const c = editing(boot(DEEP_MAP));
  pieOf(c).slices.find((x) => x.hasChildren).enter();
  assert.equal(ctlsOf(c).length, 2);
  const p = editing(boot(PREMISE_MAP));
  pieOf(p).slices[0].enter();
  ctlsOf(p)[0].add();
  assert.equal(p.state.adding.isPremise, true);
});

test('read-only maps have no edit button, handles or "+" on the pie', () => {
  const c = boot(MAP3);
  c.setState({ view: 'pie', pieEdit: true, srcErrors: [{ line: 1, message: 'x' }] });
  assert.equal(c.renderVals().pie.canEdit, false);
  c.renderVals().pie.slices[1].enter();
  assert.equal(c.renderVals().pie.slices.flatMap((x) => [...x.ctls, ...x.moves]).length, 0);
});

test('zero-share premises draw no NaN', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: -1\n\n## Q\nslug: q\nkind: premise\n\n### G\nslug: g\nimportance: 1\nimpact: -1\n`);
  for (const x of pieOf(c).slices) assert.ok(!x.d.includes('NaN'));
});

test('a slice\'s "+" buttons come right after it in Tab order, above the later slices', () => {
  const slices = template.indexOf('{{pie.slices}}');
  const buttons = template.indexOf('{{s.ctls}}');
  assert.ok(slices < buttons && buttons < template.indexOf('{{pie.hatches}}'));
  const c = editing(boot(MAP3));
  pieOf(c).slices[1].enter();
  assert.deepEqual(pieOf(c).slices.map((x) => x.ctls.length), [0, 3, 0]);
  c.setState({ hover: 'a' });
  assert.deepEqual(unresolved(c.renderVals()), []);
});

test('a right-button press starts no drag', () => {
  const c = boot(MAP3);
  colOf(c, 'a').down(ev({ button: 2, clientY: 200 }));
  colOf(c, 'a').move(ev({ clientY: 100 }));
  assert.equal(nodeOf(c, 'a').impact, -0.5);
  colOf(c, 'a').dividerDown(ev({ button: 2, clientX: 0 }));
  colOf(c, 'a').dividerMove(ev({ clientX: 100 }));
  assert.equal(nodeOf(c, 'a').importance, 10);
  const rect = { left: 0, top: 0, width: 200, height: 200 };
  const e = (x, y, extra = {}) => ev({ clientX: x, clientY: y, currentTarget: { setPointerCapture() {}, closest: () => ({ getBoundingClientRect: () => rect }) }, ...extra });
  editing(c);
  const handle = movesOf(c, 'a')[0];
  handle.down(e(100, 0, { button: 2 }));
  handle.move(e(200, 100));
  assert.equal(nodeOf(c, 'a').importance, 10);
});

test('title and description get enough rows without field-sizing', () => {
  assert.equal(Component.textRows('', 48), 1);
  assert.equal(Component.textRows('short', 48), 1);
  assert.equal(Component.textRows('x'.repeat(100), 48), 3);
  assert.equal(Component.textRows('one\ntwo\nthree', 90), 3);
  const c = boot(MAP3);
  c.setFocus('a');
  c.renderVals().pn.onDetails({ target: { value: 'x'.repeat(200) } });
  assert.equal(c.renderVals().pn.detailsRows, 3);
  assert.equal(c.renderVals().pn.titleRows, 1);
});

test('pinning keeps the pie centred while a clicked slice shows its details', () => {
  const c = boot(NESTED);
  c.setState({ view: 'pie' });
  assert.equal(pieOf(c).pinPressed, 'false');
  pieOf(c).togglePin();
  assert.equal(pieOf(c).pinPressed, 'true');
  const a = pieOf(c).slices.find((x) => x.slug === 'a');
  a.down(ev());
  a.pick(ev());
  assert.equal(c.state.focus, 'a');
  assert.equal(panelOf(c).text, 'A');
  assert.ok(pieOf(c).slices.some((x) => x.slug === 'b'), 'still shows the siblings');
  assert.equal(pieOf(c).slices.find((x) => x.slug === 'a').isSelected, true);
  pieOf(c).togglePin();
  assert.deepEqual(pieOf(c).slices.map((x) => x.slug), ['kid']);
});

test('selecting a leaf while pinned keeps the pie, with no wide "+"', () => {
  const c = boot(NESTED);
  pieOf(c).togglePin();
  c.setFocus('kid');
  assert.equal(chartOf(c).pieShown, true);
  assert.equal(chartOf(c).empty, false);
  assert.equal(chartOf(c).hintShown, true);
  assert.deepEqual(unresolved(c.renderVals()), []);
});

test('a pinned pie resizes and chooses on its own ring, whichever slice is selected', () => {
  const c = boot(NESTED);
  pieOf(c).togglePin();
  pieOf(c).slices.find((x) => x.slug === 'b').key(ev({ key: 'l' }));
  c.setFocus('a');
  assert.deepEqual(c.state.chosenFacts, ['b']);
  assert.equal(chartOf(c).chosenCount, 1);
  editing(c);
  assert.equal(movesOf(c, 'a').length, 1);
  movesOf(c, 'a')[0].key(ev({ key: 'ArrowRight' }));
  assert.ok(nodeOf(c, 'b').importance < 30); // the chosen slice absorbs
  near(nodeOf(c, 'a').importance + nodeOf(c, 'b').importance, 40);
});

test('a stale or deleted pin falls back to following the focus', () => {
  const c = boot(NESTED);
  c.setFocus('a');
  pieOf(c).togglePin();
  panelOf(c).askDel();
  panelOf(c).doDel();
  assert.equal(pieOf(c).pinPressed, 'false');
  c.setState({ pinned: 'gone' });
  assert.equal(pieOf(c).pinPressed, 'false');
  assert.deepEqual(unresolved(c.renderVals()), []);
});

test('a new map or file drops the pin', () => {
  const c = boot(NESTED);
  pieOf(c).togglePin();
  c.setState({ newTitle: 'Fresh', newDesc: '', newOptions: [] });
  c.createMap();
  assert.equal(c.state.pinned, null);
});

test('slices wide enough carry a signed label, and thin ones don\'t', () => {
  const c = boot(MAP3);
  const labels = pieOf(c).labels;
  assert.equal(labels.length, 3);
  assert.ok(labels.some((l) => l.text === Component.signed(-0.5)));
  const thin = boot(MAP3.replace('importance: 10', 'importance: 0.5'));
  assert.equal(pieOf(thin).labels.length, 2);
  for (const l of labels) assert.ok(Number.isFinite(Number(l.x)) && Number.isFinite(Number(l.y)));
});

test('the pie has no "+" buttons beside it, and sits next to the details', () => {
  const start = template.indexOf('{{chart.pieShown}}');
  const pieBlock = template.slice(start, template.indexOf('{{chart.hintShown}}'));
  assert.ok(!pieBlock.includes('{{add.left}}') && !pieBlock.includes('{{add.right}}'));
  const c = boot(MAP3);
  assert.equal(c.renderVals().focusLayout.dir, 'column');
  c.setState({ view: 'pie' });
  assert.equal(c.renderVals().focusLayout.dir, 'row');
});

test('switching between bar and pie keeps choices', () => {
  const c = boot(MAP3);
  colOf(c, 'c').down(ev({ metaKey: true }));
  c.setState({ view: 'pie' });
  assert.deepEqual(c.state.chosenFacts, ['c']);
  assert.equal(c.renderVals().pie.slices.find((x) => x.slug === 'c').isChosen, true);
  assert.deepEqual(unresolved(c.renderVals()), []);
});

test('the pie sits under the current point, and the bar only shows on its view', () => {
  const c = boot(MAP3);
  assert.deepEqual([chartOf(c).barShown, chartOf(c).pieShown], [true, false]);
  c.setState({ view: 'pie' });
  assert.deepEqual([chartOf(c).barShown, chartOf(c).pieShown], [false, true]);
  assert.equal(c.renderVals().isFocusView, true);
  assert.equal(c.renderVals().pie.center, '+0.25');
  assert.equal(pieOf(boot(PREMISE_MAP)).showCenter, false);
});

test('column text stays on a readable backing at every impact', () => {
  const c = boot(MAP3.replace('impact: 0.5', 'impact: 0.6'));
  const col = colOf(c, 'c');
  assert.equal(col.ink, 'var(--ink)');
  const filled = template.slice(template.indexOf('{{c.isFilled}}'), template.indexOf('{{c.hasDivider}}'));
  assert.equal((filled.match(/color-mix\(in srgb, var\(--card\) 80%, transparent\)/g) || []).length, 2);
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


test('opening a diff row goes through the normal focus change', () => {
  const c = boot(LEGACY_A, LEGACY_B);
  c.setState({ view: 'map' });
  colOf(c, 'pay-tax').click(ev());
  c.setState({ view: 'diff', diffTab: 'table', chosenFacts: ['pay-tax'] });
  c.renderVals().diff.rows.find((r) => r.text.startsWith('Teenagers don')).open();
  assert.equal(c.state.view, 'map');
  assert.equal(c.state.focus, 'inexperience');
  assert.deepEqual(c.state.chosenFacts, ['pay-tax'], 'choices are kept across levels');
});

// ---------------------------------------------------------------- decision record
const REC = `---\ntitle: Store\ntemplate: decision-record\ntheme: paper\naccent: blue\nshow-confidence: false\nshow-evidence: false\nshow-good-faith: false\n---\n\n# Store\nslug: store\n\n## Reliability\nslug: reliability\nimportance: 40\n\n### Durability\nslug: durability\nweight: 50\n\n#### Postgres\noption: postgres\nscore: 8\n\n##### Runbooks exist\nslug: runbooks\nweight: 60\nby: Sam\nconfidence: 4\nbasis: We run 14 clusters\n\n- [ref] [Wiki](https://example.com) — the runbooks\n\n#### DynamoDB\noption: dynamodb\nscore: 9\n\n### Ops\nslug: ops\nweight: 50\n\n#### Postgres\noption: postgres\nscore: 6\n\n## Cost\nslug: cost\nimportance: 60\n\n### Bill\nslug: bill\nweight: 1\n\n#### DynamoDB\noption: dynamodb\nscore: 4\n`;
const recOf = (src = REC) => Component.parse(src).map;

test('a record round-trips byte for byte', () => assert.equal(Component.serialize(recOf()), REC));
test('maps never gain a template line', () => {
  for (const f of [NEW, LEGACY_A]) assert.ok(!Component.serialize(Component.parse(f).map).includes('template:'));
});
test('goal scores weigh criteria by share, and a missing score is 0', () => {
  const g = Component.recordModel(recOf()).goals[0];
  near(g.goalScores.postgres, 0.5 * 8 + 0.5 * 6);
  near(g.goalScores.dynamodb, 0.5 * 9 + 0.5 * 0);
  assert.equal(g.winner, 'postgres');
});
test('overall: an option missing from a goal scores 0 there, and wins are listed', () => {
  const r = Component.recordModel(recOf()).ranking;
  near(r.find((x) => x.option === 'postgres').total, 0.4 * 7);
  near(r.find((x) => x.option === 'dynamodb').total, 0.4 * 4.5 + 0.6 * 4);
  assert.deepEqual(r.map((x) => x.option), ['dynamodb', 'postgres']);
  assert.deepEqual(r[0].wins, ['cost']);
});
test('an overlay replaces goal and criterion weights; importance 0 turns a goal off', () => {
  const m = Component.recordModel(recOf(), { cost: 0, ops: 0, nope: 5 });
  assert.equal(m.goals[1].on, false);
  near(m.ranking.find((x) => x.option === 'postgres').total, 8);
});
test('record parse errors', () => {
  const bad = (from, to) => Component.parse(REC.replace(from, to)).errors.map((e) => e.msg).join(' | ');
  assert.match(bad('score: 8', 'score: 11'), /score "11" must be a whole number from 0 to 10/);
  assert.match(bad('score: 8', 'score: 7.5'), /whole number/);
  assert.match(bad('#### DynamoDB\noption: dynamodb\nscore: 4', '#### Dynamo\noption: dynamodb\nscore: 4'), /option "dynamodb" is called "DynamoDB" elsewhere/);
  assert.match(bad('option: postgres\nscore: 6', 'score: 6'), /missing option/);
  assert.match(bad('weight: 60', 'impact: 1'), /unknown property "impact"/);
  assert.match(bad('template: decision-record', 'template: other'), /template "other"/);
});
test('newRecord has one goal with one criterion, slugs from the title', () => {
  const m = Component.newRecord('Pick a store', '');
  assert.equal(m.template, 'record');
  assert.equal(m.root.slug, 'pick-a-store');
  assert.deepEqual(Component.parse(Component.serialize(m)).errors, []);
});

// ---------------------------------------------------------------- undo and redo
test('undo and redo step through edits; a drag is one step', () => {
  const c = boot(MAP3);
  dragDivider(c, 'a', 100);
  colOf(c, 'c').key(ev({ key: 'ArrowUp' }));
  const afterBoth = Component.serialize(c.state.map);
  c.undo();
  assert.equal(nodeOf(c, 'c').impact, 0.5);
  c.undo();
  assert.deepEqual(imps(c), [10, 30, 60]);
  assert.equal(c.renderVals().undoBtn.disabled, true);
  c.redo(); c.redo();
  assert.equal(Component.serialize(c.state.map), afterBoth);
});
test('a new edit clears redo; typing in one field is one step', () => {
  const c = boot(MAP3);
  c.setFocus('a');
  const pn = () => c.renderVals().pn;
  pn().onText({ target: { value: 'A1' } });
  pn().onText({ target: { value: 'A12' } });
  pn().onTextBlur();
  c.undo();
  assert.equal(nodeOf(c, 'a').text, 'A');
  c.redo();
  c.setFocus('r'); // the bar shows the top level again
  dragDivider(c, 'a', 50);
  assert.equal(c.renderVals().redoBtn.disabled, true);
});
test('undo never crosses into another file', () => {
  const c = boot(MAP3);
  dragDivider(c, 'a', 100);
  c.loadA(NEW, 'new.md');
  assert.equal(c.renderVals().undoBtn.disabled, true);
  c.undo();
  assert.equal(c.state.map.root.slug, 'root');
});
test('⌘Z outside text fields undoes; inside one the browser handles it', () => {
  const c = boot(MAP3);
  dragDivider(c, 'a', 100);
  const dragged = imps(c);
  c.onGlobalKey({ key: 'z', metaKey: true, shiftKey: false, target: { tagName: 'TEXTAREA' }, preventDefault() {} });
  assert.deepEqual(imps(c), dragged); // the target was a text field
  c.onGlobalKey({ key: 'z', metaKey: true, shiftKey: false, target: { tagName: 'DIV' }, preventDefault() {} });
  assert.deepEqual(imps(c), [10, 30, 60]);
});

// ---------------------------------------------------------------- record views
test('New can create a decision record, which opens on Overall', () => {
  const c = boot(MAP3);
  const nm = () => c.renderVals().nm;
  nm().pickRecord();
  nm().onTitle({ target: { value: 'Pick a store' } });
  nm().create();
  assert.equal(c.state.map.template, 'record');
  assert.equal(c.state.view, 'record');
  assert.deepEqual(c.renderVals().tabs.map((t) => t.label), ['Record', 'Markdown source', 'Compare']);
  assert.equal(c.renderVals().isRecLevel.overview, true);
});
test('every record view renders with no unresolved bindings, and maps keep their views', () => {
  for (const view of ['overall', 'goals', 'source', 'compare']) {
    const c = boot(REC);
    c.setState({ view });
    assert.deepEqual(unresolved(c.renderVals()), [], view);
  }
  const c = boot(REC);
  c.setState({ view: 'record', recLevel: 'criteria', recGoal: 'reliability' });
  assert.deepEqual(unresolved(c.renderVals()), [], 'goal');
  const m = boot(MAP3);
  m.setState({ view: 'overall' });
  assert.equal(m.renderVals().isMap, true);
});

// ---------------------------------------------------------------- goals and goal views
const recBoot = () => { const c = boot(REC); c.setState({ view: 'goals' }); return c; };
const goalsWt = (c) => c.renderVals().goalsView.weights;
test('dragging the goal divider trades importance, respecting choices', () => {
  const c = recBoot();
  goalsWt(c).dividers[0].down(ev({ clientX: 0 }));
  goalsWt(c).dividers[0].move(ev({ clientX: 100 }));
  goalsWt(c).dividers[0].up(ev());
  assert.ok(nodeOf(c, 'reliability').importance > 40);
  c.undo();
  assert.equal(nodeOf(c, 'reliability').importance, 40);
});
test('a goal opens to a grid of options by criteria, best first, with its winner', () => {
  const c = recBoot();
  c.renderVals().goalsView.cards[0].open();
  const g = c.renderVals().goalView;
  assert.deepEqual(g.grid.rows.map((r) => r.option), ['postgres', 'dynamodb']);
  assert.deepEqual(g.grid.rows[1].cells.map((x) => x.n), [9, 0]);
  assert.equal(g.grid.rows[0].isWinner, true);
});
test('setting a missing score creates it; the file round-trips', () => {
  const c = recBoot();
  c.setState({ view: 'record', recLevel: 'criteria', recGoal: 'reliability' });
  c.setScore('reliability', 'ops', 'dynamodb', 7);
  assert.equal(Component.recordModel(c.state.map).goals[0].scores.dynamodb.ops, 7);
  assert.deepEqual(Component.parse(c.state.src).errors, []);
});
test('adding an existing option to a goal, and a new one', () => {
  const c = recBoot();
  c.setState({ view: 'record', recLevel: 'criteria', recGoal: 'cost' });
  const gv = () => c.renderVals().goalView;
  assert.deepEqual(gv().existing.map((o) => o.slug), ['postgres']);
  gv().existing[0].add();
  gv().onNewOption({ target: { value: 'Kafka + S3' } });
  gv().addNewOption();
  assert.deepEqual(Component.recordModel(c.state.map).goals[1].options, ['dynamodb', 'postgres', 'kafka-s3']);
});
test('bar and pie share one switch, and the pie has handles but none at the wrap', () => {
  const c = recBoot();
  c.renderVals().recordChart.pick('pie');
  assert.equal(goalsWt(c).isPie, true);
  assert.equal(goalsWt(c).handles.length, 1);
  c.renderVals().goalsView.weights.segments[0].down(ev({ metaKey: true }));
  assert.deepEqual(unresolved(c.renderVals()), []);
  c.setState({ view: 'record', recLevel: 'criteria', recGoal: 'reliability', cell: { option: 'postgres', criterion: 'ops' } });
  assert.deepEqual(unresolved(c.renderVals()), []);
});

// ---------------------------------------------------------------- reasons
test('reasons list by weight, and their weight never changes the score', () => {
  const c = recBoot();
  c.setState({ view: 'record', recLevel: 'criteria', recGoal: 'reliability', cell: { option: 'postgres', criterion: 'durability' } });
  const panel = () => c.renderVals().goalView.panel;
  panel().onNewReason({ target: { value: 'Cheap to run' } });
  panel().addReason();
  assert.deepEqual(panel().reasons.map((r) => r.text), ['Runbooks exist', 'Cheap to run']);
  panel().reasons[1].onWeight({ target: { value: '90' } });
  assert.deepEqual(panel().reasons.map((r) => r.text), ['Cheap to run', 'Runbooks exist']);
  assert.equal(Component.recordModel(c.state.map).goals[0].scores.postgres.durability, 8);
});
test('a reason has the same extras as a point', () => {
  const c = recBoot();
  c.setState({ view: 'record', recLevel: 'criteria', recGoal: 'reliability', cell: { option: 'postgres', criterion: 'durability' } });
  c.renderVals().goalView.panel.reasons[0].open();
  assert.equal(c.renderVals().bc.basis, 'We run 14 clusters');
  assert.equal(c.renderVals().ev.items.length, 1);
  assert.deepEqual(unresolved(c.renderVals()), []);
  c.renderVals().pn.askDel();
  c.renderVals().pn.doDel();
  assert.equal(c.state.reason, null);
  assert.equal(Component.findPath(c.state.map.root, 'runbooks'), null);
  assert.deepEqual(Component.parse(c.state.src).errors, []);
});

// ---------------------------------------------------------------- overall and what-if
const overallOf = (c) => c.renderVals().overall;
test('what-if weights move the ranking without touching the file, and Save writes them', () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  const before = c.state.src;
  overallOf(c).goals[1].toggle(); // Cost off
  assert.equal(overallOf(c).ranking[0].option, 'postgres');
  assert.equal(c.state.src, before);
  assert.equal(c.renderVals().whatIfBar.shown, true);
  c.renderVals().whatIfBar.save();
  assert.equal(nodeOf(c, 'cost').importance, 0);
  assert.equal(c.state.whatIf, null);
  c.undo();
  assert.equal(nodeOf(c, 'cost').importance, 60);
});
test('turning a goal back on restores its weight', () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  overallOf(c).goals[1].toggle();
  overallOf(c).goals[1].toggle();
  assert.equal(c.state.whatIf.cost, 60);
});
test('selecting a goal shows its criteria editor', () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  overallOf(c).goals[0].select();
  assert.deepEqual(overallOf(c).criteria.segments.map((x) => x.label), ['Durability', 'Ops']);
});
test('while what-if is on, every view shows it, and a Source edit is picked up', () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  overallOf(c).goals[1].toggle();
  c.setState({ view: 'goals' });
  assert.deepEqual(goalsWt(c).segments.map((x) => x.label), ['Reliability']);
  c.onSrc(c.state.src.replace(/## Cost[\s\S]*$/, '## Speed\nslug: speed\nimportance: 30\n\n### Fast\nslug: fast\nweight: 1\n'));
  c.renderVals().whatIfBar.save();
  assert.ok(!Component.findPath(c.state.map.root, 'cost'));
  assert.equal(nodeOf(c, 'speed').importance, 30);
});
test('a top option that wins no goal says so', () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  const top = overallOf(c).ranking[0];
  assert.equal(top.noWins, top.wins.length === 0);
});

// ---------------------------------------------------------------- snapshots
test('snapshot list operations', () => {
  let l = Component.snapshotAdd([], { name: 'A', file: 'x.md', root: 'store', title: 'Store', at: 1, src: REC });
  l = Component.snapshotAdd(l, { name: 'B', file: 'y.md', root: 'other', title: 'O', at: 2, src: REC });
  assert.deepEqual(Component.snapshotsFor(l, 'store').map((s) => s.name), ['A']);
  l = Component.snapshotRename(l, 'snap-1', 'A2');
  l = Component.snapshotRemove(l, 'snap-2');
  assert.deepEqual(l.map((s) => s.name), ['A2']);
});
test('saving a snapshot copies the record as shown, what-if included, and loading it restores the weights', async () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  overallOf(c).goals[1].toggle();
  overallOf(c).snap.onName({ target: { value: 'No cost' } });
  await overallOf(c).snap.save();
  const s = c.state.snapshots[0];
  assert.match(s.src, /## Cost\nslug: cost\nimportance: 0/);
  c.renderVals().whatIfBar.reset();
  overallOf(c).snap.items[0].load();
  assert.equal(c.state.whatIf.cost, 0);
  assert.deepEqual(unresolved(c.renderVals()), []);
});
test('when the browser refuses storage, snapshots say so and nothing throws', async () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  overallOf(c).snap.onName({ target: { value: 'X' } });
  await overallOf(c).snap.save(); // indexedDB is undefined in check.js
  assert.match(c.renderVals().overall.snap.notice, /can’t be kept in this browser/);
  assert.equal(c.state.snapshots.length, 1);
});

// ---------------------------------------------------------------- compare
const REC_B = REC.replace('importance: 40', 'importance: 80').replace('score: 9', 'score: 3');
test('Compare lines up two records by slug, biggest differences first', () => {
  const c = boot(REC, REC_B);
  c.setState({ view: 'compare' });
  const cmp = () => c.renderVals().compare;
  assert.equal(cmp().rows[0].label, 'Reliability');
  near(cmp().rows[0].a, 40);
  cmp().pickTier('scores');
  cmp().pickGoal('reliability');
  assert.equal(cmp().rows[0].label, 'DynamoDB');
  assert.equal(cmp().rows[0].sub, 'Durability');
  assert.equal(cmp().top.length, 3);
  assert.equal(cmp().top[0].label, 'DynamoDB'); // 6 of 10 apart beats 17 of 100
});
test('composite bars split each side into its parts', () => {
  const c = boot(REC, REC_B);
  c.setState({ view: 'compare' });
  c.renderVals().compare.pickStyle('composite');
  const sides = c.renderVals().compare.composite.sides;
  assert.deepEqual(sides.map((s) => s.parts.map((p) => p.pct)), [[40, 60], [57, 43]]);
  assert.deepEqual(unresolved(c.renderVals()), []);
  c.renderVals().compare.pickTier('scores');
  assert.equal(c.renderVals().compare.composite.options.length, 2);
  assert.deepEqual(unresolved(c.renderVals()), []);
  c.renderVals().compare.pickStyle('side');
  c.renderVals().compare.rows[0].pick();
  assert.equal(c.renderVals().compare.sel.has, true);
  assert.deepEqual(unresolved(c.renderVals()), []);
});
test('a snapshot or the what-if weights can be either side', () => {
  const c = boot(REC);
  c.setState({ view: 'overall', snapshots: Component.snapshotAdd([], { name: 'Old', file: 'x.md', root: 'store', title: 'Store', at: 1, src: REC_B }) });
  overallOf(c).goals[1].toggle();
  c.setState({ view: 'compare' });
  const keys = c.renderVals().compare.sources.map((x) => x.key);
  assert.deepEqual(keys, ['a', 'a-whatif', 'snap-1']);
});
test('comparing a record with a map explains itself', () => {
  const c = boot(REC, MAP3);
  c.setState({ view: 'compare' });
  assert.match(c.renderVals().compare.notice, /decision map/);
  assert.deepEqual(unresolved(c.renderVals()), []);
});

// ---------------------------------------------------------------- example record
test('the example record parses and round-trips', () => {
  const src = fs.readFileSync('examples/event-store/record.md', 'utf8');
  assert.deepEqual(Component.parse(src).errors, []);
  assert.equal(Component.serialize(Component.parse(src).map), src);
});


// ---------------------------------------------------------------- final review fixes
const reasonOpen = () => {
  const c = boot(REC);
  c.setState({ view: 'record', recLevel: 'criteria', recGoal: 'reliability', cell: { option: 'postgres', criterion: 'durability' } });
  c.renderVals().goalView.panel.reasons[0].open();
  return c;
};
test('review: a reason\'s basis, confidence and evidence can be edited', () => {
  const c = reasonOpen();
  c.renderVals().bc.onBasis({ target: { value: 'Ops logs' } });
  c.renderVals().bc.stars[1].pick();
  c.renderVals().ev.openAdd();
  c.renderVals().ev.onName({ target: { value: 'Runbook' } });
  c.renderVals().ev.onUrl({ target: { value: 'https://example.com/r' } });
  c.renderVals().ev.save();
  const r = nodeOf(c, 'runbooks');
  assert.equal(r.basis, 'Ops logs');
  assert.equal(r.confidence, 2);
  assert.equal(r.refs.length, 2);
});
test('review: a map\'s Diff with a record as B explains itself instead of crashing', () => {
  const c = boot(MAP3, REC);
  c.setState({ view: 'diff' });
  assert.match(c.renderVals().diff.kindNotice, /decision record/);
  assert.deepEqual(unresolved(c.renderVals()), []);
});
test('review: a goal that no longer exists falls back to the goal list', () => {
  const c = boot(REC);
  c.setState({ view: 'goals' });
  c.renderVals().goalsView.addGoal();
  c.recNav({ recLevel: 'criteria', recGoal: c.state.selGoal });
  assert.equal(c.renderVals().isGoal, true);
  c.undo();
  assert.equal(c.renderVals().isGoal, false);
  assert.equal(c.renderVals().isGoals, true);
  assert.deepEqual(unresolved(c.renderVals()), []);
});
test('review: opening a file with errors drops the old file\'s record state', () => {
  const c = boot(REC);
  c.setState({ view: 'record', whatIf: { cost: 0 }, recLevel: 'criteria', recGoal: 'cost', chosenFacts: ['cost'] });
  c.confirmDropThen = null;
  c.loadA('not a map', 'bad.md', null, true);
  assert.equal(c.state.whatIf, null);
  assert.equal(c.state.recGoal, null);
  assert.deepEqual(c.state.chosenFacts, []);
});
test('review: opening another file or New asks before dropping unsaved what-if weights', () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  overallOf(c).goals[1].toggle();
  c.loadA(NEW, 'new.md');
  assert.equal(c.state.map.root.slug, 'store', 'not opened yet');
  assert.equal(c.renderVals().dropAsk.shown, true);
  c.renderVals().dropAsk.cancel();
  assert.equal(c.renderVals().dropAsk.shown, false);
  assert.equal(c.state.whatIf.cost, 0);
  c.loadA(NEW, 'new.md');
  c.renderVals().dropAsk.go();
  assert.equal(c.state.map.root.slug, 'root');
  const d = boot(REC);
  d.setState({ view: 'overall' });
  overallOf(d).goals[1].toggle();
  d.setState({ newKind: 'record', newTitle: 'Other' });
  d.createMap();
  assert.equal(d.state.map.root.slug, 'store');
  d.renderVals().dropAsk.go();
  assert.equal(d.state.map.root.slug, 'other');
});
test('review: record weights start at 50 and a drag never takes one to 0', () => {
  const m = Component.newRecord('Pick', '');
  assert.equal(m.root.children[0].importance, 50);
  assert.equal(m.root.children[0].children[0].importance, 50);
  const c = boot(Component.serialize(m));
  c.setState({ view: 'record', recLevel: 'criteria', recGoal: 'first-goal' });
  c.addCriterion('first-goal');
  const wtc = () => c.renderVals().goalView.criteria;
  for (let k = 0; k < 5; k++) {
    wtc().dividers[0].down(ev({ clientX: 0 }));
    wtc().dividers[0].move(ev({ clientX: -5000 }));
    wtc().dividers[0].up(ev());
  }
  assert.ok(Component.findPath(c.state.map.root, 'first-criterion').at(-1).importance > 0);
  assert.equal(wtc().segments.length, 2);
});
test('review: ⌘Z works with focus on a slider or checkbox, not in a text field', () => {
  const c = boot(MAP3);
  dragDivider(c, 'a', 100);
  const dragged = imps(c);
  const key = (target) => c.onGlobalKey({ key: 'z', metaKey: true, shiftKey: false, target, preventDefault() {} });
  key({ tagName: 'TEXTAREA' });
  key({ tagName: 'INPUT', type: 'text' });
  assert.deepEqual(imps(c), dragged);
  key({ tagName: 'INPUT', type: 'range' });
  assert.deepEqual(imps(c), [10, 30, 60]);
});
test('review: snapshots are stored one per key, and a refused store or load says so', async () => {
  const data = new Map();
  const fakeDB = {
    open() {
      const req = {};
      setTimeout(() => {
        req.result = {
          close() {},
          transaction() {
            const tx = {};
            const store = {
              put(v, k) { data.set(k, v); return {}; }, delete(k) { data.delete(k); return {}; }, get(k) { return { result: data.get(k) }; },
              getAll(range) { return { result: [...data.entries()].filter(([k]) => k >= range.lower && k <= range.upper).map(([, v]) => v) }; },
            };
            tx.objectStore = () => store;
            setTimeout(() => tx.oncomplete && tx.oncomplete());
            return tx;
          },
        };
        req.onsuccess();
      });
      return req;
    },
  };
  globalThis.indexedDB = fakeDB;
  globalThis.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) };
  try {
    const c = boot(REC);
    c.setState({ view: 'overall' });
    overallOf(c).snap.onName({ target: { value: 'One' } });
    await overallOf(c).snap.save();
    assert.deepEqual([...data.keys()].filter((k) => k.startsWith('snap:')).length, 1);
    const other = boot(REC);
    await other.restoreSnapshots();
    assert.equal(other.state.snapshots.length, 1);
    overallOf(other).snap.onName({ target: { value: 'Two' } });
    await overallOf(other).snap.save();
    await c.restoreSnapshots();
    assert.equal(c.state.snapshots.length, 2, 'the other tab\'s save didn\'t wipe this one');
  } finally {
    delete globalThis.indexedDB;
    delete globalThis.IDBKeyRange;
  }
  const d = boot(REC);
  await d.restoreSnapshots();
  assert.match(d.state.snapNotice, /can’t be kept in this browser/);
});
test('review: record weights with more than one decimal are a parse error', () => {
  const errs = Component.parse(REC.replace('weight: 50', 'weight: 33.33')).errors.map((e) => e.msg).join(' | ');
  assert.match(errs, /at most one decimal place/);
});
test('review: Clear in one weight panel keeps the other panel\'s choices', () => {
  const c = boot(REC);
  c.setState({ view: 'overall', overallGoal: 'reliability' });
  overallOf(c).weights.segments[0].down(ev({ metaKey: true }));
  overallOf(c).criteria.segments[0].down(ev({ metaKey: true }));
  overallOf(c).criteria.clear();
  assert.deepEqual(c.state.chosenFacts, ['reliability']);
});
test('review: Compare is only worked out in the Compare view', () => {
  const c = boot(REC);
  c.setState({ view: 'overall', snapshots: Component.snapshotAdd([], { name: 'Old', file: 'x.md', root: 'store', title: 'Store', at: 1, src: REC }) });
  const parse = Component.parse;
  let n = 0;
  Component.parse = (...a) => { n++; return parse(...a); };
  try { c.renderVals(); } finally { Component.parse = parse; }
  assert.equal(n, 0);
});
test('review: the facts filter is hidden for records', () => {
  assert.equal(boot(REC).renderVals().showFilter, false);
  assert.equal(boot(MAP3).renderVals().showFilter, true);
});

// ---------------------------------------------------------------- revision 2: border resize
test('border resize: nothing chosen trades the two neighbours', () => {
  assert.deepEqual(Component.borderResize([28, 30, 25, 17], 2, -0.05, []), [28, 30, 20, 22]);
});
test('border resize: chosen columns on one side take the change, the far neighbour the opposite', () => {
  assert.deepEqual(Component.borderResize([28, 30, 25, 17], 2, -0.05, [1]), [28, 25, 25, 22]);
  assert.deepEqual(Component.borderResize([28, 30, 25, 17], 0, 0.05, [3]), [33, 30, 25, 12]);
  assert.deepEqual(Component.borderResize([28, 30, 25, 17], 1, -0.05, [1]), [28, 25, 30, 17]);
});
test('border resize: chosen on both sides change, unchosen neighbours slide', () => {
  assert.deepEqual(Component.borderResize([20, 20, 20, 20, 20], 1, 0.1, [0, 3]), [30, 20, 20, 10, 20]);
  const out = Component.borderResize([10, 20, 20, 30, 20], 1, 0.1, [0, 3, 4]);
  near(out[0], 20); near(out[3], 30 - 10 * 30 / 50); near(out[4], 20 - 10 * 20 / 50);
  assert.deepEqual([out[1], out[2]], [20, 20]);
});
test('border resize: stops at a 2% share for any changing column', () => {
  assert.deepEqual(Component.borderResize([10, 30, 60], 0, -0.5, []), [2, 38, 60]);
  assert.deepEqual(Component.borderResize([10, 30, 60], 0, 0.9, [2]), [68, 30, 2]);
});
test('a map bar drag keeps the border under the pointer', () => {
  const c = boot(MAP3);
  dragDivider(c, 'a', 100); // 100px of 1000px is 10% of the total
  assert.deepEqual(imps(c), [20, 20, 60]);
});

// ---------------------------------------------------------------- revision 2: summaries
test('a score summary round-trips and is read into the model', () => {
  const src = REC.replace('option: postgres\nscore: 8\n', 'option: postgres\nscore: 8\nsummary: We run 14 clusters\n');
  assert.equal(Component.serialize(Component.parse(src).map), src);
  assert.equal(Component.recordModel(Component.parse(src).map).goals[0].summaries.postgres.durability, 'We run 14 clusters');
  assert.match(Component.parse(REC.replace('weight: 50\n\n#### Postgres', 'weight: 50\nsummary: x\n\n#### Postgres')).errors[0].msg, /can't have "summary"/);
});
test('setSummary creates a missing score, keeps one line, and refuses braces', () => {
  const c = boot(REC);
  c.setSummary('ops', 'dynamodb', 'Managed\nfor us');
  assert.equal(Component.recordModel(c.state.map).goals[0].summaries.dynamodb.ops, 'Managed for us');
  c.setSummary('ops', 'dynamodb', 'a {b}');
  assert.match(c.state.notice, /braces/i);
  assert.deepEqual(Component.parse(c.state.src).errors, []);
});

// ---------------------------------------------------------------- revision 2: record levels
const rec2 = (patch = {}) => { const c = boot(REC); c.setState({ view: 'record', ...patch }); return c; };
test('the Record view opens on Overview with one crumb, and old view names still work', () => {
  const c = rec2();
  assert.equal(c.renderVals().isRecLevel.overview, true);
  assert.deepEqual(c.renderVals().recCrumbs.filter((x) => !x.ahead).map((x) => x.name), ['Overview']);
  const g = rec2({ view: 'goals' });
  assert.equal(g.renderVals().isRecLevel.goals, true);
  assert.deepEqual(c.renderVals().tabs.map((t) => t.label), ['Record', 'Markdown source', 'Compare']);
});
test('crumbs list the path, and a click goes back up while deeper crumbs stay, faded', () => {
  const c = rec2();
  c.recNav({ recLevel: 'reasons', recGoal: 'reliability', recOption: 'postgres', recCrit: 'durability' });
  const cr = () => c.renderVals().recCrumbs;
  assert.deepEqual(cr().map((x) => x.name), ['Overview', 'All goals', 'Reliability', 'Postgres', 'Durability']);
  cr()[2].go();
  assert.equal(c.renderVals().isRecLevel.criteria, true);
  assert.deepEqual(cr().map((x) => x.ahead), [false, false, false, true, true]);
});
test('a level whose goal, option or criterion is gone falls back, with every binding resolved', () => {
  const c = rec2();
  c.recNav({ recLevel: 'reasons', recGoal: 'reliability', recOption: 'postgres', recCrit: 'nope' });
  assert.equal(c.renderVals().isRecLevel.options, true);
  c.recNav({ recGoal: 'gone' });
  assert.equal(c.renderVals().isRecLevel.goals, true);
  for (const lv of ['overview', 'goals', 'criteria', 'options', 'reasons']) {
    c.recNav({ recLevel: lv, recGoal: 'reliability', recOption: 'postgres', recCrit: 'durability' });
    assert.deepEqual(unresolved(c.renderVals()), [], lv);
  }
});

Promise.all(pending).then(() => {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
});
