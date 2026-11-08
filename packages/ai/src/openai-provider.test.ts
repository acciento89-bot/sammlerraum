import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
const image = new Uint8Array(
  Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=", "base64"),
);
const catalogId = randomUUID();
const valid = {
  categoryKey: "coins",
  title: "Visible coin",
  manufacturer: null,
  seriesOrSet: null,
  year: 2020,
  identifiers: [],
  catalogCandidates: [
    {
      catalogEntryId: catalogId,
      catalogVariantId: null,
      confidence: 0.8,
      evidence: ["Visible matching marking."],
    },
  ],
  warnings: ["Check the image yourself."],
};
const response = (text = JSON.stringify(valid), status = "completed") => ({
  id: "resp_fixture",
  object: "response",
  created_at: 1,
  model: "fixture-vision",
  status,
  output: [
    {
      id: "msg_fixture",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text, annotations: [] }],
    },
  ],
  usage: {
    input_tokens: 12,
    output_tokens: 5,
    total_tokens: 17,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  },
});
async function fixture(body: unknown = response(), httpStatus = 200) {
  const requests: Record<string, any>[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    requests.push((await new Request(input, init).json()) as Record<string, any>);
    return Response.json(body, {
      status: httpStatus,
      headers: { "x-request-id": "owned-sdk-fixture" },
    });
  });
  const path = "./openai-provider";
  const module = await import(path).catch(() => null);
  expect(module?.OpenAICollectibleProvider, "actual provider adapter must exist").toBeTypeOf(
    "function",
  );
  const provider = new module!.OpenAICollectibleProvider({
    apiKey: "fixture-not-a-real-key",
    model: "fixture-vision",
    fetch,
  });
  const input = {
    images: [{ bytes: image, mimeType: "image/webp" as const }],
    signal: new AbortController().signal,
    categories: ["coins"],
    catalogCandidates: [
      { catalogEntryId: catalogId, catalogVariantId: null, title: "Reference coin" },
    ],
  };
  return { provider, fetch, requests, input };
}
describe("official SDK image adapter with owned fake HTTP", () => {
  it("sends only bounded inline images and global context with retention off and strict structure", async () => {
    const f = await fixture();
    const result = await f.provider.analyzeCollectible(f.input);
    expect(result).toEqual({ analysis: valid, usage: { inputTokens: 12, outputTokens: 5 } });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const body = f.requests[0]!;
    expect(body.store).toBe(false);
    expect(body.model).toBe("fixture-vision");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.additionalProperties).toBe(false);
    const photos = body.input
      .flatMap((message: any) => (Array.isArray(message.content) ? message.content : []))
      .filter((part: any) => part.type === "input_image");
    expect(photos).toEqual([
      {
        type: "input_image",
        image_url: `data:image/webp;base64,${Buffer.from(image).toString("base64")}`,
        detail: "high",
      },
    ]);
    expect(body).not.toHaveProperty("metadata");
    expect(body).not.toHaveProperty("user");
    expect(JSON.stringify(body)).not.toMatch(
      /"storageKey"|"ownerId"|"documents"|"originalFileName"/,
    );
  });
  it.each([
    "not json",
    JSON.stringify({ ...valid, authenticity: "genuine" }),
    JSON.stringify({ title: "partial" }),
  ])("rejects malformed or unsolicited model output", async (text) => {
    const f = await fixture(response(text));
    await expect(f.provider.analyzeCollectible(f.input)).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
      usage: { inputTokens: 12, outputTokens: 5 },
    });
  });
  it("keeps refusal and incomplete output distinct without accepting plausible partial data", async () => {
    const refused = response();
    refused.output[0]!.content = [{ type: "refusal", refusal: "Refused" } as any];
    const a = await fixture(refused);
    await expect(a.provider.analyzeCollectible(a.input)).rejects.toMatchObject({
      code: "AI_RESPONSE_REFUSED",
    });
    const b = await fixture(response(JSON.stringify(valid), "incomplete"));
    await expect(b.provider.analyzeCollectible(b.input)).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
  });
  it("never retries privately configured HTTP failures or exposes provider error text", async () => {
    const f = await fixture(
      { error: { message: "private-provider-credential-sentinel", type: "server_error" } },
      503,
    );
    const error = await f.provider.analyzeCollectible(f.input).catch((problem: unknown) => problem);
    expect(error).toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
    expect(String(error)).not.toContain("private-provider-credential-sentinel");
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects documents, URLs, extra private context and oversized image selections before HTTP", async () => {
    const f = await fixture();
    for (const input of [
      { ...f.input, documents: ["private.pdf"] },
      {
        ...f.input,
        images: [{ mimeType: "image/webp", bytes: Buffer.from("%PDF-1.7 private document bytes") }],
      },
      { ...f.input, images: [{ url: "https://example.invalid/private-photo" }] },
      { ...f.input, images: Array.from({ length: 5 }, () => f.input.images[0]) },
      { ...f.input, images: [{ mimeType: "image/webp", bytes: new Uint8Array(2097153) }] },
    ])
      await expect(f.provider.analyzeCollectible(input)).rejects.toMatchObject({
        code: "AI_INVALID_REQUEST",
      });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("does not invent catalog UUIDs or category keys outside supplied public context", async () => {
    const f = await fixture(response(JSON.stringify({ ...valid, categoryKey: "invented" })));
    await expect(f.provider.analyzeCollectible(f.input)).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
    const g = await fixture(
      response(
        JSON.stringify({
          ...valid,
          catalogCandidates: [{ ...valid.catalogCandidates[0], catalogEntryId: randomUUID() }],
        }),
      ),
    );
    await expect(g.provider.analyzeCollectible(g.input)).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
  });
});
