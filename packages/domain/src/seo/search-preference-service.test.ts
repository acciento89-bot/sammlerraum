import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createProfileService } from "../identity/profile-service";
import { createSearchPreferenceService } from "./search-preference-service";
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual PostgreSQL owner-only search preference",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>,
      isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture(withProfile = true) {
      const id = randomUUID();
      await db.user.create({
        data: {
          id,
          email: `${id}@example.invalid`,
          name: "Private identity",
          ...(withProfile
            ? { profile: { create: { handle: `seo-${id}`, displayName: "Public collector" } } }
            : {}),
        },
      });
      return { id, service: createSearchPreferenceService(db) };
    }
    it("defaults every existing/new profile off with a valid public locale", async () => {
      const { id, service } = await fixture();
      expect(await service.getOwn(id)).toEqual({
        searchEngineIndexingEnabled: false,
        publicLocale: "de",
        revision: 0,
      });
    });
    it("persists explicit owner opt-in and withdrawal without any paid-plan dependency", async () => {
      const { id, service } = await fixture();
      const on = await service.updateOwn(id, {
        searchEngineIndexingEnabled: true,
        publicLocale: "en",
        revision: 0,
      });
      expect(on).toEqual({ searchEngineIndexingEnabled: true, publicLocale: "en", revision: 1 });
      const off = await service.updateOwn(id, { ...on, searchEngineIndexingEnabled: false });
      expect(off).toEqual({ searchEngineIndexingEnabled: false, publicLocale: "en", revision: 2 });
      expect(await service.getOwn(id)).toEqual(off);
    });
    it("prevents a stale tab from silently re-enabling indexing after withdrawal", async () => {
      const { id, service } = await fixture();
      await service.updateOwn(id, {
        searchEngineIndexingEnabled: true,
        publicLocale: "de",
        revision: 0,
      });
      await service.updateOwn(id, {
        searchEngineIndexingEnabled: false,
        publicLocale: "de",
        revision: 1,
      });
      await expect(
        service.updateOwn(id, {
          searchEngineIndexingEnabled: true,
          publicLocale: "de",
          revision: 0,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await service.getOwn(id))?.searchEngineIndexingEnabled).toBe(false);
    });
    it("never creates a profile or writes another user's preference from a supplied userId", async () => {
      const f = await fixture(false),
        other = await fixture();
      expect(await f.service.getOwn(f.id)).toBeNull();
      await expect(
        f.service.updateOwn(f.id, {
          searchEngineIndexingEnabled: true,
          publicLocale: "de",
          revision: 0,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        f.service.updateOwn(f.id, {
          userId: other.id,
          searchEngineIndexingEnabled: true,
          publicLocale: "de",
          revision: 0,
        }),
      ).rejects.toThrow();
      expect((await f.service.getOwn(other.id))?.searchEngineIndexingEnabled).toBe(false);
    });
    it("ordinary profile edits preserve explicit search consent, locale and revision", async () => {
      const { id, service } = await fixture();
      const prefs = await service.updateOwn(id, {
        searchEngineIndexingEnabled: true,
        publicLocale: "en",
        revision: 0,
      });
      await createProfileService(db).upsertOwnProfile(id, {
        handle: `changed-${id}`,
        displayName: "Changed public name",
        bio: null,
        avatarAssetId: null,
      });
      expect(await service.getOwn(id)).toEqual(prefs);
    });
    it("strictly rejects coerced consent, invalid locales and revision without changing state", async () => {
      const { id, service } = await fixture();
      for (const input of [
        { searchEngineIndexingEnabled: "true", publicLocale: "de", revision: 0 },
        { searchEngineIndexingEnabled: true, publicLocale: "fr", revision: 0 },
        { searchEngineIndexingEnabled: true, publicLocale: "de", revision: -1 },
      ])
        await expect(service.updateOwn(id, input)).rejects.toThrow();
      expect((await service.getOwn(id))?.revision).toBe(0);
    });
  },
);
