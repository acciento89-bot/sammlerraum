import { createInsuranceRouteHandlers } from "./insurance-routes";
import { privateTransferContext } from "./private-transfer-context";
export const insuranceRouteHandlers = async () =>
  createInsuranceRouteHandlers(await privateTransferContext());
