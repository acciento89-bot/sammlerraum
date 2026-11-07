import { ApiError } from "@sammlerraum/contracts/errors";
import { parseImportRequestJson } from "@sammlerraum/contracts/imports";
import { readBoundedBody } from "./read-bounded-body";
/** Reuse the bounded lexical scanner: duplicate keys, invalid Unicode and deep JSON never reach a service. */
export async function readPrivateJson(request: Request): Promise<unknown> {
  if (
    new URL(request.url).search ||
    new URL(request.url).hash ||
    !/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")
  )
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid private request");
  const bytes = await readBoundedBody(request, 16384);
  try {
    if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) throw Error();
    return parseImportRequestJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid private request");
  }
}
