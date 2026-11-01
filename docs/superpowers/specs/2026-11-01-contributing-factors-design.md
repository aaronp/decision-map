# Contributing factors: design

Interactive mockup: `2026-11-01-contributing-factors-mockup.html`, next to this file. Open it directly in a browser. It shows the three views, both resize behaviours, the thermometer and the details panel. Its impact values are invented, and it is a throwaway sketch, not code to copy.

## Why

Separate Pro and Con stacks force every fact into one of two buckets and hide how much each one matters. The author wants to think of supporting facts as **contributing factors**, each with a continuous position between contrary and supporting and a weight relative to its siblings, all visible in one chart that can be reshaped by direct manipulation.

## Goals

- Replace the Pro and Con columns on the Map view with one horizontal chart of the focused claim's children.
- Model every fact with `importance` and `impact`, in a heading-based markdown format.
- Change importance by dragging dividers, and impact by dragging columns vertically.
- Keep selecting a fact to see its details, and keep adding children to any fact.
- Carry the same model through the sunburst, diff, overview and AI helpers, so that no view still depends on pro/con.

## Non-goals

- A general "adjust" feature that recomputes any layer from its children. It is a likely future addition. Premises (below) are the only calculated values for now.
- Editing a premise's calculated values by hand.

## Anti-goals

These would make the work a failure even if it technically functioned:

- A fact's children changing that fact's colour, size or contribution, except for premises. A strongly positive fact can have strongly negative children, because children only speak to the layer directly above them.
- Existing map files failing to open.

## Decided by the author

### Model

- **Importance** is a fact's weight relative to its siblings.
- **Impact** is a number from −1.0 (contrary) to +1.0 (supporting). Its sign replaces pro/con.
- **Score of a claim:** based on importance × impact across its direct children.
- Children are always relative to their parent. Impact is set by hand and is never derived from children.

### File format

Hierarchy comes from markdown headings (`#`, `##`, `###`…), with YAML-style properties for each section. `[+]` and `[-]` go away.

```markdown
---
title: Votes at 16
---

# 16-year-olds should be allowed to vote in general elections.
slug: votes-at-16
by: Ms. Smith

## Sixteen-year-olds can work and pay tax, so they should have a say.
slug: pay-tax
importance: 60
impact: 0.8
by: Sam
confidence: 4

Free text here becomes the details shown when this fact is selected.

- [ref] [Some source](https://example.com) — what it shows

### Most 16-year-olds don't earn enough to pay income tax.
slug: little-income-tax
importance: 45
impact: -0.6
```

### Chart

- Column **width** is importance. Column **colour** runs from red through neutral to green, with darkness following the size of the impact.
- Columns are **sorted by impact**, most negative on the left.
- **Three view modes**, all available and chosen by the user: width only; wide and tall (importance drives width and height); area is the score (width is importance, height is impact, with green rising and red falling from a centre axis).
- **Dragging a column vertically** shows a vertical thermometer, red at the bottom and green at the top, and changes impact.
- **Selecting a fact** shows its details. Children can be added to any fact.

### Resizing importance

Dragging a divider resizes a column, like resizing a table column. A toggle chooses what the others do:

- **Scale all the others:** dragging can continue past the neighbouring column, and every other column scales to fit.
- **Trade with chosen columns:** zero-sum. Importance moves only between the resized column and the columns the user picked.

### Premises

A premise's value is calculated, the first instance of the future "adjust" idea: it is adjusted by the relative importance and impact of its children, relative to the other premises.

### Editing

One details panel below the chart edits whichever fact is selected, and shows the focused claim when nothing is selected. It replaces the editors on today's focused-claim card: text, `by`, details, basis, confidence, evidence, Research, Check rationale and delete. As today, the root and premises don't take basis, confidence or evidence, and premises don't take an editable importance or impact. All facts can have details text.

### Devices

Desktop first. On touch, you can view, select and edit through the details panel, including importance and impact as number or slider inputs, but the drag gestures and trade-column picking aren't required. The chart mustn't block page scrolling on touch.

## Calls made by Claude

The author saw most of these during the conversation and did not object. They can be overridden.

### Format details

- The property block is the contiguous `key: value` lines directly under a heading. A blank line ends it. Allowed keys: `slug`, `importance`, `impact`, `by`, `confidence`, `basis`, `kind`. An unknown key in the block is a parse error, matching the parser's current strictness.
- Text after the block is the fact's free-text **details**, a new editable field. `- [ref]` lines are evidence, in today's syntax. `basis` becomes a single-line property.
- Headings deeper than six levels are accepted (`#######`), though other markdown renderers will show them as plain text.
- A premise is marked `kind: premise`, replacing `[*]`, and stores no `importance` or `impact`.
- `impact` is required on non-premise facts and saved to two decimals. `importance` is a required number ≥ 0, saved to one decimal, with no upper limit.

### Existing files

- Old `[+]`/`[-]`/`[*]` files still open everywhere, including as diff side B and via `?src=`, and are saved in the new format.
- On import, `weight` becomes `importance`, `[+]` becomes impact +1.0, `[-]` becomes −1.0, and `[*]` becomes `kind: premise`.
- `examples/votes-at-16/map.md` and `obi.md` are migrated. Their impacts will be exactly ±1 until someone edits them.

### Importance and score

- Importance is relative and is shown as a percentage share of its siblings.
- **Overall score** = Σ(importance × impact) ÷ Σ(importance), giving −1 to +1. It is 0 when there are no children or total importance is 0. This replaces the For/Against bar.
- A column's **contribution** = its share × its impact.

### Resize details

- A divider resizes the selected column if it touches the divider, otherwise the column on its left. Dragging can both grow and shrink it.
- In **scale** mode only the resized fact's stored number changes, because the others shrink only as shares. The divider stays under the pointer. See `resize()` in the mockup for the formula. This keeps saved diffs to one line.
- In **trade** mode the picked columns change in proportion to their current sizes. ⌘-click or Shift-click marks a column, shown with a dashed outline. With none marked, it trades with the column across the divider.
- Limits: these apply only to the columns a drag changes directly. A resized column stays between a 2% share and, in scale mode, 90%, and a trade column can't go below 2%.
- Drawn widths always match true shares, so printed percentages and "area is the score" stay accurate. In scale mode, other columns can shrink below 2% as shares, and a premise can reach 0. Such columns are drawn at a small minimum pixel width, and dividers have their own fixed width, so they stay reachable. The divider staying under the pointer may drift slightly when that minimum applies, which is acceptable.
- Impact changes re-sort when the drag ends, not during it. New children start at impact 0 and importance 50.
- The chosen view mode and resize behaviour are per-browser settings using `loadSetting`/`storeSetting`, not stored in the map file.

### Premises in the chart

- A premise's **impact** = the overall score of its direct children.
- Its **importance** = (impact + 1) ÷ 2, shown as a share among the premises, so a stronger premise is wider and a −1 premise is at the 2% minimum.
- Premise columns have no drag behaviour: dividers and the thermometer are disabled, and details state that the values are calculated.
- A root with premises shows a ranking and no overall score, because premises compete and don't push the root either way, as they do today.
- A root's direct children are either all premises or all non-premises, as today.

### Other views and features

- **Map view:** the breadcrumb and go-up button stay, and the focused claim's text and overall score stay above the chart. **Open** focuses a fact (today's drill-in), so its children become the chart. Reorder grips, per-card weight handles, group selection, column headers and "Make it a con" are removed.
- **Add:** one Add control in the details panel, adding a child to whichever fact the panel is showing. The New map panel's "Pros and cons" option becomes "Contributing factors".
- **Overview:** block width stays share, and colour uses the impact scale.
- **Sunburst:** segment size is share, and colour uses the impact scale. Its legend sliders become read-only importance and impact values or are removed, whichever is simpler.
- **Diff:** match by slug as today. It compares importance share and impact, and Sankey and Structure use the impact scale. A fact counts as changed if its share moves by at least the existing threshold in percentage points, or its impact moves by at least that threshold ÷ 100 (so today's default of 10 means 0.10). The "Weight Δ" chip becomes a "Changed" chip covering both. "Flipped" means the signs are strictly opposite, so moving to or from exactly 0 is a change but not a flip.
- **Filters:** matching is unchanged. In the chart, non-matching columns are dimmed like the Overview's blocks, never hidden, so widths and percentages always use all siblings. Editing stays enabled, as all stored values remain visible.
- **Display overlays:** the `show-confidence`, `show-evidence` and `show-good-faith` settings and front-matter keys stay. On columns they appear as small text markers instead of today's fading, dotted borders and stripes, which would clash with impact colour and the trade outline: stars, a paperclip with a count, and "no basis". The Overview and sunburst treatments follow the same rule wherever their marks would alter impact colour.
- **Themes, links, save/autosave, Source view:** unchanged in behaviour. The Source view's format help documents the new format.
- **Check rationale:** impact > 0 is the pro case and impact < 0 the con case. Facts at exactly 0 go in neither.
- **Research:** attaches sources to the selected fact. Where it describes the argument as for or against, it uses the sign of impact.
- **Colour:** reuse the theme's `--pro` and `--con` tokens, mixed towards a neutral surface, so all four themes work. Text on a column must keep readable contrast. Sign is also shown as text (`+0.80`), so colour isn't the only signal.
- **Keyboard:** left/right arrows on a focused divider change importance, up/down on a focused column change impact, and Enter selects. The app's handles have arrow-key support today, and this must not regress.
- **Locked maps:** when the map is read-only, all drags and Add controls are disabled, but selection still works.
- **README:** update the Links, AI helpers and format wording.

## Left to the builder

- How to fit the chart into the `sc-if`/`sc-for` template and `renderVals` structure in `index.html`.
- How to handle very narrow columns' text, as long as the full text is reachable by selection or tooltip.
- Exact styling, within the app's existing tokens.
- A small runnable check for the new logic: parse and serialise round trip, legacy import, resize maths, score and premise calculation. The repo has no test framework, and adding one isn't required.

## Constraints

- Plain `index.html` with vendored React and the `dc-runtime` template system (`support.js` is generated, so don't edit it). No build step and no new dependencies.
- Markdown files remain the only data source.
- Run with `make dev` (needs bun).
