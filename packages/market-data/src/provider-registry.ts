import type { MarketDataProvider } from "./types";
export type ProviderRegistration = {
  provider: MarketDataProvider;
  identifierNamespace: string;
  identifierType: string;
};
/** Trusted server composition only; registration does not grant activation or display rights. */
export class ProviderRegistry {
  private readonly providers = new Map<string, Readonly<ProviderRegistration>>();
  constructor(registrations: readonly ProviderRegistration[] = []) {
    if (!Array.isArray(registrations) || registrations.length > 100)
      throw new Error("Invalid provider registry");
    for (const registration of registrations) {
      const provider = registration?.provider;
      if (
        !provider ||
        typeof provider.id !== "string" ||
        /[\x00-\x1f\x7f]/u.test(provider.id) ||
        !/^[a-z][a-z0-9_-]{0,63}$/u.test(provider.id) ||
        typeof provider.fetch !== "function" ||
        typeof registration.identifierNamespace !== "string" ||
        /[\x00-\x1f\x7f]/u.test(registration.identifierNamespace) ||
        typeof registration.identifierType !== "string" ||
        /[\x00-\x1f\x7f]/u.test(registration.identifierType) ||
        this.providers.has(provider.id) ||
        !/^[a-z][a-z0-9_]{0,63}$/u.test(registration.identifierNamespace) ||
        !/^[a-z][a-z0-9_]{0,63}$/u.test(registration.identifierType)
      )
        throw new Error("Invalid or duplicate provider");
      // Capture identity and method so mutations of the caller's registration cannot remap a provider.
      this.providers.set(
        provider.id,
        Object.freeze({
          provider: Object.freeze({ id: provider.id, fetch: provider.fetch.bind(provider) }),
          identifierNamespace: registration.identifierNamespace,
          identifierType: registration.identifierType,
        }),
      );
    }
  }
  get(id: string): Readonly<ProviderRegistration> {
    const registration = this.providers.get(id);
    if (!registration) throw new Error("Unknown market provider");
    return registration;
  }
}
