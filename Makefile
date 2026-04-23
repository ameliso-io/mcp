.PHONY: install build test fmt lint spell check-file-size pre-commit pre-push dev coverage-check db-up db-down

dev: install build
	@trap 'docker compose stop; kill 0' SIGINT SIGTERM; \
	docker compose up -d --wait && \
	until bash -c 'echo > /dev/tcp/localhost/5432' 2>/dev/null; do sleep 0.5; done && \
	(cd server && cargo run; kill 0) & \
	(cd web && pnpm dev; kill 0) & \
	wait

install:
	git submodule update --init --recursive
	pnpm install
	cd web && pnpm install
	cd server && cargo fetch

build:
	cd server && cargo build --release
	cd web && pnpm build

test:
	cd server && cargo test
	cd web && pnpm test
	cd web && pnpm test:typecheck

coverage-check:
	cd server && cargo llvm-cov --ignore-filename-regex main.rs --fail-under-lines 85
	cd web && pnpm test:coverage

fmt:
	cd server && cargo fmt --all
	cd web && pnpm fmt

fmt-check:
	cd server && cargo fmt --all -- --check
	cd web && pnpm fmt:check

lint:
	cd server && cargo clippy --all -- -D warnings
	cd server && buf lint
	cd web && pnpm lint

spell:
	pnpm cspell --no-progress "**/*.{rs,ts,tsx,proto,toml,md,yaml,yml}" Makefile

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

# --- Git hooks (called by Husky) ---

check-file-size:
	@LIMIT=1500; FAILED=0; \
	for file in $$(find . \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' \) -not -path '*/target/*' -not -path './.claude/*' -not -path '*/node_modules/*' -not -path '*/gen/*' -not -name '*.d.ts'); do \
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
