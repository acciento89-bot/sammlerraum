import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createImportParser } from "./import-parser-runtime";
import type { ImportParserRepository, ImportParserClaim } from "./import-parser-repository";
import type { StorageProvider } from "@sammlerraum/storage";
function setup() {
  const bytes = Buffer.from("Title\nOne"),
    id = randomUUID();
  const claim: ImportParserClaim = {
    id,
    token: randomUUID(),
    sourceFormat: "CSV",
    sourceStorageKey: `imports/${id}/source`,
    sourceByteSize: BigInt(bytes.length),
    sourceChecksumSha256: createHash("sha256").update(bytes).digest("hex"),
    parserOptions: { schemaVersion: 1, format: "CSV", hasHeader: true, delimiter: "," },
  };
  const repo: ImportParserRepository = {
    claim: vi.fn(async () => claim),
    renew: vi.fn(async () => true),
    verified: vi.fn(async () => true),
    header: vi.fn(async () => {}),
    append: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
  const storage: StorageProvider = {
    read: vi.fn(async () => bytes),
    put: vi.fn(),
    exists: vi.fn(),
    delete: vi.fn(),
  };
  return { bytes, id, repo, storage, claim };
}
it("keeps ownership until a storage read that ignores cancellation has really settled", async () => {
  const f = setup(),
    controller = new AbortController();
  let release!: (v: Uint8Array) => void, started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.storage.read = vi.fn(() => {
    started();
    return new Promise<Uint8Array>((resolve) => {
      release = resolve;
    });
  });
  const running = createImportParser(f.repo, f.storage)(
    { jobId: f.id },
    { signal: controller.signal },
  );
  await start;
  controller.abort();
  await Promise.resolve();
  expect(f.repo.fail).not.toHaveBeenCalled();
  expect(f.repo.finish).not.toHaveBeenCalled();
  release(f.bytes);
  await expect(running).rejects.toMatchObject({ code: "IMPORT_PARSE_CANCELLED" });
  expect(f.repo.fail).toHaveBeenCalledWith(f.claim, "IMPORT_PARSE_CANCELLED", true);
  expect(f.repo.verified).not.toHaveBeenCalled();
});
it("does not accept payload-provided owners, paths or source replacements", async () => {
  const f = setup();
  await createImportParser(f.repo, f.storage)({ jobId: f.id, sourceStorageKey: "foreign" });
  expect(f.repo.claim).not.toHaveBeenCalled();
});
it("does not complete a partially consumed source after persistence fails", async () => {
  const f = setup();
  f.repo.append = vi.fn(async () => {
    throw new Error("synthetic transient");
  });
  await expect(createImportParser(f.repo, f.storage)({ jobId: f.id })).rejects.toMatchObject({
    code: "IMPORT_PROCESSING_ERROR",
  });
  expect(f.repo.finish).not.toHaveBeenCalled();
  expect(f.repo.fail).toHaveBeenCalledOnce();
});
