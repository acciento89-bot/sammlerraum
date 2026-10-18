import { get } from "node:http";

import { describe, expect, it, vi } from "vitest";

import { startHealthServer } from "./health";

function request(port: number, path = "/health") {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    get({ host: "127.0.0.1", port, path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    }).on("error", reject);
  });
}

describe("worker health endpoint", () => {
  it("reports healthy only when the database and queue are ready", async () => {
    const databaseHealth = vi.fn().mockResolvedValue({ ok: true });
    let queueReady = true;
    const endpoint = await startHealthServer({
      port: 0,
      databaseHealth,
      queueReady: () => queueReady,
    });

    try {
      await expect(request(endpoint.port)).resolves.toEqual({ status: 200, body: "healthy\n" });
      queueReady = false;
      await expect(request(endpoint.port)).resolves.toEqual({ status: 503, body: "degraded\n" });
      expect(databaseHealth).toHaveBeenCalledTimes(2);
    } finally {
      await endpoint.close();
    }
  });

  it("binds only to loopback and rejects other paths", async () => {
    const endpoint = await startHealthServer({
      port: 0,
      databaseHealth: async () => ({ ok: true }),
      queueReady: () => true,
    });

    try {
      expect(endpoint.host).toBe("127.0.0.1");
      await expect(request(endpoint.port, "/other")).resolves.toMatchObject({ status: 404 });
    } finally {
      await endpoint.close();
    }
  });
});
