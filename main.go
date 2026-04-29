package main

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/redpanda-data/protoc-gen-go-mcp/pkg/runtime/gosdk"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	localauth "github.com/tupe12334/ameliso/local-auth/auth"
	pb "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1"
	amelisomcp "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1/amelisomcp"
)

// auth0ClientID and auth0Audience are set via -ldflags in release builds.
var (
	auth0ClientID = ""
	auth0Audience = ""
)

// userTokenPrefix is the expected prefix for Ameliso personal access tokens.
// Kept here to surface drift from the server-side constant via TestUserTokenPrefixIsAmPat.
const userTokenPrefix = "am_pat_"

// dynamicBearerCreds attaches `authorization: Bearer <token>` to every RPC
// and allows the token to be swapped at runtime (e.g. after ameliso_login).
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

// grpcMinter exchanges an Auth0 access token for an Ameliso PAT by calling
// CreateUserToken on a temporary gRPC connection authenticated with the Auth0 JWT.
type grpcMinter struct{ addr string }

func (m *grpcMinter) MintToken(ctx context.Context, auth0AccessToken string) (string, error) {
	// Temporary connection authenticated with the Auth0 JWT (not the PAT).
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

func registerAuthTools(raw *mcp.Server, addr string, creds *dynamicBearerCreds) {
	minter := &grpcMinter{addr: addr}

	mcp.AddTool(raw, &mcp.Tool{
		Name:        "ameliso_login",
		Description: "Log in to Ameliso via browser. Runs the Auth0 Device Authorization Flow, mints a personal access token, and saves it to the OS keychain. Updates the current session immediately — no reconnect needed.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ noParams) (*mcp.CallToolResult, any, error) {
		// Force a fresh login regardless of any cached token.
		if err := localauth.DeleteToken(); err != nil {
			return nil, nil, fmt.Errorf("clearing existing token: %w", err)
		}
		token, err := localauth.EnsureToken(ctx, minter)
		if err != nil {
			return nil, nil, fmt.Errorf("login: %w", err)
		}
		creds.set(token)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: "Logged in successfully. Token saved to keychain."}},
		}, nil, nil
	})

	mcp.AddTool(raw, &mcp.Tool{
		Name:        "ameliso_logout",
		Description: "Log out from Ameliso by deleting the stored token from the OS keychain and file fallback. The current session's token remains active until it expires or is revoked via the Ameliso dashboard.",
	}, func(_ context.Context, _ *mcp.CallToolRequest, _ noParams) (*mcp.CallToolResult, any, error) {
		if err := localauth.DeleteToken(); err != nil {
			return nil, nil, fmt.Errorf("logout: %w", err)
		}
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: "Logged out. Stored token removed from keychain."}},
		}, nil, nil
	})
}

func main() {
	if auth0ClientID != "" {
		localauth.DefaultAuth0ClientID = auth0ClientID
	}
	if auth0Audience != "" {
		localauth.DefaultAuth0Audience = auth0Audience
	}

	addr := os.Getenv("AMELISO_GRPC_ADDR")
	if addr == "" {
		addr = "localhost:50052"
	}

	ctx := context.Background()
	token, err := localauth.EnsureToken(ctx, &grpcMinter{addr: addr})
	if err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: auth: %v\n", err)
		os.Exit(1)
	}

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
	registerAuthTools(raw, addr, creds)

	if err := raw.Run(ctx, &mcp.StdioTransport{}); err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: %v\n", err)
	}
}
