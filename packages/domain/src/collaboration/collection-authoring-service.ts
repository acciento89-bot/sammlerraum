import {
  CollaborativeCollectionPreconditionsSchema,
  CollaborativeCollectionChangesSchema,
  CollaborativeNodeCreateSchema,
  CollaborativeNodeUpdateSchema,
  CollectionNodeSchema,
} from "@sammlerraum/contracts/collections";
import {
  MembershipActorIdSchema,
  MembershipCollectionIdSchema,
} from "@sammlerraum/contracts/collaboration";
import {
  createCollectionService,
  type CollectionDatabase,
} from "../collections/collection-service";
import { defaultMutationAudit } from "../audit/mutation-audit";
/** Admin collection.edit path, retaining the actual actor and independent Owner-only deletion. */
export function createCollaborativeCollectionService(
  database: CollectionDatabase,
  userInput: string,
  collectionInput: string,
) {
  const userId = MembershipActorIdSchema.parse(userInput),
    collectionId = MembershipCollectionIdSchema.parse(collectionInput);
  function writer(expected?: unknown) {
    const preconditions =
      expected === undefined
        ? undefined
        : CollaborativeCollectionPreconditionsSchema.parse(expected);
    return createCollectionService(database, userId, defaultMutationAudit, {
      collaborativeCollectionId: collectionId,
      ...(preconditions ? { preconditions } : {}),
    });
  }
  return {
    async updateCollection(input: unknown, expected?: unknown) {
      return writer(expected).updateCollection(
        collectionId,
        CollaborativeCollectionChangesSchema.parse(input),
      );
    },
    async createNode(input: unknown, expected?: unknown) {
      return writer(expected).createCollectionNode({
        ...CollaborativeNodeCreateSchema.parse(input),
        collectionId,
      });
    },
    async updateNode(nodeInput: string, input: unknown, expected?: unknown) {
      return writer(expected).updateCollectionNode(
        CollectionNodeSchema.shape.id.parse(nodeInput),
        CollaborativeNodeUpdateSchema.parse(input),
      );
    },
  };
}
