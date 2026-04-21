.PHONY: install dev build test coverage-check fmt lint spell pre-commit pre-push

install:
	pnpm install
	cargo fetch

dev:
	pnpm dev

build:
	cargo build --release
	pnpm --filter ameliso-web build

test:
	cargo test
	pnpm --filter ameliso-web test

coverage-check:
	pnpm --filter ameliso-web test:coverage

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

pre-push: build test coverage-check
	@echo "pre-push: OK"
