import { describe, expect, it } from "vitest";
import { readMilestoneBody } from "./read-milestone-body";
const request = (body: RequestInit["body"], headers: Record<string, string> = {}) =>
  new Request("https://example.invalid/api/v1/dashboard/milestones", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
    duplex: "half",
  } as RequestInit);
const valid = { title: 'A private "date" { [ , : \\ end', milestoneDate: "0001-01-01" };
describe("milestone private fixed scalar body boundary", () => {
  it("reads the actual authored title/date body while treating quoted punctuation as opaque", async () =>
    expect(await readMilestoneBody(request(JSON.stringify(valid)), "create")).toEqual(valid));
  it.each([
    ["create", '{"title":"A","t\\u0069tle":"B","milestoneDate":"2026-01-01"}'],
    ["update", '{"expectedRevision":1,"expected\\u0052evision":2}'],
    ["delete", '{"expectedRevision":1,"expectedRevision":1}'],
    ["query", '{"limit":5,"l\\u0069mit":6}'],
    ["create", '{"ownerId":"private"}'],
    ["create", '{"title":{}}'],
    ["query", '{"cursor":[]}'],
    ["create", "[]"],
    ["create", "null"],
    ["create", "{}{}"],
    ["create", '{"title":"A",}'],
    ["create", "\ufeff{}"],
    ["create", '{"title":"bad\\q"}'],
    ["create", '{"title":"bad\nline"}'],
    ["create", '{"__proto__":null}'],
    ["query", '{"lifecycle":"ALL"}'],
    ["delete", '{"title":"private"}'],
    ["create", '{"title":"A","expectedRevision":1}'],
  ] as const)(
    "closes duplicate/unknown/nested/syntax input in %s",
    async (operation, body) =>
      await expect(readMilestoneBody(request(body), operation)).rejects.toMatchObject({
        code: "MILESTONE_INVALID",
      }),
  );
  it.each(["create", "update", "delete", "query"] as const)(
    "shares fatalUTF8 and BOM/media guards for %s",
    async (operation) => {
      await expect(
        readMilestoneBody(request(new Uint8Array([0xff])), operation),
      ).rejects.toMatchObject({ code: "MILESTONE_INVALID" });
      await expect(
        readMilestoneBody(request(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), operation),
      ).rejects.toMatchObject({ code: "MILESTONE_INVALID" });
      await expect(
        readMilestoneBody(request("{}", { "content-type": "text/plain" }), operation),
      ).rejects.toMatchObject({ code: "MILESTONE_INVALID" });
    },
  );
  it("keeps the exact16KiB streamed boundary even when declared size is absent or false", async () => {
    const body = "{}" + " ".repeat(16382);
    expect(await readMilestoneBody(request(body), "query")).toEqual({});
    for (const headers of [{}, { "content-length": "1" }]) {
      const bytes = new TextEncoder().encode(body + " ");
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let n = 0; n < bytes.length; n += 997)
            controller.enqueue(bytes.subarray(n, n + 997));
        },
        cancel() {
          cancelled = true;
        },
      });
      await expect(readMilestoneBody(request(stream, headers), "query")).rejects.toMatchObject({
        status: 413,
      });
      expect(cancelled).toBe(true);
    }
  });
});
