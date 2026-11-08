import { describe, expect, it } from "vitest";
import { getPublicIndexability } from "./indexability";
const publicResource = { visibility: "PUBLIC" as const, deletedAt: null, moderationHiddenAt: null };
describe("explicit search consent and effective public visibility", () => {
  it("defaults absent or opted-out profiles to noindex", () => {
    for (const profile of [null, {}, { searchEngineIndexingEnabled: false }])
      expect(getPublicIndexability(publicResource, [], profile)).toEqual({
        index: false,
        reason: "PROFILE_OPT_OUT",
      });
  });
  it("indexes an opted-in currently public resource", () => {
    expect(
      getPublicIndexability(publicResource, [publicResource], {
        searchEngineIndexingEnabled: true,
      }),
    ).toEqual({ index: true, reason: "INDEXABLE" });
  });
  it.each(["PRIVATE", "UNLISTED"] as const)("rejects %s regardless of consent", (visibility) => {
    expect(
      getPublicIndexability({ ...publicResource, visibility }, [], {
        searchEngineIndexingEnabled: true,
      }),
    ).toEqual({ index: false, reason: "RESOURCE_NOT_PUBLIC" });
    expect(
      getPublicIndexability(publicResource, [{ ...publicResource, visibility }], {
        searchEngineIndexingEnabled: true,
      }),
    ).toEqual({ index: false, reason: "PRIVATE_ANCESTOR" });
  });
  it("rejects deleted and moderated resources or ancestors", () => {
    for (const field of ["deletedAt", "moderationHiddenAt"] as const) {
      const hidden = { ...publicResource, [field]: new Date() };
      expect(getPublicIndexability(hidden, [], { searchEngineIndexingEnabled: true }).index).toBe(
        false,
      );
      expect(
        getPublicIndexability(publicResource, [hidden], { searchEngineIndexingEnabled: true })
          .index,
      ).toBe(false);
    }
  });
  it("fails closed on missing, cyclic or unresolved ancestor facts", () => {
    for (const resource of [
      null,
      { ...publicResource, ancestorsResolved: false },
      { ...publicResource, cyclic: true },
    ])
      expect(getPublicIndexability(resource, [], { searchEngineIndexingEnabled: true }).index).toBe(
        false,
      );
  });
});
