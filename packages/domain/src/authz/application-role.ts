export class ApplicationRoleError extends Error {
  readonly code = "APPLICATION_ROLE_REQUIRED";
  constructor() {
    super("APPLICATION_ROLE_REQUIRED");
    this.name = "ApplicationRoleError";
  }
}

/** Read authoritative authority and hold it until commit. Ordinary SQL revocations wait. */
export async function requireApplicationModerator(
  tx: { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> },
  userId: string,
): Promise<void> {
  const grants = await tx.$queryRaw<{ role: string }[]>`
    SELECT "role" FROM "ApplicationRoleGrant" WHERE "userId" = ${userId} FOR SHARE
  `;
  if (!grants.some((grant) => grant.role === "MODERATOR" || grant.role === "ADMIN")) {
    throw new ApplicationRoleError();
  }
}
