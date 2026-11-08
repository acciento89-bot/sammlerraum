import { object } from "./exact-json";
import { ProviderFailure } from "./provider-failure";
import { providerRequest, validateDependencies, type ProviderDependencies } from "./provider-http";
import { observation, selector } from "./provider-mapping";
import type { MarketDataProvider, MarketObservation } from "./types";
const fields = [
  "loose-price",
  "cib-price",
  "new-price",
  "graded-price",
  "box-only-price",
  "manual-only-price",
] as const;
const buckets = {
  cards: ["ungraded", "grade 7 or 7.5", "grade 8 or 8.5", "grade 9", "grade 9.5", "PSA 10"],
  video_games: ["loose", "complete", "sealed", "graded new", "box", "manual"],
} as const;
/** USD guide profile. Rights, denomination and zero semantics must be verified before activation. */
export function makePriceChartingProvider(options: ProviderDependencies): MarketDataProvider {
  const deps = { ...options };
  validateDependencies(deps);
  return {
    id: "pricecharting",
    async fetch(request, context) {
      const [, category, id, consoleName] = selector(request, "pricecharting", "product_category");
      if ((category !== "cards" && category !== "video_games") || !/^[1-9][0-9]{0,19}$/u.test(id!))
        throw new ProviderFailure("INVALID_MAPPING");
      const url = new URL("https://www.pricecharting.com/api/product");
      url.searchParams.set("t", deps.token);
      url.searchParams.set("id", id!);
      return providerRequest(deps, "pricecharting", url, {}, context, (body) => {
        const data = object(body);
        if (data.status !== "success" || data.id !== id || data["console-name"] !== consoleName)
          throw new ProviderFailure("INVALID_RESPONSE");
        const rows: MarketObservation[] = [];
        fields.forEach((field, i) => {
          if (data[field] !== undefined && data[field] !== null)
            rows.push(
              observation(
                request,
                `pricecharting.${field}`,
                "USD",
                { category, bucket: buckets[category][i]! },
                data[field],
                false,
                deps.money,
              ),
            );
        });
        return rows;
      });
    },
  };
}
