import { Client } from "pg";

// A dedicated PostgreSQL session pins the lock across asynchronous storage writes.
// Cleanup must use this same namespace around byte deletion and row removal.
export function createMediaAssetLocker(
  databaseUrl: string,
  onConnectionLost: () => void = () => process.abort(),
) {
  return async function withMediaAssetLock<T>(
    assetId: string,
    work: () => Promise<T>,
    wait = false,
  ): Promise<T | false> {
    const connection = new Client({ connectionString: databaseUrl });
    let acquired = false;
    let releasing = false;
    const connectionLost = () => {
      if (acquired && !releasing) onConnectionLost();
    };
    connection.on("error", connectionLost);
    connection.on("end", connectionLost);
    try {
      await connection.connect();
      // A 64-bit namespaced hash avoids collisions with unrelated advisory locks.
      if (wait) {
        await connection.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
          `sammlerraum:media:${assetId}`,
        ]);
        acquired = true;
      } else {
        const result = await connection.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
          [`sammlerraum:media:${assetId}`],
        );
        if (!result.rows[0]?.acquired) return false;
        acquired = true;
      }
      return await work();
    } finally {
      releasing = true;
      if (acquired) {
        await connection
          .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
            `sammlerraum:media:${assetId}`,
          ])
          .catch(() => undefined);
      }
      await connection.end().catch(() => undefined);
      connection.off("error", connectionLost);
      connection.off("end", connectionLost);
    }
  };
}
