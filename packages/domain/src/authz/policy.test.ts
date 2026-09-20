import { describe, expect, it } from "vitest";

import { assertAuthorized, authorize } from "./policy";
import {
  type ActorFacts,
  createTrustedActorFacts,
  createTrustedResourceFacts,
  type PolicyAction,
  type ResourceFacts,
} from "./types";

const anonymousActor = createTrustedActorFacts({ type: "ANONYMOUS" });
const ownerActor = createTrustedActorFacts({ type: "AUTHENTICATED", userId: "owner-1" });
const memberActor = createTrustedActorFacts({ type: "AUTHENTICATED", userId: "member-1" });

const publicItem = createTrustedResourceFacts({
  type: "ITEM",
  ownerId: "owner-1",
  visibility: "PUBLIC",
  ancestorVisibility: ["PUBLIC"],
  role: null,
  moderation: "VISIBLE",
  interactionBlocked: false,
  commentsEnabled: true,
});

describe("authorization policy", () => {
  it("denies an unknown action by default", () => {
    expect(authorize(ownerActor, "unknown.action" as never, publicItem)).toEqual({
      allowed: false,
      reason: "NO_POLICY",
    });
  });

  it("does not let public child visibility override a private ancestor", () => {
    const child = createTrustedResourceFacts({
      ...publicItem,
      ancestorVisibility: ["PUBLIC", "PRIVATE"],
    });

    expect(authorize(anonymousActor, "item.view", child)).toMatchObject({ allowed: false });
  });

  it.each(["PRIVATE", "UNLISTED"] as const)(
    "does not disclose a %s resource externally by id",
    (visibility) => {
      const item = createTrustedResourceFacts({ ...publicItem, visibility });

      expect(authorize(anonymousActor, "item.view", item)).toMatchObject({ allowed: false });
    },
  );

  it("keeps protected documents private even when their visibility chain is public", () => {
    const document = createTrustedResourceFacts({
      type: "DOCUMENT",
      ownerId: "owner-1",
      visibility: "PUBLIC",
      ancestorVisibility: ["PUBLIC", "PUBLIC"],
      role: null,
      moderation: "VISIBLE",
      interactionBlocked: false,
      protected: true,
    });

    expect(authorize(anonymousActor, "document.view", document)).toMatchObject({ allowed: false });
    expect(authorize(ownerActor, "document.view", document)).toMatchObject({ allowed: true });
  });

  it("keeps SEO indexing preference separate from authorization", () => {
    const privateProfile = createTrustedResourceFacts({
      type: "PROFILE",
      ownerId: "owner-1",
      visibility: "PRIVATE",
      ancestorVisibility: [],
      role: null,
      moderation: "VISIBLE",
      interactionBlocked: false,
      seoIndexingEnabled: true,
    });

    expect(authorize(anonymousActor, "profile.view", privateProfile)).toMatchObject({
      allowed: false,
    });
  });

  it.each(["VIEWER", "ADMIN"] as const)(
    "does not let a matching %s collection role open a private profile",
    (role) => {
      expect(() =>
        createTrustedResourceFacts({
          type: "PROFILE",
          ownerId: "owner-1",
          visibility: "PRIVATE",
          ancestorVisibility: [],
          role: { userId: "member-1", role },
          moderation: "VISIBLE",
          interactionBlocked: false,
        } as never),
      ).toThrow(TypeError);

      const privateProfile = createTrustedResourceFacts({
        type: "PROFILE",
        ownerId: "owner-1",
        visibility: "PRIVATE",
        ancestorVisibility: [],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
      });
      expect(authorize(memberActor, "profile.view", privateProfile)).toMatchObject({
        allowed: false,
      });
    },
  );

  it("rejects unknown and malformed facts at the trusted constructor boundary", () => {
    expect(() =>
      createTrustedResourceFacts({
        type: "UNKNOWN",
        ownerId: "owner-1",
        visibility: "PUBLIC",
        ancestorVisibility: [],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
      } as never),
    ).toThrow(TypeError);

    expect(() =>
      createTrustedResourceFacts({
        type: "ITEM",
        ownerId: "owner-1",
        visibility: "PUBLIC",
        ancestorVisibility: [],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
      } as never),
    ).toThrow(TypeError);
  });

  it("denies unknown resources, malformed facts, and untrusted ownership claims", () => {
    expect(
      authorize(ownerActor, "item.view", {
        type: "UNKNOWN",
        ownerId: "owner-1",
      } as never),
    ).toEqual({ allowed: false, reason: "NO_POLICY" });

    expect(
      authorize(ownerActor, "item.view", {
        type: "ITEM",
        ownerId: "owner-1",
      } as never),
    ).toEqual({ allowed: false, reason: "NO_POLICY" });

    expect(
      authorize(memberActor, "item.edit", {
        ...publicItem,
        role: { userId: "member-1", role: "ADMIN" },
      } as never),
    ).toEqual({ allowed: false, reason: "NO_POLICY" });
  });

  it("denies valid actions applied to the wrong resource kind", () => {
    expect(authorize(ownerActor, "members.manage", publicItem)).toEqual({
      allowed: false,
      reason: "NO_POLICY",
    });
  });

  it("allows intended public reads and owner access to private resources", () => {
    const privateItem = createTrustedResourceFacts({ ...publicItem, visibility: "PRIVATE" });

    expect(authorize(anonymousActor, "item.view", publicItem)).toMatchObject({ allowed: true });
    expect(authorize(ownerActor, "item.edit", privateItem)).toMatchObject({ allowed: true });
  });

  it("matches member roles to the authenticated actor and action", () => {
    const editorItem = createTrustedResourceFacts({
      ...publicItem,
      visibility: "PRIVATE",
      role: { userId: "member-1", role: "EDITOR" },
    });
    const adminCollection = createTrustedResourceFacts({
      type: "COLLECTION",
      ownerId: "owner-1",
      visibility: "PRIVATE",
      ancestorVisibility: [],
      role: { userId: "member-1", role: "ADMIN" },
      moderation: "VISIBLE",
      interactionBlocked: false,
    });
    const editorCollection = createTrustedResourceFacts({
      ...adminCollection,
      role: { userId: "member-1", role: "EDITOR" },
    });
    const viewerCollection = createTrustedResourceFacts({
      ...adminCollection,
      role: { userId: "member-1", role: "VIEWER" },
    });

    expect(authorize(memberActor, "item.edit", editorItem)).toMatchObject({ allowed: true });
    expect(authorize(memberActor, "members.manage", adminCollection)).toMatchObject({
      allowed: true,
    });
    expect(authorize(memberActor, "members.manage", editorCollection)).toMatchObject({
      allowed: false,
    });
    expect(authorize(memberActor, "members.manage", viewerCollection)).toMatchObject({
      allowed: false,
    });
    expect(
      authorize(
        createTrustedActorFacts({ type: "AUTHENTICATED", userId: "different-member" }),
        "item.edit",
        editorItem,
      ),
    ).toMatchObject({ allowed: false });
  });

  it.each(
    (() => {
      const publicProfile = createTrustedResourceFacts({
        type: "PROFILE",
        ownerId: "owner-1",
        visibility: "PUBLIC",
        ancestorVisibility: [],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
      });
      const publicCollection = createTrustedResourceFacts({
        type: "COLLECTION",
        ownerId: "owner-1",
        visibility: "PUBLIC",
        ancestorVisibility: [],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
      });
      const adminCollection = createTrustedResourceFacts({
        ...publicCollection,
        role: { userId: "member-1", role: "ADMIN" },
      });
      const editorItem = createTrustedResourceFacts({
        ...publicItem,
        role: { userId: "member-1", role: "EDITOR" },
      });
      const publicDocument = createTrustedResourceFacts({
        type: "DOCUMENT",
        ownerId: "owner-1",
        visibility: "PUBLIC",
        ancestorVisibility: ["PUBLIC"],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
        protected: false,
      });

      return [
        ["profile.view", anonymousActor, publicProfile],
        ["collection.view", anonymousActor, publicCollection],
        ["collection.edit", memberActor, adminCollection],
        ["item.view", anonymousActor, publicItem],
        ["item.edit", memberActor, editorItem],
        ["document.view", anonymousActor, publicDocument],
        ["comment.create", memberActor, publicItem],
        ["members.manage", memberActor, adminCollection],
      ] satisfies Array<[PolicyAction, ActorFacts, ResourceFacts]>;
    })(),
  )("has a reachable positive grant for %s", (action, actor, resource) => {
    expect(authorize(actor, action, resource)).toMatchObject({ allowed: true });
  });

  it("does not bypass block or moderation facts for community actions and public reads", () => {
    const blockedItem = createTrustedResourceFacts({
      ...publicItem,
      interactionBlocked: true,
    });
    const hiddenItem = createTrustedResourceFacts({ ...publicItem, moderation: "HIDDEN" });

    expect(authorize(memberActor, "comment.create", blockedItem)).toMatchObject({ allowed: false });
    expect(authorize(anonymousActor, "item.view", hiddenItem)).toMatchObject({ allowed: false });
  });

  it("throws one generic API error for every denied decision", () => {
    expect(() => assertAuthorized(anonymousActor, "item.view", publicItem)).not.toThrow();

    for (const action of ["item.edit", "unknown.action"] as const) {
      try {
        assertAuthorized(anonymousActor, action as PolicyAction, publicItem);
        throw new Error("expected authorization failure");
      } catch (error) {
        expect(error).toMatchObject({
          name: "ApiError",
          code: "FORBIDDEN",
          status: 403,
          message: "Not allowed",
        });
      }
    }
  });
});
