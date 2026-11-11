import type { createPrismaClient } from "@sammlerraum/db/create-client";
import { ApiError } from "@sammlerraum/contracts/errors";
import { apiRoute } from "./api/route-handler";
import { readPrivateQuery } from "./api/read-private-query";

type PrismaClient = ReturnType<typeof createPrismaClient>;
type Database = Pick<PrismaClient, "user">;
const berlin = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function calendar(date: Date) {
  return Object.fromEntries(berlin.formatToParts(date).map((p) => [p.type, Number(p.value)]));
}
/** Calendar-day windows stay correct when a Berlin day has 23 or 25 hours. */
export function berlinDayStart(now: Date, days = 0): Date {
  const p = calendar(now);
  const nominal = Date.UTC(p.year!, p.month! - 1, p.day! + days);
  let instant = nominal;
  for (let i = 0; i < 3; i++) {
    const local = calendar(new Date(instant));
    const offset =
      Date.UTC(
        local.year!,
        local.month! - 1,
        local.day!,
        local.hour!,
        local.minute!,
        local.second!,
      ) - instant;
    instant = nominal - offset;
  }
  return new Date(instant);
}

/** Authority comes from live database state, never email input or cached session claims. */
export async function requireAdmin(db: Database, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, applicationRoleGrant: { select: { role: true } } },
  });
  if (!user?.emailVerified || user.applicationRoleGrant?.role !== "ADMIN")
    throw new ApiError("FORBIDDEN", 403, "Administrator access required");
}

export function parseAdminQuery(request: Request) {
  const raw = readPrivateQuery(request, ["q", "page", "verified"]);
  const q = (raw.q ?? "").trim();
  if (
    q.length > 120 ||
    /[\u0000-\u001f]/u.test(q) ||
    (raw.page !== undefined && !/^[1-9][0-9]{0,3}$/.test(raw.page)) ||
    (raw.verified !== undefined && !["all", "yes", "no"].includes(raw.verified))
  )
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid administration query");
  const page = Number(raw.page ?? "1");
  if (page > 4000) throw new ApiError("VALIDATION_ERROR", 400, "Page limit exceeded");
  return { q, page, verified: raw.verified ?? "all" };
}

export async function adminUsers(
  db: PrismaClient,
  userId: string,
  query: ReturnType<typeof parseAdminQuery>,
  now = new Date(),
) {
  return db.$transaction(
    async (tx) => {
      await requireAdmin(tx, userId);
      const where = {
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" as const } },
                { email: { contains: query.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(query.verified !== "all" ? { emailVerified: query.verified === "yes" } : {}),
      };
      const [total, verified, today, lastSevenDays, matched, users] = await Promise.all([
        tx.user.count(),
        tx.user.count({ where: { emailVerified: true } }),
        tx.user.count({ where: { createdAt: { gte: berlinDayStart(now), lte: now } } }),
        tx.user.count({ where: { createdAt: { gte: berlinDayStart(now, -6), lte: now } } }),
        tx.user.count({ where }),
        tx.user.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * 25,
          take: 25,
          select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
        }),
      ]);
      return {
        summary: { total, verified, today, lastSevenDays },
        matched,
        users,
        page: query.page,
        pageSize: 25,
        generatedAt: now.toISOString(),
        timeZone: "Europe/Berlin",
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export function createAdminUsersHandler(deps: {
  db: PrismaClient;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  appOrigin: string;
}) {
  return apiRoute(async (request) => {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(deps.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await deps.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    const result = await adminUsers(deps.db, session.user.id, parseAdminQuery(request));
    return Response.json(result, {
      headers: {
        "cache-control": "private, no-store",
        vary: "Cookie",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  });
}
