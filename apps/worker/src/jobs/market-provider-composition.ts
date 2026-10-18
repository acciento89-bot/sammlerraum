import type { ServerEnv } from "@sammlerraum/config/server";
import type { MarketDatabase } from "@sammlerraum/domain/market-data/market-data-service";
import { parseLocalizedMoney, MAX_AMOUNT_MINOR } from "@sammlerraum/domain/money/money";
import { currencyMinorUnitExponent } from "@sammlerraum/domain/money/currencies";
import { credentialKey, type MoneyCapabilities } from "@sammlerraum/market-data/provider-http";
import { makeScrydexProvider } from "@sammlerraum/market-data/scrydex-provider";
import { makePriceChartingProvider } from "@sammlerraum/market-data/pricecharting-provider";
import type { ProviderRegistration } from "@sammlerraum/market-data/provider-registry";
import {
  createPostgresMarketGate,
  createMarketRequestPermit,
  type MarketGatePolicy,
} from "./market-request-permit";
export const domainMoney: MoneyCapabilities = {
  parseMajorUnits: (value, currency) => parseLocalizedMoney(value, "en", currency).amountMinor,
  validateMinorUnits: (value, currency) => {
    currencyMinorUnitExponent(currency);
    if (value < 0n || value > MAX_AMOUNT_MINOR) throw new Error("Invalid money");
    return value;
  },
};
/** Only validated private configuration is accepted. Policy approval records an operator gate,
 * not proof of rights: see the activation/drain runbook. No HTTP occurs during composition.
 */
export function createProductionMarketProviders({
  config,
  database,
  fetch: fetcher,
}: {
  config: ServerEnv;
  database: MarketDatabase;
  fetch?: typeof fetch;
}) {
  const policies: MarketGatePolicy[] = [],
    registrations: ProviderRegistration[] = [];
  if (config.MARKET_SYNC_ENABLED && config.SCRYDEX_ENABLED)
    policies.push({
      credentialKey: credentialKey("scrydex", config.SCRYDEX_API_KEY!),
      service: "scrydex",
      hourly: config.SCRYDEX_HOURLY_CALL_BUDGET,
      daily: config.SCRYDEX_DAILY_CALL_BUDGET,
    });
  if (config.MARKET_SYNC_ENABLED && config.PRICECHARTING_ENABLED)
    policies.push({
      credentialKey: credentialKey("pricecharting", config.PRICECHARTING_API_TOKEN!),
      service: "pricecharting",
      hourly: config.PRICECHARTING_HOURLY_CALL_BUDGET,
      daily: config.PRICECHARTING_DAILY_CALL_BUDGET,
    });
  const permit = createMarketRequestPermit({ store: createPostgresMarketGate(database, policies) });
  const shared = {
    permit,
    money: domainMoney,
    enabled: true,
    ...(fetcher ? { fetch: fetcher } : {}),
  };
  if (config.MARKET_SYNC_ENABLED && config.SCRYDEX_ENABLED)
    registrations.push({
      provider: makeScrydexProvider({
        ...shared,
        token: config.SCRYDEX_API_KEY!,
        teamId: config.SCRYDEX_TEAM_ID!,
      }),
      identifierNamespace: "scrydex",
      identifierType: "pokemon_card_variant",
    });
  if (config.MARKET_SYNC_ENABLED && config.PRICECHARTING_ENABLED)
    registrations.push({
      provider: makePriceChartingProvider({ ...shared, token: config.PRICECHARTING_API_TOKEN! }),
      identifierNamespace: "pricecharting",
      identifierType: "product_category",
    });
  return { registrations, requestLifecycle: permit };
}
