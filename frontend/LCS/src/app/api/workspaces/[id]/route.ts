import { NextResponse, type NextRequest } from "next/server";
import { handleWorkspaceDetailBridgeRequest } from "@/services/workspaces";

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
      Vary: "Cookie",
    },
  });
  if (result.setCookie) {
    response.headers.set("Set-Cookie", result.setCookie);
  }
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const result = await handleWorkspaceDetailBridgeRequest({
    method: "GET",
    workspaceId: id,
    requestUrl: request.url,
    headers: request.headers,
  });
  return toNextResponse(result);
}
