# Generic Tree Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `index.html` with the `design/Main.dc.html` prototype, then add round-trip files, undo, themes and colour modes, share links, IndexedDB saved maps, real lazy refs, and the Questionnaire, Pie and Compare views moved over from the old app.

**Architecture:** The app stays one DC component in `index.html`: an `<x-dc>` template plus a `<script data-dc-script>` that holds pure top-level functions and `class Component extends DCLogic`. The prototype's flat node array `{ id, parent, title, x, y, tags, note, refs }` is the only model. The old app's slug-keyed tree code is used only as reference while moving views over (read it with `git show HEAD:index.html`). It is not kept.

**Tech Stack:** DC runtime (`support.js` taken from `design/`, plus `vendor/react*.js`). Browser built-ins: `CompressionStream`, `DecompressionStream`, IndexedDB, `fetch`. Logic checks run in bun (`make check`), with no browser.

**Spec:** `docs/superpowers/specs/2026-11-21-generic-tree-design.md`

## Global Constraints

- One file: `index.html`. No build step, and no new dependencies.
- The node model is title, note, x, y, tags and refs. Nothing else.
- x and y are each a value from 0 to 1, or `null`.
- Defaults for a new map:
  - x = `Importance`, y = `Support`
  - colour dimension = `y`, colour mode = `scale`, reverse = `false`
  - theme = `paper`
  - one tag style: `evidence`
- Left/right default colours: left `#C0392B` (red), right `#1E8449` (green). Neutral at 0.5 is `#DADAD3`.
- Themes are `paper`, `slate`, `night` and `contrast`, with the values from the old `THEMES` table. There are no accents.
- Refs load **only** when the user clicks to expand one. Nothing else may call `loadRef`.
- Share links have the form `#m=` + base64url(deflate-raw(markdown)). Show a warning above 8000 characters.
- Saved maps: IndexedDB database `tree-maps`, store `maps`, keyPath `name`, records `{ name, text, updated }`. Autosave runs 1500 ms after the last change.
- URL parameters: `#m=`, `?src=`, `?theirs=`, `?view=`, `?theme=`. `?focus=` is dropped.
- Removed for good: decision records, slugs, by/basis/confidence/evidence fields, premises, the old formats, the AI helpers, accents, the Markdown source view, and the `/typesafe` proxy.
- Style: the prototype's `#2A4BD7`, Inter and JetBrains Mono fonts, and pill buttons. Colours go through CSS variables once Task 4 is done.

## Review Focus

1. **Titles that look like syntax**, such as `Issue #12` or `Budget {draft}`, must come back unchanged after a save and reopen, not become tags or values. Tested in Task 2.
2. **Description lines that look like structure**, such as `- not a child`, `@ https://x` or `# not a root`, must stay description text after a round trip. Tested in Task 2.
3. **Share links with non-ASCII text** (emoji, accents, CJK) must decode to the same text. Tested in Task 5.
4. **A ref that points back to an ancestor's source**, or to its own map, shows an error and never fetches. Tested in Task 7.
5. **A parse error in a loaded file, share link or ref** shows the line-numbered `MapParseError` message, and the current map stays as it was. Tested in Tasks 5, 6 and 7.

---

### Task 1: The prototype becomes the app

**Files:**
- Replace: `index.html` with the contents of `design/Main.dc.html`
- Replace: `support.js` with `design/support.js`, and `vendor/*` with `design/vendor/*`
- Replace: `check.js` with a new harness
- Delete: `check-fixtures/`
- Modify: `dev.js` to drop the `/typesafe` proxy
- Modify: `Makefile` echo lines to `?src=examples/votes-at-16/map.md`

**Interfaces:**
- Produces: the `check.js` harness, with `test(name, fn)`, `boot(text?) -> Component`, and `unresolved(vals) -> string[]`. The last two follow the old `check.js` lines 156–206: the same template walk, and `boot` sets `window.TREE_START = { text }` before constructing.
- Produces: `newMapText() -> string`, the default map as markdown (see Global Constraints), which replaces `SEED*`. The prototype's demo `SEED`, `SEED_TAGS`, `SEED_NOTES` and `SEED_REFS` are deleted.

- [ ] **Step 1:** Copy the files over and delete `check-fixtures/`. Remove the proxy branch in `dev.js` so it only serves files.
- [ ] **Step 2:** Write `check.js` with the harness, plus the test `every layout renders with no unresolved bindings`. It loops over `['radial','tree','directory']`, does `c.setState({ layout })`, and asserts `unresolved(c.renderVals())` is `[]`.
- [ ] **Step 3:** Run `make check`. Expected: FAIL, because `boot` can't start from `TREE_START` yet.
- [ ] **Step 4:** In the constructor, read `window.TREE_START?.text ?? newMapText()` through `parseMap` into `state.nodes`, with `currentId` set to the root id.
- [ ] **Step 5:** Run `make check`. Expected: PASS. Open `make dev` and check that the radial, tree and directory views draw the default map.
- [ ] **Step 6:** Commit with `feat: the design prototype becomes the app`.

### Task 2: Front matter and the serializer

**Files:**
- Modify: `index.html` (`parseMap`, `parseTitle`, new `serializeMap` and `parseFrontMatter`)
- Test: `check.js`

**Interfaces:**
- Produces: `parseMap(text) -> { meta, root, nodes }`. Here `nodes` includes the root as `nodes[0]`, and `meta` is
  `{ dims:{x,y}, colorDim:'x'|'y', colorMode:'scale'|'split', colorLeft, colorRight, reverse:boolean, theme, tagStyles:{[name]:{fill,border,borderStyle,opacity}} }`.
  Tags used on nodes with no style get `NEW_TAG_STYLE`.
- Produces: `DEFAULT_META` and `serializeMap({ meta, nodes }) -> string`.
- Produces: `metaOf(state) -> meta`, and `applyMeta(meta) -> state patch`. The state keeps the prototype's top-level keys (`dims`, `colorDim`, `tagStyles`) and adds `colorMode`, `colorLeft`, `colorRight`, `reverse` and `theme`.

Front matter is one `key: value` per line. The keys are `x`, `y`, `color`, `colorMode`, `colorLeft`, `colorRight`, `reverse` and `theme`, plus `tag.<name>: fill <#hex|none>; border <#hex|none> <solid|dashed|dotted>; opacity <0–1>`. An unknown key is an error, thrown as a `MapParseError` with its line number. The serializer always writes every key.

Escaping:
- In a title, `\#` and `\{` are literal. The serializer escapes a `#` that follows whitespace, and any `{`.
- A description line that starts with `- `, `@ `, `# ` or `\` is written with a leading `\`, which the parser removes.
- Description lines are joined with `\n`, not spaces. Blank lines inside a description are not kept. That's my call, because the format has no blank-line marker.
- Numbers are written as `String(Math.round(v * 1000) / 1000)`.

- [ ] **Step 1:** Write these tests:
  - `round trips a full map`: front matter with every key, nested nodes, tags, x only, y only, unset values, multi-line notes and refs. Assert `serializeMap(parseMap(t))` equals `t`, and `parseMap(serializeMap(m))` deep-equals `m`.
  - `titles that look like syntax survive`: `Issue #12`, `Budget {draft}` and `C# and F#` keep their titles and have `tags: []`.
  - `notes that look like structure survive`: description lines `- not a child`, `@ https://x.org/a.md`, `# not a root` and `\back` give `nodes.length === 2` and the note text exactly.
  - `unknown front matter key is a line-numbered error`: `---\nfoo: 1\n---\n# R` throws a message starting with `Line 2:`.
  - `defaults`: `parseMap(newMapText()).meta` deep-equals `DEFAULT_META`.
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement the escaping, `parseFrontMatter(lines) -> { meta, next }`, `serializeMap`, `metaOf` and `applyMeta`. Wire the Settings → Dimensions inputs and the tag editor so they edit state that `metaOf` reads.
- [ ] **Step 4:** Run `make check`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: maps round-trip through markdown with front matter`.

### Task 3: Undo and redo

**Files:** `index.html`, `check.js`

**Interfaces:**
- Produces: `edit(fn: (state) => patch, step?: string)`, `undo()` and `redo()`. History entries are `{ nodes, meta }`. Every change to the map or its meta goes through `edit`, and that includes `patchNode`, `addChild`, `remove`, the ref add/remove, tag changes and settings that are in meta. Consecutive calls with the same `step` key, such as one drag, merge into one entry, and `endStep()` closes it. Moving the old `edit`, `pushHistory`, `travel`, `endStep` and `onGlobalKey` code over is fine (old `index.html` lines 2788–2837).
- Produces: `state.dirty: boolean`. It's set by `edit` and cleared by load and save.

- [ ] **Step 1:** Write these tests:
  - `undo and redo cover nodes and meta`: rename a node, change `dims.x` and add a child, then undo three times back to the start and redo three times.
  - `a drag is one step`: three `patchNode` calls with `step:'drag'`, then `endStep()`, then a single `undo()` restores the start.
  - `⌘Z and ⌘⇧Z`: `onGlobalKey({ key:'z', metaKey:true, shiftKey:false, preventDefault(){} })` undoes.
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it, and add ↶ ↷ ghost buttons to the header.
- [ ] **Step 4:** Run `make check`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: undo and redo for every edit`.

### Task 4: Themes and the colour setting

**Files:** `index.html`, `check.js`

**Interfaces:**
- Produces: `colorFor(v: number|null, meta) -> '#rrggbb'`. It returns `#DADAD3` for `null`. In `scale` mode it uses the prototype's `ramp(v)`. In `split` mode it interpolates `colorLeft → #DADAD3 → colorRight` with 0.5 as the midpoint. `reverse` uses `1 - v`. Every view colours values through this one function.
- Produces: `THEMES`, copied from old `index.html:1595`. The prototype's hard-coded `#F7F7F4`, `#FFFFFF`, `#17181C`, `#E4E4DF`, `#5C5F66` and so on become `var(--bg)`, `var(--card)`, `var(--ink)`, `var(--rule)` and `var(--ink2)`, set on the root element from the active theme.
- `?theme=` overrides `meta.theme` for the page and isn't saved.

- [ ] **Step 1:** Write these tests:
  - `colorFor`: `scale` at 0 gives `#EEF2FD` and at 1 gives `#16307F`. `split` at 0 gives `#C0392B`, at 0.5 gives `#DADAD3` and at 1 gives `#1E8449`. `reverse` with `split` at 0 gives `#1E8449`. `null` gives `#DADAD3`.
  - `every theme renders`: for each theme id, `unresolved(renderVals())` is `[]`.
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it. Settings → Color & size gets a Scale / Left·right segment (`segs` helper), two colour inputs shown in left/right mode, and a Reverse toggle. Add a new Settings tab, **Theme**, with the four theme swatches. The legend draws the active mode.
- [ ] **Step 4:** Run `make check`. Expected: PASS. Use `make dev` to look at Night and High contrast.
- [ ] **Step 5:** Commit with `feat: themes and scale or left/right colour`.

### Task 5: Share links

**Files:** `index.html`, `check.js`

**Interfaces:**
- Produces: `encodeShare(text) -> Promise<string>` (base64url, no padding) and `decodeShare(payload) -> Promise<string>`.
- Produces: `sharePayload(url: string) -> string|null`, which returns what follows `#m=`, whatever the host.
- Produces: `shareLink() -> Promise<string>`, which is `location.origin + location.pathname + '#m=' + …`.
- Produces: `openText(text, name, { force }) -> boolean`. It is the one way in for every load:
  - On a parse error it sets `state.loadError` and leaves the map alone.
  - With `state.dirty` set and no `state.savedName`, it asks with `confirm('Discard changes?')` unless `force` is set.
  - It resets history.
- Startup: `#m=` in `location.hash` wins over `?src=`.

- [ ] **Step 1:** Write these tests:
  - `share round trip`: a map containing `Ünïcødé 🌳 日本語` gives back the same text, and the payload matches `/^[A-Za-z0-9_-]+$/`.
  - `sharePayload`: `https://a.org/x#m=abc` gives `abc`, `https://a.org/x.md` gives `null`.
  - `a broken share link keeps the current map`: `openText('# R\n      - bad', 'x', { force:true })` returns `false`, the nodes are unchanged and `loadError` starts with `Line 2:`.
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it. Add a **Share** header button that copies the link (`navigator.clipboard.writeText`) and shows "Link copied", or "Link copied, but it's N characters, and some apps cut long links short" when it's over 8000.
- [ ] **Step 4:** Run `make check`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: share a map as a link`.

### Task 6: Saved maps, Open…, Download

**Files:** `index.html`, `check.js`

**Interfaces:**
- Consumes: `openText` and `serializeMap`.
- Produces the IO edge, which isn't tested in bun:
  - `mapStore(mode, fn) -> Promise`, following the old `recentStore` at `index.html:1655`
  - `listSaved() -> Promise<{name,text,updated}[]>`, newest first
  - `putSaved(name, text)`
  - `deleteSaved(name)`
  - `renameSaved(from, to)`, which rejects if `to` already exists
- Produces `state.savedName: string|null`. When it's set, `edit` schedules `putSaved` 1500 ms later (`autosaveSoon`).
- Produces `nextName(base, taken: string[]) -> string`, which gives `base`, then `base 2`, `base 3` and so on.
- Startup with no `#m=` or `?src=` opens the newest saved map. If there isn't one, it opens `newMapText()`.

- [ ] **Step 1:** Write the test `nextName`: `nextName('Plan', ['Plan','Plan 2'])` is `'Plan 3'`. Also write `save marks clean`: after `edit` sets `dirty`, a stubbed `putSaved` resolving clears `dirty`. Stub with `c.store = { put: async () => {} }`, an instance seam the real code also uses.
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it:
  - **Save as…**: a name prompt, defaulting to the root title through `nextName`.
  - **Open…** panel:
    - the saved list, with rename and delete
    - a drop zone and a file chooser
    - a URL box that takes a `.md` URL or a share link
  - **Download** (`.md`, named after the root title)
  - **New**
  - `?src=` loading.
  - `?view=` picks the starting `layout`, and the address bar keeps `view` current through `history.replaceState`.
  - An asterisk after the name while `dirty`.
- [ ] **Step 4:** Run `make check`. Expected: PASS. In `make dev`, save, reload and check the map comes back. Rename, delete, drop a file, and paste a share link.
- [ ] **Step 5:** Commit with `feat: named maps saved in the browser`.

### Task 7: Real refs, loaded only on click

**Files:** `index.html`, `check.js`

**Interfaces:**
- Replaces `REF_LIBRARY` and `SAMPLE_REFS` with `fetchMapText(url) -> Promise<string>`. It decodes locally through `sharePayload`/`decodeShare` when there's a payload, and otherwise runs `fetch(url)` and throws on a non-OK response. It is an instance seam (`this.fetchMapText`) so tests can stub it.
- Produces `refCycle(graph, nodeId, url) -> boolean`. It's true when `url` equals the `source` of `nodeId` or of any of its ancestors in the composed graph. The open map's own `?src=` URL counts as the root's source.
- `loadRef(nodeId, url)` runs only from the expand control on a ref root and from the panel's Load/Retry button. When `refCycle` is true it sets the ref's status to error with "This map is already open above here" and doesn't fetch. A loaded ref's tag styles are kept in `refLoads[key].tagStyles` and never merged into `state.tagStyles`. This removes the merge at `design/Main.dc.html:1186`.

- [ ] **Step 1:** Write these tests:
  - `a ref loads only when asked`: boot a map with a ref and a stub `fetchMapText` that counts calls. Render every layout and run `fit()`, search and `serializeMap`, and check the count is 0. Then `loadRef` gives a count of 1, and the ref's nodes appear in `graph()`.
  - `a cycle never fetches`: map A refs `https://a.org/a.md`, and A was opened from that URL. Loading it leaves the count at 0 and the status `error`.
  - `a broken ref shows the line error`: the stub returns `'# R\n      - bad'`, and the status error starts with `Line 2:`.
  - `ref tag styles stay out of the file`: the ref uses tag `#theirs`, and after loading, `serializeMap` has no `tag.theirs`.
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `make check`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: refs load other maps, only when opened`.

### Task 8: Questionnaire, the bar and navigation

**Files:** `index.html`, `check.js`

Move over the old focus view: the template from old `index.html` lines 258–635 and the logic in `factRows`, `depthCells`, `textRows`, `healthLabel`, `renderVals`'s focus section and the chart modes. Change it to the new model:
- `slug` becomes `id`
- importance becomes the **size** value
- impact becomes the **colour** value, from 0 to 1
- `impactFill` becomes `colorFor`

Remove premises, by/basis/confidence/evidence, and the "More" fields that have gone.

**Interfaces:**
- Consumes: `colorFor`, `effective(nodes,id,key)` (prototype), `graph()` and `edit`.
- Produces: `layout: 'questionnaire'` as a View menu option, and `sizeOf(graph, id) -> number` (effective size value, or 0.5 when it's unset). It also produces `questionRows(graph, id, order?) -> {id, share, color, v}[]`, sorted by the colour value, low to high, with the shares summing to 1 and equal shares when everything is 0.
- Breadcrumbs, the title and description, the health bar (the node's effective colour value via `colorFor`), pin, and the chart modes *Width only* (120 px), *Wide and tall* and *Area is the score*. Clicking a column or a cell opens that node (`currentId`). Ref children show read-only, and collapsed ones show a Load control that calls `loadRef`.

- [ ] **Step 1:** Write tests, reworking the old ones in `git show HEAD:check.js` lines 234–340 to the new names:
  - `columns sorted by colour value with widths as shares`
  - `zero sizes give equal shares and no NaN`
  - `depth cells line up under their parent column`
  - `clicking a column opens it`
  - `questionnaire renders with no unresolved bindings`
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `make check`. Expected: PASS. Check it in `make dev`.
- [ ] **Step 5:** Commit with `feat: questionnaire view`.

### Task 9: Questionnaire editing

**Files:** `index.html`, `check.js`

Move over `borderResize`, `importanceForShare` (renamed `sizeForShare`), `startDivider`/`moveDivider`/`endDivider`, `startColumnDrag`/`moveColumnDrag`/`endColumnDrag`, keyboard handling, choosing (`toggleChosen`, `clearChosen`, Ctrl/⌘/Shift-click and **L**) and the + buttons. All writes go through `edit` with a `step` key per drag.

**Interfaces:**
- Produces: `addAt(parentId, colorValue: number|null)`. The left **+** calls it with 0.25 and the right with 0.75, and an empty node's single **+** passes `null`. The new child's size value is the mean of its siblings' size values, or `null` if there are none. It selects the new node and focuses its title.
- Produces: `recalculate(id)`, which sets the node's colour value to `effective` over its children (ignoring its own value), as one undo step.
- Ref nodes have no handles, no + and no drag.

- [ ] **Step 1:** Write tests, reworking the old ones at `git show HEAD:check.js` lines 241–455 and 498–523:
  - `a divider drag changes only the two columns either side`
  - `chosen columns take a resize`
  - `a vertical drag changes the colour value and re-sorts on release`
  - `colour value stays within 0–1`
  - `the + buttons add at 0.25 and 0.75`
  - `an empty node offers one +`
  - `Recalculate is one undo step`
  - `ref columns can't be dragged`
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `make check`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: questionnaire editing`.

### Task 10: Pie

**Files:** `index.html`, `check.js`

Move over `partition`, `arc`, `angleDelta`, `startPieEdge`/`movePieEdge`/`endPieEdge`, `pieEnter`/`pieLeave`, edit mode, pin, choosing slices and the + beside slices. Slice angle comes from `sizeOf`, and colour from `colorFor`. Uses `addAt` and `sizeForShare` from Task 9.

**Interfaces:** `layout: 'pie'`.

- [ ] **Step 1:** Write tests:
  - `rings by depth with angles as shares of size`
  - `an edge drag resizes against siblings`
  - `edit mode off hides the + and handles`
  - `ref slices are read-only`
  - `pie renders with no unresolved bindings`
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `make check`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: pie view`.

### Task 11: Compare

**Files:** `index.html`, `check.js`

Move over the old diff view (old template lines 1130–1400 and `diff`, `shares`, `sankeyLayout`) with its Sankey, Structure and Table tabs.

**Interfaces:**
- Produces: `titlePath(graph, id) -> string`, the trimmed, lower-cased titles from the root joined with `' / '`. When two siblings have the same path, a ` #2` suffix is added in file order.
- Produces: `compareMaps(a: graph, b: graph, meta) -> rows`. Each row is `{ path, a, b, dx, dy, changed, flipped, only:'a'|'b'|null }`, sorted by `max(|dx|,|dy|)` from biggest to smallest. `flipped` is computed only when `meta.colorMode === 'split'`. Sankey width is the size value and colour is `colorFor`.
- `state.mapB: { nodes, meta, name } | null`. B can come from Open… (file, URL, share link) or from the saved list. `?theirs=` loads B and opens `layout: 'compare'`. Both sides run on what's loaded; unopened refs are listed as ref rows and never fetched.

- [ ] **Step 1:** Write tests:
  - `matched by title path`: renaming a node in B gives one only-A row and one only-B row.
  - `same-named siblings stay apart`
  - `rows ordered by biggest difference`
  - `flipped only in split mode`
  - `compare never loads refs` (stub fetch count stays 0)
  - `compare renders with no unresolved bindings`, with and without B
- [ ] **Step 2:** Run `make check`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `make check`. Expected: PASS. In `make dev`, open `?src=examples/votes-at-16/map.md&theirs=examples/votes-at-16/obi.md`, which needs Task 12's examples. If they aren't ready yet, use two saved maps.
- [ ] **Step 5:** Commit with `feat: compare two maps`.

### Task 12: Examples, README, cleanup

**Files:**
- Rewrite: `examples/votes-at-16/map.md` and `obi.md`, and `examples/event-store/record.md`, which becomes `examples/event-store/map.md`, a plain tree
- Rewrite: `README.md`
- Delete: `design/`

Steps:

- [ ] **Step 1:** Rewrite the examples by hand in the new format. Evidence becomes children tagged `#evidence`, with the link in the description. Add a test, `examples parse`, that runs `parseMap` on each example file without an error and round-trips each one.
- [ ] **Step 2:** Run `make check`. Expected: PASS.
- [ ] **Step 3:** Rewrite `README.md` for the generic tool: the format with front matter, the views, refs, share links, saved maps, colour modes, themes, links and running it. Remove every mention of decision records, slugs, importance/impact, the AI helpers and the old formats.
- [ ] **Step 4:** Delete `design/`. Run `make check`. Expected: PASS. Check every view once in `make dev`.
- [ ] **Step 5:** Commit with `docs: README and examples for the generic tree tool`.
