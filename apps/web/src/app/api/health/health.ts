type HealthPayload = {
  status: "ok" | "degraded";
  service: "sammlerraum-web";
  dependencies: { database: "up" | "down" };
};

export function buildHealthResponse(
  databaseAvailable: boolean,
  requestId: string,
): {
  status: 200 | 503;
  headers: Record<string, string>;
  payload: HealthPayload;
} {
  return {
    status: databaseAvailable ? 200 : 503,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
    payload: {
      status: databaseAvailable ? "ok" : "degraded",
      service: "sammlerraum-web",
      dependencies: { database: databaseAvailable ? "up" : "down" },
    },
  };
}
