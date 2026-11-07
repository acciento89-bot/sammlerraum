import { createArtifactRouteHandlers } from "./artifact-routes";
import { privateTransferContext } from "./private-transfer-context";
export const artifactRouteHandlers = async () =>
  createArtifactRouteHandlers(await privateTransferContext());
