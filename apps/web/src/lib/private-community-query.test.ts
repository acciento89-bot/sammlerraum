import { describe, it, expect, vi } from "vitest";
import { createSocialDependencies, createSocialHandlers } from "./social-routes";
import { createCommentDependencies, createCommentHandlers } from "./comment-routes";
import { createModerationDependencies, createModerationHandlers } from "./moderation-routes";
import { createNotificationDependencies, createNotificationHandlers } from "./notification-routes";
import {
  createCommunityWorkspaceDependencies,
  createCommunityWorkspaceHandlers,
} from "./community-wishlist-routes";
const origin = "https://example.invalid";
describe("consistent strict private community query boundary", () => {
  const names = ["social", "comments", "moderation", "notifications", "workspace"] as const;
  for (const name of names)
    it.each(["forged=1", "limit=1&limit=2", "limit=%"])(
      `${name}: rejects %s before database access`,
      async (raw) => {
        const transaction = vi.fn(async () => {
          throw Error("Must not query private data");
        });
        const db = { $transaction: transaction },
          auth = { api: { getSession: async () => ({ user: { id: "own-query-fixture" } }) } };
        const handlers = {
          social: createSocialHandlers(createSocialDependencies(db, auth, origin)).FOLLOWING,
          comments: createCommentHandlers(createCommentDependencies(db, auth, origin)).OWN_BLOCKS,
          moderation: createModerationHandlers(createModerationDependencies(db, auth, origin))
            .REPORTS,
          notifications: createNotificationHandlers(
            createNotificationDependencies(db, auth, origin),
          ).LIST,
          workspace: createCommunityWorkspaceHandlers(
            createCommunityWorkspaceDependencies(db, auth, origin),
          ).FEED,
        };
        const response = await handlers[name](new Request(origin + "/api/v1/owned?" + raw));
        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(transaction).not.toHaveBeenCalled();
      },
    );
});
