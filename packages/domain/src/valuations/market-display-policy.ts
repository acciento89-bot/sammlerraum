import { SourceKeySchema } from "@sammlerraum/contracts/valuations";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
export type MarketDisplayGrant = {
  providerId: string;
  identifierNamespace: string;
  identifierType: string;
  allowHistorical: boolean;
};
export type MarketDisplayPolicy = {
  snapshotForOwner(actorUserId: string): readonly MarketDisplayGrant[];
};
/** Trusted activation capability, deliberately independent of worker registration/dispatch. */
export const emptyMarketDisplayPolicy: MarketDisplayPolicy = Object.freeze({
  snapshotForOwner: () => Object.freeze([]),
});
export function displayGrants(
  policy: MarketDisplayPolicy,
  registry: ProviderRegistry,
  actor: string,
): readonly Readonly<MarketDisplayGrant>[] {
  const values = policy.snapshotForOwner(actor);
  if (!Array.isArray(values) || values.length > 8)
    throw new Error("Invalid market display configuration");
  const seen = new Set<string>();
  return Object.freeze(
    values.map((value) => {
      if (
        !value ||
        Object.keys(value).sort().join(",") !==
          "allowHistorical,identifierNamespace,identifierType,providerId" ||
        typeof value.allowHistorical !== "boolean"
      )
        throw new Error("Invalid market display configuration");
      // Select explicitly so no untrusted policy data enters a query.
      const key = SourceKeySchema.safeParse({
        providerId: value.providerId,
        identifierNamespace: value.identifierNamespace,
        identifierType: value.identifierType,
        externalId: "validation",
        kind: "LAST_SOLD",
        currency: "EUR",
      });
      if (!key.success || seen.has(value.providerId))
        throw new Error("Invalid market display configuration");
      const registration = registry.get(value.providerId);
      if (
        registration.identifierNamespace !== value.identifierNamespace ||
        registration.identifierType !== value.identifierType
      )
        throw new Error("Invalid market display configuration");
      seen.add(value.providerId);
      return Object.freeze({
        providerId: value.providerId,
        identifierNamespace: value.identifierNamespace,
        identifierType: value.identifierType,
        allowHistorical: value.allowHistorical,
      });
    }),
  );
}
