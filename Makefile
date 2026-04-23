.PHONY: install build test fmt lint spell check-file-size pre-commit pre-push dev coverage-check db-up db-down

dev: install build
	@trap 'docker compose stop; kill 0' SIGINT SIGTERM; \
	docker compose up -d --wait && \
	(cargo run -p ameliso-server; kill 0) & \
	(cd web && pnpm dev; kill 0) & \
	wait

install:
	pnpm install
	cargo fetch

build:
	cargo build --release
	pnpm --filter ameliso-web build

test:
	cargo test
	pnpm --filter ameliso-web test
	pnpm --filter ameliso-web test:typecheck

coverage-check:
	cargo llvm-cov -p ameliso-server --ignore-filename-regex main.rs --fail-under-lines 85
	pnpm --filter ameliso-web test:coverage

fmt:
	cargo fmt --all
	pnpm --filter ameliso-web fmt

fmt-check:
	cargo fmt --all -- --check
	pnpm --filter ameliso-web fmt:check

lint:
	cargo clippy --all -- -D warnings
	cd server && buf lint
	pnpm --filter ameliso-web lint

spell:
	pnpm cspell --no-progress "**/*.{rs,ts,tsx,proto,toml,md,yaml,yml}" Makefile

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

# --- Git hooks (called by Husky) ---

check-file-size:
	@LIMIT=5400; FAILED=0; \
	for file in $$(git diff --cached --name-only --diff-filter=ACM | grep '\.rs$$'); do \
		lines=$$(wc -l < "$$file"); \
		if [ "$$lines" -gt "$$LIMIT" ]; then \
			echo "ERROR: $$file has $$lines lines (limit: $$LIMIT)"; \
			FAILED=1; \
		fi; \
	done; \
	[ "$$FAILED" -eq 1 ] && exit 1 || true

pre-commit: fmt lint spell check-file-size
	@echo "pre-commit: OK"

pre-push: fmt-check build test coverage-check
	@echo "pre-push: OK"
