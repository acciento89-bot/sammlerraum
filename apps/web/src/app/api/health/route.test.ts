import { describe, expect, it } from "vitest";

import { buildHealthResponse } from "./health";

describe("health response", () => {
  it("is healthy with HTTP 200 when the database is available", () => {
    expect(buildHealthResponse(true, "health-request")).toEqual({
      status: 200,
      headers: { "cache-control": "no-store", "x-request-id": "health-request" },
      payload: {
        status: "ok",
        service: "sammlerraum-web",
        dependencies: { database: "up" },
      },
    });
  });

  it("is degraded with HTTP 503 when the database is unavailable", () => {
    expect(buildHealthResponse(false, "health-request")).toEqual({
      status: 503,
      headers: { "cache-control": "no-store", "x-request-id": "health-request" },
      payload: {
        status: "degraded",
        service: "sammlerraum-web",
        dependencies: { database: "down" },
      },
    });
  });
});
