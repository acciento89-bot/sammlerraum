import { parseCollaborativeItemRequestJson } from "@sammlerraum/contracts/items";
import { ApiError } from "@sammlerraum/contracts/errors";
import { parseImportRequestJson } from "@sammlerraum/contracts/imports";
import { readBoundedBody } from "./read-bounded-body";
/** Reuse the bounded lexical scanner: duplicate keys, invalid Unicode and deep JSON never reach a service. */
export async function readPrivateJson(
  request: Request,
  profile: "default" | "item" = "default",
): Promise<unknown> {
  if (
    new URL(request.url).search ||
    new URL(request.url).hash ||
    !/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")
  )
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid private request");
  const bytes = await readBoundedBody(request, profile === "item" ? 65536 : 16384);
  try {
    if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) throw Error();
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return profile === "item"
      ? parseCollaborativeItemRequestJson(raw)
      : parseImportRequestJson(raw);
  } catch {
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid private request");
  }
}
