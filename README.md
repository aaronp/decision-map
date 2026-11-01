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

## The chart

The Map view shows the focused claim's facts as columns, sorted from most contrary to most supporting. Colour is impact, and width is share of importance. There are three views: *Width only*, *Wide and tall*, and *Area is the score*.

- **Change importance** by dragging a divider. *Scale all the others* lets you drag as far as you like, and the rest scale to fit. *Trade with chosen columns* is zero-sum: ⌘-click or Shift-click columns to mark them, or it trades with the column across the divider.
- **Change impact** by dragging a column up or down.
- **Click a column** to see and edit it in the details panel, add child factors, or **Open** it as its own chart.

Dividers also take the left and right arrow keys, and columns the up and down keys. On touch screens, edit importance and impact in the details panel.

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
| _(none)_ | The Open panel (drop, choose, URL or recent file), or start a new map |
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
