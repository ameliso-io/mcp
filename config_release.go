//go:build release

package main

// Declared here so that `go build` without -tags release fails with
// "undefined: grpcAddr / apiURL" — forcing release builds to use this tag.
// Values are injected at link time via -ldflags "-X main.grpcAddr=... -X main.apiURL=..."
var (
	grpcAddr string
	apiURL   string
)
