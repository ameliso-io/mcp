//go:build !release

package main

import "os"

// In dev builds, read addresses from environment variables.
var (
	grpcAddr = os.Getenv("AMELISO_GRPC_ADDR")
	apiURL   = os.Getenv("AMELISO_API_URL")
)
