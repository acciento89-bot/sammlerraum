import { buildOpenApiDocument } from "@sammlerraum/contracts/openapi";
import { serverEnv } from "@sammlerraum/config/server";

export function GET(): Response {
  return Response.json(buildOpenApiDocument({ appOrigin: serverEnv.APP_ORIGIN }), {
    headers: { "cache-control": "no-store" },
  });
}
