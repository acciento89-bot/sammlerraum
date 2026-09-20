import { managementHandlers } from "../../../../../../lib/management-handlers";

type Context = { params: Promise<{ itemId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: Request, context: Context) { return (await managementHandlers()).SPLIT_ITEM(request, (await context.params).itemId); }
