const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function getRequestId(headers: Headers): string {
  const incoming = headers.get("x-request-id");
  return incoming !== null && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
}
