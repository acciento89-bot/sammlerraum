import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionReferencesSchema } from "@sammlerraum/contracts/search-references";
import { finishReference, createSearchReferenceService } from "./search-reference-service";
import type { SearchDatabase } from "./search-read";
afterEach(() => vi.restoreAllMocks());
describe("reference output and processing bounds", () => {
  it("checks serialization and validation budget without partial success", () => {
    let checks = 0;
    expect(() =>
      finishReference(
        {
          checkBudget() {
            if (++checks === 3) throw Error("expired");
          },
        },
        { safeParse: () => ({ success: true as const, data: { safe: true } }) },
        {},
      ),
    ).toThrow("expired");
    expect(() =>
      finishReference(
        { checkBudget() {} },
        { safeParse: () => ({ success: true as const, data: "x".repeat(1048577) }) },
        {},
      ),
    ).toThrow("SEARCH_UNAVAILABLE");
    expect(() =>
      finishReference({ checkBudget() {} }, CollectionReferencesSchema, {
        version: 1,
        readAt: "bad",
        references: [],
      }),
    ).toThrow("SEARCH_INVARIANT");
  });
  it("rejects invalid actor and request before acquiring a connection", async () => {
    const database: SearchDatabase = { $transaction: vi.fn() };
    const service = createSearchReferenceService(database);
    await expect(service.listCollections({ userId: "" }, {})).rejects.toMatchObject({
      code: "SEARCH_INVALID",
    });
    await expect(service.resolveCollections({ userId: "a" }, { ids: [] })).rejects.toMatchObject({
      code: "SEARCH_INVALID",
    });
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it("rejects impossible condition 101 sentinel at projection boundary with native constraints intact", async () => {
    let n = 0;
    const database: SearchDatabase = {
      $transaction: async (work) =>
        work({
          $queryRaw: async <T>() =>
            (++n === 3
              ? [
                  {
                    readAt: new Date(),
                    payload: {
                      category: {
                        id: "00000000-0000-4000-8000-000000000001",
                        key: "fixture",
                        labels: { de: "Kategorie", en: "Category" },
                      },
                      scheme: null,
                      options: Array(101).fill({}),
                    },
                  },
                ]
              : []) as T,
        }),
    };
    await expect(
      createSearchReferenceService(database).listConditions(
        { userId: "a" },
        { categoryId: "00000000-0000-4000-8000-000000000001" },
      ),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
  });
  it("does not return a completed DTO after transaction settlement exceeds overall budget", async () => {
    let now = 0,
      calls = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const database: SearchDatabase = {
      $transaction: async (work) => {
        const result = await work({
          $queryRaw: async <T>() =>
            (++calls === 3 ? [{ readAt: new Date(), payload: [] }] : []) as T,
        });
        now = 12001;
        return result;
      },
    };
    await expect(
      createSearchReferenceService(database).listCollections({ userId: "a" }, {}),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
  });
});
