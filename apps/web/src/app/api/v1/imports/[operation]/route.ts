import { importRouteHandlers } from "../../../../../lib/import-route-dependencies";
type Context = { params: Promise<{ operation: string }> };
export async function GET(request: Request, context: Context) {
  return (await importRouteHandlers()).GET(request, (await context.params).operation);
}
export async function POST(request: Request, context: Context) {
  return (await importRouteHandlers()).POST(request, (await context.params).operation);
}
