import { expect, it } from "vitest";
it("preserves only validated public collector identities and optional pagination across languages", async () => {
  const path = "./public-collector-locale";
  const m = await import(path).catch(() => null);
  expect(m?.publicCollectorLocaleHref).toBeTypeOf("function");
  const id = "12345678-1234-4234-8234-123456789abc";
  for (const suffix of [
    "/@collector-one",
    `/@collector-one/collection-${id}`,
    `/@collector-one/collection-${id}/items/${id}`,
  ]) {
    expect(m!.publicCollectorLocaleHref(`/de${suffix}`, "en", "?token=secret&utm_source=no")).toBe(
      `/en${suffix}`,
    );
    expect(m!.publicCollectorLocaleHref(`/en${suffix}`, "de", "")).toBe(`/de${suffix}`);
  }
  expect(m!.publicCollectorLocaleHref("/de/@collector-one", "en", `?afterId=${id}&token=no`)).toBe(
    `/en/@collector-one?afterId=${id}`,
  );
  expect(m!.publicCollectorLocaleHref("/de/@collector-one", "en", "?afterId=invalid")).toBe(
    "/en/@collector-one",
  );
  expect(
    m!.publicCollectorLocaleHref("/de/@collector-one", "en", `?afterId=${id}&afterId=${id}`),
  ).toBe("/en/@collector-one");
  for (const bad of [
    "/de/search",
    "/de/@aa",
    "/de/@collector-one/private",
    "/de/@collector-one/collection-bad",
    "/de/@collector-one/collection-" + id + "/items/no",
  ])
    expect(m!.publicCollectorLocaleHref(bad, "en", "")).toBeNull();
  expect(m!.publicCollectorLocaleHref("/de/@collector-one", "foreign", "")).toBeNull();
});
