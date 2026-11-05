import { randomUUID } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  milestoneFail,
  parsePersonalMilestoneMutation,
  parsePersonalMilestoneUpdate,
  parsePersonalMilestoneDelete,
  parsePersonalMilestonePageInput,
  parsePersonalMilestoneId,
  PersonalMilestoneDtoSchema,
  PersonalMilestonePageSchema,
  PERSONAL_MILESTONE_MAX_REVISION,
  PERSONAL_MILESTONE_MAX_RESPONSE_BYTES,
  type PersonalMilestoneDto,
  type PersonalMilestonePage,
} from "@sammlerraum/contracts/personal-milestones";
import { searchFail } from "@sammlerraum/contracts/item-search";
import { checkedSearchTotal, type SearchActor } from "../search/item-search-service";
import {
  runSearchTransaction,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "../search/search-read";
import {
  milestoneContextHash,
  decodeMilestoneCursor,
  encodeMilestoneCursor,
} from "./personal-milestone-cursor";
type Row = {
  id: string;
  title: string;
  milestoneDate: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};
const columns = Prisma.sql`id,title,to_char("milestoneDate",'YYYY-MM-DD') AS "milestoneDate",revision,"createdAt","updatedAt"`;
function ownerId(actor: SearchActor) {
  if (!actor || typeof actor.userId !== "string" || !actor.userId || actor.userId.includes("\0"))
    return milestoneFail("MILESTONE_INVALID");
  return actor.userId;
}
function timestamp(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    return searchFail("SEARCH_INVARIANT");
  return value.toISOString();
}
function dto(row: Row): PersonalMilestoneDto {
  const parsed = PersonalMilestoneDtoSchema.safeParse({
    id: row.id,
    title: row.title,
    milestoneDate: row.milestoneDate,
    revision: row.revision,
    dateBasis: "OWNER_ENTERED",
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  });
  if (!parsed.success) return searchFail("SEARCH_INVARIANT");
  return parsed.data;
}
function bounded<T>(tx: BoundedSearchReadTransaction, result: T): T {
  if (Buffer.byteLength(JSON.stringify(result)) > PERSONAL_MILESTONE_MAX_RESPONSE_BYTES)
    return searchFail("SEARCH_UNAVAILABLE");
  tx.checkBudget();
  return result;
}
async function load(tx: BoundedSearchReadTransaction, owner: string, id: string) {
  const rows = await tx.$queryRaw<Row[]>(
    Prisma.sql`/* milestones:load */ SELECT ${columns} FROM "PersonalMilestone" WHERE id=${id}::uuid AND "ownerId"=${owner} FOR UPDATE`,
  );
  if (rows.length === 0) return milestoneFail("MILESTONE_NOT_FOUND");
  if (rows.length !== 1) return searchFail("SEARCH_INVARIANT");
  return dto(rows[0]!);
}
export function createPersonalMilestoneService(database: SearchDatabase) {
  return {
    async createMilestone(actor: SearchActor, input: unknown): Promise<PersonalMilestoneDto> {
      const owner = ownerId(actor),
        value = parsePersonalMilestoneMutation(input),
        id = randomUUID();
      return runSearchTransaction(database, async (tx) => {
        const rows = await tx.$queryRaw<Row[]>(
          Prisma.sql`/* milestones:create */ INSERT INTO "PersonalMilestone" (id,"ownerId",title,"milestoneDate",revision,"createdAt","updatedAt") SELECT ${id}::uuid,${owner},${value.title},${value.milestoneDate}::date,1,now,now FROM (SELECT date_trunc('milliseconds',clock_timestamp()) AS now) recording RETURNING ${columns}`,
        );
        if (rows.length !== 1) return searchFail("SEARCH_INVARIANT");
        return bounded(tx, dto(rows[0]!));
      });
    },
    async listMilestones(actor: SearchActor, input: unknown = {}): Promise<PersonalMilestonePage> {
      const owner = ownerId(actor),
        query = parsePersonalMilestonePageInput(input),
        context = milestoneContextHash(owner, query.limit),
        cursor = query.cursor ? decodeMilestoneCursor(query.cursor, context) : null;
      return runSearchTransaction(database, async (tx) => {
        const [clock] = await tx.$queryRaw<Array<{ readAt: Date }>>(
          Prisma.sql`/* milestones:clock */ SELECT clock_timestamp() AS "readAt"`,
        );
        if (!clock) return searchFail("SEARCH_INVARIANT");
        const [count] = await tx.$queryRaw<Array<{ total: bigint }>>(
          Prisma.sql`/* milestones:count */ SELECT count(*) AS total FROM "PersonalMilestone" WHERE "ownerId"=${owner}`,
        );
        if (!count) return searchFail("SEARCH_INVARIANT");
        const total = checkedSearchTotal(count.total);
        const after = cursor
          ? Prisma.sql`("milestoneDate","createdAt",id)<(${cursor.after.milestoneDate}::date,${cursor.after.createdAt}::timestamptz,${cursor.after.id}::uuid)`
          : Prisma.sql`TRUE`;
        const rows = await tx.$queryRaw<Row[]>(
          Prisma.sql`/* milestones:page */ SELECT ${columns} FROM "PersonalMilestone" WHERE "ownerId"=${owner} AND ${after} ORDER BY "milestoneDate" DESC,"createdAt" DESC,id DESC LIMIT ${query.limit + 1}`,
        );
        if (
          rows.length > query.limit + 1 ||
          total < rows.length ||
          (!cursor && rows.length !== Math.min(total, query.limit + 1))
        )
          return searchFail("SEARCH_INVARIANT");
        const retained = rows.map(dto),
          items = retained.slice(0, query.limit),
          last = items.at(-1);
        const nextCursor =
          retained.length > query.limit && last
            ? encodeMilestoneCursor({
                v: 1,
                contextHash: context,
                after: {
                  milestoneDate: last.milestoneDate,
                  createdAt: last.createdAt,
                  id: last.id,
                },
              })
            : null;
        const page = PersonalMilestonePageSchema.safeParse({
          version: 1,
          scope: "OWNED",
          selectionBasis: "ALL_PERSONAL_MILESTONES",
          readAt: timestamp(clock.readAt),
          items,
          total,
          nextCursor,
        });
        if (!page.success) return searchFail("SEARCH_INVARIANT");
        return bounded(tx, page.data);
      });
    },
    async updateMilestone(
      actor: SearchActor,
      idInput: string,
      input: unknown,
    ): Promise<PersonalMilestoneDto> {
      const owner = ownerId(actor),
        id = parsePersonalMilestoneId(idInput),
        value = parsePersonalMilestoneUpdate(input);
      return runSearchTransaction(database, async (tx) => {
        const current = await load(tx, owner, id);
        if (
          current.revision !== value.expectedRevision ||
          current.revision >= PERSONAL_MILESTONE_MAX_REVISION
        )
          return milestoneFail("MILESTONE_CONFLICT");
        const rows = await tx.$queryRaw<Row[]>(
          Prisma.sql`/* milestones:update */ UPDATE "PersonalMilestone" SET title=${value.title},"milestoneDate"=${value.milestoneDate}::date,revision=revision+1,"updatedAt"=greatest("updatedAt",date_trunc('milliseconds',clock_timestamp())) WHERE id=${id}::uuid AND "ownerId"=${owner} AND revision=${value.expectedRevision} RETURNING ${columns}`,
        );
        if (rows.length === 0) return milestoneFail("MILESTONE_CONFLICT");
        if (rows.length !== 1) return searchFail("SEARCH_INVARIANT");
        return bounded(tx, dto(rows[0]!));
      });
    },
    async deleteMilestone(
      actor: SearchActor,
      idInput: string,
      input: unknown,
    ): Promise<{ id: string }> {
      const owner = ownerId(actor),
        id = parsePersonalMilestoneId(idInput),
        value = parsePersonalMilestoneDelete(input);
      return runSearchTransaction(database, async (tx) => {
        const current = await load(tx, owner, id);
        if (
          current.revision !== value.expectedRevision ||
          current.revision >= PERSONAL_MILESTONE_MAX_REVISION
        )
          return milestoneFail("MILESTONE_CONFLICT");
        const rows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`/* milestones:delete */ DELETE FROM "PersonalMilestone" WHERE id=${id}::uuid AND "ownerId"=${owner} AND revision=${value.expectedRevision} RETURNING id`,
        );
        if (rows.length === 0) return milestoneFail("MILESTONE_CONFLICT");
        if (rows.length !== 1 || rows[0]!.id !== id) return searchFail("SEARCH_INVARIANT");
        return bounded(tx, { id });
      });
    },
  };
}
