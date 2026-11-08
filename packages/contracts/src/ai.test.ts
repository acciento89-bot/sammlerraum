import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CollectibleAnalysisSchema,
  parseCollectibleAnalysis,
  RequestAIAnalysisSchema,
  AIAnalysisJobSchema,
} from "./ai";
const valid = {
  categoryKey: null,
  title: "Visible title",
  manufacturer: null,
  seriesOrSet: null,
  year: null,
  identifiers: [],
  catalogCandidates: [],
  warnings: [],
};
describe("closed advisory AI boundaries", () => {
  it("accepts an explicitly uncertain empty analysis without inventing facts", () => {
    expect(parseCollectibleAnalysis({ ...valid, title: null })).toEqual({ ...valid, title: null });
  });
  it.each(["authenticity", "condition", "grading", "rarity", "provenance", "marketValue"])(
    "rejects an unsolicited %s fact",
    (key) => {
      expect(CollectibleAnalysisSchema.safeParse({ ...valid, [key]: "confirmed" }).success).toBe(
        false,
      );
    },
  );
  it("rejects partial, oversized and malformed provider output as typed invalid response", () => {
    for (const input of [
      { title: "partial" },
      { ...valid, warnings: ["\u0000"] },
      { ...valid, title: "x".repeat(201) },
      { ...valid, year: NaN },
    ])
      expect(() => parseCollectibleAnalysis(input)).toThrow("AI_INVALID_RESPONSE");
  });
  it("canonicalizes UUID input before detecting duplicate selections", () => {
    const id = randomUUID();
    expect(
      RequestAIAnalysisSchema.safeParse({
        itemId: randomUUID(),
        assetIds: [id, id.toUpperCase()],
        requestKey: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      RequestAIAnalysisSchema.safeParse({
        itemId: randomUUID(),
        assetIds: Array.from({ length: 5 }, () => randomUUID()),
        requestKey: randomUUID(),
      }).success,
    ).toBe(false);
  });
  it("never serializes a worker lease or storage key in the job DTO", () => {
    const job = {
      id: randomUUID(),
      itemId: randomUUID(),
      status: "PENDING",
      imageCount: 1,
      providerId: "fixture",
      model: "fixture",
      errorCode: null,
      createdAt: "2026-11-08T00:00:00.000Z",
      updatedAt: "2026-11-08T00:00:00.000Z",
    };
    expect(AIAnalysisJobSchema.safeParse(job).success).toBe(true);
    expect(AIAnalysisJobSchema.safeParse({ ...job, leaseToken: randomUUID() }).success).toBe(false);
    expect(AIAnalysisJobSchema.safeParse({ ...job, storageKey: "private/path" }).success).toBe(
      false,
    );
  });
});
