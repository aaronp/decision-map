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
const app = new Function('DCLogic', 'location', 'window', m[1] + '\n;return { Component, parseMap };')(DCLogic, location, window);
const { Component, parseMap } = app;

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

Promise.all(pending).then(() => {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
});
