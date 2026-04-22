import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { AmelisoService } from "@/gen/ameliso/v1/service_pb.js";

// Always use "" so requests go through the Next.js rewrite at /ameliso.v1.AmelisoService/*
// The rewrite proxy uses the server-side API_URL env var — never exposed to the browser.
const transport = createGrpcWebTransport({ baseUrl: "" });

export const client = createClient(AmelisoService, transport);
