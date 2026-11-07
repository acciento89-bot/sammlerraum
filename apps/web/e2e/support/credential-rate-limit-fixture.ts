import { randomBytes, randomUUID } from "node:crypto";
import type { createPrismaClient } from "@sammlerraum/db/create-client";
/** Reserve only a synthetic benchmark-range sign-in address in an owned test database.
 * The real Better Auth limiter stays enabled; no global counter is reset or weakened. */
export async function credentialRateLimitFixture(db: ReturnType<typeof createPrismaClient>) {
  const [guard] = await db.$queryRaw<
    { name: string; version: string }[]
  >`SELECT current_database() AS name,current_setting('server_version') AS version`;
  if (!guard?.name.endsWith("_test") || !guard.version.startsWith("17.11"))
    throw Error("Owned PostgreSQL17.11 credential test required");
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = randomBytes(2),
      ip = `198.18.${bytes[0]}.${1 + (bytes[1]! % 254)}`,
      key = `${ip}|/sign-in/email`,
      id = randomUUID();
    try {
      await db.rateLimit.create({ data: { id, key, count: 0, lastRequest: BigInt(Date.now()) } });
      return { ip, cleanup: () => db.rateLimit.deleteMany({ where: { id, key } }) };
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002")
        throw error;
    }
  }
  throw Error("Could not reserve owned synthetic credential test address");
}
