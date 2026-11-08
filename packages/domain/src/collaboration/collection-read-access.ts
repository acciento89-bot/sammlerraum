import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipError } from "@sammlerraum/contracts/collaboration";
import type { BoundedSearchReadTransaction } from "../search/search-read";
export type Parent = {
  id: string;
  ownerId: string;
  visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
  collaborationRevision: number;
};
export type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
type Member = { userId: string; role: Role };
function fail(code: MembershipError["code"]): never {
  throw new MembershipError(code);
}
/** Canonical current parent/member lookup shared by reads and locked mutations. */
export async function loadCollectionReadAccess(
  tx: BoundedSearchReadTransaction,
  collectionId: string,
  userId: string,
  lock: boolean | "SHARE" = false,
) {
  const [parent] = await tx.$queryRaw<Parent[]>(
    Prisma.sql`SELECT id,"ownerId",visibility,"collaborationRevision" FROM "Collection" WHERE id=${collectionId}::uuid AND "deletedAt" IS NULL ${lock === "SHARE" ? Prisma.sql`FOR SHARE` : lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`,
  );
  if (!parent) return fail("MEMBERSHIP_NOT_FOUND");
  let role: Role | null = parent.ownerId === userId ? "OWNER" : null;
  if (!role) {
    const [member] = await tx.$queryRaw<Member[]>(
      Prisma.sql`SELECT "userId",role FROM "CollectionMember" WHERE "collectionId"=${collectionId}::uuid AND "userId"=${userId}`,
    );
    role = member?.role ?? null;
  }
  if (!role) return fail("MEMBERSHIP_NOT_FOUND");
  return { parent, role };
}
