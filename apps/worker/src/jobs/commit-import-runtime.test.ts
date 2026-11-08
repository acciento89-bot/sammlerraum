import { BillingError } from "@sammlerraum/contracts/billing";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { ImportCommitRejected } from "@sammlerraum/domain/imports/import-commit-service";
import { createImportCommitter } from "./commit-import";
it("rejects transient queue failures without exposing raw dependency errors", async () => {
  const service = {
    commitNextBatch: vi.fn(async () => {
      throw new Error("private dependency detail");
    }),
    failCommit: vi.fn(async () => true),
  };
  await expect(createImportCommitter(service)({ jobId: randomUUID() })).rejects.toThrow(
    "Import commit temporarily unavailable",
  );
  expect(service.failCommit).not.toHaveBeenCalled();
});
it("records a permanent failure only against the exact observed revision", async () => {
  const id = randomUUID(),
    service = {
      commitNextBatch: vi.fn(async () => {
        throw new ImportCommitRejected(7);
      }),
      failCommit: vi.fn(async () => true),
    };
  await createImportCommitter(service)({ jobId: id });
  expect(service.failCommit).toHaveBeenCalledWith(id, 7);
  service.failCommit.mockResolvedValue(false);
  await expect(createImportCommitter(service)({ jobId: id })).rejects.toThrow(
    "Import commit temporarily unavailable",
  );
});
it("rejects injected payload authority and stops on cancellation before a write", async () => {
  const service = {
      commitNextBatch: vi.fn(async () => ({ complete: true, processed: 0, committedRows: 0 })),
      failCommit: vi.fn(async () => true),
    },
    id = randomUUID();
  await createImportCommitter(service)({ jobId: id, ownerId: "foreign" });
  expect(service.commitNextBatch).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(
    createImportCommitter(service)({ jobId: id }, { signal: controller.signal }),
  ).rejects.toThrow("Import commit cancelled");
  expect(service.commitNextBatch).not.toHaveBeenCalled();
});

it("normalizes a dependency rejection while recording a permanent failure", async () => {
  const service = {
    commitNextBatch: vi.fn(async () => {
      throw new ImportCommitRejected(9);
    }),
    failCommit: vi.fn(async () => {
      throw new Error("private second-transaction error");
    }),
  };
  await expect(createImportCommitter(service)({ jobId: randomUUID() })).rejects.toThrow(
    "Import commit temporarily unavailable",
  );
});

it("keeps genuine billing dependency failures retryable without permanently stopping the import", async () => {
  const service = {
    commitNextBatch: vi.fn(async () => {
      throw new BillingError("BILLING_UNAVAILABLE");
    }),
    failCommit: vi.fn(async () => true),
  };
  await expect(createImportCommitter(service)({ jobId: randomUUID() })).rejects.toThrow(
    "Import commit temporarily unavailable",
  );
  expect(service.failCommit).not.toHaveBeenCalled();
});
