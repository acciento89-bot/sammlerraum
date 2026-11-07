import { createServer } from "node:http";

export type HealthEndpoint = {
  host: "127.0.0.1";
  port: number;
  close(): Promise<void>;
};

type HealthServerOptions = {
  port: number;
  databaseHealth(): Promise<{ ok: boolean }>;
  queueReady(): boolean;
};

export async function startHealthServer(options: HealthServerOptions): Promise<HealthEndpoint> {
  const host = "127.0.0.1" as const;
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found\n");
      return;
    }

    const database = await options.databaseHealth().catch(() => ({ ok: false }));
    const healthy = database.ok && options.queueReady();
    response.writeHead(healthy ? 200 : 503, { "content-type": "text/plain; charset=utf-8" });
    response.end(healthy ? "healthy\n" : "degraded\n");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Worker health endpoint did not acquire a TCP port");
  }

  return {
    host,
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
