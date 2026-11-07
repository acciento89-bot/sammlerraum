import { describe, expect, it } from "vitest";
import { MoneyCapabilitiesSchema } from "./money-capabilities";
import { LEGACY_MONEY_PROFILE_ID, LEGACY_MONEY_AUTHORITY_HASH } from "./legacy-money";
const supported = {
  actorId: "synthetic",
  schemaVersion: 1,
  readVersion: 1,
  authoringProfiles: [
    { profileId: LEGACY_MONEY_PROFILE_ID, authorityHash: LEGACY_MONEY_AUTHORITY_HASH },
  ],
  classificationVersion: 1,
  canonicalConsumers: false,
};
describe("explicit monetary capability contract", () => {
  it("accepts only the actual pinned profile/hash and a separately disabled authoring deployment", () => {
    expect(MoneyCapabilitiesSchema.parse(supported)).toEqual(supported);
    expect(MoneyCapabilitiesSchema.parse({ ...supported, authoringProfiles: [] })).toMatchObject({
      authoringProfiles: [],
    });
  });
  it("rejects malformed/mismatched/duplicate capabilities rather than selecting a raw fallback", () => {
    for (const body of [
      null,
      {},
      { ...supported, schemaVersion: 2 },
      {
        ...supported,
        authoringProfiles: [{ ...supported.authoringProfiles[0], authorityHash: "0".repeat(64) }],
      },
      {
        ...supported,
        authoringProfiles: [...supported.authoringProfiles, ...supported.authoringProfiles],
      },
      { ...supported, rawFallback: true },
    ])
      expect(MoneyCapabilitiesSchema.safeParse(body).success).toBe(false);
  });
});
