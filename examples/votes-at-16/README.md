# Votes at 16 — argument map

**[▶ View the map](https://aaronp.github.io/arg-map-example/)** ·
[compare with Obi's weighting](https://aaronp.github.io/arg-map-example/?theirs=obi.md)

The data lives in [`map.md`](map.md) (and a second weighting in [`obi.md`](obi.md)).
The UI comes from [aaronp/arg-map](https://github.com/aaronp/arg-map).

## Using this as a template

1. Create an empty repo on GitHub, then from this directory run
   `make clone REPO=you/your-repo` (or `./clone.sh`, which prompts).
   It copies the files to `../your-repo`, points the View link above at
   your Pages site and sets the git remote.
2. Edit `map.md` (or open it in the mapper, edit it there and Download or Save
   it back), then commit and push.
3. On GitHub: Settings → Pages → Source: **GitHub Actions**.

The workflow deploys from `main` or `master`. "Branch … is not allowed to
deploy to github-pages"? Add your branch under Settings → Environments →
github-pages → Deployment branches and tags.

Your site redirects to the mapper with `?src=` pointing at your `map.md`.
Any query params you add are passed on, e.g. `?view=pie`, `?focus=pay-tax`,
`?theme=night` or `?theirs=obi.md`.

No Pages? Link straight to the raw file:
`https://aaronp.github.io/arg-map/?src=https://raw.githubusercontent.com/<you>/<repo>/<branch>/map.md`
