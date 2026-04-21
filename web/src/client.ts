import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { AmelisoService } from "./gen/ameliso/v1/service_pb.js";

const transport = createGrpcWebTransport({
  baseUrl: typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "") : "",
});

export const client = createClient(AmelisoService, transport);
