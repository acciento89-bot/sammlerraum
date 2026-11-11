import { createHmac } from "node:crypto";
import { ApiError } from "@sammlerraum/contracts/errors";

export const ACQUISITION_START = new Date("2026-11-11T19:00:00Z");
export type AcquisitionKind = "registration" | "first_item";
export type AcquisitionEvent = { kind: AcquisitionKind; transactionId: string };
type Candidate = {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  applicationRoleGrant: { role: string } | null;
};

export function parseAcquisitionStart(raw: string | null, now = new Date()): Date {
  if (!raw || !/^\d{13}$/.test(raw))
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid acquisition window");
  const value = Number(raw);
  if (
    value > now.getTime() ||
    value < now.getTime() - 30 * 86400000 ||
    value < ACQUISITION_START.getTime()
  )
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid acquisition window");
  return new Date(value);
}

/** Database truth only; the browser cannot assert verification or item creation. */
export function acquisitionEligibility(
  user: Candidate | null,
  options: { start: Date; now: Date; secret: string; firstItemAt: Date | null },
): { events: AcquisitionEvent[] } {
  if (
    !user ||
    !user.emailVerified ||
    user.applicationRoleGrant ||
    user.createdAt < ACQUISITION_START ||
    user.createdAt.getTime() < options.start.getTime() - 5 * 60000 ||
    user.createdAt > options.now ||
    /@(?:[^@.]+\.)?kamilunavo\.com$/i.test(user.email) ||
    /\.(?:test|invalid)$/i.test(user.email)
  )
    return { events: [] };
  const event = (kind: AcquisitionKind): AcquisitionEvent => ({
    kind,
    transactionId:
      "sr_" +
      createHmac("sha256", options.secret)
        .update(`sammlerraum-search-30-20261112:${kind}:${user.id}`)
        .digest("hex")
        .slice(0, 40),
  });
  return {
    events: [
      event("registration"),
      ...(options.firstItemAt &&
      options.firstItemAt >= user.createdAt &&
      options.firstItemAt <= options.now
        ? [event("first_item")]
        : []),
    ],
  };
}
