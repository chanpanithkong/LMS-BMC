import { connection, type NextRequest, NextResponse } from "next/server";
import { handle } from "@/mocks/server/router";

/** Demonstration API. Disabled when the app is pointed at a real backend. */
async function route(request: NextRequest, { params }: RouteContext<"/api/mock/v1/[...path]">) {
  await connection();
  if (process.env.NEXT_PUBLIC_API_MODE === "live") return NextResponse.json({ detail: "Mock API disabled" }, { status: 404 });
  const { path } = await params;
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";
  const result = handle(request.method, path, query, body, request.headers, ip, request.cookies.get("lms_mock_refresh")?.value);
  const response = result.status === 204 ? new NextResponse(null, { status: 204 }) : NextResponse.json(result.body, { status: result.status });
  if (result.setCookie) response.headers.set("Set-Cookie", result.setCookie);
  return response;
}

export { route as GET, route as POST, route as PATCH };
