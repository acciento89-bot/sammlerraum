import { describe, expect, it } from "vitest";
import { readSearchBody } from "./read-search-body";
import { parsePrivateItemSearchWire } from "@sammlerraum/contracts/private-search-query";

function request(body?: BodyInit, headers: Record<string, string> = {}) {
  return new Request("https://example.invalid/api/v1/search/items", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body }),
    duplex: "half",
  } as RequestInit);
}
function stream(size: number) {
  const bytes = new TextEncoder().encode(`{}${" ".repeat(size - 2)}`);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 997) controller.enqueue(bytes.subarray(i, i + 997));
      controller.close();
    },
  });
}
describe("private scalar search body boundary", () => {
  it.each(["ITEM_QUERY", "DASHBOARD_QUERY"] as const)(
    "reads only a flat %s JSON object",
    async (shape) => {
      expect(await readSearchBody(request('{"t\\u0065xt":"watch","f":null}'), shape)).toEqual({
        text: "watch",
        f: null,
      });
      expect(await readSearchBody(request(" \n{}\r\t"), shape)).toEqual({});
    },
  );
  it.each([
    '{"text":"private","text":"lost"}',
    '{"text":"private","t\\u0065xt":"lost"}',
    '{"f":null,"\\u0066":null}',
    '{"__proto__":null}',
    '{"constructor":"secret"}',
    '{"unknown":1}',
    "null",
    "[]",
    "1",
    '"private"',
    '{"text":{}}',
    '{"f":[]}',
    '{"text":true,"f":{}}',
    "",
    " ",
    "{",
    "{}{}",
    '{"text":"a",}',
    '{"text":"a"}private',
    '{"limit":01}',
    '{"limit":1.}',
    '{"limit":NaN}',
    '{"limit":+1}',
    '{"limit":1e}',
    '{"text":"\\q"}',
    '{"text":"line\nbreak"}',
    '{"text":"unterminated}',
    "\uFEFF{}",
  ])("closes malformed, duplicate, unknown or nested envelopes", async (body) => {
    await expect(readSearchBody(request(body), "ITEM_QUERY")).rejects.toMatchObject({
      code: "SEARCH_INVALID",
      message: "SEARCH_INVALID",
    });
  });
  it("rejects dashboard pagination keys before normalization", async () => {
    await expect(readSearchBody(request('{"limit":20}'), "DASHBOARD_QUERY")).rejects.toMatchObject({
      code: "SEARCH_INVALID",
    });
    await expect(
      readSearchBody(request('{"cursor":"abc"}'), "DASHBOARD_QUERY"),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
  });
  it("treats quoted f punctuation and escaped quotes/backslashes as opaque", async () => {
    const f = JSON.stringify({
      version: 1,
      root: { kind: "tags", test: { op: "hasAny", values: ['a} [, : "text": "private" \\ end'] } },
    });
    const input = await readSearchBody(request(JSON.stringify({ f, text: 'x\\"y' })), "ITEM_QUERY");
    expect(input).toEqual({ f, text: 'x\\"y' });
    expect(parsePrivateItemSearchWire(input).filter?.root.kind).toBe("tags");
  });
  it("retains raw f above 10000 chars instead of applying filter guards to its envelope", async () => {
    const f = '{"version":1,"root":{"kind":"duplicate","value":true}}'.padEnd(16384, " ");
    expect(
      parsePrivateItemSearchWire(await readSearchBody(request(JSON.stringify({ f })), "ITEM_QUERY"))
        .filter,
    ).toEqual({ version: 1, root: { kind: "duplicate", value: true } });
  });
  it.each([undefined, "text/plain", "application/jsonp"])(
    "sanitizes missing body/media-type failures",
    async (media) => {
      await expect(
        readSearchBody(
          request(undefined, { "content-type": media ?? "application/json" }),
          "ITEM_QUERY",
        ),
      ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
      if (media)
        await expect(
          readSearchBody(request("{}", { "content-type": media }), "ITEM_QUERY"),
        ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
    },
  );
  it.each([
    new Uint8Array([0xef, 0xbb, 0xbf, 123, 125]),
    new Uint8Array([123, 34, 116, 101, 120, 116, 34, 58, 34, 0xc0, 0xaf, 34, 125]),
    new Uint8Array([0xed, 0xa0, 0x80]),
  ])("rejects BOM and fatal UTF8 without decoded replacement", async (bytes) => {
    await expect(readSearchBody(request(bytes), "ITEM_QUERY")).rejects.toMatchObject({
      code: "SEARCH_INVALID",
    });
  });
  it.each([{}, { "content-length": "1" }, { "content-length": "32768" }])(
    "counts actual stream bytes independently of Content-Length",
    async (headers) => {
      expect(await readSearchBody(request(stream(32768), headers), "ITEM_QUERY")).toEqual({});
      await expect(
        readSearchBody(request(stream(32769), headers), "ITEM_QUERY"),
      ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE", status: 413 });
    },
  );
  it("preserves declared oversize rejection and rejects legal f whose outer escaping exceeds 32KiB", async () => {
    await expect(
      readSearchBody(request("{}", { "content-length": "32769" }), "ITEM_QUERY"),
    ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE", status: 413 });
    const raw = '{"version":1,"root":{"kind":"duplicate","value":true}}'.padEnd(16384, "\t");
    expect(parsePrivateItemSearchWire({ f: raw }).filter).toBeTruthy();
    const body = JSON.stringify({ f: raw, text: "x".repeat(200) });
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(32768);
    await expect(readSearchBody(request(body), "ITEM_QUERY")).rejects.toMatchObject({
      code: "UPLOAD_TOO_LARGE",
      status: 413,
    });
  });
});
