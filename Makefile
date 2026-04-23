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
	@LIMIT=4000; FAILED=0; \
	for file in $$(find . -name '*.rs' -not -path './target/*' -not -path './.claude/*'); do \
		lines=$$(wc -l < "$$file"); \
		if [ "$$lines" -gt "$$LIMIT" ]; then \
			echo "ERROR: $$file has $$lines lines (limit: $$LIMIT)"; \
			FAILED=1; \
		fi; \
	done; \
	[ "$$FAILED" -eq 1 ] && exit 1 || true

pre-commit:
	@FAIL=0; \
	$(MAKE) fmt-check & PID1=$$!; \
	$(MAKE) lint & PID2=$$!; \
	$(MAKE) spell & PID3=$$!; \
	$(MAKE) check-file-size & PID4=$$!; \
	wait $$PID1 || FAIL=1; \
	wait $$PID2 || FAIL=1; \
	wait $$PID3 || FAIL=1; \
	wait $$PID4 || FAIL=1; \
	[ "$$FAIL" -eq 0 ] && echo "pre-commit: OK" || exit 1

pre-push:
	@FAIL=0; \
	$(MAKE) fmt-check & PID1=$$!; \
	$(MAKE) build & PID2=$$!; \
	wait $$PID1 || FAIL=1; \
	wait $$PID2 || FAIL=1; \
	$(MAKE) test & PID3=$$!; \
	$(MAKE) coverage-check & PID4=$$!; \
	wait $$PID3 || FAIL=1; \
	wait $$PID4 || FAIL=1; \
	[ "$$FAIL" -eq 0 ] && echo "pre-push: OK" || exit 1
