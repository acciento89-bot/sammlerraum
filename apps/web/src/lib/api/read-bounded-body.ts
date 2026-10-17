import { ApiError } from "@sammlerraum/contracts/errors";

// The stream is counted independently of Content-Length, including when absent or false.
export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new ApiError("UPLOAD_TOO_LARGE", 413, "Upload too large");
  }
  if (!request.body) throw new ApiError("VALIDATION_ERROR", 400, "Request body required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new ApiError("UPLOAD_TOO_LARGE", 413, "Upload too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
