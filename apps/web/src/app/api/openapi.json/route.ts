import { buildOpenApiDocument } from "@sammlerraum/contracts/openapi";

export function GET(): Response {
  return Response.json(buildOpenApiDocument(), {
    headers: { "cache-control": "no-store" },
  });
}
