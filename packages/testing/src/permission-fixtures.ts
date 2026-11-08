/** Expected V1 boundaries, independent of the policy implementation under test. */
export const permissionRoles = [
  "anonymous",
  "owner",
  "admin",
  "editor",
  "viewer",
  "shared",
  "blocked",
  "moderator",
] as const;
export type PermissionRole = (typeof permissionRoles)[number];
export const permissionResources = [
  "public-child-private-ancestor",
  "workspace",
  "create-workspace-item",
  "private-document",
  "private-location",
  "audit",
  "insurance",
  "moderation",
  "premium-export",
  "advanced-filter",
] as const;
export type PermissionResource = (typeof permissionResources)[number];
// Each row is ordered as permissionRoles, making every actor's boundary explicit.
type EightStatuses = readonly [number, number, number, number, number, number, number, number];
const expected: Record<PermissionResource, EightStatuses> = {
  "public-child-private-ancestor": [404, 200, 404, 404, 404, 404, 404, 404],
  workspace: [401, 200, 200, 200, 200, 404, 404, 404],
  "create-workspace-item": [401, 200, 200, 200, 404, 404, 404, 404],
  "private-document": [404, 200, 404, 404, 404, 404, 404, 404],
  "private-location": [401, 200, 404, 404, 404, 404, 404, 404],
  audit: [401, 200, 404, 404, 404, 404, 404, 404],
  insurance: [401, 200, 404, 404, 404, 404, 404, 404],
  moderation: [401, 403, 403, 403, 403, 403, 403, 200],
  "premium-export": [401, 202, 403, 403, 403, 403, 403, 403],
  "advanced-filter": [401, 200, 403, 403, 403, 403, 403, 403],
};
export const permissionMatrix = permissionResources.flatMap((resource) =>
  permissionRoles.map((role, index) => ({ role, resource, status: expected[resource][index]! })),
);
