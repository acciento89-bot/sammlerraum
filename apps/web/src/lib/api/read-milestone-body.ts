import { milestoneFail } from "@sammlerraum/contracts/personal-milestones";
import { ItemSearchError } from "@sammlerraum/contracts/item-search";
import { readSearchBody } from "./read-search-body";
const modes = {
  create: "MILESTONE_CREATE",
  update: "MILESTONE_UPDATE",
  delete: "MILESTONE_DELETE",
  query: "MILESTONE_QUERY",
} as const;
/** Reuse the existing lexical/stream boundary; no parallel JSON parser. */
export async function readMilestoneBody(
  request: Request,
  operation: keyof typeof modes,
): Promise<unknown> {
  try {
    return await readSearchBody(request, modes[operation]);
  } catch (error) {
    if (error instanceof ItemSearchError && error.code === "SEARCH_INVALID")
      return milestoneFail("MILESTONE_INVALID");
    throw error;
  }
}
