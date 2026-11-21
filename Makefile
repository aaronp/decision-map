PORT ?= 8000

.PHONY: dev check dist publish bump-patch bump-minor bump-major
check:
	@bun check.js

dev:
	@echo "Example: http://localhost:$(PORT)/?src=examples/votes-at-16/map.md"
	@echo "Compare: http://localhost:$(PORT)/?src=examples/demo/sam.md&theirs=examples/demo/priya.md&view=compare"
	@PORT=$(PORT) bun dev.js

# Packs the `decision-map` CLI into pritzlaff-decision-map-<version>.tgz (install with: npm i -D ./pritzlaff-decision-map-*.tgz)
dist: check
	npm pack

# Bumps package.json, commits and tags v<version> (needs a clean tree)
bump-patch bump-minor bump-major:
	npm version $(@:bump-%=%)

# Publishes @pritzlaff/decision-map to npm. Bump first: make bump-patch|bump-minor|bump-major
publish: check
	npm publish
