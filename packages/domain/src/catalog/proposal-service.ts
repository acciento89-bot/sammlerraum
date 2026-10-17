import { Buffer } from "node:buffer";
import {
  CATALOG_PROPOSAL_MAX_BYTES,
  CatalogDecisionReasonSchema,
  CatalogProposalCursorSchema,
  CatalogProposalIdSchema,
  CatalogProposalListInputSchema,
  CatalogRollbackInputSchema,
  SubmitCatalogProposalInputSchema,
  type CatalogProposalOperation,
} from "@sammlerraum/contracts/catalog-proposals";
import type {
  CatalogJson,
  CatalogProposalDatabase,
  CatalogProposalRecord,
  CatalogProposalTransaction,
} from "@sammlerraum/db/catalog-types";
import { requireApplicationModerator } from "../authz/application-role";
import { createCatalogMutationService } from "./catalog-service";

type Code =
  | "CATALOG_PROPOSAL_INPUT_INVALID"
  | "CATALOG_PROPOSAL_NOT_FOUND"
  | "CATALOG_PROPOSAL_CONFLICT"
  | "CATALOG_PROPOSAL_ALREADY_DECIDED"
  | "CATALOG_PROPOSAL_LIMIT_EXCEEDED"
  | "CATALOG_PROPOSAL_ISOLATION_UNSUPPORTED";
export class CatalogProposalError extends Error {
  constructor(readonly code: Code) {
    super(code);
    this.name = "CatalogProposalError";
  }
}
function invalid(): never {
  throw new CatalogProposalError("CATALOG_PROPOSAL_INPUT_INVALID");
}
function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) invalid();
  return parsed.data;
}
function boundedJson(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (
      serialized === undefined ||
      Buffer.byteLength(serialized, "utf8") > CATALOG_PROPOSAL_MAX_BYTES
    )
      invalid();
    return JSON.parse(serialized) as unknown;
  } catch {
    invalid();
  }
}
function dto(row: CatalogProposalRecord) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
  };
}
function cursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) invalid();
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) invalid();
    const parsed = parse(CatalogProposalCursorSchema, JSON.parse(decoded.toString("utf8")));
    if (new Date(parsed.createdAt).toISOString() !== parsed.createdAt) invalid();
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    invalid();
  }
}

/** Active transaction seam. Submission requires ReadCommitted; CONFLICT is an outcome, never thrown here. */
export function createCatalogProposalTransactionService(tx: CatalogProposalTransaction) {
  async function submitProposal(proposerId: string, input: unknown) {
    const data = parse(SubmitCatalogProposalInputSchema, boundedJson(input));
    boundedJson(data);
    // A RepeatableRead snapshot can predate a quota lock's preceding submitter.
    const [transaction] = await tx.$queryRaw<{ isolation: string }[]>`
      SELECT current_setting('transaction_isolation') AS isolation
    `;
    if (transaction?.isolation !== "read committed")
      throw new CatalogProposalError("CATALOG_PROPOSAL_ISOLATION_UNSUPPORTED");
    // Separate quota namespace avoids locking User rows before canonical entry FK reads.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog-proposal-submit:${proposerId}`}, 0))::text`;
    const [pending, daily, total] = [
      await tx.catalogProposal.count({ where: { proposerId, state: "PENDING" } }),
      await tx.catalogProposal.count({
        where: { proposerId, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      }),
      await tx.catalogProposal.count({ where: { proposerId } }),
    ];
    if (pending >= 20 || daily >= 50 || total >= 10_000)
      throw new CatalogProposalError("CATALOG_PROPOSAL_LIMIT_EXCEEDED");
    if (
      data.targetEntryId &&
      !(await tx.catalogEntry.findUnique({
        where: { id: data.targetEntryId },
        select: { id: true },
      }))
    ) {
      throw new CatalogProposalError("CATALOG_PROPOSAL_NOT_FOUND");
    }
    return dto(
      await tx.catalogProposal.create({
        data: {
          proposerId,
          targetEntryId: data.targetEntryId,
          baseRevision: data.baseRevision,
          summary: data.summary,
          patch: data.patch as CatalogJson,
          ...(data.source ? { source: data.source as CatalogJson } : {}),
        },
      }),
    );
  }
  async function getProposal(proposalId: string, actorId: string, review = false) {
    if (review) await requireApplicationModerator(tx, actorId);
    const id = parse(CatalogProposalIdSchema, proposalId);
    const row = await tx.catalogProposal.findFirst({
      where: { id, ...(review ? {} : { proposerId: actorId }) },
    });
    if (!row) throw new CatalogProposalError("CATALOG_PROPOSAL_NOT_FOUND");
    return dto(row);
  }
  async function listProposals(actorId: string, input: unknown = {}, review = false) {
    if (review) await requireApplicationModerator(tx, actorId);
    const data = parse(CatalogProposalListInputSchema, input);
    const after = cursor(data.cursor);
    const rows = await tx.catalogProposal.findMany({
      where: {
        ...(review ? {} : { proposerId: actorId }),
        ...(data.state ? { state: data.state } : review ? { state: "PENDING" } : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: data.limit + 1,
    });
    const page = rows.slice(0, data.limit);
    const last = page.at(-1);
    return {
      proposals: page.map(dto),
      nextCursor:
        rows.length > data.limit && last
          ? Buffer.from(
              JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
            ).toString("base64url")
          : null,
    };
  }
  async function apply(
    patch: CatalogProposalOperation,
    entryId: string | null,
    revision: number | null,
  ) {
    const canonical = createCatalogMutationService(tx);
    switch (patch.kind) {
      case "CREATE_ENTRY": {
        const result = await canonical.createCatalogEntry(patch.input);
        return { entryId: result.state.id, revision: result.revision };
      }
      case "UPDATE_ENTRY":
        return {
          entryId: entryId!,
          revision: (await canonical.updateCatalogEntry(entryId!, revision!, patch.input)).revision,
        };
      case "ADD_VARIANT":
        return {
          entryId: entryId!,
          revision: (await canonical.addCatalogVariant(entryId!, revision!, patch.input)).revision,
        };
      case "UPDATE_VARIANT":
        return {
          entryId: entryId!,
          revision: (
            await canonical.updateCatalogVariant(entryId!, revision!, patch.variantId, patch.input)
          ).revision,
        };
      case "ADD_IDENTIFIER":
        return {
          entryId: entryId!,
          revision: (await canonical.addExternalIdentifier(entryId!, revision!, patch.input))
            .revision,
        };
      case "UPDATE_IDENTIFIER":
        return {
          entryId: entryId!,
          revision: (
            await canonical.updateExternalIdentifier(
              entryId!,
              revision!,
              patch.identifierId,
              patch.input,
            )
          ).revision,
        };
      case "REMOVE_IDENTIFIER":
        return {
          entryId: entryId!,
          revision: (
            await canonical.removeExternalIdentifier(entryId!, revision!, patch.identifierId)
          ).revision,
        };
    }
  }
  async function decide(
    proposalId: string,
    moderatorId: string,
    reason: unknown,
    decision: "APPROVE" | "REJECT",
  ) {
    await requireApplicationModerator(tx, moderatorId);
    const id = parse(CatalogProposalIdSchema, proposalId);
    const decisionReason = parse(CatalogDecisionReasonSchema, reason);
    await tx.$queryRaw`SELECT "id" FROM "CatalogProposal" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const row = await tx.catalogProposal.findUnique({ where: { id } });
    if (!row) throw new CatalogProposalError("CATALOG_PROPOSAL_NOT_FOUND");
    if (row.state !== "PENDING") throw new CatalogProposalError("CATALOG_PROPOSAL_ALREADY_DECIDED");
    const audit = { moderatorId, decisionReason, moderatedAt: new Date() };
    if (decision === "REJECT")
      return {
        conflict: false as const,
        proposal: dto(
          await tx.catalogProposal.update({ where: { id }, data: { ...audit, state: "REJECTED" } }),
        ),
      };
    const validated = parse(SubmitCatalogProposalInputSchema, {
      targetEntryId: row.targetEntryId,
      baseRevision: row.baseRevision,
      patch: row.patch,
      summary: row.summary,
      ...(row.source ? { source: row.source } : {}),
    });
    if (row.targetEntryId) {
      await tx.$queryRaw`SELECT "id" FROM "CatalogEntry" WHERE "id" = ${row.targetEntryId}::uuid FOR UPDATE`;
      const current = await tx.catalogEntry.findUniqueOrThrow({
        where: { id: row.targetEntryId },
        select: { revision: true },
      });
      if (current.revision !== row.baseRevision) {
        return {
          conflict: true as const,
          proposal: dto(
            await tx.catalogProposal.update({
              where: { id },
              data: { ...audit, state: "CONFLICT" },
            }),
          ),
        };
      }
    }
    const result = await apply(validated.patch, row.targetEntryId, row.baseRevision);
    return {
      conflict: false as const,
      proposal: dto(
        await tx.catalogProposal.update({
          where: { id },
          data: {
            ...audit,
            state: "APPROVED",
            resultEntryId: result.entryId,
            resultRevision: result.revision,
          },
        }),
      ),
    };
  }
  async function rollbackCatalogEntry(entryId: string, moderatorId: string, input: unknown) {
    await requireApplicationModerator(tx, moderatorId);
    const id = parse(CatalogProposalIdSchema, entryId);
    const data = parse(CatalogRollbackInputSchema, input);
    const result = await createCatalogMutationService(tx).rollbackCatalogEntry(
      id,
      data.expectedRevision,
      data.targetRevision,
    );
    await tx.catalogRollbackAudit.create({
      data: {
        entryId: id,
        revision: result.revision,
        actorId: moderatorId,
        reason: data.reason,
        expectedRevision: data.expectedRevision,
        targetRevision: data.targetRevision,
      },
    });
    return result;
  }
  return {
    submitProposal,
    getProposal,
    listProposals,
    rollbackCatalogEntry,
    approveProposal: (id: string, actor: string, reason: unknown) =>
      decide(id, actor, reason, "APPROVE"),
    rejectProposal: (id: string, actor: string, reason: unknown) =>
      decide(id, actor, reason, "REJECT"),
  };
}

export function createCatalogProposalService(database: CatalogProposalDatabase) {
  const within = <T>(
    work: (service: ReturnType<typeof createCatalogProposalTransactionService>) => Promise<T>,
  ) =>
    database.$transaction((tx) => work(createCatalogProposalTransactionService(tx)), {
      isolationLevel: "ReadCommitted",
    });
  async function decision(id: string, actor: string, reason: unknown, approve: boolean) {
    const result = await within((service) =>
      approve
        ? service.approveProposal(id, actor, reason)
        : service.rejectProposal(id, actor, reason),
    );
    // The transaction has committed the CONFLICT state before this public error is raised.
    if (result.conflict) throw new CatalogProposalError("CATALOG_PROPOSAL_CONFLICT");
    return result.proposal;
  }
  return {
    submitProposal: (actor: string, input: unknown) =>
      within((service) => service.submitProposal(actor, input)),
    getProposal: (id: string, actor: string, review = false) =>
      within((service) => service.getProposal(id, actor, review)),
    listProposals: (actor: string, input: unknown = {}, review = false) =>
      within((service) => service.listProposals(actor, input, review)),
    approveProposal: (id: string, actor: string, reason: unknown) =>
      decision(id, actor, reason, true),
    rejectProposal: (id: string, actor: string, reason: unknown) =>
      decision(id, actor, reason, false),
    rollbackCatalogEntry: (id: string, actor: string, input: unknown) =>
      within((service) => service.rollbackCatalogEntry(id, actor, input)),
  };
}
