package main

import (
	"context"
	"fmt"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/redpanda-data/protoc-gen-go-mcp/pkg/runtime/gosdk"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1"
	amelisomcp "github.com/tupe12334/ameliso/mcp/gen/ameliso/v1/amelisomcp"
)

func main() {
	addr := os.Getenv("AMELISO_GRPC_ADDR")
	if addr == "" {
		addr = "localhost:50052"
	}
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
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
