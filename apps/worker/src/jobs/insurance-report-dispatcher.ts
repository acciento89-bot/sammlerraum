import { createPrivateArtifactDispatcher } from "./private-artifact-dispatcher";
export const createInsuranceReportDispatcher = (
  repository: Parameters<typeof createPrivateArtifactDispatcher>[0],
  queue: Parameters<typeof createPrivateArtifactDispatcher>[1],
  logger: Parameters<typeof createPrivateArtifactDispatcher>[2],
) => createPrivateArtifactDispatcher(repository, queue, logger, 12000, "reports.build-insurance");
