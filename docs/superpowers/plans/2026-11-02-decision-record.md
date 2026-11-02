# Decision Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a decision-record template (goals → criteria → options with 0–10 scores → reasons) to the decision-map app, with overall ranking, what-if weights, undo/redo, browser snapshots and a two-record Compare view.

**Architecture:** A record is a markdown file with `template: decision-record`. It parses into the same node tree as a map, with record-only node kinds, so `findPath`, `mapNode`, `edit()`, Source and file handling are reused. Pure static helpers on `Component` compute goal scores, winners and the ranking. New views are new `sc-if` blocks in the template, fed by new `renderVals` bindings. They reuse the bar's divider, the pie's ⇔ handles, `tradePlan`/`resizeImportance` and `chosenFacts`.

**Tech Stack:** Plain `index.html`, vendored React, the `dc-runtime` template (`sc-if`/`sc-for`, `{{bindings}}`), and `check.js` run with bun through `make check`.

**Spec:** `docs/superpowers/specs/2026-11-02-decision-record-design.md`. Prototype: `docs/superpowers/specs/2026-11-02-decision-record-prototype.html`. Don't copy its code.

## Global Constraints

- No build step and no new dependencies. Don't edit `support.js`.
- Markdown files are the only data source for records. Snapshots, undo history and what-if weights are never written to the file.
- Existing map files (heading format and the legacy list format) must open and save exactly as before.
- Scores are whole numbers from 0 to 10. Reason weight is for emphasis only and never changes a score.
- An option a goal doesn't include scores 0 for that goal in the overall ranking.
- Saving what-if weights with a goal turned off writes `importance: 0`.
- If the UI conflicts, read-only wins. A file with markdown errors is shown but can't be edited.
- Name nothing new `locked`, which already means read-only. What a resize changes stays `chosenFacts`.
- Every view must render with no unresolved bindings (`unresolved(c.renderVals())` in `check.js`).
- Confirm the behaviour in a real browser (`make dev`) before calling the work done.

## Review Focus

1. **An old map round-trips unchanged.** Opening and saving any existing map file, legacy format included, gives byte-identical output, and `template:` is never written into a map. Pinned in Task 1.
2. **One option, two titles.** A record where the same `option:` slug has two different heading titles gets a parse error naming the line, rather than one title silently winning. Pinned in Task 1.
3. **Undo after a drag, and across files.** Undo after a drag reverts the whole drag in one step. Undo after opening another file does nothing: it never steps back into the previous file. Pinned in Task 2.
4. **Source edits under what-if.** A goal removed or added in Source while what-if weights are active drops out of, or joins, the overlay at its record weight. A later Save doesn't bring a removed goal back. Pinned in Task 6.
5. **Storage refused.** When IndexedDB is missing or refuses, the snapshot controls say snapshots can't be kept in this browser, and nothing throws. Pinned in Task 7.
6. **Comparing against a map.** Opening a decision map as the second file in a record's Compare shows a clear message, not a broken view. Pinned in Task 8.

---

### Task 1: Record format, model and maths

**Files:**
- Modify: `index.html` (`parse`, `parseHeadings`, `headingNode`, `serialize`, plus new statics near `allValues`)
- Test: `check.js` (new section `// ---- decision record`)

**Interfaces:**
- Produces:
  - `map.template`: `'map' | 'record'`. Front matter `template: decision-record` sets `'record'`. `serialize` writes `template: decision-record` only for records.
  - Record node kinds: `'goal'` (depth 2), `'criterion'` (depth 3), `'score'` (depth 4) and `'reason'` (depth 5). The root stays `'root'`.
  - Node fields, reusing `importance` for the number:
    - goal: `importance:` → `importance`
    - criterion: `weight:` → `importance`
    - reason: `weight:` → `importance`, plus `by`, `basis`, `confidence`, `details` and `refs` as on facts
    - score: `option: <slug>` and `score: 0–10` (whole number) → `option` and `score`. It has no `slug` line in the file. Its in-memory `slug` is `${criterionSlug}--${option}` so `findPath`/`mapNode` work, and `serialize` doesn't write it.
  - Slugs stay unique across goals, criteria and reasons. Option slugs are a separate namespace.
  - `Component.recordModel(map, overlay = null)` returns:
    ```
    { options: Map<optSlug, title>,
      goals: [{ node, importance, on: importance > 0,
                criteria: [{ node, weight, share }],
                options: [optSlug], scores: { [opt]: { [crit]: n } },
                goalScores: { [opt]: 0–10 }, winner: optSlug | null }],
      ranking: [{ option, total, parts: [{ goal, value }], wins: [goalSlug] }] }  // sorted by total, best first
    ```
    `overlay` is `{ [goalOrCriterionSlug]: weight }`. A slug in it replaces that node's weight, and unknown slugs are ignored.
  - `Component.newRecord(title, details)` returns a map with one goal "First goal" (importance 1) holding one criterion "First criterion" (weight 1).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: the new tests FAIL (`template` is an unknown front-matter key, and `recordModel`/`newRecord` aren't functions). Every existing test passes.

- [ ] **Step 3: Implement**

- `parse` accepts a `template` key, where the only allowed value is `decision-record`. The error text names the bad value.
- `parseHeadings` takes the template:
  - Its allowed properties come from the kind: `slug`, `importance`, `weight`, `option`, `score`, `by`, `confidence` and `basis`, each where it applies.
  - Evidence (`[ref]`) is allowed on reasons.
  - A record can't go deeper than five heading levels.
- A new `recordNode(text, attrs, depth, i, err)` validates the record kinds, the way `headingNode` does for maps.
- Option-title consistency is checked after the walk.
- `serialize` writes records with these same keys.
- `recordModel` follows the formulas in the spec's maths section.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: parse, save and score decision records"
```

### Task 2: Undo and redo

**Files:**
- Modify: `index.html` (`edit`, the constructor state, the header template, `componentDidMount` for keys, `loadA`, `createMap`)
- Test: `check.js`

**Interfaces:**
- Consumes: `edit(fn)`.
- Produces:
  - `edit(fn, step = null)`: an edit with the same non-null `step` as the previous edit doesn't add a history entry.
  - `state.history = { past: [{ map, whatIf }], future: [], step }`, capped at 200 entries.
  - `undo()` and `redo()`, plus `endStep()`, which sets `history.step` to null.
  - A drag passes `step: 'drag:' + pointerId + ':' + startTime`, and pointer-up calls `endStep()`. A text field passes `step: 'field:' + name + ':' + slug` and calls `endStep()` on blur.
  - `setWhatIf(overlay, step)` (Task 6) goes through the same history.
  - Opening or creating a file resets the history.
  - Bindings: `undoBtn = { disabled, run }` and `redoBtn = { disabled, run }`.

- [ ] **Step 1: Write the failing tests**

```js
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
  c.onGlobalKey({ key: 'z', metaKey: true, shiftKey: false, target: { matches: () => true }, preventDefault() {} });
  assert.deepEqual(imps(c), dragged); // the target was a text field
  c.onGlobalKey({ key: 'z', metaKey: true, shiftKey: false, target: { matches: () => false }, preventDefault() {} });
  assert.deepEqual(imps(c), [10, 30, 60]);
});
```

`pn.onTextBlur` is new. If the title field's change handler has a different name, use the existing name and add the blur handler beside it.

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: the 4 new tests FAIL (`undo`, `onGlobalKey` and `undoBtn` don't exist yet).

- [ ] **Step 3: Implement**

- History lives in state, and is updated inside `edit`'s `setState` updater so it stays pure.
- `onGlobalKey` handles ⌘Z/Ctrl+Z and ⌘⇧Z/Ctrl+Shift+Z. It's registered on `window` in `componentDidMount`. It ignores events whose target matches `input, textarea, [contenteditable]`.
- Two header buttons (↶ and ↷) sit beside the ⋯ menu, with titles "Undo (⌘Z)" and "Redo (⌘⇧Z)".
- Each drag start sets its step, and each pointer-up and blur calls `endStep()`. That covers the bar divider, column impact drag, pie edges, sliders and text fields.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: undo and redo for every edit"
```

### Task 3: Creating a record and its views

**Files:**
- Modify: `index.html` (the New card, `createMap`, `VIEWS`, `tabs`, `syncQuery`, the template's view blocks, the `renderVals` return)
- Test: `check.js`

**Interfaces:**
- Consumes: `Component.newRecord` (Task 1).
- Produces:
  - `state.newKind`: `'map' | 'record'`, set on the New card by two buttons, "Decision map" and "Decision record". Options on the card show only for maps.
  - `createMap()` builds a record with `newRecord` when `newKind === 'record'` and opens `view: 'overall'`.
  - `VIEWS` gains `'overall'`, `'goals'` and `'compare'`.
  - For a record, `tabs` are Overall, Goals, Source and Compare. For a map they stay as they are.
  - A record forced into a map view, or a map forced into a record view (by `?view=` or by opening a file), falls back to Overall or Bar.
  - `state.goal` holds the open goal's slug, or null for the goal list. `?goal=` is kept in the URL the way `?focus=` is.
  - Bindings: `isRecord`, `isOverall`, `isGoals`, `isGoal`, `isCompare`. These start as empty template blocks with a heading each.

- [ ] **Step 1: Write the failing tests**

```js
test('New can create a decision record, which opens on Overall', () => {
  const c = boot(MAP3);
  const nm = () => c.renderVals().nm;
  nm().pickRecord();
  nm().onTitle({ target: { value: 'Pick a store' } });
  nm().create();
  assert.equal(c.state.map.template, 'record');
  assert.equal(c.state.view, 'overall');
  assert.deepEqual(c.renderVals().tabs.map((t) => t.label), ['Overall', 'Goals', 'Markdown source', 'Compare']);
});
test('every record view renders with no unresolved bindings, and maps keep their views', () => {
  for (const view of ['overall', 'goals', 'source', 'compare']) {
    const c = boot(REC);
    c.setState({ view });
    assert.deepEqual(unresolved(c.renderVals()), [], view);
  }
  const c = boot(REC);
  c.setState({ view: 'goals', goal: 'reliability' });
  assert.deepEqual(unresolved(c.renderVals()), [], 'goal');
  const m = boot(MAP3);
  m.setState({ view: 'overall' });
  assert.equal(m.renderVals().isMap, true);
});
```

`nm.pickRecord`, `nm.onTitle` and `nm.create` are new or existing bindings on the New card. Match the existing names and add `pickRecord`/`pickMap`.

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: the 2 new tests FAIL.

- [ ] **Step 3: Implement**

`effectiveView` is computed once in `renderVals` from `s.view` and `map.template`, and every `is*` binding uses it.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass, including the existing "every view renders" test.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: create decision records and give them their own views"
```

### Task 4: Goals and goal views: weights, scores and options

**Files:**
- Modify: `index.html`
- Test: `check.js`

**Interfaces:**
- Consumes:
  - `recordModel` (Task 1), `edit(fn, step)`/`endStep` (Task 2), `isGoals`/`isGoal`/`state.goal` (Task 3).
  - `tradePlan`, `resizeImportance`, `startDivider`/`moveDivider`/`endDivider`, `startPieEdge`/`movePieEdge`/`endPieEdge`, `onDividerKey`, `toggleChosen`, `setImportances`.
- Produces:
  - `Component.weightRows(nodes, overlay)` returns rows shaped like `factRows`: `{ node, importance, share, impact: 0, calculated: false }`, in file order (not sorted). The divider and pie handlers take these unchanged. Rows with weight 0 are left out.
  - Binding `wt(rows, key)`: one weight editor's bindings for either bar or pie (`s.recordChart`: `'bar' | 'pie'`, shared by every editor). It covers segments or slices (label, %, `isChosen`, `isSelected`, `pick`, Ctrl/⌘/Shift-down to choose, **L**), dividers or handles with drag and arrow keys, `chosenCount`, and `clear`. The template renders it with one shared block, which every editor in Tasks 4 and 6 reuses.
  - Goals view: a goal-importance editor, plus cards (`goalCards`) with title, %, winner chip, counts and an open action, plus "Add a goal".
  - Goal view:
    - title and description edited in place
    - a criteria editor, with add and remove criterion
    - `grid`: rows are options (sorted by goal score), columns are criteria, cells are `{ n, reasons, pressed, pick }`, plus the goal score and a winner chip
    - "Add an existing option" (record options not yet in this goal) and "New option" (title → `slugify` against the record's options)
    - remove an option from the goal
  - Score panel for the selected cell (`state.cell = { option, criterion }`): a 0–10 slider using `setScore(goal, criterion, option, n, step)`. A score that doesn't exist yet is created when first set. Adding an option creates score nodes of 0 under every criterion of the goal.
  - New goal: importance = the average of the goals that are on (1 if none), with one criterion. New criterion: weight = the average of its siblings (1 if none).

- [ ] **Step 1: Write the failing tests**

```js
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
  c.setState({ goal: 'reliability' });
  c.setScore('reliability', 'ops', 'dynamodb', 7);
  assert.equal(Component.recordModel(c.state.map).goals[0].scores.dynamodb.ops, 7);
  assert.deepEqual(Component.parse(c.state.src).errors, []);
});
test('adding an existing option to a goal, and a new one', () => {
  const c = recBoot();
  c.setState({ goal: 'cost' });
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
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: the 5 new tests FAIL.

- [ ] **Step 3: Implement**

- Build `wt` on the existing handlers. `startDivider` currently finds `[data-chart]`, so give the record bar the same attribute.
- In the record pie, the slice ring is a single ring of the weight rows (`span` 1). The ⇔ handles are always visible, since there's no edit toggle in record views.
- Colours: goals use the `--g1`…`--g4` tokens and criteria use `--c1`…`--c5`. Add them to every theme in the same pattern as the existing tokens, with values from the prototype.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: goals and goal views with resizable weights, scores and options"
```

### Task 5: Reasons

**Files:**
- Modify: `index.html`
- Test: `check.js`

**Interfaces:**
- Consumes: the score panel and `state.cell` (Task 4). It also consumes the existing evidence, basis and confidence editing: the `pn` More section, `bc` and `ev`, which target `panelTarget()`.
- Produces:
  - In the score panel, `reasons` are listed largest weight first, each with text, weight %, by and refs count. A weight slider (0–100) changes only that reason's `importance`.
  - Add reason (`slugify` against every slug in the record) and remove reason (two-step, as delete is today). A new reason's weight is the average of its siblings, or 50 when it's the first.
  - `state.reason` (a slug) opens a reason's extras. `panelTarget()` returns it when set, so the existing basis, confidence, evidence and Research bindings edit it unchanged.

- [ ] **Step 1: Write the failing tests**

```js
test('reasons list by weight, and their weight never changes the score', () => {
  const c = recBoot();
  c.setState({ goal: 'reliability', cell: { option: 'postgres', criterion: 'durability' } });
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
  c.setState({ goal: 'reliability', cell: { option: 'postgres', criterion: 'durability' } });
  c.renderVals().goalView.panel.reasons[0].open();
  assert.equal(c.renderVals().bc.basis, 'We run 14 clusters');
  assert.equal(c.renderVals().ev.refs.length, 1); // use the existing evidence binding's name
  assert.deepEqual(Component.parse(c.state.src).errors, []);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: FAIL.

- [ ] **Step 3: Implement**

Reuse rather than copy: the reason editor is the existing More panel, shown inside the score panel.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: reasons with weight and evidence on each score"
```

### Task 6: Overall view and what-if weights

**Files:**
- Modify: `index.html`
- Test: `check.js`

**Interfaces:**
- Consumes: `recordModel(map, overlay)`, `wt` (Task 4), and the history (Task 2).
- Produces:
  - `state.whatIf`: `null | { [slug]: weight }`, plus `state.offWeights: { [goalSlug]: weight }`, which remembers what to restore within a session.
  - While `whatIf` is set:
    - every record view reads weights through it
    - every goal or criterion weight drag in any view edits it through `setWhatIf(next, step)`, which is undoable
    - a bar shows "What-if weights" with **Save as the record's weights** and **Reset**
  - Everything else edits the record. `recordModel` ignores overlay slugs the record no longer has, so items removed in Source drop out of the overlay and new ones use their record weight.
  - Overall view:
    - `ranking` rows: position, title, stacked parts per goal (colour and width out of 10), total, win chips, and "Wins no single goal" on a top option that wins none
    - goal list rows: checkbox `on` (off → 0, and its weight is remembered; on → the remembered weight, else the average of the goals that are on, else 1) and a name button that selects the goal (`state.goal`)
    - the goal-importance editor, plus the criteria editor of the selected goal
  - Save writes the overlay into the record in one undoable step, with turned-off goals saved as `importance: 0`, and clears `whatIf`. Reset clears it, also undoably.
  - Opening another file with `whatIf` set asks first, with a confirm built into the page (`state.confirmDrop`).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: FAIL.

- [ ] **Step 3: Implement**

`whatIf` is part of each history entry (Task 2's `{ map, whatIf }`), so undo restores it.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: overall ranking with what-if goal and criteria weights"
```

### Task 7: Snapshots

**Files:**
- Modify: `index.html` (next to `recentStore`, the Overall view, and the constructor/`componentDidMount` to load the list)
- Test: `check.js`

**Interfaces:**
- Consumes: `recentStore(mode, fn)` (the `arg-map` DB, `kv` store), `whatIf` and `recordModel` (Tasks 1 and 6).
- Produces:
  - Pure helpers:
    - `Component.snapshotAdd(list, { name, file, root, title, at, src })`, which returns a new list with `id` set to `'snap-' + at`
    - `snapshotRename(list, id, name)` and `snapshotRemove(list, id)`
    - `snapshotsFor(list, rootSlug)`
  - A snapshot stores `src`: the record serialized with the what-if weights applied, so it's a whole record.
  - Persistence: `loadSnapshots()` and `storeSnapshots(list)`. They wrap `recentStore` with key `'snapshots'` and return promises. `storeSnapshots` failing sets `state.snapNotice` to "Snapshots can't be kept in this browser (…)" and keeps the list in memory for the session.
  - `state.snapshots` is loaded in `componentDidMount`.
  - Overall view: a name field and **Save snapshot**, plus the list for this record's root slug. Each entry has its name, the time and source file name, and load, rename and delete, with delete in two steps. Load sets `whatIf` from the snapshot's weights through `recordModel`'s slugs, ignoring unknown ones.

- [ ] **Step 1: Write the failing tests**

```js
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
});
test('when the browser refuses storage, snapshots say so and nothing throws', async () => {
  const c = boot(REC);
  c.setState({ view: 'overall' });
  overallOf(c).snap.onName({ target: { value: 'X' } });
  await overallOf(c).snap.save(); // indexedDB is undefined in check.js
  assert.match(c.renderVals().overall.snap.notice, /can’t be kept in this browser/);
  assert.equal(c.state.snapshots.length, 1);
});
```

The `test` helper must await async functions. Change `test` to collect promises and await them before printing the totals.

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: FAIL.

- [ ] **Step 3: Implement**

`recentStore` already rejects when `indexedDB` is missing. Catch the rejection and set the notice.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: named snapshots of a record, kept in the browser"
```

### Task 8: Compare

**Files:**
- Modify: `index.html` (the record Compare block, `loadB` for records, the record `tabs`)
- Test: `check.js`

**Interfaces:**
- Consumes: `recordModel`, `state.mapB` (from the existing `loadB`/Open-as-B flow), `state.snapshots` and `whatIf`.
- Produces:
  - Sources are:
    - `'a'`, the open file
    - `'a-whatif'`, offered only while `whatIf` is set, labelled "Open file (what-if)"
    - `'b'`, the second file, offered only when `mapB` is a record
    - each snapshot id, parsed from its `src`
  - `state.cmpA` and `state.cmpB` default to `'a'` and `'b'`, or `'a'` and the newest snapshot when there's no B.
  - `Component.compareRows(modelA, modelB, tier, goalSlug)` returns `[{ id, label, sub, a, b, max, gap }]`, sorted by gap, biggest first. Tiers are `goals` (% of importance), `criteria` (% within the goal) and `scores` (0–10, one row per option × criterion of the goal). Items only one side has are 0 on the other.
  - `Component.topDifferences(modelA, modelB)` returns the four largest `gap / max` across all tiers that are above 0.
  - Bindings:
    - `compare.style`: `'side' | 'composite'`
    - side by side: paired bars, with a marker when `gap / max >= 0.15`, and a click on a score row shows both sides' reasons
    - composite: goals and criteria get one stacked bar per side, and scores get per-option stacked bars of what each criterion adds, out of 10
  - If B is a map rather than a record, show "This file is a decision map. Open another decision record to compare." in place of the comparison.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: FAIL.

- [ ] **Step 3: Implement**

Opening B reuses the Diff view's Open-as-B panel (`openTarget: 'B'`).

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html check.js
git commit -m "feat: compare two decision records or snapshots, side by side or composite"
```

### Task 9: Docs and example

**Files:**
- Create: `examples/event-store/record.md`, using the prototype's example as "You", saved as a valid record.
- Modify: `README.md`, which gets a "Decision records" section covering the format, the maths, the views, what-if, snapshots, Compare and undo/redo.
- Test: `check.js`

- [ ] **Step 1: Write the failing test**

```js
test('the example record parses and round-trips', () => {
  const src = fs.readFileSync('examples/event-store/record.md', 'utf8');
  assert.deepEqual(Component.parse(src).errors, []);
  assert.equal(Component.serialize(Component.parse(src).map), src);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `make check`
Expected: FAIL (the file doesn't exist).

- [ ] **Step 3: Write the example and the README section**

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add examples/event-store/record.md README.md check.js
git commit -m "docs: decision records in the README, with an example"
```
