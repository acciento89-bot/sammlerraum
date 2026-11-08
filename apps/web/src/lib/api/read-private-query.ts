import { ApiError } from "@sammlerraum/contracts/errors";
import { ItemSearchError } from "@sammlerraum/contracts/item-search";
import { readSearchQueryMap } from "../item-search-routes";
/** Adapt the shared bounded lexical reader to generic private-resource route errors. */
export function readPrivateQuery(request: Request, allowed: readonly string[]) {
  try {
    return readSearchQueryMap(request, allowed);
  } catch (error) {
    if (error instanceof ItemSearchError && error.code === "SEARCH_INVALID")
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid request query");
    throw error;
  }
}
