import { NextResponse, type NextRequest } from "next/server";
import { handleAuthBridgeRequest } from "@/services/auth";

export const dynamic = "force-dynamic";

function toNextResponse(result: {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly setCookie?: string;
}): NextResponse {
  const response = NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
  if (result.setCookie) {
    response.headers.set("Set-Cookie", result.setCookie);
  }
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await context.params;
  const result = await handleAuthBridgeRequest({
    method: "GET",
    action,
    requestUrl: request.url,
    headers: request.headers,
    readBodyText: () => Promise.resolve(""),
  });
  return toNextResponse(result);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await context.params;
  const result = await handleAuthBridgeRequest({
    method: "POST",
    action,
    requestUrl: request.url,
    headers: request.headers,
    readBodyText: () => request.text(),
  });
  return toNextResponse(result);
}
