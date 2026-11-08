import { describe, expect, it } from "vitest";
import * as subject from "./legal-pages";

describe("public release information", () => {
  it("provides only the two owned localized documents", () => {
    expect(subject?.legalDocument, "public document implementation is missing").toBeTypeOf(
      "function",
    );
    if (!subject) return;
    for (const locale of ["de", "en"])
      for (const document of ["privacy", "imprint"])
        expect(subject.legalDocument(locale, document)?.title).toBeTruthy();
    for (const [locale, document] of [
      ["fr", "privacy"],
      ["de", "account"],
      ["en", "../privacy"],
    ] as const)
      expect(subject.legalDocument(locale, document)).toBeNull();
  });

  it("keeps document identity across languages without retaining private query state", () => {
    expect(subject?.legalLocaleHref, "closed legal navigation is missing").toBeTypeOf("function");
    if (!subject) return;
    expect(subject.legalLocaleHref("/legal/de/privacy", "en")).toBe("/legal/en/privacy");
    expect(subject.legalLocaleHref("/legal/en/imprint", "de")).toBe("/legal/de/imprint");
    for (const path of [
      "/de/account",
      "/share/token",
      "/legal/de/privacy?token=private",
      "https://foreign.test/legal/de/privacy",
      "/legal/de/unknown",
    ])
      expect(subject.legalLocaleHref(path, "en")).toBeNull();
    expect(subject.legalLocaleHref("/legal/de/privacy", "fr")).toBeNull();
  });

  it("identifies the actual controller and account mail processor in both languages", () => {
    expect(subject?.legalDocument, "privacy information is missing").toBeTypeOf("function");
    if (!subject) return;
    for (const locale of ["de", "en"]) {
      const text = JSON.stringify(subject.legalDocument(locale, "privacy"));
      expect(text).toContain("Piotr Kaminski");
      expect(text).toContain("contact@kamilunavo.com");
      expect(text).toContain("Resend");
      expect(text).toContain("https://resend.com/legal/dpa");
      expect(text).not.toMatch(/GOCSPX-|-----BEGIN PRIVATE KEY-----|re_[A-Za-z0-9]{20}/u);
    }
  });

  it("does not describe disabled optional integrations as active", () => {
    expect(subject?.legalDocument, "provider-state disclosure is missing").toBeTypeOf("function");
    if (!subject) return;
    const off = subject.legalDocument("en", "privacy", {
      ai: false,
      billing: false,
      market: false,
    });
    const on = subject.legalDocument("en", "privacy", { ai: true, billing: true, market: true });
    expect(
      off?.sections.find((section) => section.id === "optional")?.paragraphs.join(" "),
    ).toContain("not enabled");
    const active = on?.sections.find((section) => section.id === "optional")?.paragraphs.join(" ");
    expect(active).toContain("OpenAI");
    expect(active).toContain("Stripe");
    expect(active).not.toContain("not enabled");
  });
});
