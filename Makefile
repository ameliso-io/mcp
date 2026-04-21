.PHONY: install build test fmt lint spell pre-commit pre-push dev

dev: install build
	@trap 'kill 0' SIGINT SIGTERM; \
	(cargo run -p ameliso-server; kill 0) & \
	(cd web && pnpm dev; kill 0) & \
	wait

install:
	pnpm install
	cd web && pnpm install
	cargo fetch

build:
	cargo build --release

test:
	cargo test

fmt:
	cargo fmt --all

lint:
	cargo clippy --all -- -D warnings
	cd server && buf lint

spell:
	pnpm cspell --no-progress "**/*.{rs,ts,tsx,proto,toml,md,yaml,yml}" Makefile

# --- Git hooks (called by Husky) ---

pre-commit: fmt lint spell
	@echo "pre-commit: OK"

pre-push: build test
	@echo "pre-push: OK"
