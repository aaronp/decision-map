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

It works for any tree of ideas: a mind map, a decision tree, an opportunity matrix. The data is just markdown. Keep maps in this browser, download them as `.md` files, host them anywhere, or share a whole map as a link.

## The format

```markdown
---
x: Importance
y: Support
color: y
colorMode: split
colorLeft: #C0392B
colorRight: #1E8449
reverse: false
theme: paper
tag.evidence: fill #E3F1F6; border none solid; opacity 1
---

# Should we move to a four-day week? #core {x:1}
Free text under a node is its description.
@ https://example.org/someone-elses-map.md
- Happier staff {x:0.8 y:0.9}
  - Survey of 40 staff #evidence
    https://example.org/survey
- Client cover on Fridays #risk {y:0.2}
```

- One `#` heading is the root, and `- ` items indented by two spaces per level are its children.
- Every node has a title, an optional description (the lines under it), two optional values **x** and **y** from 0 to 1, tags (`#name` after the title) and refs (`@ url` lines).
- Front matter names the two values (`x:` and `y:`), says which one drives colour (`color:`; the other drives size), the colour mode, the theme and each tag's style. Every key is written on save, and an unknown key is an error.
- A title that would otherwise read as syntax is escaped: `Issue \#12`, `Budget \{draft}`. A description line that starts with `- `, `@ `, `# ` or `\` gets a leading `\`.
- Evidence, sources and the like are just children with a tag, such as `#evidence`.

## Views

The **View** menu in the header:

- **Radial** and **Tree**: the map as a mind map. **Follow** keeps the node you're editing centred, and **Fisheye** fits the whole map, magnified around the selected node.
- **Directory**: the tree as an outline, with the node's details beside it.
- **Questionnaire**: one node at a time, as a question to answer. Breadcrumbs lead back up, and the title and description are editable. The health bar shows the node's colour value, filled in from its children when it has none of its own. Its children are drawn as a bar, with every level below in rows underneath.
  - Width is the size value. Colour, and the order from left to right, follow the colour value.
  - Drag a divider to resize, or drag a column up or down to change its colour value. The arrow keys do both.
  - Ctrl-click, ⌘-click or Shift-click (or **L**) chooses the columns a resize changes.
  - The **+** on the left adds a child at 0.25 and the **+** on the right at 0.75. A node with no children shows one wide **+**.
  - **Recalculate** sets the node's colour value to the mean of its children's.
  - **Pin** keeps the bar where it is, so clicking a column only shows its details.
  - The chart modes are *Width only* (a short bar), *Wide and tall* and *Area is the score*.
- **Pie**: the same tree as rings around the open node. **Edit** turns on the hover buttons: **+** beside a slice adds a sibling, **+** outside a leaf adds a child, and the ⇔ handles resize.
- **Compare**: this map (A) against a second map (B). B can be a copy of this map as it is now, a file, a URL, a share link or a saved map. Nodes are matched by their titles from the root down. There are three tabs:
  - **Table**: every node, biggest change in x or y first, then nodes on one side only.
  - **Structure**: both maps as one tree.
  - **Sankey**: each side split by size, meeting in the middle.

The node panel edits the selected node's title, values, tags, refs and description.

## Colour

Settings → Color & size picks which value drives colour, and how:

- **Scale**: one blue, light to dark.
- **Left / right**: one colour at 0 (red by default), neutral at 0.5, and another colour at 1 (green by default).
- **Reverse** flips either mode, for values where higher is worse, like price.

Tags have their own fill, border and opacity (Settings → Tags), which show on every view.

## Refs: other people's maps as children

A ref is a URL to another map, either a `.md` file or a share link. It shows as a read-only child and **loads only when you click to expand it**, never by itself. A ref to a map that is already open above it shows an error instead of loading again. Once loaded, a ref's values count towards its parent's like any child's. Its tag styles are used to draw it, but are never saved into your file.

## Saving and sharing

- **Save as…** keeps the map in this browser (IndexedDB) under a name. After that, edits save themselves 1.5 s after you stop. An asterisk after the name means unsaved changes. The page opens on the most recently saved map.
- **Open…** lists saved maps, with rename and delete, and takes a dropped file, a chosen file, a URL or a share link.
- **Download** saves a `.md` copy. **New** starts a blank map.
- **Share** copies a link that holds the whole map, compressed after `#m=`. No server is involved. Refs stay as URLs inside it. Links over 8,000 characters still work, but some apps cut them short.
- **Undo and redo** (⌘Z and ⌘⇧Z, or ↶ ↷) cover every edit to the map and its settings. A drag is one step.

## Themes

Paper, Slate, Night and High contrast, under Settings → Theme. The theme is saved in the map's front matter. `?theme=` overrides it for one link.

## Links

| Query | Effect |
|---|---|
| `#m=…` | The map inside a share link |
| `?src=<url>` | Opens that markdown file |
| `?theirs=<url>` | Opens a second map as B and starts on Compare |
| `?view=radial\|tree\|directory\|questionnaire\|pie\|compare` | The view |
| `?theme=paper\|slate\|night\|contrast` | Overrides the map's theme |

A URL must allow cross-origin requests (GitHub Pages and raw.githubusercontent.com do).

Try `?src=examples/votes-at-16/map.md&theirs=examples/votes-at-16/obi.md`.

## Run it

```sh
make dev          # http://localhost:8000 (needs bun)
make check        # logic checks, no browser needed (needs bun)
```

Opening `index.html` from disk won't work: browsers block the scripts over `file://`.

Pushing to `main` or `master` publishes the page to GitHub Pages (`.github/workflows/pages.yml`; one-time setup: Settings → Pages → Source: GitHub Actions).

## Examples

- `examples/votes-at-16` is a slim data repo: two maps and an `index.html` that redirects to the published app with `?src=` pointing at it. `make clone REPO=you/your-repo` there copies it into a new repo.
- `examples/event-store/map.md` is a decision laid out as a tree: goals, criteria under them, and options scored under each criterion.
