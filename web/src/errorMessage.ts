import { ConnectError } from "@connectrpc/connect";

export function errorMessage(e: unknown): string {
  if (e instanceof ConnectError) {
    return e.message || e.rawMessage || String(e);
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
