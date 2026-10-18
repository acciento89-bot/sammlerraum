import { afterEach, describe, expect, it, vi } from "vitest";
import { parseItemSearchQuery } from "@sammlerraum/contracts/item-search";
import { Prisma } from "@sammlerraum/db/search-sql";
import { leaves } from "./search-compiler";
import { runSearchRead, type SearchDatabase } from "./search-read";
import { validateRetainedUrls } from "./search-url-integrity";
import * as producer from "../custom-fields/custom-field-service";
const nodes = leaves(
  parseItemSearchQuery({
    filter: {
      version: 1,
      root: {
        kind: "customField",
        selector: {
          source: "CUSTOM",
          collectionId: "00000000-0000-4000-8000-000000000001",
          definitionId: "00000000-0000-4000-8000-000000000002",
        },
        predicate: { valueType: "URL", test: { op: "present" } },
      },
    },
  }).filter!.root,
);
afterEach(() => vi.restoreAllMocks());
describe("URL validation processing boundary", () => {
  it("does no manifest query or producer parsing without a URL leaf", async () => {
    const read = vi.fn(),
      checkBudget = vi.fn(),
      parse = vi.spyOn(producer, "validateFieldValue");
    await validateRetainedUrls({ $queryRaw: read, checkBudget }, [], Prisma.sql`TRUE`);
    expect(read).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(checkBudget).not.toHaveBeenCalled();
  });
  it.each(["before read", "after read", "during parsing"] as const)(
    "closes when the actual transaction deadline expires %s",
    async (stage) => {
      let now = 0,
        reads = 0;
      vi.spyOn(performance, "now").mockImplementation(() => now);
      const actual = producer.validateFieldValue;
      const parse = vi.spyOn(producer, "validateFieldValue").mockImplementation((...args) => {
        const result = actual(...args);
        if (stage === "during parsing") now = 5001;
        return result;
      });
      const database: SearchDatabase = {
        $transaction: async (work) =>
          work({
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              if (sql.text.includes("search_url_manifest")) {
                reads++;
                if (stage === "after read") now = 5001;
                return [
                  {
                    count: 2n,
                    bytes: 42n,
                    values: ["https://example.org/", "https://example.net/"],
                  },
                ] as T;
              }
              return [] as T;
            },
          }),
      };
      await expect(
        runSearchRead(database, async (tx) => {
          if (stage === "before read") now = 5001;
          await validateRetainedUrls(tx, nodes, Prisma.sql`TRUE`);
          throw new Error("Must never proceed to match/count/page");
        }),
      ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
      expect(reads).toBe(stage === "before read" ? 0 : 1);
      expect(parse).toHaveBeenCalledTimes(stage === "during parsing" ? 1 : 0);
    },
  );
  it("closes raw manifest driver failures without parsing or exposing values", async () => {
    const parse = vi.spyOn(producer, "validateFieldValue");
    const database: SearchDatabase = {
      $transaction: async (work) =>
        work({
          $queryRaw: async <T>(sql: Prisma.Sql) => {
            if (sql.text.includes("search_url_manifest"))
              throw {
                code: "P2010",
                meta: { code: "57014", message: "https://private.invalid/secret" },
              };
            return [] as T;
          },
        }),
    };
    const error = await runSearchRead(database, (tx) =>
      validateRetainedUrls(tx, nodes, Prisma.sql`TRUE`),
    ).catch((error) => error);
    expect(error).toMatchObject({ code: "SEARCH_UNAVAILABLE", message: "SEARCH_UNAVAILABLE" });
    expect(JSON.stringify(error)).not.toContain("private");
    expect(parse).not.toHaveBeenCalled();
  });
});
