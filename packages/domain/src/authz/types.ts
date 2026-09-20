export type PolicyAction =
  | "profile.view"
  | "collection.view"
  | "collection.edit"
  | "item.view"
  | "item.edit"
  | "document.view"
  | "comment.create"
  | "members.manage";

export type Visibility = "PRIVATE" | "UNLISTED" | "PUBLIC";
export type CollectionRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
export type ModerationStatus = "VISIBLE" | "HIDDEN";

export type AuthorizationDecision =
  | { allowed: true; reason: "OWNER" | "MEMBER" | "PUBLIC" }
  | { allowed: false; reason: "NO_POLICY" | "NOT_AUTHORIZED" };

const trustedFacts = Symbol("server-trusted authorization facts");

type TrustedFacts = {
  readonly [trustedFacts]: true;
};

export type AnonymousActorFacts = TrustedFacts & {
  readonly type: "ANONYMOUS";
};

export type AuthenticatedActorFacts = TrustedFacts & {
  readonly type: "AUTHENTICATED";
  readonly userId: string;
};

export type ActorFacts = AnonymousActorFacts | AuthenticatedActorFacts;

export type RoleAssignment = {
  readonly userId: string;
  readonly role: CollectionRole;
};

type ResourceFactsBase = TrustedFacts & {
  readonly ownerId: string;
  readonly visibility: Visibility;
  readonly ancestorVisibility: readonly Visibility[];
  readonly moderation: ModerationStatus;
  readonly interactionBlocked: boolean;
};

export type ProfileResourceFacts = ResourceFactsBase & {
  readonly type: "PROFILE";
  readonly role: null;
};

export type CollectionResourceFacts = ResourceFactsBase & {
  readonly type: "COLLECTION";
  readonly role: RoleAssignment | null;
};

export type ItemResourceFacts = ResourceFactsBase & {
  readonly type: "ITEM";
  readonly role: RoleAssignment | null;
  readonly commentsEnabled: boolean;
};

export type DocumentResourceFacts = ResourceFactsBase & {
  readonly type: "DOCUMENT";
  readonly role: RoleAssignment | null;
  /** An explicit document-level protection bit; parent visibility never clears it. */
  readonly protected: boolean;
};

export type ResourceFacts =
  | ProfileResourceFacts
  | CollectionResourceFacts
  | ItemResourceFacts
  | DocumentResourceFacts;

type ActorFactsInput = { type: "ANONYMOUS" } | { type: "AUTHENTICATED"; userId: string };

type ResourceFactsInputBase = {
  ownerId: string;
  visibility: Visibility;
  ancestorVisibility: readonly Visibility[];
  moderation: ModerationStatus;
  interactionBlocked: boolean;
};

type ProfileResourceFactsInput = ResourceFactsInputBase & { type: "PROFILE"; role: null };
type CollectionResourceFactsInput = ResourceFactsInputBase & {
  type: "COLLECTION";
  role: RoleAssignment | null;
};
type ItemResourceFactsInput = ResourceFactsInputBase & {
  type: "ITEM";
  role: RoleAssignment | null;
  commentsEnabled: boolean;
};
type DocumentResourceFactsInput = ResourceFactsInputBase & {
  type: "DOCUMENT";
  role: RoleAssignment | null;
  protected: boolean;
};

type ResourceFactsInput =
  | ProfileResourceFactsInput
  | CollectionResourceFactsInput
  | ItemResourceFactsInput
  | DocumentResourceFactsInput;

const VISIBILITIES = new Set<unknown>(["PRIVATE", "UNLISTED", "PUBLIC"]);
const ROLES = new Set<unknown>(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);
const MODERATION_STATUSES = new Set<unknown>(["VISIBLE", "HIDDEN"]);
const RESOURCE_TYPES = new Set<unknown>(["PROFILE", "COLLECTION", "ITEM", "DOCUMENT"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isVisibility(value: unknown): value is Visibility {
  return VISIBILITIES.has(value);
}

function isRoleAssignment(value: unknown, ownerId: string): value is RoleAssignment | null {
  if (value === null) return true;
  if (typeof value !== "object") return false;

  const candidate = value as Partial<RoleAssignment>;
  return (
    isNonEmptyString(candidate.userId) &&
    ROLES.has(candidate.role) &&
    (candidate.role !== "OWNER" || candidate.userId === ownerId)
  );
}

function brandAndFreeze<T extends object>(facts: T): T & TrustedFacts {
  Object.defineProperty(facts, trustedFacts, { value: true });
  return Object.freeze(facts) as T & TrustedFacts;
}

/**
 * Marks actor facts resolved at a server authentication boundary. Never call this
 * with an actor identity taken from request input.
 */
export function createTrustedActorFacts<T extends ActorFactsInput>(
  facts: T,
): T["type"] extends "AUTHENTICATED" ? AuthenticatedActorFacts : AnonymousActorFacts {
  if (facts.type === "AUTHENTICATED") {
    if (!isNonEmptyString(facts.userId)) throw new TypeError("Invalid trusted actor facts");
    return brandAndFreeze({ type: facts.type, userId: facts.userId }) as never;
  }
  return brandAndFreeze({ type: facts.type }) as never;
}

function validateResourceFacts(facts: ResourceFactsInput): void {
  if (
    !RESOURCE_TYPES.has(facts.type) ||
    !isNonEmptyString(facts.ownerId) ||
    !isVisibility(facts.visibility) ||
    !Array.isArray(facts.ancestorVisibility) ||
    !facts.ancestorVisibility.every(isVisibility) ||
    !isRoleAssignment(facts.role, facts.ownerId) ||
    !MODERATION_STATUSES.has(facts.moderation) ||
    typeof facts.interactionBlocked !== "boolean"
  ) {
    throw new TypeError("Invalid trusted resource facts");
  }

  if (facts.type === "PROFILE" && (facts.ancestorVisibility.length !== 0 || facts.role !== null)) {
    throw new TypeError("Invalid trusted resource facts");
  }
  if (facts.type === "ITEM" && typeof facts.commentsEnabled !== "boolean") {
    throw new TypeError("Invalid trusted resource facts");
  }
  if (facts.type === "DOCUMENT" && typeof facts.protected !== "boolean") {
    throw new TypeError("Invalid trusted resource facts");
  }
}

type TrustedResourceFor<T extends ResourceFactsInput> = T["type"] extends "PROFILE"
  ? ProfileResourceFacts
  : T["type"] extends "COLLECTION"
    ? CollectionResourceFacts
    : T["type"] extends "ITEM"
      ? ItemResourceFacts
      : DocumentResourceFacts;

/**
 * Marks complete facts loaded by trusted server code. Membership, ownership,
 * moderation, and visibility values must never come directly from request input.
 */
export function createTrustedResourceFacts<T extends ResourceFactsInput>(
  facts: T,
): TrustedResourceFor<T> {
  validateResourceFacts(facts);

  const base = {
    type: facts.type,
    ownerId: facts.ownerId,
    visibility: facts.visibility,
    ancestorVisibility: Object.freeze([...facts.ancestorVisibility]),
    role:
      facts.role === null
        ? null
        : Object.freeze({ userId: facts.role.userId, role: facts.role.role }),
    moderation: facts.moderation,
    interactionBlocked: facts.interactionBlocked,
  };

  if (facts.type === "ITEM") {
    return brandAndFreeze({
      ...base,
      type: facts.type,
      commentsEnabled: facts.commentsEnabled,
    }) as never;
  }
  if (facts.type === "DOCUMENT") {
    return brandAndFreeze({ ...base, type: facts.type, protected: facts.protected }) as never;
  }
  return brandAndFreeze({ ...base, type: facts.type }) as never;
}

export function isTrustedActorFacts(value: unknown): value is ActorFacts {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ActorFacts> & { [trustedFacts]?: unknown };
  if (candidate[trustedFacts] !== true || !Object.isFrozen(value)) return false;
  if (candidate.type === "ANONYMOUS") return true;
  return candidate.type === "AUTHENTICATED" && isNonEmptyString(candidate.userId);
}

export function isTrustedResourceFacts(value: unknown): value is ResourceFacts {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ResourceFactsInput> & { [trustedFacts]?: unknown };
  if (candidate[trustedFacts] !== true || !Object.isFrozen(value)) return false;

  try {
    validateResourceFacts(candidate as ResourceFactsInput);
  } catch {
    return false;
  }

  return true;
}
