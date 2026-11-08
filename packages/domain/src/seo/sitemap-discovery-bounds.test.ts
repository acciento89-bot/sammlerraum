import { expect, it } from "vitest";
import { createCommunitySitemapService } from "./sitemap-service";
import type { CommunityDatabase } from "../community/social-service";
it("limits each effective-public discovery probe before counting and never globally aggregates eligibility", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      queries.push(query);
      return [];
    },
  };
  const db = {
    $transaction: async (work: (t: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as CommunityDatabase;
  expect(await createCommunitySitemapService(db).listSegments(100)).toEqual([]);
  const probes = queries.filter((q) => !q.sql.includes("set_config"));
  expect(probes.length).toBeGreaterThan(0);
  for (const q of probes) {
    expect(q.sql).toMatch(/LIMIT/u);
    expect(q.values).toContain(101);
    expect(q.sql).not.toMatch(/GROUP BY/u);
  }
});
