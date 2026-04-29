package main

import (
	"context"
	"fmt"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/redpanda-data/protoc-gen-go-mcp/pkg/runtime/gosdk"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	localauth "github.com/tupe12334/ameliso/local-auth/auth"
	pb "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1"
	amelisomcp "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1/amelisomcp"
)

// auth0ClientID and auth0Audience are set via -ldflags in release builds.
// They are used as defaults when the corresponding env vars are not set.
var (
	auth0ClientID = ""
	auth0Audience = ""
)

// userTokenPrefix is the expected prefix for Ameliso personal access tokens.
// Kept here to surface drift from the server-side constant via TestUserTokenPrefixIsAmPat.
const userTokenPrefix = "am_pat_"

// bearerCreds attaches `authorization: Bearer <token>` to every RPC.
type bearerCreds struct{ token string }

func (b bearerCreds) GetRequestMetadata(context.Context, ...string) (map[string]string, error) {
	return map[string]string{"authorization": "Bearer " + b.token}, nil
}

func (bearerCreds) RequireTransportSecurity() bool { return false }

// grpcMinter exchanges an Auth0 access token for an Ameliso PAT by calling
// CreateUserToken on a temporary gRPC connection authenticated with the
// Auth0 JWT.
type grpcMinter struct{ addr string }

func (m *grpcMinter) MintToken(ctx context.Context, auth0AccessToken string) (string, error) {
	conn, err := grpc.NewClient(
		m.addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithPerRPCCredentials(bearerCreds{token: auth0AccessToken}),
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

func main() {
	// Forward link-time defaults to local-auth so env vars can still override.
	if auth0ClientID != "" {
		localauth.DefaultAuth0ClientID = auth0ClientID
	}
	if auth0Audience != "" {
		localauth.DefaultAuth0Audience = auth0Audience
	}

	if len(os.Args) == 2 && os.Args[1] == "--logout" {
		if err := localauth.DeleteToken(); err != nil {
			fmt.Fprintf(os.Stderr, "ameliso-mcp: logout: %v\n", err)
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "ameliso-mcp: logged out")
		return
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

	conn, err := grpc.NewClient(
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithPerRPCCredentials(bearerCreds{token: token}),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: grpc dial: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	raw, s := gosdk.NewServer("ameliso", "1.0.0")
	amelisomcp.ForwardToAmelisoServiceClient(s, pb.NewAmelisoServiceClient(conn))

	// Run blocks until stdin closes (client disconnected). Any returned error
	// indicates session end — log for diagnostics but always exit cleanly.
	if err := raw.Run(ctx, &mcp.StdioTransport{}); err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: %v\n", err)
	}
}
