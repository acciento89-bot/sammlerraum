import { z } from "zod";
import { AIAnalysisError, RequestAIAnalysisSchema } from "@sammlerraum/contracts/ai";
import { ApiError } from "@sammlerraum/contracts/errors";
import type { createAIAnalysisService } from "@sammlerraum/domain/ai/ai-analysis-service";
import type { createAIUsageService } from "@sammlerraum/domain/ai/usage-service";
import { AIUsagePeriodSchema } from "@sammlerraum/domain/ai/usage-service";
import { aiRouteActor, aiRouteId, mapAIError, readAIJson } from "./ai-routes";
import { apiRoute } from "./api/route-handler";
const RequestBody = RequestAIAnalysisSchema.omit({ itemId: true });
type Service = Pick<
  ReturnType<typeof createAIAnalysisService>,
  "getCapture" | "requestItemAnalysis" | "cancelAnalysis" | "getAnalysis"
>;
export function createAICaptureRouteHandlers(dependencies: {
  appOrigin: string;
  enabled: boolean;
  monthlyLimit: number;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  service: Service;
  usage: ReturnType<typeof createAIUsageService>;
}) {
  const output = (key: string, data: unknown, status = 200) =>
    Response.json({ [key]: data }, { status, headers: { "cache-control": "no-store" } });
  return {
    CAPTURE: apiRoute(async (request, id: string) => {
      const actor = await aiRouteActor(dependencies, request, false);
      try {
        const capture = await dependencies.service.getCapture(actor, aiRouteId(id)),
          usage = await dependencies.usage.getAIUsage(
            actor.userId,
            new Date().toISOString().slice(0, 7),
          );
        return output("capture", {
          ...capture,
          enabled: dependencies.enabled,
          monthlyLimit: dependencies.monthlyLimit,
          usage,
        });
      } catch (error) {
        mapAIError(error);
      }
    }),
    REQUEST: apiRoute(async (request, id: string) => {
      const actor = await aiRouteActor(dependencies, request, true);
      if (!dependencies.enabled)
        throw new ApiError("AI_UNAVAILABLE", 503, "Photo analysis is currently unavailable");
      const input = RequestBody.parse(await readAIJson(request));
      try {
        return output(
          "job",
          await dependencies.service.requestItemAnalysis(
            actor,
            aiRouteId(id),
            input.assetIds,
            input.requestKey,
          ),
          201,
        );
      } catch (error) {
        mapAIError(error);
      }
    }),
    GET: apiRoute(async (request, id: string) => {
      const actor = await aiRouteActor(dependencies, request, false);
      try {
        return output("detail", await dependencies.service.getAnalysis(actor, aiRouteId(id)));
      } catch (error) {
        mapAIError(error);
      }
    }),
    CANCEL: apiRoute(async (request, id: string) => {
      const actor = await aiRouteActor(dependencies, request, true);
      try {
        return output("job", await dependencies.service.cancelAnalysis(actor, aiRouteId(id)));
      } catch (error) {
        mapAIError(error);
      }
    }),
    USAGE: apiRoute(async (request) => {
      const actor = await aiRouteActor(dependencies, request, false),
        query = new URL(request.url).searchParams;
      if ([...query.keys()].some((key) => key !== "period") || query.getAll("period").length > 1)
        throw new ApiError("VALIDATION_ERROR", 400, "Invalid usage period");
      const period = AIUsagePeriodSchema.parse(
        query.get("period") ?? new Date().toISOString().slice(0, 7),
      );
      try {
        return output("usage", await dependencies.usage.getAIUsage(actor.userId, period));
      } catch (error) {
        mapAIError(error);
      }
    }),
  };
}
