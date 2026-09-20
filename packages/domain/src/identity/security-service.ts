export type SessionMetadata = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  userAgent: string | null;
  current: boolean;
};

type SessionRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  userAgent: string | null;
};

type AccountRow = {
  id: string;
  providerId: string;
  password: string | null;
};

type PasskeyRow = { id: string };

type DeleteResult = { count: number };

type SecurityTransaction = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  user: {
    findUnique(args: {
      where: { id: string };
      select: { emailVerified: true };
    }): Promise<{ emailVerified: boolean } | null>;
  };
  account: {
    findMany(args: {
      where: { userId: string };
      select: { id: true; providerId: true; password: true };
    }): Promise<AccountRow[]>;
    deleteMany(args: {
      where: { userId: string; id?: string; providerId?: string };
    }): Promise<DeleteResult>;
  };
  passkey: {
    findMany(args: { where: { userId: string }; select: { id: true } }): Promise<PasskeyRow[]>;
    deleteMany(args: { where: { id: string; userId: string } }): Promise<DeleteResult>;
  };
};

export type SecurityDatabase = {
  session: {
    findMany(args: {
      where: { userId: string; expiresAt: { gt: Date } };
      select: {
        id: true;
        createdAt: true;
        updatedAt: true;
        userAgent: true;
      };
      orderBy: { updatedAt: "desc" };
    }): Promise<SessionRow[]>;
    deleteMany(args: { where: { id: string; userId: string } }): Promise<DeleteResult>;
  };
  $transaction<T>(
    operation: (transaction: SecurityTransaction) => Promise<T>,
    options: { isolationLevel: "Serializable" },
  ): Promise<T>;
};

export type SecurityErrorCode =
  | "LOGIN_METHOD_NOT_FOUND"
  | "RECOVERY_METHOD_REQUIRED"
  | "SESSION_NOT_FOUND";

export class SecurityServiceError extends Error {
  constructor(
    readonly code: SecurityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SecurityServiceError";
  }
}

const verifiedOAuthProviders = new Set(["google", "apple"]);

function sanitizeUserAgentLabel(userAgent: string | null): string | null {
  if (userAgent === null) return null;
  const label = userAgent
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label.length === 0 ? null : label.slice(0, 160);
}

export function createSecurityService(database: SecurityDatabase, now = () => new Date()) {
  return {
    async listSessions(userId: string, currentSessionId: string): Promise<SessionMetadata[]> {
      const sessions = await database.session.findMany({
        where: { userId, expiresAt: { gt: now() } },
        select: { id: true, createdAt: true, updatedAt: true, userAgent: true },
        orderBy: { updatedAt: "desc" },
      });

      return sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastSeenAt: session.updatedAt,
        userAgent: sanitizeUserAgentLabel(session.userAgent),
        current: session.id === currentSessionId,
      }));
    },

    async revokeSession(userId: string, sessionId: string): Promise<void> {
      const result = await database.session.deleteMany({ where: { id: sessionId, userId } });
      if (result.count !== 1) {
        throw new SecurityServiceError("SESSION_NOT_FOUND", "Session not found");
      }
    },

    async removeLoginMethod(userId: string, methodId: string): Promise<void> {
      await database.$transaction(
        async (transaction) => {
          // Lock one stable per-user row so two removals cannot both observe two factors.
          await transaction.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE`;
          const [user, accounts, passkeys] = await Promise.all([
            transaction.user.findUnique({
              where: { id: userId },
              select: { emailVerified: true },
            }),
            transaction.account.findMany({
              where: { userId },
              select: { id: true, providerId: true, password: true },
            }),
            transaction.passkey.findMany({ where: { userId }, select: { id: true } }),
          ]);

          if (!user) {
            throw new SecurityServiceError("LOGIN_METHOD_NOT_FOUND", "Login method not found");
          }

          const credentialAccounts = accounts.filter(
            (account) => account.providerId === "credential" && account.password !== null,
          );
          const verifiedAccountIds = new Set(
            accounts
              .filter((account) => verifiedOAuthProviders.has(account.providerId))
              .map((account) => account.id),
          );
          const verifiedPasskeyIds = new Set(passkeys.map((passkey) => passkey.id));

          let target:
            | { type: "password" }
            | { type: "account"; id: string }
            | { type: "passkey"; id: string };
          if (methodId === "password" && credentialAccounts.length > 0) {
            target = { type: "password" };
          } else if (methodId.startsWith("account:")) {
            const id = methodId.slice("account:".length);
            if (!verifiedAccountIds.has(id)) {
              throw new SecurityServiceError("LOGIN_METHOD_NOT_FOUND", "Login method not found");
            }
            target = { type: "account", id };
          } else if (methodId.startsWith("passkey:")) {
            const id = methodId.slice("passkey:".length);
            if (!verifiedPasskeyIds.has(id)) {
              throw new SecurityServiceError("LOGIN_METHOD_NOT_FOUND", "Login method not found");
            }
            target = { type: "passkey", id };
          } else {
            throw new SecurityServiceError("LOGIN_METHOD_NOT_FOUND", "Login method not found");
          }

          let remainingVerifiedFactors =
            (user.emailVerified && credentialAccounts.length > 0 ? 1 : 0) +
            verifiedAccountIds.size +
            verifiedPasskeyIds.size;
          if (target.type === "password" && user.emailVerified) remainingVerifiedFactors -= 1;
          if (target.type === "account") remainingVerifiedFactors -= 1;
          if (target.type === "passkey") remainingVerifiedFactors -= 1;
          if (remainingVerifiedFactors < 1) {
            throw new SecurityServiceError(
              "RECOVERY_METHOD_REQUIRED",
              "At least one verified recovery method is required",
            );
          }

          const result =
            target.type === "password"
              ? await transaction.account.deleteMany({
                  where: { userId, providerId: "credential" },
                })
              : target.type === "account"
                ? await transaction.account.deleteMany({ where: { userId, id: target.id } })
                : await transaction.passkey.deleteMany({ where: { userId, id: target.id } });
          if (result.count < 1) {
            throw new SecurityServiceError("LOGIN_METHOD_NOT_FOUND", "Login method not found");
          }
        },
        { isolationLevel: "Serializable" },
      );
    },
  };
}
