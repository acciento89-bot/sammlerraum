import { getRequestId } from "../../../lib/request-id";
import { buildHealthResponse } from "./health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request.headers);
  const [{ checkDatabaseHealth }, { prisma }] = await Promise.all([
    import("@sammlerraum/db/health"),
    import("@sammlerraum/db/client"),
  ]);
  const database = await checkDatabaseHealth(prisma);
  const response = buildHealthResponse(database.ok, requestId);

  return Response.json(response.payload, {
    status: response.status,
    headers: response.headers,
  });
}
