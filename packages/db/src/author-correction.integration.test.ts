import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "./testing/legacy-money-schema";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
describe.runIf(enabled)("native prospective correction privacy", () => {
  it("retains a correction reason until actual User FK erasure while preserving catalog receipt facts", async () => {
    const own = await createLegacyMoneyTestSchema(),
      client = new Client({ connectionString: own.databaseUrl });
    await client.connect();
    try {
      const actor = randomUUID(),
        category = randomUUID(),
        definition = randomUUID(),
        entry = randomUUID(),
        event = randomUUID();
      await client.query(
        `INSERT INTO "user" (id,name,email,"createdAt","updatedAt") VALUES ($1,'Synthetic correction',$2,now(),now())`,
        [actor, `${actor}@example.invalid`],
      );
      await client.query(`INSERT INTO "CategoryTemplate" (id,key) VALUES ($1,$2)`, [
        category,
        `correction_${category.replaceAll("-", "")}`,
      ]);
      await client.query(
        `INSERT INTO "CatalogAttributeDefinition" (id,"categoryTemplateId",key,type,position) VALUES ($1,$2,'price','MONEY',0)`,
        [definition, category],
      );
      const snapshot = {
        schemaVersion: 1,
        id: entry,
        categoryTemplateId: category,
        text: { language: "en", title: "Correction fixture" },
        attributes: [
          {
            definitionId: definition,
            key: "price",
            type: "MONEY",
            value: { amountMinor: 1, currency: "AFN" },
          },
        ],
        variants: [],
        identifiers: [],
      };
      await client.query(
        `INSERT INTO "CatalogEntry" (id,"categoryTemplateId",authored) VALUES ($1,$2,$3::jsonb)`,
        [entry, category, JSON.stringify(snapshot)],
      );
      await client.query(
        `INSERT INTO "CatalogRevision" ("entryId",revision,snapshot) VALUES ($1,1,$2::jsonb)`,
        [entry, JSON.stringify(snapshot)],
      );
      const receipt = {
        schemaVersion: 1,
        profileId: "legacy-money-iso-2026-09-17-v1",
        authorityHash: "33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff",
        raw: { amountMinor: "1", currency: "AFN" },
        exponent: 2,
        unitKey: "iso4217-2026-09-17:AFN",
        normalizedDecimal: "0.01",
      };
      await client.query(
        `INSERT INTO "CatalogMoneyInterpretationEvent" (id,"entryId",revision,"targetKey","definitionId",sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId",receipt,"actorId",reason) VALUES ($1,$2,1,'entry',$3,1,'AUTHOR',1,'AFN',2,'iso4217-2026-09-17:AFN','legacy-money-iso-2026-09-17-v1',$4::jsonb,$5,'Private correction note')`,
        [event, entry, definition, JSON.stringify(receipt), actor],
      );
      expect(
        (
          await client.query('SELECT reason FROM "CatalogMoneyInterpretationEvent" WHERE id=$1', [
            event,
          ])
        ).rows[0].reason,
      ).toBe("Private correction note");
      await expect(
        client.query('UPDATE "CatalogMoneyInterpretationEvent" SET "actorId"=NULL WHERE id=$1', [
          event,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query('DELETE FROM "user" WHERE id=$1', [actor]);
      const after = (
        await client.query(
          'SELECT "actorId",reason,"evidenceErasedAt",receipt,"rawAmountMinor"::text AS raw,exponent FROM "CatalogMoneyInterpretationEvent" WHERE id=$1',
          [event],
        )
      ).rows[0];
      expect(after).toMatchObject({ actorId: null, reason: null, receipt, raw: "1", exponent: 2 });
      expect(after.evidenceErasedAt).not.toBeNull();
    } finally {
      await client.end();
      await own.cleanup();
    }
  });
});
