module github.com/tupe12334/ameliso/mcp

go 1.26.1

tool github.com/redpanda-data/protoc-gen-go-mcp/cmd/protoc-gen-go-mcp

require (
	connectrpc.com/connect v1.18.1
	github.com/modelcontextprotocol/go-sdk v1.4.1
	github.com/redpanda-data/protoc-gen-go-mcp v0.0.0-20260430225748-67e0bd25a988
	github.com/tupe12334/ameliso/local-auth v0.0.0
	google.golang.org/grpc v1.67.1
	google.golang.org/protobuf v1.36.9
)

replace github.com/tupe12334/ameliso/local-auth => ../local-auth

require (
	al.essio.dev/pkg/shellescape v1.5.1 // indirect
	buf.build/gen/go/bufbuild/protovalidate/protocolbuffers/go v1.36.9-20250912141014-52f32327d4b0.1 // indirect
	buf.build/gen/go/redpandadata/common/protocolbuffers/go v1.34.2-20240917150400-3f349e63f44a.2 // indirect
	github.com/danieljoos/wincred v1.2.2 // indirect
	github.com/godbus/dbus/v5 v5.1.0 // indirect
	github.com/google/jsonschema-go v0.4.2 // indirect
	github.com/redpanda-data/common-go/api v0.0.0-20250801174835-9eea07f1ea06 // indirect
	github.com/segmentio/asm v1.1.3 // indirect
	github.com/segmentio/encoding v0.5.4 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	github.com/zalando/go-keyring v0.2.6 // indirect
	golang.org/x/net v0.49.0 // indirect
	golang.org/x/oauth2 v0.34.0 // indirect
	golang.org/x/sys v0.40.0 // indirect
	golang.org/x/text v0.33.0 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20250218202821-56aae31c358a // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20250212204824-5a70512c5d8b // indirect
)
