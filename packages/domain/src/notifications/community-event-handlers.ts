import type { FavoriteTarget } from "@sammlerraum/contracts/community";
import type { SearchReadTransaction } from "../search/search-read";
import { createNotificationInTransaction } from "./notification-service";

/** Call only inside the source mutation's transaction, after locking every participant.
 * Occurrence IDs distinguish a genuine re-follow/re-favorite from request retries.
 * No user-authored body, label, report reason or URL is copied into a notification.
 */
export function communityEventHandlers(tx: SearchReadTransaction) {
  return {
    onModerationStatus: (event: { id: string; recipientId: string }) =>
      createNotificationInTransaction(tx, {
        eventKey: `moderation:${event.id}`,
        type: "MODERATION_STATUS",
        recipientId: event.recipientId,
        target: { type: "ACCOUNT", id: event.recipientId },
      }),
    onJobCompleted: (event: { id: string; recipientId: string; kind: "IMPORT" | "EXPORT" }) =>
      createNotificationInTransaction(tx, {
        eventKey: `${event.kind.toLowerCase()}:completed:${event.id}`,
        type: event.kind === "IMPORT" ? "IMPORT_COMPLETED" : "EXPORT_COMPLETED",
        recipientId: event.recipientId,
        target: { type: event.kind === "IMPORT" ? "IMPORT_JOB" : "EXPORT_JOB", id: event.id },
      }),
    onSecurityEvent: (event: { id: string; recipientId: string }) =>
      createNotificationInTransaction(tx, {
        eventKey: `security:${event.id}`,
        type: "SECURITY_ALERT",
        recipientId: event.recipientId,
        target: { type: "ACCOUNT", id: event.recipientId },
      }),
    onFollowCreated: (event: { id: string; actorId: string; recipientId: string }) =>
      createNotificationInTransaction(tx, {
        eventKey: `follow:${event.id}`,
        type: "FOLLOW_RECEIVED",
        actorId: event.actorId,
        recipientId: event.recipientId,
        target: { type: "USER", id: event.actorId },
      }),
    onFavoriteCreated: (event: {
      id: string;
      actorId: string;
      recipientId: string;
      target: FavoriteTarget;
    }) =>
      createNotificationInTransaction(tx, {
        eventKey: `favorite:${event.id}`,
        type: "FAVORITE_RECEIVED",
        actorId: event.actorId,
        recipientId: event.recipientId,
        target: event.target,
      }),
    async onCommentCreated(event: {
      id: string;
      actorId: string;
      ownerId: string;
      parentAuthorId: string | null;
      target: FavoriteTarget;
    }) {
      await createNotificationInTransaction(tx, {
        eventKey: `comment:${event.id}`,
        type: "COMMENT_RECEIVED",
        actorId: event.actorId,
        recipientId: event.ownerId,
        target: event.target,
      });
      if (event.parentAuthorId && event.parentAuthorId !== event.ownerId)
        await createNotificationInTransaction(tx, {
          eventKey: `reply:${event.id}`,
          type: "REPLY_RECEIVED",
          actorId: event.actorId,
          recipientId: event.parentAuthorId,
          target: event.target,
        });
    },
  };
}
