### Task 1: Add central marketing SEO registry and bilingual metadata

**Files:**
- Create: `apps/web/src/seo/public-pages.ts`
- Create: `apps/web/src/seo/public-pages.test.ts`
- Create: `apps/web/src/seo/page-metadata.ts`
- Create: `apps/web/src/seo/page-metadata.test.ts`
- Modify: `apps/web/src/app/[locale]/layout.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Create: `apps/web/src/app/[locale]/features/page.tsx`
- Create: `apps/web/src/app/[locale]/pricing/page.tsx`

**Interfaces:**
- Produces `PUBLIC_MARKETING_PAGES`.
- Produces `marketingMetadata(pageKey, locale): Metadata`.

- [ ] **Step 1: Write failing reciprocal metadata tests**

```ts
import { describe, expect, it } from "vitest";
import { marketingMetadata } from "./page-metadata";

describe("marketingMetadata", () => {
  it("builds reciprocal German and English alternates for pricing", () => {
    const de = marketingMetadata("pricing", "de");
    const en = marketingMetadata("pricing", "en");

    expect(de.alternates).toMatchObject({
      canonical: "/de/preise",
      languages: {
        "de-DE": "/de/preise",
        en: "/en/pricing",
        "x-default": "/de/preise",
      },
    });

    expect(en.alternates).toMatchObject({
      canonical: "/en/pricing",
      languages: {
        "de-DE": "/de/preise",
        en: "/en/pricing",
        "x-default": "/de/preise",
      },
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run apps/web/src/seo/page-metadata.test.ts`  
Expected: FAIL because the SEO registry does not exist.

- [ ] **Step 3: Implement the marketing route registry**

Use stable route keys and translated slugs:

```ts
export const PUBLIC_MARKETING_PAGES = {
  home: { de: "/de", en: "/en" },
  features: { de: "/de/funktionen", en: "/en/features" },
  pricing: { de: "/de/preise", en: "/en/pricing" },
} as const;
```

The German/English visible pages use translation keys from the existing `next-intl` setup.

- [ ] **Step 4: Implement metadata builder**

Return exact title, description, canonical, reciprocal language alternatives, Open Graph and Twitter metadata from one typed registry. Use absolute URLs only after combining with configured `APP_ORIGIN`.

- [ ] **Step 5: Run GREEN/build**

Run:

```bash
pnpm vitest run apps/web/src/seo/public-pages.test.ts apps/web/src/seo/page-metadata.test.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/seo apps/web/src/app
git commit -m "seo: add bilingual marketing metadata"
```

---

