type Queryable = {
  $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
};

export async function checkDatabaseHealth(db: Queryable): Promise<{ ok: boolean }> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
