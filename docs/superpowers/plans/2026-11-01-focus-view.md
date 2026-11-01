# Focus View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Map and Pie views with one focus view (new-map card, single header, breadcrumbs, current point, health bar, bar or pie of points, depth rows, locks), keeping the markdown format and the Source and Diff views.

**Architecture:** Everything stays in `index.html`'s `sc-if`/`sc-for` template and `renderVals`. The "selected fact" concept goes away, so the existing panel bindings (`pn`, `bc`, `ev`, `rat`) always describe the focused point. New pure logic goes in static `Component` methods, tested from `check.js`. `resizeImportance` keeps its scale and trade modes, and only the choice of plan changes.

**Tech Stack:** Plain HTML, vendored React, `dc-runtime` template, bun for `make dev` and `make check`.

**Spec:** `docs/superpowers/specs/2026-11-01-focus-view-design.md`. The look to match is `docs/superpowers/specs/2026-11-01-focus-view-prototype.html`. Don't copy its code: it builds its own DOM, and this app renders through the template.

## Global Constraints

- No build step and no new dependencies. Don't edit `support.js` (generated).
- Markdown stays the only data source. Locks, chart view and hover state are never written to the file.
- Colours come from existing theme tokens, and all four themes (paper, slate, night, contrast) must work.
- Read-only maps (`locked` in the code, meaning the markdown has errors) allow opening points, and no edits, drags, locks or "+" buttons.
- Don't name column locks `locked` in code. Use `lockedFacts`.
- `?view=map|pie|source|diff`, `?focus`, `?theme`, `?src`, `?ours` and `?theirs` keep working.
- `make check` passes at the end of every task. The test `every view renders with no unresolved bindings` catches template bindings left dangling.
- Delete code a task makes unused, in that task.

## Review Focus

- Siblings all at importance 0, or premises all at impact −1 (share 0): no `NaN` in widths, slices or depth cells, and nothing draggable breaks.
- A lock on a point that later disappears, through a Source edit, delete or undo: it is ignored, and the count and Clear stay right.
- Maps deeper than five levels: depth rows and pie rings show every level, since the old overview stopped at 5.
- Titles with only symbols, and options that repeat each other or the title: Create stays disabled for the first, and slugs stay unique for the second.
- Very long titles at deep levels: breadcrumbs truncate on one row, and the whole title is reachable on hover.

---

### Task 1: New-map card

**Files:**
- Modify: `index.html` (template `nm` section at lines 76-96 and the "No map open" panel at 172-181; `createMap` at 2362; `nm` bindings at 3112-3123; initial state)
- Test: `check.js` (replace `new maps of each kind can be created and reopened`; keep the slug-block test at line 558 working against the title)

**Interfaces:**
- Produces: state `newOpen`, `newTitle`, `newDesc` (replaces `newText`), `newOptions: string[]`. `newKind` is removed. `createMap()` uses these. `nm` binds `title`, `desc`, `slug`, `options[]`, `addOption`, `showOptionsToggle`, `create`, `createDisabled`, `canCancel`.

- [ ] **Step 1: Write the failing tests**

```js
test('a new map takes its slug from the title, with an optional description', () => {
  const c = boot();
  c.setState({ newTitle: 'Where to?', newDesc: '', newOptions: [] });
  c.createMap();
  assert.equal(c.state.map.root.slug, 'where-to');
  assert.equal(c.state.map.root.text, 'Where to?');
  assert.equal(c.state.map.title, 'Where to?');
  assert.equal(c.state.map.root.details, null);
  assert.equal(Component.parse(c.state.src).errors.length, 0);
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
});

test('Create is disabled until the title has a letter or digit', () => {
  const c = boot();
  c.setState({ newOpen: true, newTitle: '?!' });
  assert.equal(c.renderVals().nm.createDisabled, true);
  c.setState({ newTitle: 'a' });
  assert.equal(c.renderVals().nm.createDisabled, false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `make check`
Expected: FAIL on all four, because `newDesc` and `newOptions` are ignored.

- [ ] **Step 3: Implement**

`createMap`: slug from `Component.slugBase(title)`, title used for both `map.title` and `root.text`, `details` is the trimmed description or `null`, and options go through `Component.slugify(text, taken)`, adding each slug to `taken` starting from the root's. Remove the `adding: 'premise'` follow-up. Keep the curly-brace notice and the slug-block rule, now on the title.

Template: a card filling the viewport below the header (`flex: 1`, large padding as in the prototype). The title is a borderless `<input>` at `2.25rem`/700 with the placeholder "What are you deciding?", the description a borderless `<textarea>` with "Add a description (optional)", then the small slug line. "+ Compare options instead of one thesis" reveals option inputs with × buttons and "+ Add option". The footer holds the "replaces the current map" warning (only when a map is open), Cancel (only when a map is open) and Create. When no map is open and the Open panel isn't showing, show this card in place of the "No map open" panel, and keep an Open… button in its footer.

- [ ] **Step 4: Run to verify they pass**

Run: `make check`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js docs/superpowers/specs/2026-11-01-focus-view-design.md docs/superpowers/specs/2026-11-01-focus-view-prototype.html docs/superpowers/plans/2026-11-01-focus-view.md
git commit -m "feat: new maps start from a title card with optional description and options"
```

### Task 2: Single header bar

**Files:**
- Modify: `index.html` (template lines 44-74 and 98-167; `tb`, `tabs`, `chart.views` bindings)
- Test: `check.js` (update `views and resize behaviours switch and show bindings`)

**Interfaces:**
- Produces: `tb.menuOpen`, `tb.toggleMenu`. `tabs` is unchanged except that the `map` tab's label becomes "Bar view". `chartViewsShown: boolean` is true only when `view === 'map'`.

- [ ] **Step 1: Write the failing test**

```js
test('the chart view switch only shows on the bar view', () => {
  const c = boot(MAP3);
  assert.equal(c.renderVals().chartViewsShown, true);
  for (const view of ['pie', 'source', 'diff']) { c.setState({ view }); assert.equal(c.renderVals().chartViewsShown, false, view); }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `make check`
Expected: FAIL, because `chartViewsShown` is undefined.

- [ ] **Step 3: Implement**

One `<header>` row, wrapping when narrow. Left: `{{title}}` (truncated), `{{tb.file}}`, `{{tb.status}}`. Centre: the existing view icons, in the same order. Right: the filter box, the Filter button with its existing panel (positioned under the button), the chart view switch as icon buttons with the three titles, and a ⋯ button opening a menu with New, Add option (`tb.addPremise`, same disabled rule and title), Open…, Save (when `tb.canSave`), Download and Settings. Remove the old `<h1>` block, its "Argument map · markdown-backed" line and the old rows. Close the menu after a choice, and on Escape.

- [ ] **Step 4: Run to verify it passes**

Run: `make check`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: one header bar for file actions, views, filter and chart view"
```

### Task 3: Clicking opens, and locks replace the trade pool

**Files:**
- Modify: `index.html` (`dividerPlan`, `startColumnDrag`, `moveColumnDrag`, `onColumnClick`, `toggleFact`, `panelTarget`, `Component.panelSlug`, `setFocus`, `PANEL_RESET`, initial state, `chart` bindings at 2696, and the mode switch template at lines 297-301)
- Test: `check.js` (rewrite every test from the list in Step 1)

**Interfaces:**
- Produces: `static Component.lockPlan(i, rows, lockedFacts) -> { divider, resized, mode, pool } | null`; state `lockedFacts: string[]`; `toggleLock(slug)`; `clearLocks()`; column bindings `c.isLocked`, `c.menu` (the `contextmenu` handler); `chart.lockCount`, `chart.clearLocks`. `panelTarget()` returns `state.focus`. `selectedFact`, `tradePool`, `resizeMode`, `RESIZE_MODE_STORE` and `chart.modes` are removed.
- `setFocus` clears `lockedFacts`.

- [ ] **Step 1: Write the failing tests**

Rewrite the existing tests that depend on selection: `a divider resizes the selected column when it touches it`, `trade drag moves importance only between chosen columns`, `clicking selects, and clicking again deselects`, `premise columns can be selected but not dragged`, `views and resize behaviours…`, `the panel shows the selected fact…`, `the panel edits the selected fact…`, `evidence attaches to the selected fact`, `add puts a child under the panel target…`, `Open focuses the fact…`, `delete removes the selected fact…`, `a selected fact removed from the source…`, `locked maps still select…`, `vertical drag…`, and `panelSlug and safeFocus…`. Each moves to "the focused point". Add:

```js
// Shared fixtures for this and later tasks. Slugs: DEEP_MAP is r > level-1 > ... > level-6.
const PREMISE_MAP = `---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: 1\n\n## Q\nslug: q\nkind: premise\n\n### G\nslug: g\nimportance: 1\nimpact: -0.5\n`;
const DEEP_MAP = `---\ntitle: T\n---\n\n# R\nslug: r\n` + [1, 2, 3, 4, 5, 6].map((n) => `\n${'#'.repeat(n + 1)} L${n}\nslug: level-${n}\nimportance: 1\nimpact: 0.5\n`).join('');
const imps = (c) => ['a', 'b', 'c'].map((s) => nodeOf(c, s).importance);
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
  const col = chartOf(c).cols[0];
  col.down(ev({ metaKey: true }));
  assert.deepEqual(c.state.lockedFacts, []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `make check`
Expected: FAIL on `lockPlan`-related and "opens" tests.

- [ ] **Step 3: Implement**

`lockPlan`: keep only slugs present in `rows`. No locks returns `{ divider: i, resized: i, mode: 'scale' }`. If `rows[i]` and `rows[i + 1]` are both locked, return `null`. `resized` is `i + 1` if only `rows[i]` is locked, else `i`. `pool` is every unlocked index except `resized`. An empty `pool` returns `null`. Otherwise `mode: 'trade'`. `startDivider` and `onDividerKey` do nothing on `null`.

Modifier handling goes in `startColumnDrag`, on pointer down, because Ctrl-click on a Mac fires `contextmenu` with no `click`: when `e.ctrlKey || e.metaKey || e.shiftKey`, call `toggleLock` for facts on an editable map, set `suppressClick`, and return. `c.menu` calls `preventDefault` when `e.ctrlKey`, and needs `onContextMenu="{{c.menu}}"` in the template. Enter on a column calls `setFocus`, and **L** calls `toggleLock`.

`moveColumnDrag` no longer sets a selection. `onColumnClick` becomes `setFocus(slug)` after the `suppressClick` check.

Locked style on the column (add a class to the `<helmet>` styles): diagonal `repeating-linear-gradient` from `--ink` at 16%, `2px dashed var(--ink2)`, fill faded. Hovering a draggable column shows a ↕. Under the chart, replace `chart.hint` with the prototype's hint text, or when locks exist "`N` locked · a resize leaves it/them alone" and a **Clear** button.

- [ ] **Step 4: Run to verify they pass**

Run: `make check`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: clicking a column opens it, and locks control what a resize affects"
```

### Task 4: The current point

**Files:**
- Modify: `index.html` (template lines 234-286 and 348-end of the details section, `fc`, `score`, `pn` bindings, the root text setter, the removed overview section)
- Test: `check.js`

**Interfaces:**
- Consumes: `panelTarget() === focus` from Task 3.
- Produces: `static Component.importanceForShare(raws, index, share) -> number` (share clamped to 0.02-0.9); `static Component.healthLabel(score) -> string`; `health: { has, left, width, isPositive, label, signed }`; `pn.shareSlider`, `pn.setShare`; `pn.moreOpen`. The breadcrumb row keeps `crumbs` and adds `crumbMeta` (for example `+0.80 · 34% of this level`).

- [ ] **Step 1: Write the failing tests**

```js
test('the share slider changes only this fact, and clamps', () => {
  near(Component.importanceForShare([10, 30, 60], 0, 0.5), 90);
  near(Component.importanceForShare([10, 30, 60], 0, 0.99), 810); // clamped to 90%
  near(Component.importanceForShare([10, 30, 60], 0, 0), 90 * 0.02 / 0.98);
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
  const p = boot(PREMISE_MAP);
  assert.match(p.renderVals().health.label, /^Leading: /);
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

test('breadcrumbs list every level above and the point in focus', () => {
  const c = boot(DEEP_MAP);
  c.setFocus('level-6');
  assert.equal(c.renderVals().crumbs.length, 6);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `make check`
Expected: FAIL on the new helpers and bindings.

- [ ] **Step 3: Implement**

Remove the Overview section, the parent card and the focused-claim card. New order: breadcrumbs (only with a parent, on one row, each crumb truncated with a `title` holding the whole text, the current point unlinked, `crumbMeta` on the right), then title (borderless `<textarea rows="1">` bound to `pn.text`, `2.25rem`/700, `field-sizing: content`, `readOnly` when locked), description (borderless `<textarea>` bound to `pn.details`, with the placeholder), sliders (facts only; importance disabled with no siblings, and `aria-label`s), premise note, health bar, and a `<details>` **More** holding by, basis, confidence, evidence, Research, Check rationale, slug and delete. Scale drags in the bar re-render these values too.

The "kids mini-bar" and panel add form inside the old details section go away (the add form moves to Task 5). `setText` on the root also updates `map.title` when they matched.

- [ ] **Step 4: Run to verify they pass**

Run: `make check`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: current point with breadcrumbs, inline editing, sliders and health bar"
```

### Task 5: Adding points

**Files:**
- Modify: `index.html` (`addArg`, `add` bindings at 2638, `draftSlugCustom` and its helpers, the chart section template)
- Test: `check.js` (replace `adding a fact defaults…`, and rewrite `add puts a child…`)

**Interfaces:**
- Produces: state `adding: null | { parent: slug, impact: number, isPremise: boolean }`, `draftText`, `draftDetails`, `draftImpact`; `openAdd(parentSlug, impact)`; `commitAdd()`; `cancelAdd()`. Bindings: `add.open`, `add.title`, `add.details`, `add.impact`, `add.commit`, `add.cancel`, `add.left`, `add.right`, `add.wide`, `add.wideLabel`. `tb.addPremise` calls `openAdd(root.slug, 0)` with `isPremise: true`.

- [ ] **Step 1: Write the failing tests**

```js
test('the "+" buttons start at the agreed impacts, with importance 50', () => {
  const start = (fn) => { const c = boot(MAP3); chartOf(c); fn(c.renderVals().add); return c.state.adding.impact; };
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
});

test('an empty point offers one wide "+", starting at 0', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n`);
  assert.equal(chartOf(c).hasCols, false);
  c.renderVals().add.wide();
  assert.equal(c.state.adding.impact, 0);
});

test('on premises every "+" adds an option, with no impact', () => {
  const c = boot(PREMISE_MAP);
  c.renderVals().add.left();
  assert.equal(c.state.adding.isPremise, true);
  c.setState({ draftText: 'Another' });
  c.commitAdd();
  assert.equal(c.state.map.root.children.find((k) => k.text === 'Another').kind, 'premise');
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
  const bad = boot(MAP3);
  bad.setState({ srcErrors: [{ line: 1, message: 'broken' }] }); // match the error shape used by `locked maps…`
  assert.equal(bad.renderVals().add.canOpen, false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `make check`
Expected: FAIL on `add.left`, `commitAdd` and friends.

- [ ] **Step 3: Implement**

In the chart section: with children, the bar sits between two 48px dashed "+" buttons. With none, one wide dashed "+" with "Add the first point" or "Add the first option". The chart section's own card and its heading go away, so the bar stands alone, as in the prototype.

The dialog is a fixed overlay with `role="dialog"`, `aria-modal="true"`, `autoFocus` on the title field, Escape to cancel, and Enter in the title to commit. It holds the title, optional description and impact slider (not for premises). Remove `draftSlugCustom`, its helpers and `slugProblem` if nothing else uses it. New points use `Component.slugify`.

Animate columns into place only if it stays simple in this template: a CSS `transition` on `flex-grow` is enough. Respect `prefers-reduced-motion`.

- [ ] **Step 4: Run to verify they pass**

Run: `make check`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: add points through a dialog from the plus buttons around the bar"
```

### Task 6: Depth rows

**Files:**
- Modify: `index.html` (new static method, `chart` bindings, template under the bar; delete `ice` from `renderVals` only if the Diff view doesn't need `Component.icicle`, which it does at line 3004)
- Test: `check.js`

**Interfaces:**
- Produces: `static Component.depthCells(rows, values) -> [{ node, row, x, w, topIndex }]`. `rows` is the bar's sorted `factRows`, `x` and `w` are fractions of total column width, `topIndex` is the top-level column index, and `row` starts at 0 for the level directly below the bar. Bindings: `chart.depth: { has, height, cells: [{ left, width, top, bg, title, text, op, open }] }`.

- [ ] **Step 1: Write the failing tests**

```js
test('depth cells line up under their parent column, at every level', () => {
  const c = boot(DEEP_MAP);
  const values = Component.allValues(c.state.map.root);
  const rows = Component.factRows(c.state.map.root, values);
  const cells = Component.depthCells(rows, values);
  assert.equal(Math.max(...cells.map((x) => x.row)), 4); // level-2 to level-6, past the old overview's limit of 5 levels
  for (const cell of cells) { assert.ok(cell.x >= 0 && cell.x + cell.w <= 1 + 1e-9); }
});

test('siblings in a depth row share their parent width, sorted by impact', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 50\nimpact: 0\n\n### P\nslug: p\nimportance: 1\nimpact: 1\n\n### Q\nslug: q\nimportance: 3\nimpact: -1\n\n## B\nslug: b\nimportance: 50\nimpact: 1\n`);
  const values = Component.allValues(c.state.map.root);
  const cells = Component.depthCells(Component.factRows(c.state.map.root, values), values);
  assert.deepEqual(cells.map((x) => x.node.slug), ['q', 'p']);
  near(cells[0].w, 0.375);
  near(cells[1].x, 0.375);
});

test('zero-importance children produce no NaN', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## A\nslug: a\nimportance: 50\nimpact: 0\n\n### P\nslug: p\nimportance: 0\nimpact: 1\n\n### Q\nslug: q\nimportance: 0\nimpact: -1\n`);
  const values = Component.allValues(c.state.map.root);
  for (const cell of Component.depthCells(Component.factRows(c.state.map.root, values), values)) { assert.ok(Number.isFinite(cell.x) && Number.isFinite(cell.w)); }
});

test('clicking a depth cell opens it', () => {
  const c = boot(DEEP_MAP);
  chartOf(c).depth.cells[0].open();
  assert.notEqual(c.state.focus, c.state.map.root.slug);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `make check`
Expected: FAIL, `depthCells` is not a function.

- [ ] **Step 3: Implement**

Cells position with CSS `calc` so they match the flex columns and their 8px dividers. With `n` columns, `left: calc((100% - ${8 * (n - 1)}px) * ${x} + ${8 * topIndex}px)`, `width: calc((100% - ${8 * (n - 1)}px) * ${w} - 1px)`, min 2px. Columns under their `min-width` drift slightly, which the earlier spec accepts. Rows are 30px high. Text only shows where the cell's share of the bar suggests at least about 56px (`w > 0.05`). Cells are `<button>`s with `title`, using `Component.impactFill`. They dim under a filter like columns. Depth rows are rendered on the bar view only.

- [ ] **Step 4: Run to verify they pass**

Run: `make check`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: show the levels below the points, and open any of them"
```

### Task 7: Pie in the focus layout

**Files:**
- Modify: `index.html` (template lines ~575-640, `pie` bindings at 2730-2793, `pinned` state and its uses, `chart` section conditionals, drag handlers)
- Test: `check.js` (rewrite `deleting a pinned claim falls back instead of crashing` to test focus fallback; update `the overview and sunburst colour by impact`)

**Interfaces:**
- Consumes: `lockPlan`, `toggleLock`, `add.*`, `openAdd` from Tasks 3 and 5.
- Produces: `static Component.angleDelta(prev, now) -> number` (radians, normalised to −π..π); `startPieEdge(i, rows, e)`, using the same `this.drag` flow as dividers with `type: 'pieEdge'`. Bindings: `pie.slices[]` (adds `slug`, `depth`, `hasChildren`, `isLocked`, `down`, `menu`, `key`), `pie.edges[]` (`d`, `down`, `move`, `up`, `key`), `pie.ctls[]` (`x`, `y`, `label`, `add`), `pie.hatch`. Hover state keeps `hover`, with `this.pieHoverTimer` hiding it after 180ms so the pointer can reach a "+".

- [ ] **Step 1: Write the failing tests**

```js
const pieOf = (c) => { c.setState({ view: 'pie' }); return c.renderVals().pie; };

test('slice edges exist between inner slices only, with none at the wrap', () => {
  assert.equal(pieOf(boot(MAP3)).edges.length, 2);
  assert.equal(pieOf(boot(PREMISE_MAP)).edges.length, 0);
});

test('angleDelta takes the short way around', () => {
  near(Component.angleDelta(3, -3), 2 * Math.PI - 6);
  near(Component.angleDelta(-3, 3), 6 - 2 * Math.PI);
  near(Component.angleDelta(0, 0.5), 0.5);
});

test('dragging a slice edge respects locks', () => {
  const c = boot(MAP3);
  const p = pieOf(c);
  p.slices.find((s) => s.slug === 'c').down(ev({ metaKey: true }));
  assert.deepEqual(c.state.lockedFacts, ['c']);
  const rect = { left: 0, top: 0, width: 200, height: 200 };
  const e = (x, y) => ev({ clientX: x, clientY: y, currentTarget: { setPointerCapture() {}, closest: () => ({ getBoundingClientRect: () => rect }) } });
  const edge = pieOf(c).edges[0];
  edge.down(e(100, 0));            // straight up from the centre
  pieOf(c).edges[0].move(e(200, 100)); // a quarter turn clockwise, or 0.25 of the total
  pieOf(c).edges[0].up(e(200, 100));
  assert.equal(nodeOf(c, 'c').importance, 60);
  assert.equal(nodeOf(c, 'a').importance + nodeOf(c, 'b').importance, 40);
  assert.ok(nodeOf(c, 'a').importance > 10);
});

test('only inner slices can be locked', () => {
  const c = boot(DEEP_MAP);
  const inner = pieOf(c).slices.filter((s) => s.depth > 1)[0];
  inner.down(ev({ metaKey: true }));
  assert.deepEqual(c.state.lockedFacts, []);
});

test('hovering shows a "+" each side, and a leaf gets one more for a first child', () => {
  const c = boot(MAP3);
  pieOf(c).slices[0].enter();
  const ctls = pieOf(c).ctls;
  assert.equal(ctls.length, 3);
  ctls[0].add();
  assert.equal(c.state.adding.parent, 'r');
  assert.equal(c.state.adding.impact, -0.75);
  c.setState({ adding: null });
  pieOf(c).ctls[1].add();
  assert.equal(c.state.adding.impact, -0.25);
  c.setState({ adding: null });
  pieOf(c).ctls[2].add();
  assert.equal(c.state.adding.parent, 'a');
  assert.equal(c.state.adding.impact, 0);
});

test('a slice with children gets no leaf "+"; premise siblings have no impact', () => {
  const c = boot(DEEP_MAP);
  pieOf(c).slices.find((s) => s.hasChildren).enter();
  assert.equal(pieOf(c).ctls.length, 2);
  const p = boot(PREMISE_MAP);
  pieOf(p).slices[0].enter();
  pieOf(p).ctls[0].add();
  assert.equal(p.state.adding.isPremise, true);
});

test('zero-share premises draw no slice and no NaN', () => {
  const c = boot(`---\ntitle: T\n---\n\n# R\nslug: r\n\n## P\nslug: p\nkind: premise\n\n### F\nslug: f\nimportance: 1\nimpact: -1\n\n## Q\nslug: q\nkind: premise\n\n### G\nslug: g\nimportance: 1\nimpact: -1\n`);
  for (const s of pieOf(c).slices) assert.ok(!s.d.includes('NaN'));
});

test('switching between bar and pie keeps locks', () => {
  const c = boot(MAP3);
  colOf(c, 'c').down(ev({ metaKey: true }));
  c.setState({ view: 'pie' });
  assert.deepEqual(c.state.lockedFacts, ['c']);
  assert.equal(c.renderVals().pie.slices.find((s) => s.slug === 'c').isLocked, true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `make check`
Expected: FAIL on `edges`, `ctls` and `angleDelta`.

- [ ] **Step 3: Implement**

Remove `pinned`, the pin button, the legend, the labels and the centre button, along with their bindings. The pie now appears in the chart slot under the current point, between the same two "+" buttons, at `min(68vh, 640px)` high. The Pie view reuses the Map view's current-point block, so make that block unconditional for both views instead of duplicating it. Centre text is the score, none on premises.

Reuse `Component.arc` and `Component.partition` with slices sorted by impact (`factRows`' order at each level), starting clockwise from the top, using all levels, with ring radii leaving 28 viewBox units outside the outer ring for the leaf "+".

Edge drag: `angle = atan2(x - cx, cy - y)`. Accumulate with `angleDelta` and call `resizeImportance` with `move: accumulated / (2π)`, using the plan from `lockPlan`, and the same `setImportances`. Edge paths are `stroke: transparent; stroke-width: 12`, with a faint `--ink` stroke on hover, `cursor: grab`, `tabIndex="0"`, and left/right arrows through `onDividerKey`. Skip all of this for premises or when locked.

"+" positions and sibling start impacts follow the spec's Pie section. Clamp impact to −1..1. Use the prototype's spacing rule: buttons stay at least 24 units apart, and a full ring nudges both apart by 0.2 radians. Show `ctls` on hover and on slice keyboard focus, with `<g tabIndex="0">` so Tab reaches them. Locked slices get `fill-opacity`, a dashed stroke and an overlay path using an SVG `<pattern>`.

- [ ] **Step 4: Run to verify they pass**

Run: `make check`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: pie in the focus layout, with drag to resize, locks and hover plus buttons"
```

### Task 8: Docs and a real browser pass

**Files:**
- Modify: `README.md` (the chart and Links sections, and the wording about Open, selection and Trade); `index.html` (any fixes found)
- Test: `make check`, plus the browser

- [ ] **Step 1: Update the README**

Replace "Click a column to see and edit it in the details panel…", the Scale/Trade bullets and "Open" wording with: clicking opens a point, Ctrl/⌘/Shift-click or **L** locks, and a resize leaves locked points alone. Describe depth rows and the pie's drag, locks and "+" buttons.

- [ ] **Step 2: Run the checks**

Run: `make check`
Expected: all tests pass.

- [ ] **Step 3: Check in a real browser**

Run: `make dev` and open `http://localhost:8000/?src=examples/votes-at-16/map.md`. If the sandbox blocks the port, ask the author to run it, and don't claim this step passed. Confirm each of these, in Chrome at desktop width:

1. New map with only a title lands on the wide "+". Slug is from the title. Save and reopen round-trips.
2. Add three points from each side. They sort. New maps with options work.
3. Divider drag, column drag, locks and Clear work, including Ctrl-click on a Mac with no context menu.
4. Depth rows stay aligned while dragging. Clicking one opens it, and breadcrumbs jump back.
5. The pie: edge drag follows the pointer, locks show, and the "+" buttons can be reached before they vanish.
6. The header stays on one row at 1400px and wraps cleanly at 400px, with no horizontal page scroll.
7. All four themes: column text, depth text and locked styling stay readable.
8. Source and Diff work under the new header. `?ours=…&theirs=…` still opens Diff.
9. Keyboard: arrows, Enter and **L** on the bar and pie.

Fix what's broken and rerun `make check`.

- [ ] **Step 4: Commit**

```bash
git add README.md index.html check.js
git commit -m "docs: describe the focus view, and fixes from the browser pass"
```
