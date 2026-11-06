import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogMaintenanceService } from "./catalog-service";
import { prepareCatalogMoneySubmission } from "./catalog-money-submission";
import { readMoneyFact } from "../money/legacy-money-store";
import { moneyTransaction } from "../money/legacy-money-transaction";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let db: ReturnType<typeof createTestDatabaseClient>;
let category: string, money: string, label: string, foreign: string;
const actor = randomUUID();
const text = { language: "en", title: "Synthetic reference" };
const raw = { amountMinor: 100, currency: "AFN" };
const authoring = {
  kind: "DECIMAL",
  profileId: "legacy-money-iso-2026-09-17-v1",
  currency: "AFN",
  decimal: "1",
};
const path = (op: object) => ({ target: "ENTRY", definitionId: money, intent: op });
const input = (
  patch: object,
  intents: object[],
  targetEntryId: string | null = null,
  baseRevision: number | null = null,
) => ({
  proposal: {
    targetEntryId,
    baseRevision,
    summary: "Evidence checked against synthetic record",
    patch,
  },
  money: { schemaVersion: 1, intents },
});
const create = (attrs: object[] = [{ definitionId: money, value: raw }]) => ({
  kind: "CREATE_ENTRY",
  input: { categoryTemplateId: category, text, attributes: attrs },
});
const prepare = (value: unknown) =>
  db.$transaction((tx) => prepareCatalogMoneySubmission(tx, actor, value), {
    isolationLevel: "ReadCommitted",
  });
describe.runIf(enabled)(
  "catalog money submission selected from actual definitions and revisions",
  () => {
    beforeAll(async () => {
      db = createTestDatabaseClient();
      await db.user.create({
        data: { id: actor, name: "Synthetic proposer", email: `${actor}@example.invalid` },
      });
      const service = createCategoryTemplateMaintenanceService(db);
      const template = await service.createCategoryTemplate({
        key: `fixture_${actor.replaceAll("-", "")}`,
        labels: { de: "Test", en: "Test" },
        definitions: [
          { key: "price", type: "MONEY", labels: { de: "Preis", en: "Price" } },
          { key: "label", type: "SHORT_TEXT", labels: { de: "Text", en: "Text" } },
        ],
      });
      category = template.id;
      money = template.definitions[0]!.id;
      label = template.definitions[1]!.id;
      const other = await service.createCategoryTemplate({
        key: `other_${actor.replaceAll("-", "")}`,
        labels: { de: "Andere", en: "Other" },
        definitions: [{ key: "price", type: "MONEY", labels: { de: "Preis", en: "Price" } }],
      });
      foreign = other.definitions[0]!.id;
    });
    afterAll(async () => {
      if (!db) return;
      const keys = [`fixture_${actor.replaceAll("-", "")}`, `other_${actor.replaceAll("-", "")}`];
      const entry = { categoryTemplate: { key: { in: keys } } };
      await db.catalogRevision.deleteMany({ where: { entry } });
      await db.catalogAttributeValue.deleteMany({ where: { entry } });
      await db.catalogVariant.deleteMany({ where: { entry } });
      await db.catalogEntry.deleteMany({ where: entry });
      await db.catalogAttributeLabel.deleteMany({
        where: { definition: { categoryTemplate: { key: { in: keys } } } },
      });
      await db.catalogAttributeDefinition.deleteMany({
        where: { categoryTemplate: { key: { in: keys } } },
      });
      await db.categoryTemplateLabel.deleteMany({
        where: { categoryTemplate: { key: { in: keys } } },
      });
      await db.categoryTemplate.deleteMany({ where: { key: { in: keys } } });
      await db.user.deleteMany({ where: { id: actor } });
      await db?.$disconnect();
    });
    it("freezes the server's exact pinned authoring receipt", async () => {
      const envelope = await prepare(input(create(), [path({ op: "NEW", authoring })]));
      expect(envelope).toMatchObject({
        schemaVersion: 1,
        baseRevision: null,
        paths: [
          {
            target: "ENTRY",
            definitionId: money,
            kind: "AUTHORED",
            receipt: {
              raw: { amountMinor: "100", currency: "AFN" },
              exponent: 2,
              normalizedDecimal: "1.00",
            },
          },
        ],
      });
      expect(envelope.patchDigest).toMatch(/^[a-f0-9]{64}$/u);
    });
    it("rejects missing, extraneous, foreign and unknown-definition intents", async () => {
      for (const value of [
        input(create(), []),
        input(create([{ definitionId: label, value: "Not money" }]), [
          path({ op: "NEW", authoring }),
        ]),
        input(create([{ definitionId: foreign, value: raw }]), [
          { target: "ENTRY", definitionId: foreign, intent: { op: "NEW", authoring } },
        ]),
        input(create([{ definitionId: randomUUID(), value: raw }]), []),
      ])
        await expect(prepare(value)).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
    });
    it("rejects authoring whose exact raw patch amount or currency differs", async () => {
      for (const value of [
        { amountMinor: 1, currency: "AFN" },
        { amountMinor: 100, currency: "EUR" },
      ])
        await expect(
          prepare(
            input(create([{ definitionId: money, value }]), [path({ op: "NEW", authoring })]),
          ),
        ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
    });
    it("preserves a historical raw path only with its exact current fact token", async () => {
      // Seed an actual pre-authority historical snapshot without asking the prospective writer to author ZZZ.
      const entry = { state: { id: randomUUID() } };
      await db.catalogEntry.create({
        data: {
          id: entry.state.id,
          categoryTemplateId: category,
          authored: { text: { ...text, translations: [] }, sources: [] },
        },
      });
      await db.catalogRevision.create({
        data: {
          entryId: entry.state.id,
          revision: 1,
          snapshot: {
            schemaVersion: 1,
            id: entry.state.id,
            categoryTemplateId: category,
            text: { ...text, translations: [] },
            sources: [],
            attributes: [
              {
                definitionId: money,
                key: "price",
                type: "MONEY",
                value: { amountMinor: 1, currency: "ZZZ" },
              },
            ],
            variants: [],
            identifiers: [],
          },
        },
      });
      const subject = {
        family: "CATALOG" as const,
        entryId: entry.state.id,
        revision: 1,
        target: { kind: "ENTRY" as const },
        definitionId: money,
      };
      const fact = await db.$transaction((tx) =>
        readMoneyFact(moneyTransaction(tx), subject, { userId: actor }),
      );
      const patch = {
        kind: "UPDATE_ENTRY",
        input: {
          attributes: [{ definitionId: money, value: { amountMinor: 1, currency: "ZZZ" } }],
        },
      };
      const envelope = await prepare(
        input(
          patch,
          [path({ op: "RETAIN", expectedFactToken: fact.factToken })],
          entry.state.id,
          1,
        ),
      );
      expect(envelope.paths).toEqual([
        { target: "ENTRY", definitionId: money, kind: "RETAIN", factToken: fact.factToken },
      ]);
      await expect(
        prepare(input(patch, [path({ op: "RETAIN", expectedFactToken: "a" })], entry.state.id, 1)),
      ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
      await expect(
        prepare(input(patch, [path({ op: "NEW", authoring })], entry.state.id, 1)),
      ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
    });
    it("does not demand intents for untouched fields or removed fields", async () => {
      const entry = await createCatalogMaintenanceService(db).createCatalogEntry({
        categoryTemplateId: category,
        text,
        attributes: [{ definitionId: money, value: raw }],
      });
      for (const patch of [
        { kind: "UPDATE_ENTRY", input: { text: { ...text, title: "Text only" } } },
        { kind: "UPDATE_ENTRY", input: { attributes: [] } },
      ])
        expect((await prepare(input(patch, [], entry.state.id, 1))).paths).toEqual([]);
    });
    it("distinguishes new paths from deliberate same-raw replacements", async () => {
      const catalog = createCatalogMaintenanceService(db);
      const entry = await catalog.createCatalogEntry({ categoryTemplateId: category, text });
      const patch = {
        kind: "UPDATE_ENTRY",
        input: { attributes: [{ definitionId: money, value: raw }] },
      };
      expect(
        (await prepare(input(patch, [path({ op: "NEW", authoring })], entry.state.id, 1))).paths[0],
      ).toMatchObject({ kind: "AUTHORED" });
      await expect(
        prepare(
          input(
            patch,
            [path({ op: "REPLACE", expectedFactToken: "a", authoring })],
            entry.state.id,
            1,
          ),
        ),
      ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
      const saved = await catalog.updateCatalogEntry(entry.state.id, 1, patch.input);
      const fact = await db.$transaction((tx) =>
        readMoneyFact(
          moneyTransaction(tx),
          {
            family: "CATALOG",
            entryId: entry.state.id,
            revision: saved.revision,
            target: { kind: "ENTRY" },
            definitionId: money,
          },
          { userId: actor },
        ),
      );
      expect(
        (
          await prepare(
            input(
              patch,
              [path({ op: "REPLACE", expectedFactToken: fact.factToken, authoring })],
              entry.state.id,
              saved.revision,
            ),
          )
        ).paths[0],
      ).toMatchObject({ kind: "AUTHORED", receipt: { raw: { amountMinor: "100" } } });
      const changed = {
        ...patch,
        input: { attributes: [{ definitionId: money, value: { ...raw, amountMinor: 200 } }] },
      };
      await expect(
        prepare(
          input(
            changed,
            [path({ op: "RETAIN", expectedFactToken: fact.factToken })],
            entry.state.id,
            saved.revision,
          ),
        ),
      ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
    });
    it("binds variant retention to that exact variant rather than its entry", async () => {
      const catalog = createCatalogMaintenanceService(db);
      const entry = await catalog.createCatalogEntry({
        categoryTemplateId: category,
        text,
        attributes: [{ definitionId: money, value: raw }],
      });
      const added = await catalog.addCatalogVariant(entry.state.id, 1, {
        text,
        attributes: [{ definitionId: money, value: { ...raw, amountMinor: 200 } }],
      });
      const variant = added;
      const base = {
        family: "CATALOG" as const,
        entryId: entry.state.id,
        revision: added.revision,
        definitionId: money,
      };
      const read = (target: { kind: "ENTRY" } | { kind: "VARIANT"; variantId: string }) =>
        db.$transaction((tx) =>
          readMoneyFact(moneyTransaction(tx), { ...base, target }, { userId: actor }),
        );
      const variantFact = await read({ kind: "VARIANT", variantId: variant.id });
      const entryFact = await read({ kind: "ENTRY" });
      const patch = {
        kind: "UPDATE_VARIANT",
        variantId: variant.id,
        input: { text, attributes: [{ definitionId: money, value: { ...raw, amountMinor: 200 } }] },
      };
      const retained = (token: string) =>
        input(
          patch,
          [
            {
              target: "OPERATION_VARIANT",
              definitionId: money,
              intent: { op: "RETAIN", expectedFactToken: token },
            },
          ],
          entry.state.id,
          added.revision,
        );
      expect((await prepare(retained(variantFact.factToken))).paths).toEqual([
        {
          target: "OPERATION_VARIANT",
          definitionId: money,
          kind: "RETAIN",
          factToken: variantFact.factToken,
        },
      ]);
      await expect(prepare(retained(entryFact.factToken))).rejects.toMatchObject({
        code: "MONEY_CONFLICT",
      });
    });
    it("rejects a snapshot whose category differs from its actual parent", async () => {
      const id = randomUUID();
      await db.catalogEntry.create({
        data: {
          id,
          categoryTemplateId: category,
          authored: { text: { ...text, translations: [] }, sources: [] },
        },
      });
      await db.catalogRevision.create({
        data: {
          entryId: id,
          revision: 1,
          snapshot: {
            schemaVersion: 1,
            id,
            categoryTemplateId: randomUUID(),
            text: { ...text, translations: [] },
            sources: [],
            attributes: [],
            variants: [],
            identifiers: [],
          },
        },
      });
      await expect(
        prepare(input({ kind: "UPDATE_ENTRY", input: { text } }, [], id, 1)),
      ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
    });
  },
);
