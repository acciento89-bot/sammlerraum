import { managementHandlers } from "../../../../../../lib/management-handlers";

type Context = { params: Promise<{ collectionId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request, context: Context) { return (await managementHandlers()).GET_CUSTOM_FIELDS(request, (await context.params).collectionId); }
export async function POST(request: Request, context: Context) { return (await managementHandlers()).POST_CUSTOM_FIELD(request, (await context.params).collectionId); }
