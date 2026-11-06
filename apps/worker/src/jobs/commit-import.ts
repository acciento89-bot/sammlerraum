import { z } from "zod";
import { ImportServiceError } from "@sammlerraum/contracts/imports";
import {
  ImportCommitRejected,
  createImportCommitService,
} from "@sammlerraum/domain/imports/import-commit-service";
export const IMPORT_COMMIT_JOB = "imports.commit";
const payload = z.object({ jobId: z.uuid().transform((v) => v.toLowerCase()) }).strict();
export function createImportCommitter(
  service: Pick<ReturnType<typeof createImportCommitService>, "commitNextBatch" | "failCommit">,
) {
  return async (input: unknown, context?: { signal: AbortSignal }) => {
    const request = payload.safeParse(input);
    if (!request.success) return;
    for (let batch = 0; batch <= 1000; batch++) {
      if (context?.signal.aborted) throw new Error("Import commit cancelled");
      try {
        const result = await service.commitNextBatch(request.data.jobId);
        if (result.complete) return;
      } catch (error) {
        if (error instanceof ImportCommitRejected) {
          try {
            if (await service.failCommit(request.data.jobId, error.expectedJobRevision)) return;
          } catch {
            // Failure recording has the same private dependency boundary as the write.
            // Keep the revision CAS and let the broker retry with a controlled message.
          }
        } else if (error instanceof ImportServiceError && error.code === "IMPORT_NOT_FOUND") return;
        throw new Error("Import commit temporarily unavailable");
      }
    }
    throw new Error("Import commit did not finish within its row bound");
  };
}
