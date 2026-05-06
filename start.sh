#!/bin/sh
# Installs the latest ameliso MCP binary from the public module and runs it.
set -e
GOPRIVATE=github.com/ameliso-io GONOSUMDB=github.com/ameliso-io go install github.com/ameliso-io/mcp@latest >&2
exec "$(go env GOPATH)/bin/mcp"
