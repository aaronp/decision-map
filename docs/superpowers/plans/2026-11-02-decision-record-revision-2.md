# Decision Record Revision 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the record's Overall/Goals views with one drill-down path (Overview › All goals › goal › option › criterion), and make every resize, in maps and records, keep the border under the pointer.

**Architecture:**
- **Resizing:** one pure helper, `Component.borderResize`, replaces `tradePlan` and `resizeImportance` at every call site (map bar, map pie, record bars, keyboard).
- **Record views:** a single `record` view with a `recLevel` state. Breadcrumb bindings sit above it, and each level is a template block fed by its own `renderVals` binding.
- **Reuse:** the levels reuse the existing weight editor (`wt`), the reason panel and the More markup.

**Tech Stack:** plain `index.html`, vendored React, the dc-runtime template, and `check.js` run with bun through `make check`.

**Spec:** `docs/superpowers/specs/2026-11-02-decision-record-design.md`. The section "Revision 2: views you drill into, and resizing that follows the pointer" is binding where it differs from the rest. Prototype: `docs/superpowers/specs/2026-11-02-decision-record-prototype.html`. Its `resizeWeights` doesn't follow the spec's rule for chosen columns on both sides, so follow the spec.

## Global Constraints

- No build step and no new dependencies. Don't edit `support.js`.
- Existing map and record files open and save unchanged. The only new key is `summary:` on score headings.
- **Resize rule, from the spec, verbatim:** "each side of the border changes its chosen columns if it has any, otherwise the column next to the border. The left side grows by exactly what the right side shrinks, so the border always stays under the pointer."
- "A drag stops when any column that's changing would go below a 2% share. A record weight never reaches 0."
- In a pie, "left" means counter-clockwise.
- If the UI conflicts, read-only wins.
- Every view and level renders with no unresolved bindings (`unresolved(c.renderVals())`).
- Confirm the behaviour in a real browser (`make dev`) before calling the work done.

## Review Focus

1. **Chosen columns on both sides of the border.** The left chosen columns grow by exactly what the right chosen columns shrink, and the unchosen neighbours keep their weights. Pinned in Task 1.
2. **The 2% floor with several chosen columns.** No changing column goes below 2%, and the drag stops rather than changing a column that isn't involved. Pinned in Task 1.
3. **A stale level.** If the open goal, option or criterion is deleted (undo, Source, removal), the level falls back to the nearest level that still exists, never to a broken view. Pinned in Task 3.
4. **Old URLs.** `?view=overall` and `?view=goals` still open a record, on Overview and All goals. Pinned in Task 3.
5. **A summary with braces or line breaks.** Braces get the existing notice, and a line break becomes a space, so the file still parses. Pinned in Task 2.

---

### Task 1: The border-follows-pointer resize rule

**Files:**
- Modify: `index.html`: replace `tradePlan`/`resizeImportance`, and update `dividerPlan`, `startDivider`, `moveDivider`, `startPieEdge`, `movePieEdge` and `onDividerKey`.
- Modify: `README.md`, the "Choose the columns a resize changes" bullet.
- Test: `check.js`.

**Interfaces:**
- Produces `Component.borderResize(raws, i, move, chosen) → number[]`:
  - `i` is the index of the column left of the border.
  - `move` is the border's travel as a fraction of the total, positive to the right or clockwise.
  - `chosen` is the indices of chosen columns among `raws`.
  - Left members are `chosen ≤ i`, or `[i]` if there are none. Right members are `chosen > i`, or `[i+1]` if there are none.
  - With `d = move × total`, the left members gain `d` and the right members lose `d`, each split in proportion to their raws. If every member's raw is 0, split it evenly.
  - `d` is clamped so that no member drops below a 2% share.
- The handlers keep their names. `side` and `plan` are dropped, and the drag state stores `i` and the chosen indices instead.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: the new tests FAIL, because `borderResize` doesn't exist.

- [ ] **Step 3: Implement `borderResize` and switch every call site to it**

- Delete `tradePlan` and `resizeImportance`, and their direct tests in `check.js` at lines ~155–175, ~389 and ~1372.
- Rewrite the existing resize tests to the values the new rule gives, and record each rewrite in the ledger. The tests are:
  - "scale drag changes only the resized fact…"
  - "chosen columns absorb…"
  - "with only the left column chosen…"
  - "a divider between unchosen columns…"
  - "with nothing chosen, a drag changes only the resized fact"
  - "keyboard on a divider…"
  - "a move handle resizes the hovered slice…"
  - "dragging a slice edge takes from the chosen slices only"
  - "with nothing chosen, a slice edge…"
  - "a deeper ring gets move handles…"
  - "dragging a deeper handle follows the pointer…"
  - "dragging the goal divider…"
  - "review: record weights start at 50…"
- In `README.md`, replace "With nothing chosen, you can drag as far as you like and the rest scale to fit." with "With nothing chosen, the two columns either side of the border trade, so the border follows the pointer."

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

`git commit -m "feat: every resize keeps the border under the pointer"`

### Task 2: Score summaries in the format

**Files:**
- Modify: `index.html` (`recordNode`, `serialize`, `recordModel`)
- Test: `check.js`

**Interfaces:**
- Produces:
  - A score node's `summary: string | null`, read from `summary: …` under a score heading and written right after `score:`.
  - `recordModel(...).goals[].summaries`, of the form `{ [opt]: { [crit]: string } }`.
  - `setSummary(critSlug, option, text)`. It creates the score node at 0 if it's missing, uses step `field:summary:<crit>--<option>`, rejects braces with `SLUG_BLOCK_NOTICE`-style text, and turns line breaks into spaces.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

`git commit -m "feat: an optional one-line reason on each score"`

### Task 3: The Record view, levels and breadcrumbs

**Files:**
- Modify: `index.html`: `RECORD_VIEWS`, the record `tabs`, `syncQuery`, the constructor state and the record bindings.
- Test: `check.js`

**Interfaces:**
- Produces:
  - `RECORD_VIEWS = ['record', 'source', 'compare']`. `?view=overall` and `?view=record` map to `record` with `recLevel: 'overview'`. `?view=goals` maps to `record` with `recLevel: 'goals'`. The tabs are Record, Markdown source and Compare.
  - State:
    - `recLevel`: `'overview' | 'goals' | 'criteria' | 'options' | 'reasons'`
    - `recGoal`, `recOption`, `recCrit`: slugs or null
    - `selGoal`, `selCrit`: the column whose details show
    - `optMode`: `'edit' | 'compare'`
  - These replace `goal`, `cell` and `overallGoal`. `overallGoal` stays as Overview's own selected goal.
  - `recNav(patch)` sets these and resets `reason` and `PANEL_RESET`.
  - The effective level falls back to the deepest level whose slugs exist: reasons needs goal, option and criterion; options needs goal and an option in it; criteria needs goal.
  - Bindings:
    - `crumbs`: `[{ tier, name, current: bool, ahead: bool, go }]`, with the full trail and the levels below the current one marked `ahead`
    - `isRecLevel`: `{ overview, goals, criteria, options, reasons }`
    - The existing `overall` binding feeds `isRecLevel.overview`.

- [ ] **Step 1: Write the failing tests**

```js
const rec2 = (patch = {}) => { const c = boot(REC); c.setState({ view: 'record', ...patch }); return c; };
test('the Record view opens on Overview with one crumb, and old view names still work', () => {
  const c = rec2();
  assert.equal(c.renderVals().isRecLevel.overview, true);
  assert.deepEqual(c.renderVals().crumbs.filter((x) => !x.ahead).map((x) => x.name), ['Overview']);
  const g = rec2({ view: 'goals' });
  assert.equal(g.renderVals().isRecLevel.goals, true);
  assert.deepEqual(c.renderVals().tabs.map((t) => t.label), ['Record', 'Markdown source', 'Compare']);
});
test('crumbs list the path, and a click goes back up while deeper crumbs stay, faded', () => {
  const c = rec2();
  c.recNav({ recLevel: 'reasons', recGoal: 'reliability', recOption: 'postgres', recCrit: 'durability' });
  const cr = () => c.renderVals().crumbs;
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Add a crumb bar under the header, inside an `sc-if` that's on for records outside Source and Compare. Each crumb shows a tier label over its name, with `aria-current` on the current one. Crumbs marked `ahead` have opacity 0.5.
- Give each level an empty block for now (Tasks 4 and 5 fill them).
- Update or remove the tests for the old `goalsView`/`goalView`/`isGoal`/`isGoals` bindings as they're replaced, and record each in the ledger.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

`git commit -m "feat: a Record view with breadcrumbs from the overview down to reasons"`

### Task 4: All goals and a goal's criteria

**Files:**
- Modify: `index.html` (`wt`, the bar markup and the level blocks)
- Test: `check.js`

**Interfaces:**
- Consumes: `wt(title, nodes, fillOf, selected, onSelect)`, `addGoal`, `addCriterion`, `setNodeText`, `addOptionToGoal`, `addNewOption` and `recordModel`.
- Produces:
  - `wt` gains `addLabel` and `add` (an optional **+** column) and `height` (in px).
  - Bar segments render the map's way: a title chip at the top, a % chip at the bottom, the goal colour or criterion fill, and the existing dividers and choosing. The pie keeps today's look.
  - `goalsLevel`:
    - `weights`: `wt` with `add: addGoal` and height 150
    - `detail`: the selected goal's title, description, `onTitle`, `onDesc`, `onBlur`, winner text, counts, and `open` (→ criteria)
  - `criteriaLevel`:
    - `weights`: `wt` of the goal's criteria with `add: addCriterion` and height 120
    - `detail`: the selected criterion's title and description (the description is `details`)
    - `options`: `[{ title, score, width, isWinner, open }]`, sorted by goal score
    - `compareAll`: switches to options in compare mode
    - `existing` and `newOption` controls, as `goalView` has today

- [ ] **Step 1: Write the failing tests**

```js
test('All goals: a short bar with a "+" column; clicking a goal shows its details', () => {
  const c = rec2({ recLevel: 'goals' });
  const gl = () => c.renderVals().goalsLevel;
  assert.equal(gl().weights.hasAdd, true);
  gl().weights.segments[1].pick();
  assert.equal(gl().detail.title, 'Cost');
  gl().detail.onDesc({ target: { value: 'Money and people' } });
  assert.equal(nodeOf(c, 'cost').details, 'Money and people');
  gl().weights.add();
  assert.equal(Component.recordModel(c.state.map).goals.length, 3);
  gl().detail.open();
  assert.equal(c.renderVals().isRecLevel.criteria, true);
});
test('a goal\'s criteria: bar with "+", criterion details, and options by goal score', () => {
  const c = rec2();
  c.recNav({ recLevel: 'criteria', recGoal: 'reliability' });
  const cl = () => c.renderVals().criteriaLevel;
  cl().weights.segments[1].pick();
  cl().detail.onDesc({ target: { value: 'How hard it is to run' } });
  assert.equal(nodeOf(c, 'ops').details, 'How hard it is to run');
  assert.deepEqual(cl().options.map((o) => [o.title, o.isWinner]), [['Postgres', true], ['DynamoDB', false]]);
  cl().options[1].open();
  assert.equal(c.state.recOption, 'dynamodb');
  assert.equal(c.renderVals().isRecLevel.options, true);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass. Unresolved-binding checks pass at both levels in bar and pie.

- [ ] **Step 5: Commit**

`git commit -m "feat: goals and criteria as short resizable bars with details"`

### Task 5: Options (edit one or compare all) and reasons

**Files:**
- Modify: `index.html`
- Test: `check.js`

**Interfaces:**
- Consumes: `setScore`, `setSummary` (Task 2), `removeOptionFromGoal`, the reason panel bindings (`reasons`, `addReason`, `setReasonWeight`, open reason → the More copy), and `recNav`.
- Produces:
  - `optionsLevel`:
    - `isEdit` and `isCompare`, plus `modes` (Edit one / Compare all)
    - `picks`: option chips with the goal score
    - `rows`: one per criterion, `{ title, pct, score, onScore, onBlur, summary, onSummary, reasonsLabel, openReasons }`
    - `remove`
    - `grid`: today's grid, with each cell showing its summary's first 16 characters. A cell's `pick` switches to edit for that option.
  - `reasonsLevel`: the score slider, the summary, and the reasons list. These are the existing score-panel bindings, moved here.

- [ ] **Step 1: Write the failing tests**

```js
test('editing one option: a slider and a short reason per criterion, and Reasons opens the next level', () => {
  const c = rec2();
  c.recNav({ recLevel: 'options', recGoal: 'reliability', recOption: 'postgres', optMode: 'edit' });
  const ol = () => c.renderVals().optionsLevel;
  assert.deepEqual(ol().rows.map((r) => [r.title, r.score]), [['Durability', 8], ['Ops', 6]]);
  ol().rows[1].onScore({ target: { value: '9' } });
  ol().rows[1].onSummary({ target: { value: 'Well understood' } });
  assert.equal(Component.recordModel(c.state.map).goals[0].scores.postgres.ops, 9);
  assert.equal(Component.recordModel(c.state.map).goals[0].summaries.postgres.ops, 'Well understood');
  ol().rows[0].openReasons();
  assert.equal(c.renderVals().isRecLevel.reasons, true);
  assert.deepEqual(c.renderVals().reasonsLevel.reasons.map((r) => r.text), ['Runbooks exist']);
});
test('compare all: the grid, and a cell edits that option', () => {
  const c = rec2();
  c.recNav({ recLevel: 'options', recGoal: 'reliability', recOption: 'postgres', optMode: 'compare' });
  const g = c.renderVals().optionsLevel.grid;
  assert.deepEqual(g.rows.map((r) => r.option), ['postgres', 'dynamodb']);
  g.rows[1].cells[0].pick();
  assert.equal(c.state.optMode, 'edit');
  assert.equal(c.state.recOption, 'dynamodb');
  assert.deepEqual(unresolved(c.renderVals()), []);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make check`
Expected: FAIL.

- [ ] **Step 3: Implement, then delete what's no longer used**

- Delete the old `goalsView`/`goalView` bindings, their template blocks and `recPanels`. Overview keeps its two panels in its own block.
- Move the copy of the More markup under the reasons level.
- Update the Task 5 (reasons) and review tests from the first build that used `goalView.panel` to use `reasonsLevel`. Record each in the ledger.

- [ ] **Step 4: Run tests**

Run: `make check`
Expected: all pass.

- [ ] **Step 5: Commit**

`git commit -m "feat: edit one option or compare all, with reasons a level below"`

### Task 6: README

**Files:**
- Modify: `README.md`, the Decision records section.

- [ ] **Step 1:** Rewrite the "The views" list to cover Record (breadcrumbs, then Overview, All goals, a goal's criteria, an option with Edit one / Compare all, and reasons), Source and Compare. Add `summary:` to the format sketch and its notes.
- [ ] **Step 2:** Run `make check`. Expected: all pass. The example record still round-trips.
- [ ] **Step 3:** `git commit -m "docs: the decision record's drill-down views"`
