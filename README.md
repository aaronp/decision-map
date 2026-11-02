# [Decision map](https://aaronp.github.io/decision-map/)

This tool was created to help solve [wicked problems](https://en.wikipedia.org/wiki/Wicked_problem) by:
 - helping people capture their rationale
 - exposing a visual of that raionale for others to see and contribute to
 - providing a 'diff' view so people can identify areas they've not thought of or weight differently

[View Here](https://aaronp.github.io/decision-map/)


This is based on the excellent [https://www.kialo-edu.com/](https://www.kialo-edu.com/) and research into:

 - [issue-based information system (IBIS)])(https://en.wikipedia.org/wiki/Issue-based_information_system)
 - [bayesian networks](https://en.wikipedia.org/wiki/Bayesian_network)
 - [analysis of competing hypothesis](https://en.wikipedia.org/wiki/Analysis_of_competing_hypotheses)


# Using it

The data source for this is just markdown.

You can create your own markdown files locally, or host them online in whatever way you wish.

This tool simply provides a convenient way to edit and visualise that data, separate from the data itself.

If you use git (github), you can clone an 'example' project which is a minimal repo for hosting the content.

Simply use `make clone` and then push your saved markdown into whatever git repo you like.

## The format

Each fact is a heading, one `#` deeper than its parent, with properties directly under it:

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
confidence: 4
basis: Evidence that few 16-year-olds work

Free text here is shown when the fact is selected.

- [ref] [Some source](https://example.com) — what it shows

### Most 16-year-olds don't earn enough to pay income tax.
slug: little-income-tax
importance: 45
impact: -0.6
```

- `importance` is relative to the fact's siblings and has no upper limit. It's shown as a share.
- `impact` runs from -1.0 (contrary) to 1.0 (supporting), and you always set it by hand: a fact's children don't change it.
- A claim's **overall score** is Σ(importance × impact) ÷ Σ(importance) over its direct children.
- A root can instead hold **premises**, competing answers marked `kind: premise`. A premise's impact is the score of its children, and its importance is (impact + 1) ÷ 2, so these are calculated and can't be edited.

Older files in the `- [+] text {slug: …, weight: …}` list format still open, and are saved in this format once edited. `[+]` becomes impact 1.0 and `[-]` becomes -1.0.

## Creating a map

**New** starts from a full-size card: a title, an optional description, and optional options when the discussion is "choose from options" and not a single thesis. The slug comes from the title.

## The focus view

The screen is built around one point at a time: its title and description, a health bar for the overall result of its children, and the children themselves. Breadcrumbs jump to any level above, and the **Bar** and **Pie** icons in the header switch how the children are drawn. A point with no children shows one wide **+**. Otherwise there's a **+** on each side, the left starting a contrary point and the right a supporting one, and new points sort into place by impact.

Click a title or description to edit it. **More** holds by, basis, confidence, evidence, Research, Check rationale, the slug and delete.

### The bar

Columns are sorted from most contrary to most supporting. Colour is impact, and width is share of importance. There are three chart views, switched from the header: *Width only*, *Wide and tall*, and *Area is the score*. Rows under the bar show every level below, lined up under their parent column.

- **Click a column** or any cell in the rows below to open it.
- **Change importance** by dragging a divider, or with the slider on an open point.
- **Change impact** by dragging a column up or down, or with the slider on an open point.
- **Choose the columns a resize changes** with Ctrl-click, ⌘-click or Shift-click, or **L** on the keyboard. Chosen columns get a diagonal pattern and dashed border. Dragging a divider then changes the chosen columns on each side of it, spread in proportion to their size, or the column next to the divider on a side with none chosen. Every other column keeps its size, and the divider stays under the pointer. You can also choose cells in the levels below, which apply when you resize at that level. Choices stay as you move between levels until **Clear** removes them. With nothing chosen, the two columns either side of the divider trade.

Dividers also take the left and right arrow keys, and columns the up and down keys. On touch screens, use the sliders.

### The pie

The same points as rings around the current point, sorted clockwise from the top, next to the current point's details. Slices with room show their impact.

- **Edit** (the pencil next to the pin) turns on the hover buttons. Off by default, so hovering just shows a slice's details.
- **Drag the ⇔ handle** that edit mode shows on a slice's edges to resize that slice against its siblings, on any ring. It takes the left and right arrow keys too.
- **Choose slices** on any ring the same way as columns.
- **Pin** the pie to keep it centred where it is. Clicking a slice then shows that point's details beside the pie, without moving the pie.
- In edit mode, **hover a slice** for a **+** on each side, which adds a point beside it. A slice with no children also gets a **+** outside it for its first child.

## Decision records

A decision record is a template with fixed tiers, for decisions shaped as "which option best meets our goals?". Choose **Decision record** on the New card.

- **Goals** have a title, a description and an importance relative to the other goals.
- Each goal has its own **criteria**, weighted against each other.
- Each goal has its own **options**: pick one already used elsewhere in the record, or add a new one. Each option gets a **score** from 0 to 10 on each criterion.
- Each score can have **reasons**. A reason has a weight, which sets its emphasis but never changes the score, and the same extras as a point: by, basis, confidence and evidence.

An option's **goal score** is the sum of each criterion's share of the goal × its score, out of 10. The best goal score wins that goal. The **overall score** is the sum of each goal's share of importance × the option's goal score. A goal that doesn't include an option adds nothing to it, so an option can come first overall without winning any single goal.

```markdown
---
title: Event store for the billing service
template: decision-record
---

# Event store for the billing service
slug: billing-event-store

## Reliability
slug: reliability
importance: 40

### Durability
slug: durability
weight: 50

#### DynamoDB
option: dynamodb
score: 9
summary: Multi-AZ by default

##### Multi-AZ replication by default
slug: multi-az
weight: 60
```

A score heading names its option with `option:` instead of a slug, because the same option appears under several criteria. `summary:` is an optional one-line reason for the score. Free text under a goal or criterion heading is its description. An option has one title throughout the file. A missing score reads as 0.

The views are **Overview**, **Record**, **Markdown source** and **Compare**. A new decision record opens on Record, at its first step.

**Record** has a step rail down the left: **Goals › Criteria › Options › Reasons**. Each step shows what's chosen there, and you can click any step to jump to it. A step with nothing chosen yet picks the first goal, option or criterion. On a narrow screen the rail becomes a row across the top.

- **Overview** (its own tab): the ranking, with each option's bar split by what each goal adds. Goal weights and the selected goal's criteria weights use the bar or the pie, with Ctrl/⌘-click to choose what a resize changes, and a checkbox turns a goal off. Changes here are **what-if weights**: every view shows them, but nothing is saved until **Save as the record's weights**. **Reset** drops them. A goal saved while off gets `importance: 0`.
- **All goals:** a short bar of goal importance, with **+** to add a goal. Click a goal to see and edit its title and description, then open it.
- **A goal:** a short bar of its criteria by weight, with **+**. Click a criterion to edit its title and description. Below are the goal's options by goal score, with the winner marked, and controls to add an option.
- **An option:** **Edit one** gives a 0–10 slider and an optional short reason for each criterion, with **Reasons ›** for the full reasons. **Compare all** shows every option against every criterion. Click a score there to edit that option.
- **A criterion's reasons for that option:** the score and its short reason, then the full reasons by weight. Each reason has its own weight, and the same extras as a point.

**Compare** shows two records side by side, from the open file, its what-if weights, a second file, or a snapshot. Choose goals, one goal's criteria or one goal's scores, as paired bars or as composite bars split into their parts. The biggest differences are listed first. Click a score row to see each side's reasons.

**Snapshots** save a named copy of the record as shown, what-if weights included. They're kept only in this browser, in IndexedDB, and can be loaded back as what-if weights or used in Compare.

**Undo and redo** (⌘Z and ⌘⇧Z, or the ↶ ↷ buttons) cover every edit in maps and records, including what-if weights. A drag is one step. History starts again when a file is opened.

## Run it

```sh
make dev          # http://localhost:8000 (needs bun)
make check        # logic checks, no browser needed (needs bun)
```

`make dev` serves this folder and proxies `/typesafe/*` to api.typesafe.ai,
which doesn't accept calls straight from a browser. Opening `index.html` from
disk won't work: browsers block the scripts over `file://`.

Pushing to `main` or `master` publishes the page to GitHub Pages
(`.github/workflows/pages.yml`; one-time setup: Settings → Pages → Source:
GitHub Actions).

## Links

| Query | Effect |
|---|---|
| _(none)_ | The new-map card, with Open… for a file, URL or recent file |
| `?src=<url>` (alias `?ours=`) | Opens that markdown file as the map |
| `?theirs=<url>` | Opens a second map as B and starts on the diff view; without it the diff view offers the Open panel for B |
| `?view=map\|pie\|source\|diff` | The view (default `map`) |
| `?focus=<slug>` | The claim in focus (default the thesis) |
| `?theme=paper\|slate\|night\|contrast` | Overrides the map's own `theme:` |

The address bar keeps `view`, `focus` and `theme` up to date, so it's always
a link to what's on screen. A URL must allow cross-origin requests (GitHub
Pages and raw.githubusercontent.com do).

Try `?ours=examples/votes-at-16/map.md&theirs=examples/votes-at-16/obi.md`.

## Files

- **Open…** takes a dropped file, a file chooser or a URL, and lists the last
  10 files under Recent.
- **Save** writes back to a file opened from this computer (Chromium-based
  browsers), and after the first Save, edits autosave 1.5 s after you stop.
  An asterisk after the file name means unsaved changes.
- **Download** saves a copy (with a save dialog where the browser has one).

## Themes

The same themes and accents as the risk register. Settings → Display writes
`theme:` and `accent:` into the map's front matter, so the look travels with
the file; `?theme=` overrides it for one link.

## AI helpers (optional)

Keys are kept in this browser's localStorage, never in the markdown.

- **OpenRouter** key → **Research** next to *Add evidence* on a fact:
  a web search for sources, each offered to add as evidence. Only sources the
  search actually cited are offered.
- **typesafe.ai** (Jev) key → **Check rationale** on a claim with contributing
  factors: Jev's confidence that the supporting facts (impact above 0), taken
  together, give good reason to accept the claim, and the contrary facts (impact
  below 0) to reject it. Needs `make dev` (the proxy).

## Examples

`examples/votes-at-16` is a slim data repo: the markdown plus an
`index.html` that redirects to the published mapper with `?src=` pointing at
it. `make clone REPO=you/your-repo` there copies it into a new repo.

`examples/event-store/record.md` is an example decision record.
