# Decision record: design

Clickable prototype: `2026-11-02-decision-record-prototype.html`, next to this file, also at <https://claude.ai/artifact/67WgW36ovDH5eBdvLpwHkA> (private to the author). It's a throwaway sketch: the event-store example, "Sam" and the snapshot are invented, nothing saves, and its builder only checked that the script parses and that the resize rule gives the right numbers. It has never been seen running by its builder. Don't copy its code.

## Why

A decision map is free-form: any point can hold any points, to any depth. Many real decisions have a fixed shape instead: what we want (goals), how we'd judge it (criteria), what we could do (options), how each option does on each criterion (scores), and why (reasons). The author wants a **decision record** template with those fixed tiers, built from the same parts as the map: resizable weights, the bar and pie, choosing what a resize changes, and comparing two people's files.

The point is to make the choice visible and arguable. Each author works through goals → criteria → options → reasons, a winner falls out per goal and overall, and changing any weight shows straight away how the ranking moves. Comparing two authors' records shows exactly which tier they disagree on.

## Revision 2: views you drill into, and resizing that follows the pointer

The author tried the first build and the prototype, and decided the following (2026-11-02). It replaces the Overall and Goals view descriptions below wherever they disagree. The prototype (version 5 at the link above, copied next to this file) shows it.

### Record views: one path from the overview down to reasons

- The header's views for a record are **Record**, **Source** and **Compare**.
- **Record** has a sub-header of breadcrumbs: **Overview › All goals › *goal* › *option* › *criterion***.
  - Each crumb has a small tier label above its name (Goals, Criteria of, Option, Reasons for).
  - Every crumb is clickable. Levels below the current one stay in the trail, faded, so you can step back down to where you were.
- **Overview:** the ranked options, with the what-if goal and criteria weights, the goal checkboxes and snapshots, as described under "Overall view" below.
- **All goals:** the map's bar style, short (about 150px).
  - Each column has its title in a chip at the top and its % in a chip at the bottom, in the goal's colour.
  - Dividers drag, Ctrl/⌘-click chooses, and a dashed **+** column on the right adds a goal.
  - Clicking a goal shows its title and description below, edited in place, with its winner, its counts and a button to open it.
- **A goal (its criteria):** the same short bar of the goal's criteria by weight, with **+**.
  - Clicking a criterion shows its title and description below. Criteria now have descriptions, kept as the free text under the criterion heading.
  - Below that, the goal's options are listed by goal score with a winner marker, with **Compare all**, and controls to add an existing option or a new one. Clicking an option opens it.
- **An option:** a switch between **Edit one** and **Compare all**.
  - *Edit one:* chips to switch option. Then one row per criterion: its weight, a 0–10 slider, an optional short reason ("Why this score?", one line of plain text), and a **Reasons ›** button. A button removes the option from the goal.
  - *Compare all:* the grid of options × criteria, each cell showing its score and the start of its short reason. Clicking a cell edits that option.
- **A criterion's reasons for that option:** the score with its slider and short reason, then the full reasons, largest weight first. Each has a weight slider, the extras (by, basis, confidence, evidence) and remove.
- The short reason is stored on the score as `summary: …` (one line, no braces). It's separate from the full reasons and optional.
- The bar/pie switch stays for these weight bars. The prototype shows only the bar.
- What-if weights work as built (Claude's call): a weight drag on the Overview starts them. While they're on, every level shows them and every weight drag edits them, under the "What-if weights" bar with Save and Reset. Otherwise the other levels edit the record directly.

### Changed after trying it: a step rail (author's decision)

- A new decision record opens on the **Goals** step. An existing record still opens on the Overview (Claude's call).
- The breadcrumbs are replaced by a vertical step rail on the left, full height, which stays in place as the page scrolls: **Goals › Criteria › Options › Reasons**, each showing what's chosen there and clickable to jump to it.
- The Overview isn't on the rail. It's its own header tab, so a record's tabs are **Overview**, **Record**, **Markdown source** and **Compare**. **Record** returns to the step you were last on, or Goals (Claude's call).
- A step with nothing chosen yet picks the first goal, option or criterion. On screens under 700px wide, the rail becomes a row across the top (Claude's calls).

### Changed after trying it: one page that opens up (author's decision)

- Record is one page. Selecting a goal shows a divider, a **Criteria** heading with that goal's criteria, then a divider and **Options**: a pill per option and an add-option control. Selecting an option shows its criterion scores, and with a criterion chosen, a divider and a **Reasons** section.
- The step rail shows the selected value under each step: the goal, the criterion, the option, and for Reasons the count (Claude's call, since there's no selection there).
- Clicking a column selects it. Clicking a criterion, or a score's Reasons button, picks which reasons show. Compare all is the last option pill. Clicking a rail step scrolls to its section (Claude's calls).

### Resizing: the border follows the pointer (maps too)

This replaces the map's "drag as far as you like and the rest scale to fit", in the map's bar and pie as well as in records.

One rule covers every case: **each side of the border changes its chosen columns if it has any, otherwise the column next to the border.** The left side grows by exactly what the right side shrinks, so the border always stays under the pointer.

- **Nothing chosen:** the two columns either side of the border trade. Nothing else moves.
- **Chosen columns all on one side of the border:** they take the change, in proportion to their size, and the neighbour on the far side takes the opposite change. Columns between the chosen ones and the border slide along unchanged. Example: with Cost chosen, dragging the Developer speed | Replay and audit border left grows Replay and audit, shrinks Cost, and slides Developer speed left. This example was decided by the author.
- **Chosen columns on both sides:** the chosen columns on the left take the change one way, and the chosen columns on the right take it the other way. Unchosen columns, the neighbours included, slide along unchanged. Claude's call, after the builder check found the first wording contradictory: it's the same rule, and it keeps the border under the pointer.
- A drag stops when any column that's changing would go below a 2% share. A record weight never reaches 0.
- In a pie, "left" means counter-clockwise, and the same rules apply to each ring.

## Goals

- A decision record template with four fixed tiers: goals, criteria, options with scores, and reasons.
- A winner per goal and an overall ranking, both updating live as any weight or score changes.
- What-if weights in the overall view that are temporary unless saved.
- Undo and redo across the app.
- Named snapshots kept in the browser.
- Comparing two records, or a record and a snapshot, tier by tier.

## Non-goals

- Calculating scores from reasons. Reason weight is for emphasis only. A later feature may calculate scores from reason weights, so don't make that impossible, but don't build it.
- Several authors in one file.
- Syncing snapshots between browsers or devices.
- Changing how decision maps work, except for gaining undo/redo.

## Anti-goals

These would make the work a failure even if it technically functioned:

- Existing decision map files failing to open, or saving differently.
- Weights or scores changing anywhere other than where the person dragged or typed. In particular, a goal or criterion that isn't chosen must not move when something chosen is resized.
- What-if weights being written to the file without the person saving them.
- Losing a snapshot silently. If the browser won't store it, say so.

## Decided by the author

### The record

- A record has **goals**. Each has a title, a description and an importance relative to the other goals.
- Each goal has its own **criteria**. Each has a title and a weight relative to the goal's other criteria.
- Each goal has its own **options**. When adding an option to a goal, you can pick an option already used elsewhere in the record, or create a new one.
- Each option in a goal gets a **score** from 0 to 10, whole numbers only, on each of that goal's criteria.
- Each score has zero or more **reasons**. A reason has the same extras as a point today (by, basis, confidence, evidence) and a **weight**. The weight is for emphasis only: it doesn't change the score.

### The maths

- An option's **goal score** is the sum over the goal's criteria of (criterion weight as a share of the goal's criteria) × score. It runs from 0 to 10.
- The option with the highest goal score is that goal's **winner**.
- An option's **overall score** is the sum over goals of (goal importance as a share) × goal score. An option a goal doesn't include scores **zero** for that goal. So an option can come first overall without winning any single goal, and the overall view says so.

### Overall view

- It shows the overall ranking, with each option's bar split by what each goal adds, and which goals each option wins.
- Goal weights use the existing **bar or pie**, switchable, with drag to resize and Ctrl/⌘-click to choose what a resize changes. The chosen goals take the change and everything else stays frozen, as in the map today.
- A **checkbox** per goal turns it off (weight zero), so you can ask "what wins if we only care about three of the four?"
- **Clicking a goal's name** selects it, and a second bar or pie of the same kind shows that goal's criteria weights, with the same resizing and choosing.
- These changes are **what-if weights**: temporary unless saved. **Reset** drops them; saving writes them into the record.
- Saving with a goal turned off writes `importance: 0` for it. The goal then stays off everywhere until it's given a weight again. Its old weight isn't kept, except through undo and git. Decided by the author after the builder check.

### Undo and redo

Undo and redo are important. They cover every edit in the app, including what-if weights.

### Snapshots

- You can save a **named snapshot** of the record.
- Snapshots live **only in the browser**, in IndexedDB, with create, list, rename and delete.
- A snapshot can be used as either side of Compare.

### Compare

- One file per author, opened the way Diff opens a second file today.
- Compare shows goals (importance), the criteria of one goal (weights), or the scores of one goal.
- It has two styles, switchable: **side by side**, with paired bars per item, and **composite**, with each record's whole bar split into its parts.

## Calls made by Claude

The author saw most of these in the prototype and did not object, but didn't decide them. They can be overridden.

### File and creation

- A record is a markdown file with `template: decision-record` in its front matter. A file without it is a decision map, as today.
- The full-size New card offers **Decision map** or **Decision record**. A new record has its title, an optional description and one empty goal.
- Goals, criteria and options match across files by **slug**, as points do in Diff today. Slugs come from titles with `slugBase`/`slugify` and never change when something is renamed. Two authors who each type "Postgres" get the same slug and line up in Compare.
- An option keeps one title throughout a file. Renaming it renames it everywhere.

### Views

- *(Superseded by Revision 2.)* For a record, the header's views are **Overall**, **Goals**, **Source** and **Compare**. Compare replaces Diff for records. For maps, nothing changes.
- *(Superseded by Revision 2.)* **Goals:** the goal-importance bar or pie, plus a card per goal showing its winner. Opening a goal shows its title and description (edited in place), its criteria bar or pie, a grid of options × criteria with scores and goal scores, and a panel for the selected score: a 0–10 slider and its reasons.
- Reasons are shown largest weight first, sized by weight. Each reason can be opened to edit its extras, like a point's More section today.
- The bar/pie choice is shared across the app's views.
- Choices (what a resize changes) belong to each weight set separately: the goals, and each goal's criteria. They last until Clear, as in the map.
- A goal with weight 0 (turned off, or saved that way) drops out of every bar and pie and shows an unchecked checkbox. Turning it back on gives it the weight it had before it was turned off in this session. If there isn't one, such as a goal saved at 0, it gets the average of the goals that are on.

### What-if and saving

- What-if weights are an overlay of goal and criteria weights, keyed by slug. While it's active, **every view** shows the what-if weights, and every weight drag in any view edits the overlay. A bar across the top says "What-if weights" with **Save as the record's weights** and **Reset**. So the views never disagree.
- Everything else always edits the record, whether what-if is active or not: adding or removing goals, criteria or options, scores, reasons, titles, and edits in Source. The overlay picks up those changes. Items that are removed drop out of it, and new items take the record's weight. Saving therefore never undoes a deliberate edit.
- Saving replaces the record's weights with the overlay as one undoable step, and ends what-if.
- Switching to another file drops unsaved what-if weights, after a confirm built into the page.

### Undo and redo

- One history per open file, of every edit: weights, scores, titles, reasons, options, and what-if weights. A drag is one step. Typing in a text field is one step per field focus.
- ⌘Z / Ctrl+Z and ⌘⇧Z / Ctrl+Shift+Z, plus buttons in the header. In a text field, the browser's own undo applies instead.
- Undo also applies to decision maps.
- History isn't saved. It starts again when a file is opened.

### Snapshots

- A snapshot is a **copy of the whole record** (weights, scores and reasons) with its name and the time it was saved. If what-if weights are active, it copies them as shown. Confirmed by the author after seeing it.
- Each snapshot stores the record's root slug, the file name and the title it came from. A file lists the snapshots with its root slug, labelled with the source file name. Compare can pick any snapshot in the browser, so renaming or moving a file never hides one. Snapshots of a new record that hasn't been saved yet still work, because the root slug exists from creation.
- Loading a snapshot makes its weights the what-if weights. Weights for items the record no longer has are ignored, and new items keep the record's weight.
- Use the existing `arg-map` IndexedDB database (`recentStore()` in `index.html`) unless the author points to an existing snapshot API. None was found in the repo.
- If IndexedDB is blocked, the snapshot controls say snapshots can't be kept in this browser, as the API-key setting does for storage today.

### Compare details

- Either side picks from: the open file, the second file, and any snapshot in the browser. Compare shows the files' saved weights. If what-if weights are active, they're offered as a separate choice, "Open file (what-if)", so Compare never shows a difference that isn't in a file without saying so.
- The top of the view shows the four biggest differences across all tiers, measured as a share of each tier's scale (percentage points of weight, or points out of 10). Clicking one jumps to it.
- Side by side lists items biggest difference first, with a marker on differences of 15% of the scale or more. Clicking a score row shows both sides' reasons.
- In composite style, goals and criteria show each record's full bar split by relative weight. Scores show each option's goal score as a bar out of 10, split by what each criterion adds.
- Items only one side has show as zero on the other side.

### Format

The same heading-and-properties style as maps. A sketch (the builder may change the details within the constraints below):

```markdown
---
title: Event store for the billing service
template: decision-record
---

# Event store for the billing service
slug: billing-event-store

Optional description.

## Reliability
slug: reliability
importance: 40

Billing events must never be lost.

### Durability
slug: durability
weight: 50

#### DynamoDB
slug: dynamodb
score: 9

##### Multi-AZ replication by default
slug: multi-az
weight: 60
confidence: 4
basis: AWS documentation

- [ref] [DynamoDB resilience](https://docs.aws.amazon.com/...) — what it shows
```

Constraints on the format:

- An option belongs to a goal when it has a score heading under any of that goal's criteria. A missing score under one of its criteria reads as 0.
- An option's title is the same everywhere in the file.
- Files must round-trip: opening and saving changes nothing unless the person changed something.

### Everything else

- Filters, the display overlays and themes work in record views as they do in maps, where they apply.
- Read-only rules apply as in maps: a file with markdown errors is shown but can't be edited.
- The README gets a decision record section, and `check.js` gets checks for the maths, the format round-trip, resizing with choices, what-if save/reset, undo/redo, snapshots (with IndexedDB stubbed), and Compare's matching by slug.

## Left to the builder

- The exact markdown format, within the constraints above.
- How to fit the new views into the `sc-if`/`sc-for` template and `renderVals`, and how much of the map's bar, pie, choosing and focus code to share. Sharing is preferred over copying.
- How undo/redo is stored (snapshots of state or inverse operations), as long as a drag is one step.
- Exact styling within the app's tokens, using the prototype as the guide.

## Constraints

- Plain `index.html` with vendored React and the `dc-runtime` template system. `support.js` is generated, so don't edit it. No build step and no new dependencies.
- Markdown files remain the only data source for records. Snapshots, undo history and what-if weights are not data.
- Run with `make dev`, check with `make check` (both need bun).
- The behaviour must be confirmed in a real browser, since the prototype never was by its builder.
