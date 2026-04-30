package main

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/redpanda-data/protoc-gen-go-mcp/pkg/runtime/gosdk"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	localauth "github.com/tupe12334/ameliso/local-auth/auth"
	pb "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1"
	amelisomcp "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1/amelisomcp"
)

// apiURL is the base URL of the Ameliso HTTP API, set via -ldflags in release
// builds (e.g. https://api.ameliso.io). Override at runtime via AMELISO_API_URL.
// If empty, defaults to http://localhost:8080 (local dev).
var apiURL = ""

// userTokenPrefix is the expected prefix for Ameliso personal access tokens.
// Kept here to surface drift from the server-side constant via TestUserTokenPrefixIsAmPat.
const userTokenPrefix = "am_pat_"

// dynamicBearerCreds attaches `authorization: Bearer <token>` to every RPC
// and allows the token to be swapped at runtime (e.g. after ameliso_login_poll succeeds).
type dynamicBearerCreds struct {
	token atomic.Value // stores string
}

func newDynamicBearerCreds(token string) *dynamicBearerCreds {
	c := &dynamicBearerCreds{}
	c.token.Store(token)
	return c
}

func (c *dynamicBearerCreds) set(token string) { c.token.Store(token) }

func (c *dynamicBearerCreds) GetRequestMetadata(context.Context, ...string) (map[string]string, error) {
	return map[string]string{"authorization": "Bearer " + c.token.Load().(string)}, nil
}

func (c *dynamicBearerCreds) RequireTransportSecurity() bool { return false }

// grpcMinter exchanges an Auth0 access token for an Ameliso PAT.
type grpcMinter struct{ addr string }

func (m *grpcMinter) MintToken(ctx context.Context, auth0AccessToken string) (string, error) {
	tmpCreds := newDynamicBearerCreds(auth0AccessToken)
	conn, err := grpc.NewClient(
		m.addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithPerRPCCredentials(tmpCreds),
	)
	if err != nil {
		return "", fmt.Errorf("grpc dial: %w", err)
	}
	defer conn.Close()

	resp, err := pb.NewAmelisoServiceClient(conn).CreateUserToken(ctx, &pb.CreateUserTokenRequest{
		Name: "mcp",
	})
	if err != nil {
		return "", fmt.Errorf("CreateUserToken: %w", err)
	}
	return resp.GetSecret(), nil
}

type noParams struct{}

func registerAuthTools(raw *mcp.Server, addr string, apiBaseURL string, creds *dynamicBearerCreds) {
	minter := &grpcMinter{addr: addr}

	// pending holds an in-progress device flow between ameliso_login and ameliso_login_poll calls.
	var (
		pendingMu sync.Mutex
		pending   *localauth.PendingLogin
	)

	mcp.AddTool(raw, &mcp.Tool{
		Name: "ameliso_login",
		Description: "Start an Ameliso login flow. Opens the user's browser and returns a " +
			"verification URL and code to display. After showing the user the URL, call " +
			"ameliso_login_poll repeatedly (every 5 seconds) until it reports success.",
	}, func(_ context.Context, _ *mcp.CallToolRequest, _ noParams) (*mcp.CallToolResult, any, error) {
		// Fetch Auth0 config from server; non-fatal if server unreachable
		// (env vars / ldflags defaults act as fallback).
		_ = localauth.FetchAuthConfig(apiBaseURL)

		p, err := localauth.StartLogin()
		if err != nil {
			return nil, nil, fmt.Errorf("starting login: %w", err)
		}
		pendingMu.Lock()
		pending = p
		pendingMu.Unlock()

		msg := fmt.Sprintf(
			"Browser opened. Ask the user to visit:\n\n  %s\n\nOr go to %s and enter code: %s\n\nThen call ameliso_login_poll every %s until it reports success.",
			p.VerificationURIComplete, p.VerificationURI, p.UserCode, p.Interval(),
		)
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: msg}}}, nil, nil
	})

	mcp.AddTool(raw, &mcp.Tool{
		Name: "ameliso_login_poll",
		Description: "Poll for completion of an in-progress Ameliso login flow started by ameliso_login. " +
			"Returns 'pending' if the user has not yet authenticated, or 'success' once done. " +
			"Call once every 5 seconds until success.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ noParams) (*mcp.CallToolResult, any, error) {
		pendingMu.Lock()
		p := pending
		pendingMu.Unlock()

		if p == nil {
			return nil, nil, fmt.Errorf("no login in progress; call ameliso_login first")
		}

		pat, done, err := p.Poll(ctx, minter)
		if err != nil {
			pendingMu.Lock()
			pending = nil
			pendingMu.Unlock()
			return nil, nil, err
		}
		if !done {
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "pending"}}}, nil, nil
		}

		creds.set(pat)
		pendingMu.Lock()
		pending = nil
		pendingMu.Unlock()
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "success: logged in and token saved to keychain"}}}, nil, nil
	})

	mcp.AddTool(raw, &mcp.Tool{
		Name: "ameliso_logout",
		Description: "Log out from Ameliso by deleting the stored token from the OS keychain " +
			"and file fallback. Call ameliso_login to authenticate again.",
	}, func(_ context.Context, _ *mcp.CallToolRequest, _ noParams) (*mcp.CallToolResult, any, error) {
		if err := localauth.DeleteToken(); err != nil {
			return nil, nil, fmt.Errorf("logout: %w", err)
		}
		creds.set("")
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "Logged out. Stored token removed from keychain."}}}, nil, nil
	})
}

func resolveAPIURL() string {
	if v := os.Getenv("AMELISO_API_URL"); v != "" {
		return v
	}
	if apiURL != "" {
		return apiURL
	}
	return "http://localhost:8080"
}

func main() {
	addr := os.Getenv("AMELISO_GRPC_ADDR")
	if addr == "" {
		addr = "localhost:50052"
	}

	// Non-interactive: read stored token from env/keychain/file.
	// If none found, start unauthenticated — the LLM should call ameliso_login.
	token, _ := localauth.ReadToken()
	creds := newDynamicBearerCreds(token)

	conn, err := grpc.NewClient(
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithPerRPCCredentials(creds),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: grpc dial: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	raw, s := gosdk.NewServer("ameliso", "1.0.0")
	amelisomcp.ForwardToAmelisoServiceClient(s, pb.NewAmelisoServiceClient(conn))
	registerAuthTools(raw, addr, resolveAPIURL(), creds)

	if err := raw.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: %v\n", err)
	}
}
