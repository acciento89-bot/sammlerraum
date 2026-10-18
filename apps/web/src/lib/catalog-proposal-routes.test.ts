import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CatalogProposalError } from "@sammlerraum/domain/catalog/proposal-service";
import { CategoryTemplateServiceError } from "@sammlerraum/domain/catalog/category-template-service";
import { ApplicationRoleError } from "@sammlerraum/domain/authz/application-role";
import { createCatalogProposalRouteHandlers } from "./catalog-proposal-routes";
const valid = {
  targetEntryId: randomUUID(),
  baseRevision: 1,
  summary: "Correction",
  patch: { kind: "UPDATE_ENTRY", input: {} },
};
function fixture(authenticated = true) {
  return createCatalogProposalRouteHandlers({
    appOrigin: "https://example.test",
    getSession: async () => (authenticated ? { user: { id: "actor" } } : null),
    createService: () =>
      ({
        submitProposal: async (actor: string, input: unknown) => ({ actor, input }),
        listProposals: async () => ({ proposals: [], nextCursor: null }),
        getProposal: async () => {
          throw new CatalogProposalError("CATALOG_PROPOSAL_NOT_FOUND");
        },
        approveProposal: async () => {
          throw new ApplicationRoleError();
        },
        rejectProposal: async () => {
          throw new CatalogProposalError("CATALOG_PROPOSAL_CONFLICT");
        },
        rollbackCatalogEntry: async () => {
          throw new Error("database password SECRET");
        },
      }) as never,
  });
}
function request(
  body: NonNullable<RequestInit["body"]> | null,
  headers: Record<string, string> = {},
  path = "proposals",
) {
  return new Request(`https://example.test/api/v1/catalog/${path}`, {
    method: "POST",
    headers: { origin: "https://example.test", "content-type": "application/json", ...headers },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" as never } : {}),
  });
}

describe("catalog proposal route boundaries", () => {
  it("checks exact Origin and authentication before pulling mutation streams", async () => {
    for (const [authenticated, origin, status] of [
      [true, "https://example.test.evil", 403],
      [true, "", 403],
      [false, "https://example.test", 401],
    ] as const) {
      let pulled = false;
      const stream = new ReadableStream(
        {
          pull(controller) {
            pulled = true;
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      const response = await fixture(authenticated).POST_PROPOSAL(request(stream, { origin }));
      expect(response.status).toBe(status);
      expect(pulled).toBe(false);
    }
  });
  it("counts streamed UTF8 bytes even with absent or false content length", async () => {
    for (const headers of [{}, { "content-length": "1" }]) {
      let pulls = 0;
      const stream = new ReadableStream(
        {
          pull(controller) {
            pulls++;
            controller.enqueue(new Uint8Array(65_537));
          },
        },
        { highWaterMark: 0 },
      );
      const response = await fixture().POST_PROPOSAL(request(stream, headers));
      expect(response.status).toBe(413);
      expect(pulls).toBe(1);
    }
  });
  it("validates JSON type, encoding, strict body shape and authored provenance", async () => {
    for (const [body, headers] of [
      ["{", {}],
      [JSON.stringify(valid), { "content-type": "text/plain" }],
      [new Uint8Array([0xff]), {}],
      [JSON.stringify({ ...valid, moderator: true }), {}],
      [JSON.stringify({ ...valid, source: { url: "javascript:alert(1)" } }), {}],
    ] as [NonNullable<RequestInit["body"]>, Record<string, string>][]) {
      expect((await fixture().POST_PROPOSAL(request(body, headers))).status).toBe(400);
    }
    const response = await fixture().POST_PROPOSAL(request(JSON.stringify(valid)));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      proposal: { actor: "actor", input: { summary: "Correction" } },
    });
  });
  it("returns hidden404 for personal details, role403 and committed conflict409 with redacted errors", async () => {
    const routes = fixture();
    const read = new Request("https://example.test/api/v1/catalog/proposals");
    expect((await routes.GET_PROPOSAL(read, randomUUID())).status).toBe(404);
    expect((await routes.GET_PROPOSAL(read, "invalid")).status).toBe(404);
    const denied = await routes.POST_DECISION(
      request(JSON.stringify({ decision: "APPROVE", reason: "Checked" })),
      randomUUID(),
    );
    expect(denied.status).toBe(403);
    const conflict = await routes.POST_DECISION(
      request(JSON.stringify({ decision: "REJECT", reason: "Checked" })),
      randomUUID(),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "CATALOG_PROPOSAL_CONFLICT" } });
    const error = await routes.POST_ROLLBACK(
      request(JSON.stringify({ expectedRevision: 1, targetRevision: 1, reason: "Checked" }), {
        "x-request-id": "catalog-test-request",
      }),
      randomUUID(),
    );
    expect(error.status).toBe(500);
    expect(error.headers.get("x-request-id")).toBe("catalog-test-request");
    expect(await error.text()).not.toContain("SECRET");
  });
  it("maps only known attribute failures and keeps unexpected decision failures redacted server errors", async () => {
    for (const [error, status] of [
      [new CategoryTemplateServiceError("CATALOG_ATTRIBUTE_DEFINITION_INVALID"), 400],
      [new CategoryTemplateServiceError("CATALOG_ATTRIBUTE_TYPE_MISMATCH"), 400],
      [new CategoryTemplateServiceError("CATALOG_ATTRIBUTE_VALUE_INVALID"), 400],
      [new CategoryTemplateServiceError("CATALOG_TEMPLATE_INVALID"), 500],
      [new Error("database password SECRET"), 500],
    ] as const) {
      const api = createCatalogProposalRouteHandlers({
        appOrigin: "https://example.test",
        getSession: async () => ({ user: { id: "actor" } }),
        createService: () =>
          ({
            approveProposal: async () => {
              throw error;
            },
          }) as never,
      });
      const response = await api.POST_DECISION(
        request(JSON.stringify({ decision: "APPROVE", reason: "Check bounded mapping" })),
        randomUUID(),
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        error: { code: status === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR" },
      });
    }
  });
  it("rejects unsupported or duplicate query parameters, invalid limits and spoofed decision fields", async () => {
    for (const query of [
      "ownerId=other",
      "state=PENDING&state=APPROVED",
      "limit=51",
      "limit=0",
      "limit=1e1",
      "cursor=",
      "state=invalid",
    ])
      expect(
        (
          await fixture().GET_PROPOSALS(
            new Request(`https://example.test/api/v1/catalog/proposals?${query}`),
          )
        ).status,
      ).toBe(400);
    const read = await fixture().GET_PROPOSALS(
      new Request("https://example.test/api/v1/catalog/proposals?limit=20"),
    );
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(
      (
        await fixture().POST_DECISION(
          request(JSON.stringify({ decision: "APPROVE", reason: "Checked", role: "ADMIN" })),
          randomUUID(),
        )
      ).status,
    ).toBe(400);
  });
});
