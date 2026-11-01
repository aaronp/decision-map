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

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
