# Focus view: design

Clickable prototype: `2026-11-01-focus-view-prototype.html`, next to this file, also at <https://claude.ai/artifact/QjLeg8xSxPZGwTzgy7e2tx> (private to the author). The author approved how it looks and behaves. It is a throwaway sketch, so don't copy its code. Its impact values and the options example are invented, nothing saves, and it has only ever been checked by parsing the script and running its resize maths. It has never been seen running by its builder.

## Why

The author tried to create a new map and hit two problems:

1. The slug came from the required root claim instead of the title. The description is useful but should be optional.
2. The screen after creating a map was confusing. They expected their title and description to be prominent, with a large "add" button under them. Instead they got an empty overview strip, the thesis card, an empty chart section and a details form that repeated the title.

The goal is a cleaner screen built around one thing at a time: the current point, what it's made of, and how to add to it.

## Goals

- Creating a map starts from a full-size card: a prominent title, an optional description and optional options.
- The Map and Pie views become one focus view with a consistent header bar.
- Selecting a point makes it the current point. There is no separate "selected" state.
- Importance and impact can be changed directly on the chart and with sliders on the current point.
- Choosing points controls what a resize affects, in both the bar and the pie.

## Non-goals

- Redesigning the Source and Diff views. They move under the new header and otherwise stay as they are.
- Changing the markdown format.
- Choosing points on touch screens, which stays desktop first like the rest of the chart's drag gestures.

## Anti-goals

These would make the work a failure even if it technically functioned:

- A point's children changing that point's own colour, size or contribution, except for premises. The health bar and the sliders on the same screen measure different things and must not affect each other.
- Existing map files failing to open, or saving differently except for values the user changed.
- The old screen's clutter coming back: a details form repeating the title, or several stacked cards before you reach the chart.

## Decided by the author

### New map

A full-size card with a 4xl title, a supporting description and optional options, for when a discussion is "choose from options" and not a single thesis. The slug comes from the title. The description is optional.

### Main view, top to bottom

1. **Header bar:** consistent across the app, holding the view icons and filter (which the author likes as they are) and the control for the view mode.
2. **Breadcrumbs:** only when below the top level, and every level above is clickable.
3. **Current point:** title and description.
4. **Health bar:** the overall result of the point's children.
5. **Points:** the resizable bar. With no children, one single wide "+" instead. With children, a "+" on either side of the bar.
6. **Depth:** the levels below the points, shown under the bar. Selecting any point in that tree makes it current.

Sorting is automatic by impact, including for newly added points. Selecting a child puts it directly in focus.

### Adjusting

Importance (bar width) and impact (colour depth) can both be adjusted.

### Choosing what a resize changes

Ctrl-click or ⌘-click **chooses** points. A resize takes from or adds to only the chosen points, spread in proportion to their size, and every point not chosen keeps its size. Chosen points show a diagonal background, a disabled style and a dashed border. A **Clear** button removes the choice.

**Changed after trying it (author's decision):** this was first built the other way round, with marked points locked and the rest absorbing the resize. The author tried it and reversed it.

### Pie view

The header switches between the bar and the pie. The pie can be dragged to resize and its slices chosen, like the bar. Hovering a slice shows a "+" on either side of it, and hovering a leaf (a slice with no children) also shows a "+" on the slice to add below it.

## Calls made by Claude

The author saw most of these in the prototype and did not object, but didn't decide them. They can be overridden.

### New map

- The **title** becomes both the front matter `title` and the root heading. The **description** becomes the root's `details`. The slug is `slugBase(title)`.
- Create is disabled until the title contains a letter or digit. The existing curly-brace rule still applies to the title.
- Blank options are ignored. Options become `kind: premise` children, with slugs from `slugify`.
- The existing warning that this replaces the current map stays, and Cancel appears when a map is open.
- The card replaces the "No map open" panel's New route and the small New form.
- The prototype's example links are not carried over.

### Header

One bar replaces the file toolbar, the page heading, the icon row and the filter row:

- Left: the map's title, then the file name and save status (asterisk for unsaved changes), as today.
- Centre: the four view icons, in today's order. **Tree** is now the bar view. `?view=map|pie|source|diff` keeps working.
- Right: filter box, the Filter button with its existing panel, the chart view switch (Width only, Wide and tall, Area is the score) and a ⋯ menu.
- The ⋯ menu holds New, Add option, Open, Save, Download and Settings. **Add option** follows today's New premise rule: only on a root with no factors.
- The chart view switch is hidden whenever the view isn't the bar.

### Current point

- Title and description are edited in place, by clicking them. Read-only maps don't allow this. A slug never changes when a title is edited.
- Editing the root's title doesn't change the front matter `title`, unless the two were identical.
- A collapsed **More** section holds everything else from today's details panel: by, basis, confidence, evidence, Research, Check rationale, slug (read-only) and delete with its two-step confirm. The same rules apply as today: the root and premises don't take basis, confidence or evidence.
- **Sliders** appear on any fact except the root: Importance (a 2–90% share of its siblings, which changes only that fact's stored number, disabled when it has no siblings) and Impact (−1 to +1). They sit above the health bar and are labelled as bar width and colour depth.
- A premise shows a note that its values are calculated instead of sliders.
- The right of the breadcrumb row shows the point's impact and share of its level, and updates as the sliders move.

### Health bar

- It diverges from the centre on a −1 to +1 scale, and shows the existing overall score. The label reads "Balanced" within ±0.10, otherwise "Mostly supported" or "Mostly contrary".
- With no children it is an empty track reading "No points yet".
- A root with premises shows the leading option and its score. This replaces the earlier "no overall score" treatment.

### Points and adding

- Clicking a column opens it. The previous select-then-Open step goes away, and with it `selectedFact` and the details panel. A divider now resizes the column on its left, unless the choice says otherwise (below).
- Adding uses one modal dialog: title, optional description, and an impact slider (not for premises). The custom slug field in today's add form is dropped, and slugs are automatic.
- Starting impact: left "+" −0.50, right "+" +0.50, wide "+" 0. On premises, both "+" buttons add an option and the wide one says so. New facts start at importance 50, as today.
- New points animate into their sorted place, respecting `prefers-reduced-motion`.
- Hovering a draggable column shows a ↕.

### Depth rows

- These replace the Overview strip. Each row shows one level, lined up under its parent column, with the same width and colour rules, down to the deepest level of the current point.
- They stay aligned while dragging. Cells wide enough show the title, and all cells have a tooltip. Non-matching cells dim under a filter.
- Depth rows only show the levels below the current point. Breadcrumbs cover the levels above, so the view no longer shows the whole map at once from a deep level.

### Choosing details

- **Changed after trying it (author's decision):** points can be chosen at any level, in the bar's depth rows and on any pie ring. A choice only affects resizes among its own siblings, and choices last until Clear, across levels. It survives switching between bar and pie, and isn't saved in the file.
- On a resize, the column left of the divider changes, unless it is the only chosen point, in which case the right one does, against it. Every divider can move while anything is chosen.
- With a choice, the drag is zero-sum in proportion across the chosen points, using the existing `resizeImportance` trade mode with the chosen points as its pool. With nothing chosen, it is the existing scale mode.
- Existing limits stay: a resized column between a 2% share and 90% in scale mode, and a trade column no lower than 2%.
- The "Scale all the others / Trade with chosen columns" switch is removed. Its stored setting is ignored.
- Shift-click also chooses. Premises can't be chosen or resized.
- In the code, avoid naming this `locked`: that word already means the map is read-only because its markdown source has errors, and that text stays as it is. `tradePool` can be replaced.
- If there's a conflict in the UI, read-only wins: no choosing, drags or "+" buttons on a read-only map.

### Pie

- This replaces today's sunburst view. The legend list and the centre "go up" button go away, since breadcrumbs cover them. The centre shows the score, except on a root with premises.
- **Changed after trying it (author's decision):** there are no "+" buttons beside the pie, because it wasn't clear what they added to. Slices with room carry their signed impact as a label. The pin is back: a pinned pie stays centred, and clicking a slice shows its details without moving the pie. The details sit beside the pie, so they stay on screen.
- Slices are drawn in impact order, clockwise from the top. All rings below the current point are shown, and clicking any slice opens it.
- **Changed after trying it (author's decision):** an **Edit** button (pencil) next to the pin turns the hover buttons on and off, and starts off. The invisible drag zone on the edges is gone. In edit mode, a hovered slice on any ring shows a ⇔ move handle next to the "+" on each edge it shares with a neighbour, with none where the last slice meets the first. Dragging it, or arrow keys on it, resizes the hovered slice against its siblings.
- The "+" buttons beside a slice add a sibling, starting 0.25 more contrary (counter-clockwise) or more supporting (clockwise) than the slice. A leaf's own "+" sits just outside the slice and adds its first child, starting at impact 0. The outer ring leaves room for it.
- The wide "+" works as it does in the bar view.

### Accessibility and devices

- Existing keyboard support mustn't regress: left and right on a focused divider change importance, up and down on a focused column change impact, Enter opens. Pie edges take arrow keys.
- **L** on a focused column, depth-row cell or slice toggles whether it is chosen. This is new and wasn't in the prototype.
- Slice "+" buttons also appear when a slice has keyboard focus, and can be reached by Tab. The prototype was mouse only.
- Colour isn't the only signal: signed values stay on columns and in tooltips. Dashed borders and the diagonal pattern mark chosen points.
- On touch, viewing, opening, sliders and the side "+" buttons work. Dragging and choosing aren't required, and the chart mustn't block page scrolling.

### Everything else

- **Filters and display overlays** keep today's behaviour, including the star, paperclip and "no basis" markers on columns.
- **Themes:** all four themes must work, using existing tokens. The prototype only shows Paper.
- **README:** update the chart, pie and Links sections.
- **Checks:** update `check.js` where it relies on `selectedFact`, the details panel, the mode switch or the root-claim slug. Add checks for the title slug, optional description, options on create, and the choosing rules.

## Left to the builder

- How to fit this into the `sc-if`/`sc-for` template and `renderVals`, and how to split the work.
- How to build inline editing, the dialog, the ⋯ menu and the depth rows within the template system.
- Exact styling within the app's tokens, using the prototype as the guide. Very narrow columns may drop their text as long as it's reachable by tooltip.
- Which now-unused code to delete. Unused code should go: don't leave the old panel or pin state behind.

## Constraints

- Plain `index.html` with vendored React and the `dc-runtime` template system. `support.js` is generated, so don't edit it. No build step and no new dependencies.
- Markdown files remain the only data source.
- Run with `make dev`, check with `make check` (both need bun).
- The behaviour must be confirmed in a real browser, since the prototype never was by its builder.
