import { managementHandlers } from "../../../../../../lib/management-handlers";

type Context = { params: Promise<{ itemId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function PUT(request: Request, context: Context) { return (await managementHandlers()).PUT_IDENTIFIERS(request, (await context.params).itemId); }
