package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/redpanda-data/protoc-gen-go-mcp/pkg/runtime/gosdk"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1"
	amelisomcp "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1/amelisomcp"
)

const userTokenPrefix = "am_pat_"

// bearerCreds attaches `authorization: Bearer <token>` to every RPC. Used to
// carry an Ameliso personal access token (AMELISO_TOKEN) to the server so the
// gRPC call is authenticated as the human running the MCP client.
type bearerCreds struct{ token string }

func (b bearerCreds) GetRequestMetadata(context.Context, ...string) (map[string]string, error) {
	return map[string]string{"authorization": "Bearer " + b.token}, nil
}

func (bearerCreds) RequireTransportSecurity() bool { return false }

func main() {
	addr := os.Getenv("AMELISO_GRPC_ADDR")
	if addr == "" {
		addr = "localhost:50052"
	}
	dialOpts := []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}
	if token := os.Getenv("AMELISO_TOKEN"); token != "" {
		if !strings.HasPrefix(token, userTokenPrefix) {
			fmt.Fprintf(
				os.Stderr,
				"ameliso-mcp: warning: AMELISO_TOKEN does not start with %q. "+
					"Personal access tokens minted at /account/settings have this "+
					"prefix; the server will reject anything else when Auth0 is "+
					"configured.\n",
				userTokenPrefix,
			)
		}
		dialOpts = append(dialOpts, grpc.WithPerRPCCredentials(bearerCreds{token: token}))
	}
	conn, err := grpc.NewClient(addr, dialOpts...)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: grpc dial: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	raw, s := gosdk.NewServer("ameliso", "1.0.0")
	amelisomcp.ForwardToAmelisoServiceClient(s, pb.NewAmelisoServiceClient(conn))

	// Run blocks until stdin closes (client disconnected). Any returned error
	// indicates session end — log for diagnostics but always exit cleanly.
	if err := raw.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		fmt.Fprintf(os.Stderr, "ameliso-mcp: %v\n", err)
	}
}
