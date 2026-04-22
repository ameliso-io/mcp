## What Ameliso is

Ameliso is a **git-native manual testing management tool**. It reads and writes
test cases, runs, and results stored as plain Markdown/YAML files in a
*controlled repository* (typically your project's git repo).

The tool itself lives in this repo (`server/`, `mcp/`, `cli/`).
The file formats for controlled repositories are defined in [REPO_STRUCTURE.md](REPO_STRUCTURE.md).

Always follow the guidelines at https://github.com/tupe12334/guidelines when contributing.

## Setup

```sh
pnpm install      # installs Husky git hooks
cargo build       # build all crates
```

Git hooks activate automatically after `pnpm install`:
- `pre-commit`: `make pre-commit` — fmt (Rust + web), clippy, buf lint, web ESLint, cspell
- `pre-push`: `make pre-push` — fmt-check, build, test, coverage check

## Project structure

| Directory | Purpose |
|-----------|---------|
| `server/` | gRPC server (tonic 0.12). Implements `AmelisoService` (25 RPCs). |
| `server/proto/` | Protobuf definitions for `AmelisoService`. |
| `mcp/` | MCP server (rmcp 1.5, stdio). Wraps all 25 RPCs as 21 MCP tools. |
| `cli/` | CLI binary (clap 4). Wraps all RPCs as subcommands. |
| `web/` | Browser client (Next.js 16 App Router + TypeScript). Talks gRPC-Web to the server. |

## Engineering constraints

- **Language**: Rust for all backend logic. TypeScript only for UI (`web/`).
- **Service communication**: gRPC only. No REST or WebSocket between services.
- **Package manager**: `pnpm` only. Never `npm install` or `yarn`.
- **No logic duplication**: repo logic lives in `server/src/repo.rs`. The `mcp/`
  and `cli/` crates currently call the gRPC server directly (they are not in the
  Cargo workspace while the migration from file-based to gRPC-backed is in progress).
- **No panics**: use `anyhow::Result` and `?`. No `unwrap()` or `expect()` in
  production code paths.

## Running tests

```sh
cargo test                   # all workspace tests
cargo test -p ameliso-server # server + integration tests only
```

## Web client development

Run both the gRPC server and the Next.js dev server together:

```sh
pnpm dev       # or: make dev
```

The web client is at http://localhost:3000 and proxies gRPC-Web calls to http://localhost:50052 via `next.config.ts` rewrites.

To regenerate the TypeScript proto bindings after proto changes:

```sh
cd server && buf generate
```

Generated TypeScript files land in `web/src/gen/`. Commit them.

## Proto changes

Proto files live in `server/proto/ameliso/v1/`. After editing:

```sh
cd server && buf lint         # lint proto schema
cargo build -p ameliso-server # regenerates Rust bindings via build.rs
cd server && buf generate     # regenerate TypeScript bindings for web/
```

Do not commit generated files from `server/generated/`.

## Adding a new RPC

1. Add request/response messages and the RPC to `service.proto`.
2. Run `cd server && buf lint && buf generate` — regenerates Rust bindings (via `build.rs`) and TypeScript bindings (`web/src/gen/`). Commit the generated files.
3. Implement the handler in `server/src/service.rs`.
4. Add repo logic in `server/src/repo.rs` if needed.
5. Add a corresponding MCP tool in `mcp/src/main.rs`.
6. Add a corresponding CLI subcommand in `cli/src/main.rs`.
7. Add unit tests for the new handler in `server/src/service.rs` (validation tests + passes-validation test).
8. Update the RPC count in `AGENTS.md`, `README.md`, and `CONTRIBUTING.md`.
