import { personalMilestoneRouteHandlers } from "../../../../../../lib/personal-milestone-route-dependencies";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  return (await personalMilestoneRouteHandlers()).PATCH(request, (await context.params).id);
}
export async function DELETE(request: Request, context: Context) {
  return (await personalMilestoneRouteHandlers()).DELETE(request, (await context.params).id);
}
