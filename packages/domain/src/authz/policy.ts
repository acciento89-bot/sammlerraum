import { ApiError } from "@sammlerraum/contracts/errors";

import {
  type ActorFacts,
  type AuthorizationDecision,
  type CollectionRole,
  isTrustedActorFacts,
  isTrustedResourceFacts,
  type PolicyAction,
  type ResourceFacts,
} from "./types";

const POLICY_ACTIONS = new Set<unknown>([
  "profile.view",
  "collection.view",
  "collection.edit",
  "item.view",
  "item.edit",
  "document.view",
  "comment.create",
  "members.manage",
] satisfies PolicyAction[]);

const noPolicy = (): AuthorizationDecision => ({ allowed: false, reason: "NO_POLICY" });
const denied = (): AuthorizationDecision => ({ allowed: false, reason: "NOT_AUTHORIZED" });

function isPolicyAction(value: unknown): value is PolicyAction {
  return POLICY_ACTIONS.has(value);
}

function actorRole(actor: ActorFacts, resource: ResourceFacts): CollectionRole | null {
  if (actor.type !== "AUTHENTICATED") return null;
  if (actor.userId === resource.ownerId) return "OWNER";
  return resource.role?.userId === actor.userId ? resource.role.role : null;
}

function allowForRole(
  actor: ActorFacts,
  resource: ResourceFacts,
  roles: readonly CollectionRole[],
): AuthorizationDecision | null {
  const role = actorRole(actor, resource);
  if (role === null || !roles.includes(role)) return null;
  return { allowed: true, reason: role === "OWNER" ? "OWNER" : "MEMBER" };
}

function isPubliclyVisible(resource: ResourceFacts): boolean {
  return (
    resource.visibility === "PUBLIC" &&
    resource.ancestorVisibility.every((visibility) => visibility === "PUBLIC") &&
    resource.moderation === "VISIBLE"
  );
}

function authorizeView(actor: ActorFacts, resource: ResourceFacts): AuthorizationDecision {
  const memberDecision = allowForRole(actor, resource, ["OWNER", "ADMIN", "EDITOR", "VIEWER"]);
  if (memberDecision) return memberDecision;
  if (!isPubliclyVisible(resource)) return denied();
  if (resource.type === "DOCUMENT" && resource.protected) return denied();
  return { allowed: true, reason: "PUBLIC" };
}

function actionMatchesResource(action: PolicyAction, resource: ResourceFacts): boolean {
  if (action === "profile.view") return resource.type === "PROFILE";
  if (
    action === "collection.view" ||
    action === "collection.edit" ||
    action === "members.manage"
  ) {
    return resource.type === "COLLECTION";
  }
  if (action === "item.view" || action === "item.edit" || action === "comment.create") {
    return resource.type === "ITEM";
  }
  return action === "document.view" && resource.type === "DOCUMENT";
}

export function authorize(
  actor: ActorFacts,
  action: PolicyAction,
  resource: ResourceFacts,
): AuthorizationDecision {
  if (
    !isPolicyAction(action) ||
    !isTrustedActorFacts(actor) ||
    !isTrustedResourceFacts(resource) ||
    !actionMatchesResource(action, resource)
  ) {
    return noPolicy();
  }

  if (action.endsWith(".view")) return authorizeView(actor, resource);

  if (action === "collection.edit") {
    return allowForRole(actor, resource, ["OWNER", "ADMIN"]) ?? denied();
  }
  if (action === "item.edit") {
    return allowForRole(actor, resource, ["OWNER", "ADMIN", "EDITOR"]) ?? denied();
  }
  if (action === "members.manage") {
    return allowForRole(actor, resource, ["OWNER", "ADMIN"]) ?? denied();
  }

  if (
    action === "comment.create" &&
    actor.type === "AUTHENTICATED" &&
    resource.type === "ITEM" &&
    resource.commentsEnabled &&
    !resource.interactionBlocked &&
    resource.moderation === "VISIBLE"
  ) {
    const viewDecision = authorizeView(actor, resource);
    return viewDecision.allowed ? viewDecision : denied();
  }

  return denied();
}

export function assertAuthorized(
  actor: ActorFacts,
  action: PolicyAction,
  resource: ResourceFacts,
): void {
  if (!authorize(actor, action, resource).allowed) {
    throw new ApiError("FORBIDDEN", 403, "Not allowed");
  }
}
