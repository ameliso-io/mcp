export const dynamic = "force-dynamic";
export const runtime = "edge";

export function GET() {
  return Response.json({ status: "ok" });
}
