.PHONY: install build test fmt lint spell pre-commit pre-push

install:
	pnpm install
	cd server && cargo fetch

build:
	cd server && cargo build --release

test:
	cd server && cargo test

fmt:
	cd server && cargo fmt

lint:
	cd server && cargo clippy -- -D warnings
	cd server && buf lint

spell:
	@echo "spell check: not yet configured"

# --- Git hooks (called by Husky) ---

pre-commit: fmt lint
	@echo "pre-commit: OK"

pre-push: build test
	@echo "pre-push: OK"
