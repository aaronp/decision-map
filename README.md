# [Decision map](https://aaronp.github.io/argument-map/)

This tool was created to help solve [wicked problems](https://en.wikipedia.org/wiki/Wicked_problem) by:
 - helping people capture their rationale
 - exposing a visual of that raionale for others to see and contribute to
 - providing a 'diff' view so people can identify areas they've not thought of or weight differently

[View Here](https://aaronp.github.io/argument-map/)


This is based on the excellent [https://www.kialo-edu.com/](https://www.kialo-edu.com/) and research into:

 - [issue-based information system (IBIS)])(https://en.wikipedia.org/wiki/Issue-based_information_system)
 - [bayesian networks](https://en.wikipedia.org/wiki/Bayesian_network)
 - [analysis of competing hypothesis](https://en.wikipedia.org/wiki/Analysis_of_competing_hypotheses)


# Using it

The data source for this is just markdown.

You can create your own markdown files locally, or host them online in whatever way you wish.

This tool simply provides a convenient way to edit and visualise that data, separate from the data itself.

If you use git (github), you can clone an 'example' project which is a minimal repo for hosting the content.

Simply use `make clone` and then push your saved argument markdown into whatever git repo you like.

## Run it

```sh
make dev          # http://localhost:8000 (needs bun)
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

- **OpenRouter** key → **Research** next to *Add evidence* on a pro or con:
  a web search for sources, each offered to add as evidence. Only sources the
  search actually cited are offered.
- **typesafe.ai** (Jev) key → **Check rationale** on a claim with pros or
  cons: Jev's confidence that the pros, taken together, give good reason to
  accept the claim, and the cons to reject it. Needs `make dev` (the proxy).

## Examples

`examples/votes-at-16` is a slim data repo: the markdown plus an
`index.html` that redirects to the published mapper with `?src=` pointing at
it. `make clone REPO=you/your-repo` there copies it into a new repo.
