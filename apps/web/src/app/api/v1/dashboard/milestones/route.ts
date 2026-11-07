import { personalMilestoneRouteHandlers } from "../../../../../lib/personal-milestone-route-dependencies";
export async function POST(request: Request) {
  return (await personalMilestoneRouteHandlers()).POST(request);
}
