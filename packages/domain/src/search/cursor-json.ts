/** Shared byte-level cursor boundary; each operation owns its schema and canonical field order. */
export function readCursorJson(token: string): unknown {
  if (!/^[A-Za-z0-9_-]{1,2048}$/u.test(token)) throw Error();
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length > 1536 || bytes.toString("base64url") !== token) throw Error();
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
