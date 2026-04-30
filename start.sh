#!/bin/sh
# Runs the ameliso-mcp binary, rebuilding it first if missing or stale.
# Auth0 values are baked in at build time via ldflags (see Makefile build-mcp).
set -e
dir="$(cd "$(dirname "$0")" && pwd)"
binary="$dir/ameliso-mcp"

stale=0
if [ ! -f "$binary" ]; then
    stale=1
elif [ -n "$(find "$dir" -name '*.go' -newer "$binary" 2>/dev/null)" ]; then
    stale=1
fi

if [ "$stale" = "1" ]; then
    make -C "$dir/.." build-mcp >&2
fi

exec "$binary"
