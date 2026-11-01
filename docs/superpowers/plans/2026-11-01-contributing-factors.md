# Contributing Factors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace pro/con stacks with one sortable chart of contributing factors, each with an importance and an impact, backed by a heading-based markdown format and carried through every view.

**Architecture:** Everything stays in `index.html`: template in `<x-dc>`, logic in `class Component`. Pure static functions hold the format, scoring and resize maths, and are tested outside the browser by a new `check.js`. During the build, `renderVals` reads a temporary copy of the map with the old `side` and `weight` fields added, so unported views keep working. Task 6 removes it.

**Tech Stack:** Plain HTML, vendored React, the `dc-runtime` template system, bun for `make dev` and `make check`.

**Spec:** `docs/superpowers/specs/2026-11-01-contributing-factors-design.md`. Read it first. `resize()` in `docs/superpowers/specs/2026-11-01-contributing-factors-mockup.html` shows the interaction, but it is a sketch, not code to copy.

## Global Constraints

- No build step and no new dependencies. Don't edit `support.js` (generated) or `vendor/`.
- Markdown files remain the only data source.
- Old `[+]`/`[-]`/`[*]` files keep opening everywhere, including as diff side B and via `?src=`.
- Colours use theme tokens, so `paper`, `slate`, `night` and `contrast` all work. Sign also appears as text (`+0.80`, using `−` for negatives).
- A fact's children never change its colour, size or contribution, except for premises.
- Work on a branch named `contributing-factors`, created from `master` before Task 1.
- Verify by running `make check`. For browser checks, use `make dev` and `http://localhost:8000/?src=examples/votes-at-16/map.md`.

## Review Focus

1. Details text with a line starting `#` or `- [ref]`: must survive save and reload as text, not become a heading or evidence. Test in Task 1.
2. A selected or focused fact disappearing through delete, source edit or opening another file: the page falls back to a fact that exists instead of crashing. Test in Task 4.
3. Siblings whose importance is all 0, or a single child: equal shares and no `NaN` in widths, score or files. Test in Task 2.
4. Changing impact by keyboard past a neighbour: focus stays on the same fact, and order changes only on blur. Test in Task 2, verified in Task 3.
5. Old files with `weight: 0`, CRLF line endings, or premises with evidence-bearing children: open, compare and save without loss. Test in Task 1.

---

### Task 1: Check harness and file format

**Files:**
- Create: `check.js`
- Modify: `Makefile`
- Modify: `index.html`: node model comment (`:1303`), `BLANK` (`:1255`), `parse` (`:1307`), `parseAttrs` (`:1455`), `serialize` (`:1489`), and the guards at `:1900`, `:1911`, `:2005`, `createMap` (`:2269`), `addArg` (`:2287`), plus a one-line change at the top of `renderVals` (`:2361`)

**Interfaces:**
- Produces: Node `{ slug, text, kind: 'root'|'fact'|'premise', importance: number|null, impact: number|null, by, basis, confidence, details: string|null, refs, children }`. Importance and impact are `null` on root and premises.
- Produces: `Component.parse(src)` → `{ map, errors }`, unchanged in shape, accepting both formats. `Component.serialize(map)` always writes the new format.
- Produces: `Component.withLegacyFields(map)` → a deep copy with `side` (`'pro'` if impact ≥ 0, `'con'` otherwise, `'premise'`, or `null`) and `weight` (`Math.min(100, Math.round(importance))`, or `null`). It is temporary.
- Produces: `check.js` loads the logic with this approach, already proven to work:

```js
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
class DCLogic {}
const Component = new Function('DCLogic', 'location', m[1] + '\n;return Component;')(DCLogic, { search: '', href: 'http://x/' });
```

- [ ] **Step 1: Create the branch**

```bash
git checkout -b contributing-factors
```

- [ ] **Step 2: Write the failing tests in `check.js`**

Use `node:assert` and a small `test(name, fn)` that counts failures and sets a non-zero exit code. Add a `check:` target to `Makefile` running `bun check.js`. Assertions:

```js
const NEW = `---\ntitle: T\n---\n\n# Root claim\nslug: root\nby: Me\n\nRoot details.\n\n## Good: a fact\nslug: a\nimportance: 60\nimpact: 0.8\nby: Sam\nconfidence: 4\nbasis: Would change if X\n\nLine one.\n\nLine two.\n\n- [ref] [Src](https://example.com) — shows it\n\n### Child\nslug: b\nimportance: 45.5\nimpact: -0.6\n`;
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
// round trip
assert.deepEqual(Component.parse(Component.serialize(map)).map, map);

// errors (each must give at least one error mentioning the key)
for (const [bad, word] of [['impact: 1.5', 'impact'], ['impact: abc', 'impact'], ['importance: -1', 'importance'], ['colour: red', 'colour']]) {
  const r = Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## F\nslug: f\nimportance: 1\nimpact: 0\n${bad}\n`);
  assert.ok(r.errors.some((e) => e.msg.includes(word)), bad);
}
assert.ok(Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## F\nslug: f\nimportance: 1\n`).errors.some((e) => e.msg.includes('impact')));
assert.ok(Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n### Too deep\nslug: f\nimportance: 1\nimpact: 0\n`).errors.length > 0);

// more than six heading levels are accepted
const deep = ['---', 'title: T', '---', '', '# R', 'slug: r', ''];
for (let d = 2; d <= 8; d++) deep.push(`${'#'.repeat(d)} L${d}`, `slug: l${d}`, 'importance: 1', 'impact: 0', '');
assert.deepEqual(Component.parse(deep.join('\n')).errors, []);

// premises
const P = Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: 1\n`).map;
assert.equal(P.root.children[0].kind, 'premise');
assert.equal(P.root.children[0].importance, null);
assert.ok(Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n## F\nslug: f\nimportance: 1\nimpact: 1\n`).errors.length > 0);
assert.ok(Component.parse(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## F\nslug: f\nimportance: 1\nimpact: 1\n\n### P\nslug: p\nkind: premise\n`).errors.length > 0);

// details that look like structure survive (Review Focus 1)
const tricky = JSON.parse(JSON.stringify(map));
tricky.root.children[0].details = '# not a heading\n- [ref] not evidence\n\\# already slashed';
assert.equal(Component.parse(Component.serialize(tricky)).map.root.children[0].details, tricky.root.children[0].details);
assert.equal(Component.parse(Component.serialize(tricky)).map.root.children[0].refs.length, 1);

// legacy import (Review Focus 5)
const old = fs.readFileSync('examples/votes-at-16/map.md', 'utf8');
const L = Component.parse(old).map;
const pay = L.root.children.find((c) => c.slug === 'pay-tax');
assert.deepEqual([pay.kind, pay.importance, pay.impact], ['fact', 60, 1]);
assert.equal(L.root.children.find((c) => c.slug === 'inexperience').impact, -1);
assert.deepEqual(Component.parse(old.replace(/\n/g, '\r\n')).map, L);
const zero = Component.parse(`---\ntitle: T\n---\n\n# R {slug: r}\n\n- [*] P {slug: p}\n  - [+] F {slug: f, weight: 0}\n    - [ref] Src — note\n    - [basis] Because\n`).map;
assert.equal(zero.root.children[0].kind, 'premise');
const f = zero.root.children[0].children[0];
assert.deepEqual([f.importance, f.impact, f.basis, f.refs[0].name], [0, 1, 'Because', 'Src']);
assert.deepEqual(Component.parse(Component.serialize(zero)).map, zero);

// saved numbers
const rounded = JSON.parse(JSON.stringify(map));
rounded.root.children[0].importance = 38.5714;
rounded.root.children[0].impact = -0.004;
const out = Component.serialize(rounded);
assert.ok(out.includes('importance: 38.6\n') && out.includes('impact: 0\n'));
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `make check`
Expected: failure on the first new-format assertion, because `parse` reports a missing attribute block.

- [ ] **Step 4: Implement the format**

In `parse`: normalise `\r\n` to `\n` first, and share the existing front-matter loop. The file is legacy when its root heading line matches `/\{[^{}]*slug:[^{}]*\}\s*$/`. Keep today's list parser as `parseLegacy`, converting each node at the end (`[+]`/`[-]` to impact ±1, `weight` to `importance`, `[*]` to `kind: 'premise'`). New-format rules come from the spec's "Format details". A heading's depth may rise by only one level. `basis`, `confidence` and refs aren't allowed on root or premises. In `details`, a line starting `#`, `- [ref] ` or `\` is saved with a leading `\`, and the parser removes it. `serialize` writes `importance` with `Number(x.toFixed(1))` and `impact` with `Number(x.toFixed(2))`, and turns newlines in `basis` into spaces.

Then add `withLegacyFields` and change `renderVals` to `const map = Component.withLegacyFields(s.map)`, also applying it to `s.mapB` wherever that is read. Change `hasMap` to `s.map !== BLANK`, because the copy is never identical to `BLANK`. Update the guards at `:1900`, `:1911` and `:2005` to check `kind === 'fact'`. `addArg` builds new facts with `importance: 50, impact: 0, details: null`. `createMap` and `BLANK` use the new shape. Delete the `flip` action's use of `side` by making it set `impact: -n.impact`, because Task 3 removes it.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `make check`
Expected: all pass, exit code 0.

- [ ] **Step 6: Confirm the app still loads**

Run `make dev`, open the example, and check that the map, pie and diff views render with no console errors. Pro/con cards still appear at this stage.

- [ ] **Step 7: Commit**

```bash
git add check.js Makefile index.html
git commit -m "feat: heading-based map format with legacy import"
```

### Task 2: Scoring and resize maths

**Files:**
- Modify: `index.html`: add statics after `slugify` (`:1565`)
- Test: `check.js`

**Interfaces:**
- Consumes: the Node shape from Task 1.
- Produces: `Component.allValues(root)` → `Map<slug, { score: number|null, importance: number|null, impact: number|null, share: number|null }>`.
  - `score` is Σ(importance × impact) ÷ Σ(importance) over direct fact children, 0 if none or the total is 0, and `null` on a root with premises.
  - For a premise, `impact` is its `score` and `importance` is `(impact + 1) / 2`.
  - `share` is importance ÷ the sibling total, or equal shares when the total is 0. The root's is `null`.
- Produces: `Component.factRows(node, values, order = null)` → array of `{ node, importance, impact, share, contribution, calculated }`, sorted by impact ascending and stable. If `order` (an array of slugs) is given, it uses that order instead: unknown slugs are ignored and children not listed go last, sorted by impact.
- Produces: `Component.resizeImportance(raws, { divider, resized, move, mode, pool = [] })` → a new array. `divider` is the index of the column left of the divider. `resized` is `divider` or `divider + 1`. `move` is the pointer's movement as a fraction of total column width, positive to the right. `mode` is `'scale'` or `'trade'`.

- [ ] **Step 1: Write the failing tests**

```js
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const fact = (slug, importance, impact, children = []) => ({ slug, text: slug, kind: 'fact', importance, impact, by: null, basis: null, confidence: null, details: null, refs: [], children });
const prem = (slug, children) => ({ ...fact(slug, null, null, children), kind: 'premise' });
const rootOf = (children) => ({ ...fact('r', null, null, children), kind: 'root' });

// score: parent's own impact unaffected by children; share and contribution
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

// zero and single (Review Focus 3)
const z = rootOf([fact('a', 0, 1), fact('b', 0, -1)]);
const vz = Component.allValues(z);
near(vz.get('r').score, 0);
near(vz.get('a').share, 0.5);
near(Component.allValues(rootOf([fact('a', 7, 0.2)])).get('a').share, 1);
near(Component.allValues(rootOf([])).get('r').score, 0);

// premises
const pt = rootOf([prem('p1', [fact('x', 1, 1)]), prem('p2', []), prem('p3', [fact('y', 1, -1)])]);
const vp = Component.allValues(pt);
assert.equal(vp.get('r').score, null);
near(vp.get('p1').impact, 1);
near(vp.get('p1').share, 2 / 3);
near(vp.get('p2').share, 1 / 3);
near(vp.get('p3').share, 0);
assert.equal(Component.factRows(pt, vp)[0].calculated, true);
near(Component.allValues(rootOf([prem('p', [fact('y', 1, -1)])])).get('p').share, 1);

// frozen order (Review Focus 4)
const ord = rootOf([fact('a', 1, 0.9), fact('b', 1, -0.9), fact('c', 1, 0)]);
assert.deepEqual(Component.factRows(ord, Component.allValues(ord), ['a', 'gone', 'b']).map((r) => r.node.slug), ['a', 'b', 'c']);

// scale mode
const scale = (raws, divider, resized, move) => Component.resizeImportance(raws, { divider, resized, move, mode: 'scale' });
const shareAt = (r, i) => r[i] / r.reduce((t, x) => t + x, 0);
near(shareAt(scale([10, 30, 60], 0, 0, 0.2), 0), 0.3);
assert.deepEqual(scale([10, 30, 60], 0, 0, 0.2).slice(1), [30, 60]);
near(shareAt(scale([10, 30, 60], 0, 0, 0.6), 0), 0.7);          // past the neighbour
near(shareAt(scale([10, 30, 60], 0, 0, 0.95), 0), 0.9);         // upper limit
near(shareAt(scale([10, 30, 60], 0, 0, -0.09), 0), 0.02);       // lower limit
near(shareAt(scale([10, 30, 60], 0, 1, 0.01), 1), 0.23);        // column right of the divider
assert.deepEqual(scale([0, 0], 0, 0, 0.2), [0, 0]);             // nothing to measure against
assert.deepEqual(scale([5, 0], 0, 0, 0.2), [5, 0]);

// trade mode
const trade = (raws, divider, resized, move, pool) => Component.resizeImportance(raws, { divider, resized, move, mode: 'trade', pool });
assert.deepEqual(trade([50, 50, 100], 0, 0, 0.1, [2]), [70, 50, 80]);
assert.deepEqual(trade([50, 50, 100], 0, 0, 0.1, []), [70, 30, 100]);    // defaults to across the divider
assert.deepEqual(trade([50, 50, 100], 0, 1, 0.1, []), [70, 30, 100]);    // moving right shrinks the right column
assert.deepEqual(trade([50, 50, 100], 0, 0, 0.9, [1]), [96, 4, 100]);    // floor on the trade column
assert.deepEqual(trade([50, 50, 100], 0, 0, -0.9, [1]), [4, 96, 100]);   // floor on the resized column
assert.deepEqual(trade([50, 50, 100], 0, 0, 0.1, [0]), [70, 30, 100]);   // the resized column can't trade with itself
assert.deepEqual(trade([40, 20, 60, 80], 0, 0, 0.1, [1, 3]), [60, 16, 60, 64]); // in proportion
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `make check`
Expected: failure with `Component.allValues is not a function`.

- [ ] **Step 3: Implement the three functions**

`resizeImportance` scale mode uses this formula, where the divider's position is what the pointer controls:

```js
// g0 = this column's share. A = share beyond its far edge. B = share past the divider. d = move away from the column's far edge.
g = clamp(((A + g0 + d) * (A + B) - A) / B, 0.02, 0.9);
raw = (g / (1 - g)) * othersTotal; // all other raws unchanged
```

`d` is `move` when `resized === divider`, otherwise `-move`. In trade mode, `delta = clamp(d * T, 0.02 * T - raws[resized], P - 0.02 * T * members.length)`, and each member becomes `raws[j] - delta * raws[j] / P`, in that order so the test values stay exact. Members default to the column across the divider. If total importance or the other columns' total is 0, return a copy unchanged.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add check.js index.html
git commit -m "feat: importance share, score and resize calculations"
```

### Task 3: The chart on the Map view

**Files:**
- Modify: `index.html`: template `:288-303` (lean bars on the focused card), `:438-537` (selection bar and Pro/Con columns), handlers `:1858-1888`, `:1917-1994`, `:2311-2347`, view model `:2454-2546`, constructor state `:1274-1293`, `data-props` `minCardWidth` at `:1052`, statics `weightsOf`, `scaleWeights`, `widthToWeight`
- Test: `check.js`

**Interfaces:**
- Consumes: `allValues`, `factRows`, `resizeImportance` from Task 2.
- Produces: `Component.impactFill(impact)` → a CSS string: `color-mix(in srgb, var(--con or --pro) N%, var(--sunk))` with `N = round(12 + 88 × |impact|)`, using `--pro` for impact ≥ 0. `Component.impactInk(impact)` → `var(--on-fill)` when `|impact| > 0.5`, otherwise `var(--ink)`. `Component.signed(v)` → `+0.80`, `−0.60`, `0.00`.
- Produces: state `selectedFact: slug|null`, `chartView: 'width'|'tall'|'area'`, `resizeMode: 'scale'|'trade'`, `tradePool: slug[]`, `frozenOrder: slug[]|null`. `chartView` and `resizeMode` are stored with `loadSetting`/`storeSetting` under new constants `CHART_VIEW_STORE` and `RESIZE_MODE_STORE`, named in the same style as `OR_KEY_STORE`.
- Produces: `setFocus` clears `selectedFact`, `tradePool` and `frozenOrder`.

- [ ] **Step 1: Write the failing test**

```js
assert.equal(Component.signed(0.8), '+0.80');
assert.equal(Component.signed(-0.6), '−0.60');
assert.equal(Component.signed(0), '0.00');
assert.ok(Component.impactFill(-1).includes('--con') && Component.impactFill(-1).includes('100%'));
assert.ok(Component.impactFill(0).includes('12%'));
assert.equal(Component.impactInk(0.2), 'var(--ink)');
assert.equal(Component.impactInk(-0.8), 'var(--on-fill)');
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `make check`
Expected: failure with `Component.signed is not a function`.

- [ ] **Step 3: Implement the helpers and overall score**

Replace the focused card's For/Against bar with an overall score gauge (red-to-green track, marker at `(score + 1) × 50%`, signed number). A claim with no children shows "No contributing factors yet." A root with premises shows today's leading-premise sentence using `impact`, with no gauge.

- [ ] **Step 4: Replace the columns with the chart**

Build `chart` in `renderVals` from `factRows(focus, values, s.frozenOrder)` using the real map, not the legacy copy. Remove the selection bar, Pro/Con columns, reorder and weight handlers, `selected`/`dragGroup` state, `flip`, `weightsOf`, `scaleWeights`, `widthToWeight` and `minCardWidth`.

- Each column uses `flex: {{share}} 1 0` with `min-width: 6px`, and each divider is a fixed `8px` focusable button.
- `width` and `tall` views put the fill on the column. `tall` height is `70 + 190 × importance ÷ largest sibling importance` px, in a 260px chart, aligned to the bottom. `area` view uses a centre axis, with bar height `|impact| × 100%` of its half and the label in the opposite half.
- Each column shows its text, share and signed impact. Display overlays appear as text markers: stars, `📎 n`, "no basis". Non-matching columns under a filter use `opacity: 0.22`.
- Use `touch-action: pan-y` on columns and dividers. Only pointer events of type `mouse` or `pen` start a drag.
- Premise columns have no divider drags or thermometer, and locked maps disable all drags. Selection still works in both.

- [ ] **Step 5: Implement the gestures**

Follow `startDrag`'s pattern: `setPointerCapture` on the pressed element, with state kept in `this.drag`.

- **Divider:** snapshot `raws` in the current sibling order. `resized` is the selected column if it touches the divider, otherwise the left one. Each move calls `resizeImportance`, then writes changed values through `this.edit`, rounded to one decimal, always computing from the snapshot.
- **Column:** a vertical move over 5px begins an impact drag, sets `selectedFact` and sets `frozenOrder` to the current order. `impact = clamp(start − dy ÷ 118, −1, 1)`, rounded to two decimals. A thermometer sits over the column. Release clears `frozenOrder`, which re-sorts.
- **Click without a drag:** selects the fact. In trade mode, ⌘-click or Shift-click toggles it in `tradePool`, shown with a dashed outline.
- **Keyboard:** left and right arrows on a divider move by 2% of width, and Shift moves by 0.5%. Up and down on a column change impact by 0.05, or 0.01 with Shift, with `frozenOrder` held until the column loses focus. Enter selects.
- **Controls:** add the view and resize toggles above the chart using `aria-pressed` buttons, and a short hint line that matches the mode.

- [ ] **Step 6: Run the tests and verify in the browser**

Run: `make check`, expected all pass. Then with `make dev`:
- Dragging a divider far past its neighbour in scale mode keeps it under the pointer. In the Source view, only that fact's `importance` line changes.
- Trade mode takes importance only from marked columns.
- Impact drag shows the thermometer and re-sorts on release.
- Keyboard: raise impact past a neighbour, confirm focus stays on the same fact, then Tab away and confirm it re-sorts.
- All three views render in all four themes with readable text.

- [ ] **Step 7: Commit**

```bash
git add check.js index.html
git commit -m "feat: contributing factors chart on the map view"
```

### Task 4: Details panel

**Files:**
- Modify: `index.html`: template `:262-287` and `:304-436` (focused card editors), handlers using `s.focus` (`setBasis` `:1894`, `setConfidence` `:1906`, `saveRef` `:1995`, `removeRef` `:2013`, `onFocusText` `:2043`, `research` `:2227`, `addResearched` `:2241`, `checkRationale` `:2248`, `addArg` `:2287`, `deleteFocus` `:2305`), and the state-replacing paths `onSrc` `:2024`, `loadA` `:2207`
- Test: `check.js`

**Interfaces:**
- Consumes: `selectedFact` from Task 3.
- Produces: `Component.panelSlug(root, focus, selectedFact)` → `selectedFact` if it exists in the map, otherwise `focus` if it exists, otherwise `root.slug`. `Component.safeFocus(root, focus)` → `focus` if it exists, otherwise `root.slug`.

- [ ] **Step 1: Write the failing test (Review Focus 2)**

```js
const t2 = rootOf([fact('a', 1, 0, [fact('b', 1, 0)])]);
assert.equal(Component.panelSlug(t2, 'a', 'b'), 'b');
assert.equal(Component.panelSlug(t2, 'a', 'gone'), 'a');
assert.equal(Component.panelSlug(t2, 'gone', 'gone'), 'r');
assert.equal(Component.panelSlug(t2, 'a', null), 'a');
assert.equal(Component.safeFocus(t2, 'gone'), 'r');
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `make check`
Expected: failure with `Component.panelSlug is not a function`.

- [ ] **Step 3: Implement the panel**

The focused-claim card keeps a read-only claim, score and breadcrumb. Move all editors into a new panel below the chart, bound to `panelSlug(...)`:
- Text, `by` and a multi-line details textarea (a new `setDetails(v)`, where empty becomes `null`).
- Importance and impact number inputs with a slider, for facts only (these serve touch users). Premises show their values with the label "Calculated from its child factors".
- Basis, confidence, evidence and Research, for facts only, as the template already gates by kind.
- Check rationale, on any fact with fact children.
- Add child (the draft form moved from the old columns, with slug field and no weight) and **Open**, which calls `setFocus`.
- Delete, with the existing confirmation, on anything except the root. Deleting clears `selectedFact` and keeps the focus where it is if it still exists.

Handlers use a new `panelTarget()` in place of `s.focus`. Research and rationale results stay keyed by slug, as they are. Clear `selectedFact`, `tradePool` and `frozenOrder` when another file loads. In `renderVals` and `onSrc`, use `panelSlug` and `safeFocus` so a removed slug falls back instead of hitting the `bug:` throw at `:2369`. The toolbar's New premise still adds under the root, via the same draft form with `kind: 'premise'`.

- [ ] **Step 4: Run the tests and verify in the browser**

Run: `make check`, expected all pass. Then with `make dev`:
- Select a fact, edit its text and details, add a child, and confirm all three appear in the Source view.
- Save, reload, and confirm nothing is lost.
- Select a fact, go to the Source view, delete its section, and return to the Map view with no crash.
- A premise shows no editable values.

- [ ] **Step 5: Commit**

```bash
git add check.js index.html
git commit -m "feat: details panel edits the selected fact"
```

### Task 5: Overview, sunburst and diff

**Files:**
- Modify: `index.html`: `layoutWeight`/`partition`/`icicle`/`shares`/`orderedKids` (`:1589-1623`, `:1716`), `diff` (`:1640`), `sankeyLayout` (`:1727`), overview styling (`:2437`), pie view model (`:2558-2620`) and template (`:590-608`), diff view model (`:2643-2850`) and template (`:641-660`, `:671-680`, `:804-870`)
- Test: `check.js`

**Interfaces:**
- Consumes: `allValues`, `factRows`, `impactFill`, `impactInk`, `signed`.
- Produces: `Component.layoutWeight(c, values)` → `Math.max(values.get(c.slug).share, 0.01)`. `Component.partition(node, maxDepth, values)` lays out children in `factRows` order. `orderedKids` is deleted, and `diff` visits children in file order.
- Produces: `Component.diff(a, b, thr)` rows gain `shareA`, `shareB` (percent of siblings or `null`), `impactA`, `impactB`, `shareDelta`, `impactDelta`, `changed`, `flipped`, and lose `wA`, `wB`, `delta`, `weightChanged`, `sideA`, `sideB`.

- [ ] **Step 1: Write the failing tests**

```js
const mapOf = (root) => ({ title: 'T', display: {}, root });
const rowsFor = (a, b) => Component.diff(mapOf(rootOf(a)), mapOf(rootOf(b)), 10).rows;
const rowOf = (rows, slug) => rows.find((r) => r.slug === slug);
// impact change alone counts, at threshold ÷ 100
let d = rowOf(rowsFor([fact('a', 1, 0.8)], [fact('a', 1, 0.1)]), 'a');
assert.ok(d.changed && !d.flipped);
near(d.impactDelta, -0.7);
assert.equal(rowOf(rowsFor([fact('a', 1, 0.8)], [fact('a', 1, 0.75)]), 'a').changed, false);
// share change, in percentage points
d = rowOf(rowsFor([fact('a', 50, 0), fact('b', 50, 0)], [fact('a', 70, 0), fact('b', 30, 0)]), 'a');
assert.ok(d.changed);
near(d.shareDelta, 20);
// flipped needs strictly opposite signs
assert.equal(rowOf(rowsFor([fact('a', 1, 0.5)], [fact('a', 1, -0.5)]), 'a').flipped, true);
d = rowOf(rowsFor([fact('a', 1, 0.5)], [fact('a', 1, 0)]), 'a');
assert.ok(d.changed && !d.flipped);
// layout values never collapse
const lv = Component.allValues(rootOf([fact('a', 0, 1), fact('b', 10, 1)]));
near(Component.layoutWeight({ slug: 'a' }, lv), 0.01);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `make check`
Expected: failure on `d.changed`.

- [ ] **Step 3: Port overview and sunburst**

Colour every block and segment with `impactFill`, with the root and focused emphasis kept through borders and shadows. Overlays become small text in `aria`/titles where marks would alter impact colour. The sunburst legend shows read-only share and signed impact and drops its sliders. Labels show `signed(impact)`.

- [ ] **Step 4: Port diff**

Compute `allValues` for both maps and pass them through `sankeyLayout`, `shares` and the Structure view. `changed` means `|shareDelta| ≥ thr` or `|impactDelta| ≥ thr ÷ 100`. `flipped` means `impactA × impactB < 0`. Use the premise's calculated impact where needed. Thesis-lean bars become two overall-score gauges. The `weight` chip becomes `Changed`, and the `flipped` chip's label becomes `Flipped`. The Sankey legend becomes the impact scale, and links use `impactFill`, keeping `--moved` and orphan treatments. Detail cards show Share and Impact in place of Weight and Holds.

- [ ] **Step 5: Run the tests and verify in the browser**

Run: `make check`, expected all pass. Then open `?ours=examples/votes-at-16/map.md&theirs=examples/votes-at-16/obi.md`, and check Sankey, Structure and Table tabs, every chip, and Sankey selection for no console errors. Check pie drill-in and pin too.

- [ ] **Step 6: Commit**

```bash
git add check.js index.html
git commit -m "feat: overview, sunburst and diff use importance and impact"
```

### Task 6: Finish the port

**Files:**
- Modify: `index.html`: `checkRationale` (`:2248`), `researchEvidence` prompt (`:1244`), rationale `show` (`:3003`), filter summary (`:3016`), overlay descriptions (`:3078`), New map panel (`:84`), format help (`:901-925`), remaining copy, `withLegacyFields`, `scoreAll`
- Modify: `README.md`
- Modify: `examples/votes-at-16/map.md`, `examples/votes-at-16/obi.md`, `examples/votes-at-16/README.md`
- Test: `check.js`

**Interfaces:**
- Consumes: everything above. Nothing later depends on this task.

- [ ] **Step 1: Write the failing test**

```js
const script = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
for (const dead of [/\.side\b/, /\.weight\b/, /withLegacyFields/, /scoreAll/, /orderedKids/]) assert.ok(!dead.test(script), String(dead));
// migrated examples are in the new format and keep every fact
for (const f of ['map', 'obi']) {
  const src = fs.readFileSync(`examples/votes-at-16/${f}.md`, 'utf8');
  assert.ok(!src.includes('[+]') && !src.includes('[-]'), f);
  assert.deepEqual(Component.parse(src).errors, []);
}
assert.equal(Component.allValues(Component.parse(fs.readFileSync('examples/votes-at-16/map.md', 'utf8')).map.root).size, 14);
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `make check`
Expected: failure on `/\.side\b/`.

- [ ] **Step 3: Implement**

- Check rationale: pro case is children with impact > 0, con case is impact < 0, and zero goes in neither. Research: `side` in the prompt is `'for'` if impact ≥ 0, otherwise `'against'`.
- New map panel: rename the option to "Contributing factors". Update the format help to the new format and rewrite the README's Links, AI helpers and format wording.
- Remove `withLegacyFields`, its `renderVals` line, `scoreAll` and every remaining pro/con reference and label.
- Migrate both examples by running `Component.serialize(Component.parse(old).map)` once from a throwaway script, then check the output before committing. Their impacts are ±1, as the spec says.
- Remove any leftover `--prem-fill*`, `--pro-fill*` or `--con-fill*` tokens only if nothing still uses them.

- [ ] **Step 4: Run the tests and do the end-to-end check**

Run: `make check`, expected all pass. Then with `make dev`:
- Open the migrated example and an old-format copy from `git show master:examples/votes-at-16/map.md`. Edit the old one and confirm the source becomes the new format.
- Run through map, pie, source and diff views in all four themes, with no console errors.
- Create a new map with each starting option, add facts and premises, and download it, then reopen the file.

- [ ] **Step 5: Commit**

```bash
git add check.js index.html README.md examples
git commit -m "feat: finish contributing factors port and migrate examples"
```
