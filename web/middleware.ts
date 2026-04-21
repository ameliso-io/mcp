import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const installationId = searchParams.get("installation_id");
  if (installationId) {
    return NextResponse.redirect(
      new URL(`/repositories?installation_id=${installationId}`, request.url)
    );
  }
  return NextResponse.redirect(new URL("/overview", request.url));
}

export const config = {
  matcher: ["/"],
};
