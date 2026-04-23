.PHONY: install build test test-server lint spell coverage-check pre-commit pre-push dev db-up db-down

dev: install
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
	cd web && pnpm build

test:
	cd server && cargo test


coverage-check:
	cd server && cargo llvm-cov -p ameliso-server --ignore-filename-regex main.rs --fail-under-lines 85

lint:
	cd server && cargo clippy --all -- -D warnings
	cd server && buf lint

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

pre-commit:
	$(MAKE) lint
	@echo "pre-commit: OK"

pre-push:
	@echo "pre-push: OK"
