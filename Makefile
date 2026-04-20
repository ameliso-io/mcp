.PHONY: install build test fmt lint spell pre-commit pre-push

install:
	pnpm install
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
	@echo "spell check: not yet configured"

# --- Git hooks (called by Husky) ---

pre-commit: fmt lint
	@echo "pre-commit: OK"

pre-push: build test
	@echo "pre-push: OK"
