.PHONY: install build test fmt lint spell pre-commit pre-push dev coverage-check db-up db-down

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

coverage-check:
	cargo llvm-cov -p ameliso-server --fail-under-lines 0
	pnpm --filter ameliso-web test:coverage

fmt:
	cargo fmt --all

lint:
	cargo clippy --all -- -D warnings
	cd server && buf lint

spell:
	pnpm cspell --no-progress "**/*.{rs,ts,tsx,proto,toml,md,yaml,yml}" Makefile

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

# --- Git hooks (called by Husky) ---

pre-commit: fmt lint spell
	@echo "pre-commit: OK"

pre-push: build test coverage-check
	@echo "pre-push: OK"
