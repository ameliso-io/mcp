package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"sync/atomic"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/redpanda-data/protoc-gen-go-mcp/pkg/runtime/gosdk"
	"google.golang.org/grpc"

	localauth "github.com/ameliso-io/local-auth/auth"
	pb "github.com/ameliso-io/mcp/gen/ameliso/v1"
	amelisomcp "github.com/ameliso-io/mcp/gen/ameliso/v1/amelisomcp"
)


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
		localauth.TransportCreds(m.addr),
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
			"ameliso_login_poll repeatedly (every 5 seconds) until it reports success. " +
			"IMPORTANT: the URL must be opened in a regular browser with an active Auth0 session — not incognito and not Playwright isolated context.",
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
			"Browser opened. Ask the user to visit:\n\n  %s\n\nOr go to %s and enter code: %s\n\nIMPORTANT: open the URL in a regular browser where you are already signed in to Auth0 — do NOT use incognito mode or an isolated browser context (e.g. Playwright). Auth0 requires an active session to confirm the device.\n\nThen call ameliso_login_poll every %s until it reports success.",
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

func main() {
	addr, err := localauth.GRPCAddr(grpcAddr)
	if err != nil {
		log.Fatal(err)
	}

	apiBaseURL, err := localauth.APIURL(apiURL)
	if err != nil {
		log.Fatal(err)
	}

	// Non-interactive: read stored token from env/keychain/file.
	// If none found, start unauthenticated — the LLM should call ameliso_login.
	token, _ := localauth.ReadToken()
	creds := newDynamicBearerCreds(token)

	conn, err := grpc.NewClient(
		addr,
		localauth.TransportCreds(addr),
		grpc.WithPerRPCCredentials(creds),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: grpc dial: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	raw, s := gosdk.NewServer("ameliso", "1.0.0")
	amelisomcp.ForwardToAmelisoServiceClient(s, pb.NewAmelisoServiceClient(conn))
	registerAuthTools(raw, addr, apiBaseURL, creds)

	if err := raw.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: %v\n", err)
	}
}
