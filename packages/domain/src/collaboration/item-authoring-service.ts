import {
  CollaborativeItemPreconditionsSchema,
  CollaborativeItemCreateSchema,
  CollaborativeItemUpdateSchema,
  CollaborativeItemSchema,
  CreateItemInputSchema,
  UpdateItemInputSchema,
  CollectibleItemSchema,
} from "@sammlerraum/contracts/items";
import {
  MembershipActorIdSchema,
  MembershipCollectionIdSchema,
} from "@sammlerraum/contracts/collaboration";
import {
  createItemInTransaction,
  updateItemInTransaction,
  type ItemDatabase,
  type ItemTransaction,
} from "../items/item-service";
/** Real Editor/Admin metadata authoring. Never call an Owner service under an impersonated actor. */
export function createCollaborativeItemService(database: ItemDatabase, actorInput: string) {
  const actor = MembershipActorIdSchema.parse(actorInput);
  async function transaction<T>(work: (tx: ItemTransaction) => Promise<T>) {
    return database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('statement_timeout','2000ms',true),set_config('lock_timeout','500ms',true),set_config('TimeZone','UTC',true)`;
        return work(tx);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  return {
    async createItem(input: unknown) {
      const value = CollaborativeItemCreateSchema.parse(input),
        data = CreateItemInputSchema.parse(value);
      return transaction(async (tx) =>
        CollaborativeItemSchema.parse(
          await createItemInTransaction(tx, actor, data, {
            collaborativeCollectionId: value.collectionId,
          }),
        ),
      );
    },
    async updateItem(
      collectionInput: string,
      itemInput: string,
      input: unknown,
      expected?: unknown,
    ) {
      const preconditions =
          expected === undefined ? undefined : CollaborativeItemPreconditionsSchema.parse(expected),
        collectionId = MembershipCollectionIdSchema.parse(collectionInput),
        itemId = CollectibleItemSchema.shape.id.parse(itemInput),
        value = CollaborativeItemUpdateSchema.parse(input),
        data = UpdateItemInputSchema.parse(value);
      return transaction(async (tx) =>
        CollaborativeItemSchema.parse(
          await updateItemInTransaction(tx, actor, itemId, data, {
            collaborativeCollectionId: collectionId,
            ...(preconditions ? { collaborativePreconditions: preconditions } : {}),
          }),
        ),
      );
    },
  };
}
