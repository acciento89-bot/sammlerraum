import { beginMutationAudit, appendMutationAudit } from "../audit/mutation-audit";
import { captureMoneyAuditSnapshot } from "../audit/money-audit";
import type { AuditContext } from "../audit/audit-context";
import { readPersonalMoneyHistory } from "./personal-money-history";
import {
  CreateItemMoneyInputSchema,
  UpdateItemMoneyInputSchema,
  CustomMoneyWriteInputSchema,
  ItemMoneyResultSchema,
  type ItemMoneyResult,
} from "@sammlerraum/contracts/personal-money";
import {
  ClassifyMoneyInputSchema,
  LegacyMoneySubjectSchema,
  RevokeMoneyInputSchema,
  legacyMoneyFail,
  type MoneySubject,
  type MoneyView,
  type AuthoringReceipt,
  LegacyMoneyError,
} from "@sammlerraum/contracts/legacy-money";
import {
  createItemInTransaction,
  readOwnedItemInTransaction,
  updateItemInTransaction,
  type ItemTransaction,
} from "../items/item-service";
import {
  setFieldValueInTransaction,
  type CustomFieldTransaction,
} from "../custom-fields/custom-field-service";
import { parseLegacyMoneyAuthoring } from "./legacy-money-policy";
import {
  readMoneyFact,
  requireMoneyToken,
  appendMoneyAssertion,
  revokeMoneyAssertion,
} from "./legacy-money-store";
import { moneyTransaction } from "./legacy-money-transaction";
import { isReadSerializationFailure, isReadDependencyFailure } from "../api/read-dependency-errors";
import type { SearchReadTransaction } from "../search/search-read";
import { z } from "zod";
type Tx = ItemTransaction & CustomFieldTransaction;
export type PersonalMoneyDatabase = {
  $transaction<T>(
    work: (tx: Tx) => Promise<T>,
    options: { isolationLevel: "ReadCommitted"; maxWait: number; timeout: number },
  ): Promise<T>;
};
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return r.data;
}
function personal(input: MoneySubject) {
  const s = parse(LegacyMoneySubjectSchema, input);
  if (s.family === "CATALOG") return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return s;
}
function raw(receipt: AuthoringReceipt) {
  return {
    purchaseAmountMinor: Number(receipt.raw.amountMinor),
    purchaseCurrency: receipt.raw.currency,
  };
}
export function createPersonalMoneyService(database: PersonalMoneyDatabase, actorId: string) {
  const who = { userId: actorId };
  async function run<T>(work: (tx: Tx, money: SearchReadTransaction) => Promise<T>): Promise<T> {
    const stop = performance.now() + 12000;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = Math.floor(stop - performance.now());
      if (remaining < 1) return legacyMoneyFail("MONEY_UNAVAILABLE");
      try {
        const saved = await database.$transaction(
          async (tx) => {
            const timeout = Math.min(5000, remaining);
            await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout','2000ms',true),set_config('lock_timeout','500ms',true),set_config('transaction_timeout',${`${timeout}ms`},true)`;
            const result = await work(tx, moneyTransaction(tx));
            if (performance.now() >= stop) return legacyMoneyFail("MONEY_UNAVAILABLE");
            return result;
          },
          {
            isolationLevel: "ReadCommitted",
            maxWait: Math.min(2000, remaining),
            timeout: Math.min(5000, remaining),
          },
        );
        if (performance.now() >= stop) return legacyMoneyFail("MONEY_UNAVAILABLE");
        return saved;
      } catch (error) {
        if (error instanceof LegacyMoneyError) throw error;
        if (isReadSerializationFailure(error) && attempt < 2 && performance.now() < stop) continue;
        if (isReadDependencyFailure(error)) return legacyMoneyFail("MONEY_UNAVAILABLE");
        throw error;
      }
    }
    return legacyMoneyFail("MONEY_UNAVAILABLE");
  }
  async function result(
    tx: Tx,
    money: SearchReadTransaction,
    id: string,
  ): Promise<ItemMoneyResult> {
    try {
      const item = await readOwnedItemInTransaction(tx, actorId, id);
      return ItemMoneyResultSchema.parse({
        schemaVersion: 1,
        item,
        purchase: await readMoneyFact(money, { family: "PURCHASE", itemId: id }, who),
      });
    } catch (error) {
      if (error instanceof RangeError || error instanceof z.ZodError)
        return legacyMoneyFail("MONEY_DATA_INTEGRITY");
      throw error;
    }
  }

  async function appendPurchaseAudit(
    tx: Tx,
    money: SearchReadTransaction,
    audit: AuditContext,
    s: MoneySubject,
    before: Awaited<ReturnType<typeof captureMoneyAuditSnapshot>> | null,
  ) {
    if (s.family === "CATALOG") return legacyMoneyFail("LEGACY_MONEY_INVALID");
    const after = await captureMoneyAuditSnapshot(money, s, actorId);
    if (JSON.stringify(before) !== JSON.stringify(after))
      await appendMutationAudit(tx, audit, {
        resourceType: "ITEM",
        resourceId: s.itemId,
        action: "ITEM_MONEY_CHANGED",
        before,
        after,
      });
  }
  async function createItemV2(input: unknown): Promise<ItemMoneyResult> {
    const data = parse(CreateItemMoneyInputSchema, input),
      receipt = data.purchase ? parseLegacyMoneyAuthoring(data.purchase.authoring) : null;
    return run(async (tx, money) => {
      const audit = await beginMutationAudit(
        tx,
        actorId,
        () => new LegacyMoneyError("MONEY_NOT_FOUND"),
      );
      const item = await createItemInTransaction(tx, actorId, {
        ...data.item,
        ...(receipt ? raw(receipt) : { purchaseAmountMinor: null, purchaseCurrency: null }),
      });
      if (receipt) {
        const s = { family: "PURCHASE" as const, itemId: item.id },
          view = await readMoneyFact(money, s, who),
          fact = await requireMoneyToken(money, s, who, view.factToken);
        await appendMoneyAssertion(money, fact, { kind: "AUTHOR", receipt });
      }
      if (receipt)
        await appendPurchaseAudit(tx, money, audit, { family: "PURCHASE", itemId: item.id }, null);
      return result(tx, money, item.id);
    });
  }
  async function updateItemV2(id: string, input: unknown): Promise<ItemMoneyResult> {
    const data = parse(UpdateItemMoneyInputSchema, input);
    return run(async (tx, money) => {
      const audit = await beginMutationAudit(
        tx,
        actorId,
        () => new LegacyMoneyError("MONEY_NOT_FOUND"),
      );
      const s = personal({ family: "PURCHASE", itemId: id });
      const before =
        data.purchase && data.purchase.op !== "RETAIN"
          ? await captureMoneyAuditSnapshot(money, s, actorId)
          : null;
      if (data.purchase) await requireMoneyToken(money, s, who, data.purchase.expectedFactToken);
      // RETAIN/omission must omit raw column names from the existing writer.
      const receipt =
        data.purchase?.op === "REPLACE" ? parseLegacyMoneyAuthoring(data.purchase.authoring) : null;
      const fields = {
        ...data.item,
        ...(receipt
          ? raw(receipt)
          : data.purchase?.op === "CLEAR"
            ? { purchaseAmountMinor: null, purchaseCurrency: null }
            : {}),
      };
      if (Object.keys(fields).length > 0) await updateItemInTransaction(tx, actorId, id, fields);
      if (receipt) {
        const view = await readMoneyFact(money, s, who),
          fact = await requireMoneyToken(money, s, who, view.factToken);
        await appendMoneyAssertion(money, fact, {
          kind: "AUTHOR",
          receipt,
          ...(data.purchase?.op === "REPLACE" && data.purchase.correctionReason !== undefined
            ? { correctionReason: data.purchase.correctionReason }
            : {}),
        });
      }
      if (data.purchase && data.purchase.op !== "RETAIN")
        await appendPurchaseAudit(tx, money, audit, s, before);
      return result(tx, money, id);
    });
  }
  async function setCustomMoneyV2(
    itemId: string,
    fieldDefinitionId: string,
    input: unknown,
  ): Promise<MoneyView> {
    const data = parse(CustomMoneyWriteInputSchema, input),
      s = personal({ family: "CUSTOM", itemId, fieldDefinitionId });
    return run(async (tx, money) => {
      const audit = await beginMutationAudit(
        tx,
        actorId,
        () => new LegacyMoneyError("MONEY_NOT_FOUND"),
      );
      await requireMoneyToken(money, s, who, data.intent.expectedFactToken);
      if (data.intent.op === "RETAIN") return readMoneyFact(money, s, who);
      const before = await captureMoneyAuditSnapshot(money, s, actorId);
      const receipt =
        data.intent.op === "REPLACE" ? parseLegacyMoneyAuthoring(data.intent.authoring) : null;
      await setFieldValueInTransaction(
        tx,
        actorId,
        itemId,
        fieldDefinitionId,
        receipt
          ? { amountMinor: Number(receipt.raw.amountMinor), currency: receipt.raw.currency }
          : null,
        receipt ? { authoringReceipt: receipt } : {},
      );
      if (receipt) {
        const view = await readMoneyFact(money, s, who),
          fact = await requireMoneyToken(money, s, who, view.factToken);
        await appendMoneyAssertion(money, fact, {
          kind: "AUTHOR",
          receipt,
          ...(data.intent.op === "REPLACE" && data.intent.correctionReason !== undefined
            ? { correctionReason: data.intent.correctionReason }
            : {}),
        });
      }
      await appendPurchaseAudit(tx, money, audit, s, before);
      return readMoneyFact(money, s, who);
    });
  }
  const getMoney = (s: MoneySubject) => run((_tx, money) => readMoneyFact(money, personal(s), who));
  const classifyMoney = (s: MoneySubject, input: unknown) =>
    run(async (tx, money) => {
      const data = parse(ClassifyMoneyInputSchema, input),
        subject = personal(s),
        audit = await beginMutationAudit(
          tx,
          actorId,
          () => new LegacyMoneyError("MONEY_NOT_FOUND"),
        );
      const fact = await requireMoneyToken(money, subject, who, data.expectedFactToken),
        before = await captureMoneyAuditSnapshot(money, subject, actorId);
      const saved = await appendMoneyAssertion(money, fact, { kind: "CLASSIFY", input: data });
      await appendPurchaseAudit(tx, money, audit, subject, before);
      return saved;
    });
  const revokeAssertion = (s: MoneySubject, input: unknown) =>
    run(async (tx, money) => {
      const data = parse(RevokeMoneyInputSchema, input),
        subject = personal(s),
        audit = await beginMutationAudit(
          tx,
          actorId,
          () => new LegacyMoneyError("MONEY_NOT_FOUND"),
        ),
        before = await captureMoneyAuditSnapshot(money, subject, actorId);
      await revokeMoneyAssertion(money, subject, data, who);
      await appendPurchaseAudit(tx, money, audit, subject, before);
    });
  const getMoneyBulk = (itemId: string, fields: string[]) =>
    run(async (_tx, money) => {
      if (fields.length > 50 || new Set(fields).size !== fields.length)
        return legacyMoneyFail("LEGACY_MONEY_INVALID");
      const purchase = await readMoneyFact(money, personal({ family: "PURCHASE", itemId }), who),
        custom: MoneyView[] = [];
      for (const fieldDefinitionId of fields)
        custom.push(
          await readMoneyFact(
            money,
            personal({ family: "CUSTOM", itemId, fieldDefinitionId }),
            who,
          ),
        );
      return { schemaVersion: 1 as const, purchase, custom };
    });
  const getItemV2 = (id: string) => {
    const s = personal({ family: "PURCHASE", itemId: id });
    return run((tx, money) => result(tx, money, s.itemId));
  };
  const listHistory = (s: MoneySubject, query: unknown) =>
    run((_tx, money) => readPersonalMoneyHistory(money, personal(s), actorId, query));
  return {
    listHistory,
    getMoneyBulk,
    createItemV2,
    getItemV2,
    updateItemV2,
    setCustomMoneyV2,
    getMoney,
    classifyMoney,
    revokeAssertion,
  };
}
