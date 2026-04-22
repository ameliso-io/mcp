import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const { searchParams } = request.nextUrl;
    const installationId = searchParams.get("installation_id");
    if (installationId) {
      const params = new URLSearchParams({ installation_id: installationId });
      const setupAction = searchParams.get("setup_action");
      if (setupAction) params.set("setup_action", setupAction);
      return NextResponse.redirect(new URL(`/repositories?${params}`, request.url));
    }
    return NextResponse.redirect(new URL("/repositories", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
