import { describe, expect, it } from "vitest";
import { workspaceSection, workspaceLinks } from "./workspace-navigation";

describe("collector workspace navigation", () => {
  it("keeps nested collection and item screens in the collection section", () => {
    expect(workspaceSection("/de/collections/abc/members")).toBe("collections");
    expect(workspaceSection("/en/items/abc/values")).toBe("collections");
    expect(workspaceSection("/de/items/new")).toBe("collections");
  });
  it("does not mistake public handles or marketing routes for private pages", () => {
    for (const path of [
      "/de",
      "/de/preise",
      "/en/features",
      "/de/my-collection",
      "/de/catalogue",
    ]) {
      expect(workspaceSection(path)).toBeNull();
    }
  });
  it("identifies account screens independently and ignores query/hash fragments", () => {
    expect(workspaceSection("/de/account/security")).toBe("security");
    expect(workspaceSection("/en/dashboard?q=abc#metrics")).toBe("dashboard");
    expect(workspaceSection("/en/shared-search")).toBe("shared-search");
  });
  it("localizes every destination with unique, supported section routes", () => {
    for (const locale of ["de", "en"] as const) {
      const links = workspaceLinks(locale);
      expect(links.length).toBeGreaterThanOrEqual(17);
      expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
      for (const link of links) {
        expect(link.href.startsWith(`/${locale}/`)).toBe(true);
        expect(workspaceSection(link.href)).toBe(link.key);
        expect(link.label.length).toBeGreaterThan(0);
      }
    }
  });
});
