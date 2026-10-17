import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogMaintenanceService } from "./catalog-service";
import {
  createCatalogProposalService,
  createCatalogProposalTransactionService,
} from "./proposal-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const prefix = `fixture_${randomUUID().replaceAll("-", "")}`;
const proposer = `${prefix}_author`;
const moderator = `${prefix}_moderator`;
const text = { language: "pl", title: "Moneta", description: "Opis" };
let categoryId: string;
const catalog = () => createCatalogMaintenanceService(db!);
const service = () => createCatalogProposalService(db!);

describe.runIf(enabled)("catalog proposal moderation PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.createMany({
      data: [proposer, moderator].map((id) => ({
        id,
        name: "Synthetic test",
        email: `${id}@example.invalid`,
      })),
    });
    await db!.applicationRoleGrant.create({
      data: {
        userId: moderator,
        role: "MODERATOR",
        grantedBy: "synthetic fixture",
        reason: "Test authority",
      },
    });
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: prefix,
        labels: { de: "Münzen", en: "Coins" },
      })
    ).id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.catalogProposal.deleteMany({ where: { proposerId: { startsWith: prefix } } });
    await db.catalogRollbackAudit.deleteMany({ where: { actorId: { startsWith: prefix } } });
    const entry = { categoryTemplate: { key: prefix } };
    await db.catalogRevision.deleteMany({ where: { entry } });
    await db.catalogAttributeValue.deleteMany({ where: { entry } });
    await db.catalogExternalIdentifier.deleteMany({ where: { entry } });
    await db.catalogVariant.deleteMany({ where: { entry } });
    await db.catalogEntry.deleteMany({ where: entry });
    await db.categoryTemplateLabel.deleteMany({ where: { categoryTemplate: { key: prefix } } });
    await db.categoryTemplate.deleteMany({ where: { key: prefix } });
    await db.applicationRoleGrant.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("does not auto-apply a stale base and commits CONFLICT before returning its conflict error", async () => {
    const entry = await catalog().createCatalogEntry({ categoryTemplateId: categoryId, text });
    const proposal = await db!.catalogProposal.create({
      data: {
        proposerId: proposer,
        targetEntryId: entry.state.id,
        baseRevision: 1,
        summary: "Correct title",
        patch: { kind: "UPDATE_ENTRY", input: { text: { ...text, title: "Proposed" } } },
      },
    });
    await catalog().updateCatalogEntry(entry.state.id, 1, {
      text: { ...text, title: "Already advanced" },
    });
    const result = await service()
      .approveProposal(proposal.id, moderator, "Checked source")
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    expect.soft(result).toMatchObject({ error: { code: "CATALOG_PROPOSAL_CONFLICT" } });
    expect
      .soft(await db!.catalogProposal.findUniqueOrThrow({ where: { id: proposal.id } }))
      .toMatchObject({
        state: "CONFLICT",
        moderatorId: moderator,
        decisionReason: "Checked source",
      });
    expect
      .soft(await catalog().getCatalogEntryAtRevision(entry.state.id, 2))
      .toMatchObject({ revision: 2, state: { text: { title: "Already advanced" } } });
    expect(await catalog().getCatalogEntryAtRevision(entry.state.id, 3)).toBeNull();
  });
  it("corrects and retires references with CAS, entry scope, normalized UUIDs and historical identities", async () => {
    const entry = await catalog().createCatalogEntry({ categoryTemplateId: categoryId, text });
    const other = await catalog().createCatalogEntry({ categoryTemplateId: categoryId, text });
    const reference = await catalog().addExternalIdentifier(entry.state.id, 1, {
      namespace: "museum",
      type: "accession",
      value: "Wrong",
    });
    const input = {
      namespace: "museum",
      type: "accession",
      value: "Correct",
      sources: [{ note: "Authored source" }],
    };
    await expect(
      catalog().updateExternalIdentifier(
        entry.state.id.toUpperCase(),
        1,
        reference.id.toUpperCase(),
        input,
      ),
    ).rejects.toMatchObject({ code: "CATALOG_REVISION_CONFLICT" });
    await expect(
      catalog().updateExternalIdentifier(other.state.id, 1, reference.id, input),
    ).rejects.toMatchObject({ code: "CATALOG_IDENTIFIER_NOT_FOUND" });
    const corrected = await catalog().updateExternalIdentifier(
      entry.state.id.toUpperCase(),
      2,
      reference.id.toUpperCase(),
      input,
    );
    expect(corrected).toMatchObject({
      revision: 3,
      state: {
        identifiers: [
          { id: reference.id, value: "Correct", sources: [{ note: "Authored source" }] },
        ],
      },
    });
    expect(
      (await catalog().getCatalogEntryAtRevision(entry.state.id, 2))!.state.identifiers[0]!.value,
    ).toBe("Wrong");
    await expect(
      catalog().removeExternalIdentifier(other.state.id, 1, reference.id),
    ).rejects.toMatchObject({ code: "CATALOG_IDENTIFIER_NOT_FOUND" });
    const removed = await catalog().removeExternalIdentifier(
      entry.state.id.toUpperCase(),
      3,
      reference.id.toUpperCase(),
    );
    expect(removed).toMatchObject({ revision: 4, state: { identifiers: [] } });
    expect(
      await db!.catalogExternalIdentifier.findUniqueOrThrow({ where: { id: reference.id } }),
    ).toMatchObject({ active: false });
    const restored = await catalog().rollbackCatalogEntry(entry.state.id, 4, 3);
    expect(restored.state.identifiers[0]).toMatchObject({ id: reference.id, value: "Correct" });
  });

  const createEntry = () => catalog().createCatalogEntry({ categoryTemplateId: categoryId, text });
  const submit = (
    entryId: string | null,
    baseRevision: number | null,
    patch: object,
    actor = proposer,
  ) =>
    service().submitProposal(actor, {
      targetEntryId: entryId,
      baseRevision,
      patch,
      summary: "Authored change",
      source: { url: "https://example.org/source", license: "CC BY 4.0" },
    });
  async function syntheticUser(suffix: string, role?: "MODERATOR" | "ADMIN") {
    const id = `${prefix}_${suffix}`;
    await db!.user.create({ data: { id, name: "Synthetic test", email: `${id}@example.invalid` } });
    if (role)
      await db!.applicationRoleGrant.create({
        data: { userId: id, role, grantedBy: "synthetic fixture", reason: "Test authority" },
      });
    return id;
  }

  it("creates a new entry once and retains authored proposal provenance with its resulting revision", async () => {
    const proposal = await submit(null, null, {
      kind: "CREATE_ENTRY",
      input: { categoryTemplateId: categoryId.toUpperCase(), text },
    });
    const results = await Promise.allSettled([
      service().approveProposal(proposal.id.toUpperCase(), moderator, "Verified original"),
      service().approveProposal(proposal.id, moderator, "Second attempt"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "CATALOG_PROPOSAL_ALREADY_DECIDED" },
    });
    const saved = await service().getProposal(proposal.id, proposer);
    expect(saved).toMatchObject({
      state: "APPROVED",
      resultRevision: 1,
      source: { license: "CC BY 4.0" },
    });
    expect(saved.resultEntryId).not.toBeNull();
    expect(await catalog().getCatalogEntryAtRevision(saved.resultEntryId!, 1)).toMatchObject({
      state: { text: { language: "pl", title: "Moneta", translations: [] } },
    });
    expect(await db!.catalogRevision.count({ where: { entryId: saved.resultEntryId! } })).toBe(1);
  });

  it("supports corrections, authored translations, variant references, source updates and reference removal", async () => {
    const entry = await createEntry();
    async function approve(base: number, patch: object) {
      const proposal = await submit(entry.state.id.toUpperCase(), base, patch);
      return service().approveProposal(proposal.id, moderator, "Checked correction");
    }
    await approve(1, {
      kind: "UPDATE_ENTRY",
      input: {
        text: { ...text, translations: [{ language: "de", title: "Münze" }] },
        sources: [{ note: "Museum", license: "CC0" }],
      },
    });
    await approve(2, { kind: "ADD_VARIANT", input: { text, edition: "First", reference: "V-1" } });
    const variant = (await catalog().getCatalogEntryAtRevision(entry.state.id, 3))!.state
      .variants[0]!;
    await approve(3, {
      kind: "UPDATE_VARIANT",
      variantId: variant.id.toUpperCase(),
      input: { text, reference: "V-2", sources: [{ note: "Variant correction" }] },
    });
    await approve(4, {
      kind: "ADD_IDENTIFIER",
      input: {
        variantId: variant.id.toUpperCase(),
        namespace: "museum",
        type: "accession",
        value: "WRONG",
      },
    });
    const identifier = (await catalog().getCatalogEntryAtRevision(entry.state.id, 5))!.state
      .identifiers[0]!;
    await approve(5, {
      kind: "UPDATE_IDENTIFIER",
      identifierId: identifier.id.toUpperCase(),
      input: {
        variantId: variant.id,
        namespace: "museum",
        type: "accession",
        value: "Correct Case",
        sources: [{ note: "Verified reference" }],
      },
    });
    const corrected = await catalog().getCatalogEntryAtRevision(entry.state.id, 6);
    expect(corrected!.state).toMatchObject({
      text: { language: "pl", translations: [{ language: "de", title: "Münze" }] },
      sources: [{ note: "Museum", license: "CC0" }],
      variants: [{ id: variant.id, reference: "V-2" }],
      identifiers: [
        { id: identifier.id, value: "Correct Case", sources: [{ note: "Verified reference" }] },
      ],
    });
    await approve(6, { kind: "REMOVE_IDENTIFIER", identifierId: identifier.id.toUpperCase() });
    expect(
      (await catalog().getCatalogEntryAtRevision(entry.state.id, 7))!.state.identifiers,
    ).toEqual([]);
    expect(
      await db!.catalogExternalIdentifier.findUniqueOrThrow({ where: { id: identifier.id } }),
    ).toMatchObject({ active: false });
  });

  it("hides foreign proposal state and denies all review and canonical decisions without persisted authority", async () => {
    const entry = await createEntry();
    const proposal = await submit(entry.state.id, 1, {
      kind: "UPDATE_ENTRY",
      input: { text: { ...text, title: "Private proposal" } },
    });
    const foreign = await syntheticUser("foreign");
    await expect(service().getProposal(proposal.id, foreign)).rejects.toMatchObject({
      code: "CATALOG_PROPOSAL_NOT_FOUND",
    });
    expect((await service().listProposals(foreign)).proposals).toEqual([]);
    for (const work of [
      () => service().approveProposal(proposal.id, foreign, "Spoofed"),
      () => service().rejectProposal(randomUUID(), foreign, "Spoofed"),
      () => service().getProposal(proposal.id, foreign, true),
      () => service().listProposals(foreign, {}, true),
      () =>
        service().rollbackCatalogEntry(entry.state.id, foreign, {
          expectedRevision: 1,
          targetRevision: 1,
          reason: "Spoofed",
        }),
    ]) {
      await expect(work()).rejects.toMatchObject({ code: "APPLICATION_ROLE_REQUIRED" });
    }
    expect((await service().getProposal(proposal.id, proposer)).state).toBe("PENDING");
    expect(await catalog().getCatalogEntryAtRevision(entry.state.id, 2)).toBeNull();
    const rejected = await service().rejectProposal(
      proposal.id,
      moderator,
      "Source lacks evidence",
    );
    expect(rejected).toMatchObject({
      state: "REJECTED",
      moderatorId: moderator,
      decisionReason: "Source lacks evidence",
      resultRevision: null,
    });
    expect(rejected.moderatedAt).not.toBeNull();
    await expect(service().approveProposal(proposal.id, moderator, "Replay")).rejects.toMatchObject(
      { code: "CATALOG_PROPOSAL_ALREADY_DECIDED" },
    );
  });

  it("serializes competing entry proposals and never loses an approved change", async () => {
    const entry = await createEntry();
    const one = await submit(entry.state.id, 1, {
      kind: "UPDATE_ENTRY",
      input: { text: { ...text, title: "One" } },
    });
    const two = await submit(entry.state.id, 1, {
      kind: "UPDATE_ENTRY",
      input: { text: { ...text, title: "Two" } },
    });
    const results = await Promise.allSettled([
      service().approveProposal(one.id, moderator, "First"),
      service().approveProposal(two.id, moderator, "Second"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "CATALOG_PROPOSAL_CONFLICT" },
    });
    const states = await db!.catalogProposal.findMany({
      where: { id: { in: [one.id, two.id] } },
      orderBy: { state: "asc" },
    });
    expect(states.map((row) => row.state)).toEqual(["APPROVED", "CONFLICT"]);
    expect(await db!.catalogRevision.count({ where: { entryId: entry.state.id } })).toBe(2);
  });

  it("rolls canonical changes and decision metadata back under an enclosing transaction", async () => {
    const entry = await createEntry();
    const proposal = await submit(entry.state.id, 1, {
      kind: "UPDATE_ENTRY",
      input: { text: { ...text, title: "Must roll back" } },
    });
    await expect(
      db!.$transaction(async (tx) => {
        const outcome = await createCatalogProposalTransactionService(tx).approveProposal(
          proposal.id,
          moderator,
          "Nested approval",
        );
        expect(outcome).toMatchObject({
          conflict: false,
          proposal: { state: "APPROVED", resultRevision: 2 },
        });
        throw new Error("enclosing rollback");
      }),
    ).rejects.toThrow("enclosing rollback");
    expect(await service().getProposal(proposal.id, proposer)).toMatchObject({
      state: "PENDING",
      moderatorId: null,
      resultRevision: null,
    });
    expect(await catalog().getCatalogEntryAtRevision(entry.state.id, 2)).toBeNull();
    await catalog().updateCatalogEntry(entry.state.id, 1, { text: { ...text, title: "Advance" } });
    await expect(
      db!.$transaction(async (tx) => {
        expect(
          await createCatalogProposalTransactionService(tx).approveProposal(
            proposal.id,
            moderator,
            "Nested conflict",
          ),
        ).toMatchObject({ conflict: true });
        throw new Error("enclosing rollback");
      }),
    ).rejects.toThrow("enclosing rollback");
    expect((await service().getProposal(proposal.id, proposer)).state).toBe("PENDING");
  });

  it("keeps non-stale semantic validation failures pending without partial canonical writes", async () => {
    const entry = await createEntry();
    const other = await createEntry();
    const variant = await catalog().addCatalogVariant(other.state.id, 1, { text });
    const proposal = await submit(entry.state.id, 1, {
      kind: "ADD_IDENTIFIER",
      input: {
        variantId: variant.id,
        namespace: "museum",
        type: "accession",
        value: "Foreign variant",
      },
    });
    await expect(
      service().approveProposal(proposal.id, moderator, "Invalid scope"),
    ).rejects.toMatchObject({ code: "CATALOG_VARIANT_NOT_FOUND" });
    expect(await service().getProposal(proposal.id, proposer)).toMatchObject({
      state: "PENDING",
      moderatorId: null,
    });
    expect(await catalog().getCatalogEntryAtRevision(entry.state.id, 2)).toBeNull();
  });

  it("records authorized rollback reasons and no-op results, with CAS checked before audit", async () => {
    const entry = await createEntry();
    await catalog().updateCatalogEntry(entry.state.id, 1, { text: { ...text, title: "Changed" } });
    const admin = await syntheticUser("admin", "ADMIN");
    const restored = await service().rollbackCatalogEntry(entry.state.id.toUpperCase(), admin, {
      expectedRevision: 2,
      targetRevision: 1,
      reason: "Restore original evidence",
    });
    expect(restored).toMatchObject({
      revision: 3,
      rollbackFromRevision: 1,
      state: { text: { title: "Moneta" } },
    });
    const unchanged = await service().rollbackCatalogEntry(entry.state.id, admin, {
      expectedRevision: 3,
      targetRevision: 1,
      reason: "Verified already restored",
    });
    expect(unchanged).toMatchObject({ revision: 3, rollbackFromRevision: 1 });
    await expect(
      service().rollbackCatalogEntry(entry.state.id, admin, {
        expectedRevision: 2,
        targetRevision: 1,
        reason: "Stale",
      }),
    ).rejects.toMatchObject({ code: "CATALOG_REVISION_CONFLICT" });
    expect(
      await db!.catalogRollbackAudit.findMany({
        where: { entryId: entry.state.id },
        orderBy: { createdAt: "asc" },
        select: {
          actorId: true,
          expectedRevision: true,
          targetRevision: true,
          revision: true,
          reason: true,
        },
      }),
    ).toEqual([
      {
        actorId: admin,
        expectedRevision: 2,
        targetRevision: 1,
        revision: 3,
        reason: "Restore original evidence",
      },
      {
        actorId: admin,
        expectedRevision: 3,
        targetRevision: 1,
        revision: 3,
        reason: "Verified already restored",
      },
    ]);
    expect(await catalog().getCatalogEntryAtRevision(entry.state.id, 4)).toBeNull();
    const own = await submit(
      null,
      null,
      { kind: "CREATE_ENTRY", input: { categoryTemplateId: categoryId, text } },
      admin,
    );
    expect(
      (await service().approveProposal(own.id, admin, "Own reviewed contribution")).state,
    ).toBe("APPROVED");
  });

  it("blocks SQL role revocation until the authorized transaction commits and denies the next decision", async () => {
    const mod = await syntheticUser("revocable", "MODERATOR");
    const proposal = await submit(null, null, {
      kind: "CREATE_ENTRY",
      input: { categoryTemplateId: categoryId, text },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: (pid: number) => void;
    const approved = new Promise<number>((resolve) => {
      ready = resolve;
    });
    const approval = db!.$transaction(
      async (tx) => {
        const result = await createCatalogProposalTransactionService(tx).approveProposal(
          proposal.id,
          mod,
          "Revocation ordering",
        );
        const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        ready(backend!.pid);
        await gate;
        return result;
      },
      { timeout: 10_000 },
    );
    const approvalPid = await approved;
    let deleting!: (pid: number) => void;
    const started = new Promise<number>((resolve) => {
      deleting = resolve;
    });
    const revocation = db!.$transaction(
      async (tx) => {
        const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        deleting(backend!.pid);
        await tx.applicationRoleGrant.delete({ where: { userId: mod } });
      },
      { timeout: 10_000 },
    );
    const revokePid = await started;
    try {
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await db!.$queryRaw<
          { blockers: number[] }[]
        >`SELECT pg_blocking_pids(${revokePid}::integer) AS blockers`;
        if (row!.blockers.includes(approvalPid)) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
    } finally {
      release();
      await approval;
      await revocation;
    }
    expect((await service().getProposal(proposal.id, proposer)).state).toBe("APPROVED");
    await expect(db!.user.delete({ where: { id: mod } })).rejects.toMatchObject({ code: "P2003" });
    expect(
      await catalog().getCatalogEntryAtRevision(
        (await service().getProposal(proposal.id, proposer)).resultEntryId!,
        1,
      ),
    ).not.toBeNull();
    await expect(service().listProposals(mod, {}, true)).rejects.toMatchObject({
      code: "APPLICATION_ROLE_REQUIRED",
    });
    await expect(service().rejectProposal(randomUUID(), mod, "Revoked")).rejects.toMatchObject({
      code: "APPLICATION_ROLE_REQUIRED",
    });
  });

  it("rejects private fields, role spoofing, unsafe provenance, malformed IDs and oversized or unserializable input", async () => {
    const entry = await createEntry();
    const valid = {
      targetEntryId: entry.state.id,
      baseRevision: 1,
      summary: "Correction",
      patch: { kind: "UPDATE_ENTRY", input: {} },
    };
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const input of [
      { ...valid, moderator: true },
      {
        ...valid,
        patch: { kind: "UPDATE_ENTRY", input: { privateNotes: "Secret", ownerId: proposer } },
      },
      { ...valid, source: { url: "javascript:alert(1)" } },
      { ...valid, source: { url: "https://user:pass@example.org/" } },
      { ...valid, targetEntryId: "invalid" },
      { ...valid, baseRevision: null },
      { ...valid, summary: "x".repeat(501) },
      { ...valid, summary: " " },
      cycle,
      {
        ...valid,
        patch: {
          kind: "UPDATE_ENTRY",
          input: {
            text: {
              ...text,
              description: "€".repeat(20000),
              translations: [{ language: "de", title: "Münze", description: "€".repeat(20000) }],
            },
          },
        },
      },
      {
        ...valid,
        patch: { kind: "CREATE_ENTRY", input: { categoryTemplateId: categoryId, text } },
      },
    ])
      await expect(service().submitProposal(proposer, input)).rejects.toMatchObject({
        code: "CATALOG_PROPOSAL_INPUT_INVALID",
      });
    const proposal = await service().submitProposal(proposer, valid);
    for (const reason of [" ", "x".repeat(1001), "bad\u0000reason"])
      await expect(service().rejectProposal(proposal.id, moderator, reason)).rejects.toMatchObject({
        code: "CATALOG_PROPOSAL_INPUT_INVALID",
      });
    expect((await service().getProposal(proposal.id, proposer)).state).toBe("PENDING");
  });

  it("paginates own and moderator views without overlap and rejects invalid list cursors or limits", async () => {
    const actor = await syntheticUser("pagination");
    for (let i = 0; i < 3; i++)
      await submit(
        null,
        null,
        { kind: "CREATE_ENTRY", input: { categoryTemplateId: categoryId, text } },
        actor,
      );
    const first = await service().listProposals(actor, { limit: 2 });
    const second = await service().listProposals(actor, { limit: 2, cursor: first.nextCursor });
    expect(first.proposals).toHaveLength(2);
    expect(second.proposals).toHaveLength(1);
    expect(new Set([...first.proposals, ...second.proposals].map((row) => row.id)).size).toBe(3);
    expect(second.nextCursor).toBeNull();
    expect(
      (
        await service().listProposals(moderator, { state: "PENDING", limit: 50 }, true)
      ).proposals.some((row) => row.id === first.proposals[0]!.id),
    ).toBe(true);
    for (const input of [
      { limit: 51 },
      { limit: 0 },
      { cursor: "bad" },
      { cursor: "a".repeat(257) },
      { state: "UNKNOWN" },
      { ownerId: actor },
      {
        cursor: Buffer.from(
          JSON.stringify({ createdAt: "2026-02-30T00:00:00.000Z", id: randomUUID() }),
        ).toString("base64url"),
      },
    ])
      await expect(service().listProposals(actor, input)).rejects.toMatchObject({
        code: "CATALOG_PROPOSAL_INPUT_INVALID",
      });
  });

  it("atomically enforces pending, rolling daily and retained-history quotas without deleting audit rows", async () => {
    const actor = await syntheticUser("quota");
    const data = {
      proposerId: actor,
      targetEntryId: null,
      baseRevision: null,
      summary: "Quota fixture",
      patch: { kind: "CREATE_ENTRY", input: { categoryTemplateId: categoryId, text } },
    };
    await db!.catalogProposal.createMany({ data: Array.from({ length: 19 }, () => data) });
    const results = await Promise.allSettled([
      submit(null, null, data.patch, actor),
      submit(null, null, data.patch, actor),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "CATALOG_PROPOSAL_LIMIT_EXCEEDED" },
    });
    expect(
      await db!.catalogProposal.count({ where: { proposerId: actor, state: "PENDING" } }),
    ).toBe(20);
    await db!.catalogProposal.updateMany({
      where: { proposerId: actor },
      data: { state: "REJECTED" },
    });
    await db!.catalogProposal.createMany({
      data: Array.from({ length: 30 }, () => ({ ...data, state: "REJECTED" as const })),
    });
    await expect(submit(null, null, data.patch, actor)).rejects.toMatchObject({
      code: "CATALOG_PROPOSAL_LIMIT_EXCEEDED",
    });
    const old = new Date(Date.now() - 172_800_000);
    await db!.catalogProposal.updateMany({
      where: { proposerId: actor },
      data: { createdAt: old },
    });
    await submit(null, null, data.patch, actor);
    for (let offset = 0; offset < 9949; offset += 500)
      await db!.catalogProposal.createMany({
        data: Array.from({ length: Math.min(500, 9949 - offset) }, () => ({
          ...data,
          createdAt: old,
          state: "REJECTED" as const,
        })),
      });
    await expect(submit(null, null, data.patch, actor)).rejects.toMatchObject({
      code: "CATALOG_PROPOSAL_LIMIT_EXCEEDED",
    });
    expect(await db!.catalogProposal.count({ where: { proposerId: actor } })).toBe(10_000);
  }, 20_000);
  it("checks CAS before approving a no-op and points successful no-ops at their unchanged revision", async () => {
    const entry = await createEntry();
    const same = await submit(entry.state.id, 1, { kind: "UPDATE_ENTRY", input: {} });
    expect(await service().approveProposal(same.id, moderator, "Already correct")).toMatchObject({
      state: "APPROVED",
      resultEntryId: entry.state.id,
      resultRevision: 1,
    });
    const stale = await submit(entry.state.id, 1, { kind: "UPDATE_ENTRY", input: {} });
    await catalog().updateCatalogEntry(entry.state.id, 1, { text: { ...text, title: "Advanced" } });
    await expect(
      service().approveProposal(stale.id, moderator, "Stale no-op"),
    ).rejects.toMatchObject({ code: "CATALOG_PROPOSAL_CONFLICT" });
    expect((await service().getProposal(stale.id, proposer)).state).toBe("CONFLICT");
    expect(await catalog().getCatalogEntryAtRevision(entry.state.id, 3)).toBeNull();
  });

  it("rejects foreign variant reassignment, duplicate identifier tuples, malformed IDs and stale removal", async () => {
    const entry = await createEntry();
    const foreignEntry = await createEntry();
    const foreignVariant = await catalog().addCatalogVariant(foreignEntry.state.id, 1, { text });
    const reference = await catalog().addExternalIdentifier(entry.state.id, 1, {
      namespace: "museum",
      type: "accession",
      value: "Case Kept",
    });
    const other = await catalog().addExternalIdentifier(entry.state.id, 2, {
      namespace: "museum",
      type: "accession",
      value: "Other",
    });
    const input = { namespace: "museum", type: "accession", value: "Corrected" };
    await expect(
      catalog().updateExternalIdentifier(entry.state.id, 3, reference.id, {
        ...input,
        variantId: foreignVariant.id,
      }),
    ).rejects.toMatchObject({ code: "CATALOG_VARIANT_NOT_FOUND" });
    await expect(
      catalog().updateExternalIdentifier(entry.state.id, 3, reference.id, {
        ...input,
        value: "Other",
      }),
    ).rejects.toMatchObject({ code: "CATALOG_IDENTIFIER_CONFLICT" });
    await expect(
      catalog().updateExternalIdentifier(entry.state.id, 3, "bad", input),
    ).rejects.toMatchObject({ code: "CATALOG_INPUT_INVALID" });
    await expect(
      catalog().removeExternalIdentifier(entry.state.id, 3, "bad"),
    ).rejects.toMatchObject({ code: "CATALOG_INPUT_INVALID" });
    await expect(
      catalog().removeExternalIdentifier(entry.state.id, 2, other.id),
    ).rejects.toMatchObject({ code: "CATALOG_REVISION_CONFLICT" });
    expect(await catalog().getCatalogEntryAtRevision(entry.state.id, 4)).toBeNull();
    expect(
      (await catalog().getCatalogEntryAtRevision(entry.state.id, 3))!.state.identifiers
        .map((row) => row.value)
        .sort(),
    ).toEqual(["Case Kept", "Other"]);
  });
  it("rejects unsupported submission isolation after a preestablished RepeatableRead snapshot", async () => {
    const actor = await syntheticUser("snapshot_quota");
    const patch = { kind: "CREATE_ENTRY", input: { categoryTemplateId: categoryId, text } };
    await db!.catalogProposal.createMany({
      data: Array.from({ length: 19 }, () => ({
        proposerId: actor,
        targetEntryId: null,
        baseRevision: null,
        summary: "Snapshot fixture",
        patch,
      })),
    });
    const result = await db!.$transaction(
      async (tx) => {
        expect(await tx.catalogProposal.count({ where: { proposerId: actor } })).toBe(19);
        await submit(null, null, patch, actor);
        return createCatalogProposalTransactionService(tx)
          .submitProposal(actor, {
            targetEntryId: null,
            baseRevision: null,
            summary: "Stale count snapshot",
            patch,
          })
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
      },
      { isolationLevel: "RepeatableRead" },
    );
    expect
      .soft(result)
      .toMatchObject({ error: { code: "CATALOG_PROPOSAL_ISOLATION_UNSUPPORTED" } });
    expect(
      await db!.catalogProposal.count({ where: { proposerId: actor, state: "PENDING" } }),
    ).toBe(20);
    await expect(
      db!.$transaction(
        (tx) =>
          createCatalogProposalTransactionService(tx).submitProposal(actor, {
            targetEntryId: null,
            baseRevision: null,
            summary: "Serializable submit",
            patch,
          }),
        { isolationLevel: "Serializable" },
      ),
    ).rejects.toMatchObject({ code: "CATALOG_PROPOSAL_ISOLATION_UNSUPPORTED" });
  });
});
