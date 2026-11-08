import { createAIApplyRouteDependencies, createAIApplyRouteHandlers } from "./ai-routes";
export async function aiApplyHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createAIApplyRouteHandlers(
    createAIApplyRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}

export async function aiCaptureHandlers() {
  const [
    { auth },
    { prisma },
    { serverEnv },
    { createAIAnalysisService },
    { createAIUsageService },
    { createAICaptureRouteHandlers },
  ] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
    import("@sammlerraum/domain/ai/ai-analysis-service"),
    import("@sammlerraum/domain/ai/usage-service"),
    import("./ai-capture-routes"),
  ]);
  return createAICaptureRouteHandlers({
    appOrigin: serverEnv.APP_ORIGIN,
    enabled: serverEnv.AI_ANALYSIS_ENABLED,
    monthlyLimit: serverEnv.AI_MONTHLY_REQUEST_LIMIT,
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createAIAnalysisService(prisma, {
      providerId: "openai",
      model: serverEnv.AI_OPENAI_MODEL ?? "unavailable",
      monthlyRequestLimit: serverEnv.AI_MONTHLY_REQUEST_LIMIT,
    }),
    usage: createAIUsageService(prisma),
  });
}
