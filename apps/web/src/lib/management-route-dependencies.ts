import { createResourceQuery } from "@sammlerraum/domain/api/resource-query";
import { createCollectionService } from "@sammlerraum/domain/collections/collection-service";
import { createCustomFieldService } from "@sammlerraum/domain/custom-fields/custom-field-service";
import { createIdentifierService } from "@sammlerraum/domain/items/identifier-service";
import { createItemQuery } from "@sammlerraum/domain/items/item-query";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createTagService } from "@sammlerraum/domain/items/tag-service";
import { createLocationService } from "@sammlerraum/domain/locations/location-service";

type Authentication = {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: true; disableRefresh: true };
    }): Promise<{ user: { id: string } } | null>;
  };
};

export function createManagementRouteDependencies(
  database: Parameters<typeof createResourceQuery>[0] &
    Parameters<typeof createCollectionService>[0] &
    Parameters<typeof createItemService>[0] &
    Parameters<typeof createCustomFieldService>[0] &
    Parameters<typeof createIdentifierService>[0] &
    Parameters<typeof createTagService>[0] &
    Parameters<typeof createLocationService>[0],
  auth: Authentication,
  appOrigin: string,
) {
  const resources = createResourceQuery(database);
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
      }),
    getPublicItem: createItemQuery(database).getPublicItem,
    ...resources,
    createCollectionService: (userId: string) => createCollectionService(database, userId),
    createItemService: (userId: string) => createItemService(database, userId),
    createCustomFieldService: (userId: string) => createCustomFieldService(database, userId),
    createIdentifierService: (userId: string) => createIdentifierService(database, userId),
    createTagService: (userId: string) => createTagService(database, userId),
    createLocationService: (userId: string) => createLocationService(database, userId),
  };
}
