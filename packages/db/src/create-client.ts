import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export function createPrismaClient(
  databaseUrl: string,
  options: { bounded?: boolean } = {},
): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    ...(options.bounded ? { connectionTimeoutMillis: 2000 } : {}),
  });
  return new PrismaClient({
    adapter,
    ...(options.bounded ? { transactionOptions: { maxWait: 2000, timeout: 10000 } } : {}),
  });
}
