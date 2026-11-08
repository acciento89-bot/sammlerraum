import { createHash } from "node:crypto";
import {
  milestoneFail,
  PersonalMilestoneCursorSchema,
  type PersonalMilestoneCursor,
} from "@sammlerraum/contracts/personal-milestones";
import { readCursorJson } from "../search/cursor-json";
export function milestoneContextHash(owner: string, limit: number) {
  return createHash("sha256")
    .update(
      JSON.stringify(["personal-milestones", 1, owner, limit, "DATE_DESC_CREATED_DESC_ID_DESC"]),
    )
    .digest("hex");
}
export function encodeMilestoneCursor(value: PersonalMilestoneCursor) {
  const parsed = PersonalMilestoneCursorSchema.safeParse(value);
  if (!parsed.success) return milestoneFail("MILESTONE_INVALID");
  return Buffer.from(JSON.stringify(parsed.data)).toString("base64url");
}
export function decodeMilestoneCursor(token: string, contextHash: string): PersonalMilestoneCursor {
  try {
    const parsed = PersonalMilestoneCursorSchema.safeParse(readCursorJson(token));
    if (
      !parsed.success ||
      parsed.data.contextHash !== contextHash ||
      encodeMilestoneCursor(parsed.data) !== token
    )
      throw Error();
    return parsed.data;
  } catch {
    return milestoneFail("MILESTONE_INVALID");
  }
}
