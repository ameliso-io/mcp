package main

import (
	"context"
	"strings"
	"testing"
)

func TestDynamicBearerCredsAttachesAuthorizationHeader(t *testing.T) {
	creds := newDynamicBearerCreds("am_pat_deadbeef")
	md, err := creds.GetRequestMetadata(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := md["authorization"]; got != "Bearer am_pat_deadbeef" {
		t.Fatalf("authorization header = %q, want Bearer am_pat_deadbeef", got)
	}
}

func TestDynamicBearerCredsTokenSwap(t *testing.T) {
	creds := newDynamicBearerCreds("am_pat_old")
	creds.set("am_pat_new")
	md, err := creds.GetRequestMetadata(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := md["authorization"]; got != "Bearer am_pat_new" {
		t.Fatalf("after swap: authorization header = %q, want Bearer am_pat_new", got)
	}
}

func TestDynamicBearerCredsAllowsInsecureTransport(t *testing.T) {
	// MCP runs over a local insecure connection by default; require_transport_security
	// would refuse to attach the Bearer in that case.
	creds := newDynamicBearerCreds("")
	if creds.RequireTransportSecurity() {
		t.Fatal("RequireTransportSecurity should be false for stdio MCP")
	}
}

// Surfaces drift if userTokenPrefix is renamed away from the server-side
// constant. Keeping the values in sync matters for the AMELISO_TOKEN warning.
func TestUserTokenPrefixIsAmPat(t *testing.T) {
	if !strings.HasPrefix("am_pat_deadbeef", userTokenPrefix) {
		t.Fatalf("userTokenPrefix = %q, want am_pat_", userTokenPrefix)
	}
}
