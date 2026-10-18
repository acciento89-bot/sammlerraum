import { object, text } from "./exact-json";
import { ProviderFailure } from "./provider-failure";
import {
  providerRequest,
  validateCredential,
  validateDependencies,
  type ProviderDependencies,
} from "./provider-http";
import { observation, selector } from "./provider-mapping";
import type { MarketDataProvider, MarketObservation, SourceQualifiers } from "./types";
/** Only the documented bare Pokémon card object is accepted; no speculative envelopes. */
export function makeScrydexProvider(
  options: ProviderDependencies & { teamId: string },
): MarketDataProvider {
  const deps = { ...options };
  validateDependencies(deps);
  validateCredential(deps.teamId);
  return {
    id: "scrydex",
    async fetch(request, context) {
      const [, game, id, variant] = selector(request, "scrydex", "pokemon_card_variant");
      if (game !== "pokemon" || !request.target.variantId || !/^[A-Za-z0-9_-]{1,64}$/u.test(id!))
        throw new ProviderFailure("INVALID_MAPPING");
      const url = new URL(`https://api.scrydex.com/pokemon/v1/cards/${id}`);
      url.searchParams.set("include", "prices");
      url.searchParams.set("casing", "snake");
      return providerRequest(
        deps,
        "scrydex",
        url,
        { "X-Api-Key": deps.token, "X-Team-ID": deps.teamId },
        context,
        (body) => {
          const card = object(body);
          if (card.id !== id || !Array.isArray(card.variants) || card.variants.length > 32)
            throw new ProviderFailure("INVALID_RESPONSE");
          const matches = card.variants.map(object).filter((v) => v.name === variant);
          if (
            matches.length !== 1 ||
            !Array.isArray(matches[0]!.prices) ||
            matches[0]!.prices.length > 25
          )
            throw new ProviderFailure("INVALID_RESPONSE");
          const rows: MarketObservation[] = [];
          for (const value of matches[0]!.prices) {
            const price = object(value),
              type = price.type;
            if (type !== "raw" && type !== "graded") throw new ProviderFailure("INVALID_RESPONSE");
            const qualifiers: Record<string, string | boolean> = { variant: variant!, type };
            if (type === "raw") {
              const condition = text(price.condition);
              if (!["NM", "LP", "MP", "HP", "DM"].includes(condition))
                throw new ProviderFailure("INVALID_RESPONSE");
              qualifiers.condition = condition;
            } else {
              qualifiers.company = text(price.company);
              qualifiers.grade = text(price.grade);
            }
            for (const flag of ["is_perfect", "is_signed", "is_error"]) {
              if (price[flag] !== undefined) {
                if (typeof price[flag] !== "boolean") throw new ProviderFailure("INVALID_RESPONSE");
                qualifiers[flag] = price[flag];
              }
            }
            const currency = text(price.currency, 3);
            if (!/^[A-Z]{3}$/u.test(currency)) throw new ProviderFailure("INVALID_RESPONSE");
            for (const metric of type === "raw"
              ? ["low", "market"]
              : ["low", "mid", "high", "market"]) {
              if (price[metric] !== undefined && price[metric] !== null)
                rows.push(
                  observation(
                    request,
                    `scrydex.${type}.${metric}`,
                    currency,
                    qualifiers as SourceQualifiers,
                    price[metric],
                    true,
                    deps.money,
                  ),
                );
            }
          }
          return rows;
        },
      );
    },
  };
}
