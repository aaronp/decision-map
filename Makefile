PORT ?= 8000

.PHONY: dev check
check:
	@bun check.js

dev:
	@echo "Example: http://localhost:$(PORT)/?src=examples/votes-at-16/map.md"
	@echo "Compare: http://localhost:$(PORT)/?src=examples/votes-at-16/map.md&theirs=examples/votes-at-16/obi.md"
	@PORT=$(PORT) bun dev.js
