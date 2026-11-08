import { BillingCatalogSchema, type BillingOffer } from "@sammlerraum/contracts/billing-ui";
const catalog = BillingCatalogSchema;
/** One bounded configuration entry; only public validated data, never own account state. */
export function createBillingPriceCache(now: () => number = Date.now) {
  let current: { key: string; until: number; promise: Promise<BillingOffer[] | null> } | undefined;
  return {
    async read(key: string, load: () => Promise<unknown>): Promise<BillingOffer[] | null> {
      if (!current || current.key !== key || now() >= current.until) {
        const entry = {
          key,
          until: Infinity,
          promise: Promise.resolve(null) as Promise<BillingOffer[] | null>,
        };
        entry.promise = (async () => {
          let result: BillingOffer[] | null = null;
          try {
            const parsed = catalog.safeParse(await load());
            if (parsed.success) result = parsed.data;
          } catch {
            /* No provider error body in UI or cache. */
          }
          entry.until = now() + (result ? 300000 : 30000);
          return result;
        })();
        current = entry;
      }
      return structuredClone(await current.promise);
    },
  };
}
