# Generic tree tool: the design prototype becomes the app

Date: 2026-11-21

## Intent

Decision map becomes a general tree-hierarchy tool: mind maps, decision trees, opportunity
matrices, anything shaped as a tree of nodes. The mockup in `design/Main.dc.html` is the product.
It replaces the current `index.html`. A few things we already have are brought into it: the Pie
view, the Questionnaire view (today's focus view, "what are you deciding"), themes, and Compare.
Two new things are added: named maps saved in the browser, and share links.

Why: the old app was built around one kind of argument (importance, signed impact, decision
records), and the owner wants one tool that suits any tree. Maps should be shareable as a single
URL, and other people's maps should be able to sit inside yours as children that load only when
they're expanded.

## Goals

- Every node has the same parts: **title, description (note), x, y, tags, refs**. Nothing else.
- **x** and **y** are optional values from 0 to 1. Users name them in Settings → Dimensions. New
  maps start with sensible names (see Defaults).
- **Refs** are URLs to other maps, shown as read-only children that are collapsed and load
  lazily. A ref can be a `.md` URL or a share link.
- **Share link:** the whole map is compressed into the URL fragment, so no server is needed.
- **Saved maps:** named maps kept in IndexedDB. You can save, open, rename and delete them.
- **Views**, all in the design's View menu: Radial, Tree, Directory (from the design), plus
  Questionnaire, Pie and Compare (moved over from the current app).
- **Themes**, in the Settings drawer.
- Undo and redo for every edit (the current app has them; the prototype doesn't).

## Non-goals

- Decision records, in every form: the template, the Record/Overview screens, goal/criteria/option
  scoring, what-if weights, and record snapshots.
- Special point fields: slug, by, basis, confidence, evidence, premises, `kind:`. Evidence is now
  a child node tagged e.g. `evidence`, and the rest go in tags or the description.
- AI helpers (Research, Check rationale), with their key settings, and the `/typesafe` proxy in
  `dev.js`.
- Converting old-format files (heading format or `[+]` list format). The examples in `examples/`
  are rewritten by hand in the new format.
- Any server or backend.

## Anti-goals

- Bringing old-model ideas into the new views (signed impact, premises, slugs) because it's easier
  than adapting them. If a moved view still needs one of them, it hasn't been moved yet.
- Splitting the app into several files or adding a build step. It stays a single-file DC component
  on the existing runtime.
- Share links that quietly drop data. Anything the file format holds must round-trip through a
  share link.

## Constraints

- Runtime: the DC runtime (`support.js`, `vendor/react*.js`). The design's `support.js` is a newer
  build than the repo's, so the design's version replaces the root one.
- One file: `index.html` holds the template and the logic class, as it does now.
- `make check` (bun, no browser) tests the pure logic, as it does now. `check.js` is rewritten for
  the new model.
- Published by GitHub Pages from `master`/`main`. That's static hosting only, so refs to other
  sites need CORS, as `?src=` does today.

## Approaches considered

- **A. The prototype becomes `index.html`, and our views move into it (chosen).** It starts from
  the UI the owner prefers. Each old view is adapted to the generic node model as it comes across.
  Nothing from the old code comes along unless it was chosen.
- B. Restyle the current `index.html` to look like the prototype. Rejected: the old data model is
  in every view, so most of the work would be removing things, and the prototype's
  radial/tree/directory views and tag system would still have to be moved in.
- C. Split into separate files per view. Rejected: neither codebase works that way, and it's an
  unrequested refactor.

## Decisions made with the owner

- The generic x/y model, named by the user, with defaults.
- The prototype's node model as it stands: title, note, x, y, tags, refs.
- Evidence and similar concepts become tagged child nodes.
- Refs are lazily expanded children. Share links compress and base64 the data.
- Decision records are removed.
- Pie, Questionnaire, themes, IndexedDB saved maps and Compare are added. Then the prototype
  replaces what we have.

## The design

### File format

This is the prototype's format (see `parseMap` in `design/Main.dc.html`), plus front matter for
map-level settings:

```markdown
---
x: Importance
y: Support
color: y
theme: paper
tag.evidence: fill #ECE1F7; border #B4500A dashed; opacity 0.6
---

# Should we adopt X? #core {x:1}
Free text under a node is its description.
@ https://example.org/someone-elses-map.md

- Faster onboarding {x:0.8 y:0.9}
  Description lines sit two spaces in, under their node.
  - Survey of 40 new hires #evidence
    https://example.org/survey
- Migration cost #risk {x:0.6 y:0.2}
```

- Front matter keys:
  - dimension names (`x`, `y`)
  - which dimension drives colour (`color`); the other drives size
  - the colour mode (scale or left/right, with its two colours) and reverse
  - `theme`
  - one `tag.<name>` line per styled tag
- The exact front matter syntax is the builder's call. Unknown keys are an error, as in the
  prototype's style.
- **A serializer is new work.** `parseMap(serialize(m))` must equal `m` for every map, including
  notes, tags, refs, unset values and front matter. Multi-line descriptions need a defined
  form: today the parser joins description lines with spaces. The builder picks a form that keeps
  line breaks and still round-trips.

### Defaults for a new map

- x = **Importance**, y = **Support** (0 against · 0.5 neutral · 1 for).
- Colour = y, size = x.
- Theme Paper.
- One tag style: `evidence`.

### Views (View menu)

The **colour dimension** and the **size dimension** come from the existing Color & size setting
and are used in every view:

| View | Size dimension | Colour dimension |
|---|---|---|
| Radial / Tree / Directory | as in the prototype | as in the prototype |
| Questionnaire | column width | column colour and left→right sort |
| Pie | slice angle | slice colour |
| Compare | — | — (compares both x and y) |

**Colour setting** (Settings → Color & size, saved in front matter):
- **Mode** is one of:
  - **Scale:** the design's single-hue ramp, light to dark (the default, as in the prototype).
  - **Left/right:** a left colour at 0 and a right colour at 1, passing through neutral at 0.5.
    Defaults are red on the left and green on the right.
- **Reverse** flips either mode, for values where higher is worse, like price.
- Tag fills and borders still come from tag styles, as in the prototype, and take precedence over
  the value colour where the prototype already does that.

**Values from children** (low priority, build last): one rule used everywhere, the prototype's
`effective()`.
- An unset value is the mean of its children's values. That includes the children of a ref, once
  it's loaded.
- Where a view needs a number for an unset value, it uses 0.5.
- The Questionnaire's health bar shows the node's derived colour value.
- **Recalculate** sets the node's own colour value to the mean of its children's.
- No weighted score. Refs never load by themselves (see Refs), so derived values only change when
  someone clicks to open a ref.

**Questionnaire** is today's focus view, moved over:
- One node at a time: breadcrumbs, title and description, the health bar (score), the children
  as the bar, and rows of every level below.
- The **+** on the left adds a child with colour value 0.25, and the **+** on the right adds one
  with 0.75. With no children there's one **+**, which adds a child with no values set.
- **Recalculate** sets the node's own colour value to its score.
- Dragging a divider changes the size value. Dragging a column up or down changes the colour
  value. Ctrl/⌘/Shift-click (or **L**) chooses the columns a resize changes. Pin and the three
  chart modes work as they do now.
- Reading the current implementation is part of the work.

**Pie** is today's pie, moved over: rings by depth, slices sized by the size value, edit mode with
⇔ handles, choosing slices, pin, and + beside slices.

**Ref children** in Questionnaire and Pie are shown read-only, collapsed until they're opened,
the same as in the prototype's views.

**Compare** is today's diff view, moved over. Map A is the open map. Map B can be:
- a file
- a URL
- a share link
- a saved map

*(Builder's call)* Compare uses the same size and colour dimensions as the other views. Sankey
flow width is the size value, and flow colour is the colour value. "Changed" means either value
moved, and "flipped" (only in Left/right mode) means the colour value crossed 0.5. The Table lists
both x and y by their names. Compare runs on what's loaded: unopened refs on either side are
listed as refs and never fetched.

Nodes are matched by their **title path**: titles from the root down, trimmed and lower-cased.
Compare shows differences in x and y, biggest first, plus nodes found only in A or only in B. The
current Sankey, Structure and Table tabs move over, using x/y in place of importance/impact.

`?theirs=` keeps opening Compare with B loaded.

### Refs

- The prototype's model: `composeGraph` with `refLoads`, read-only nodes, a status of
  loading/loaded/error, and retry/remove on the ref root.
- **Replace the stand-in `REF_LIBRARY`** with real loading:
  - A URL whose fragment holds a share payload is decoded locally, whatever its host.
  - Any other http(s) URL is fetched as markdown.
- Loading happens **only when the user clicks to expand that ref node**. No view, Compare,
  search, export or startup step ever loads a ref by itself. This is so the app never pulls in a
  chain of maps on its own.
- *(Builder's call)* A loaded ref's values are shown under the host map's dimension names. Its
  own tag styles are used only to draw its nodes, and are kept with the ref's load state. They are
  never copied into the host's `tagStyles`, so opening a ref never changes the saved file.
- Refs inside a loaded ref are themselves refs and load lazily in turn.
- Guard against cycles: a URL already among a node's ancestors shows as an error, not a load.

### Share link

- `#m=` + base64url(deflate-raw(serialized markdown)), using the browser's built-in
  `CompressionStream` / `DecompressionStream`. No library.
- Loading a page with `#m=…` opens that map.
- A **Share** button copies the link.
- Refs stay as URLs inside the payload and are never embedded.
- If the link is longer than about 8,000 characters, the copy still works but shows a warning.
  Some chat apps cut long links short. That size is the owner's to revisit.

### Saved maps (IndexedDB)

- One object store, keyed by **name**. Each record holds the serialized markdown and an updated
  time.
- **Save as…** names the current map.
- Once a map has a name, edits autosave to it, 1.5 s after the last change, as autosave does now.
- **Open…** lists saved maps, most recently updated first, with rename and delete. It also
  accepts:
  - a dropped or chosen file
  - a URL
  - a share link
- **Download** saves a `.md` copy.
- *(Builder's call)* **Startup:**
  - With no `#m=` or `?src=`, the page opens the most recently updated saved map, or a new map
    with the defaults if there are none.
  - Opening a share link or URL while the current map has unsaved changes and no name asks
    first: "Discard changes?" A named map has already been autosaved.
- Unsaved maps are marked with an asterisk, as now.

### Themes

- The current THEMES: Paper, Slate, Night and High contrast.
- The prototype's hard-coded colours become CSS variables so a theme recolours everything.
- The theme is stored in the front matter. `?theme=` overrides it for one link, as now.
- **Accents are dropped.** The design's blue is the only accent.

### URL parameters

| Parameter | Effect |
|---|---|
| `#m=` | The map inside the link |
| `?src=` | A map loaded from a URL |
| `?theirs=` | Map B for Compare |
| `?view=` | The view to open |
| `?theme=` | Overrides the map's theme |

- `?focus=` is dropped, because nodes no longer have stable ids. The address bar keeps `view` up
  to date.

### Undo and redo

The current app's snapshot-based history, covering every edit to the map and its settings. A drag
is one step, and ⌘Z / ⌘⇧Z work as now.

### What's deleted

- In `index.html`, everything not listed above.
- `check-fixtures/` (old formats).
- The `/typesafe` proxy in `dev.js`.
- The README sections on decision records, the old format and the AI helpers. The README is
  rewritten for the new tool.
- `design/` is removed once its content is in `index.html`. It stays in git history.

## Left to the builder

- The exact front matter syntax for tag styles.
- The serialized form for multi-line descriptions.
- The order in which views are moved over.
- How the old views' layout code is reshaped to fit the prototype's header and bottom node panel.
- Visual details of the Open…, Save as… and Share controls, in the prototype's style: pill
  buttons, `#2A4BD7`, and the Inter and JetBrains Mono fonts.
- Which logic is worth checking in `check.js`. At minimum:
  - the parse ↔ serialize round trip
  - share encode ↔ decode
  - score
  - Compare matching
  - ref cycle detection
