import {
  createInsuranceReportRouteDependencies,
  createInsuranceReportRouteHandlers,
} from "./insurance-report-routes";
const dependencies = async () => {
  const [{ auth }, { createPrismaClient }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/create-client"),
    import("@sammlerraum/config/server"),
  ]);
  return createInsuranceReportRouteHandlers(
    createInsuranceReportRouteDependencies(
      createPrismaClient(serverEnv.DATABASE_URL, { bounded: true }),
      auth,
      serverEnv.APP_ORIGIN,
      { canonicalMoneyEnabled: serverEnv.MONEY_CANONICAL_CONSUMERS_ENABLED },
    ),
  );
};
let handlers: ReturnType<typeof dependencies> | undefined;
export const insuranceReportRouteHandlers = () => (handlers ??= dependencies());
