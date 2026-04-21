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
- `pre-commit`: `cargo fmt` + `cargo clippy`
- `pre-push`: `cargo build --release` + `cargo test`

## Project structure

| Directory | Purpose |
|-----------|---------|
| `server/` | gRPC server (tonic 0.12). Implements `AmelisoService` (13 RPCs). |
| `mcp/` | MCP server (rmcp 1.5, stdio). Wraps all 13 RPCs as MCP tools. |
| `cli/` | CLI binary (clap 4). Wraps all 13 RPCs as subcommands. |
| `proto/` | Protobuf definitions for `AmelisoService`. |
| `web/` | Browser client (gRPC-web). Not yet implemented. |

## Engineering constraints

- **Language**: Rust for all backend logic. TypeScript only for UI (`web/`).
- **Service communication**: gRPC only. No REST or WebSocket between services.
- **Package manager**: `pnpm` only. Never `npm install` or `yarn`.
- **No logic duplication**: repo logic lives in `server/src/repo.rs` and is
  imported by both `mcp/` and `cli/` via the `ameliso-server` lib crate.
- **No panics**: use `anyhow::Result` and `?`. No `unwrap()` or `expect()` in
  production code paths.

## Running tests

```sh
cargo test                   # all workspace tests
cargo test -p ameliso-server # server + integration tests only
```

## Proto changes

Proto files live in `server/proto/ameliso/v1/`. After editing:

```sh
cd server && buf lint         # lint proto schema
cargo build -p ameliso-server # regenerates Rust bindings via build.rs
```

Do not commit generated files from `server/generated/`.

## Adding a new RPC

1. Add request/response messages and the RPC to `service.proto`.
2. Implement the handler in `server/src/service.rs`.
3. Add repo logic in `server/src/repo.rs` if needed.
4. Add a corresponding MCP tool in `mcp/src/main.rs`.
5. Add a corresponding CLI subcommand in `cli/src/main.rs`.
6. Add an integration test in `server/tests/integration.rs`.
