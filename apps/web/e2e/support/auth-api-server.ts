import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import {
  createSecurityService,
  type SecurityDatabase,
} from "@sammlerraum/domain/identity/security-service";
import { betterAuth } from "better-auth";

import { createSessionRouteHandlers } from "../../src/lib/account-security-routes";

export type AuthApiServer = {
  origin: string;
  verificationUrlFor(email: string): string;
  removeUser(email: string): Promise<void>;
  close(): Promise<void>;
};

type WebHandler = (request: Request) => Promise<Response>;

function incomingHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function requestBody(request: IncomingMessage): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function toWebRequest(request: IncomingMessage, origin: string): Promise<Request> {
  const body = await requestBody(request);
  return new Request(new URL(request.url ?? "/", origin), {
    method: request.method ?? "GET",
    headers: incomingHeaders(request),
    ...(body === undefined ? {} : { body }),
  });
}

async function sendWebResponse(response: ServerResponse, webResponse: Response): Promise<void> {
  response.statusCode = webResponse.status;
  for (const [name, value] of webResponse.headers) {
    if (name !== "set-cookie") response.setHeader(name, value);
  }
  const cookies = webResponse.headers.getSetCookie();
  if (cookies.length > 0) response.setHeader("set-cookie", cookies);
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

export async function startAuthApiServer(databaseUrl: string): Promise<AuthApiServer> {
  if (databaseUrl.length === 0) throw new Error("DATABASE_URL is required for the auth E2E test");

  const prisma = createPrismaClient(databaseUrl);
  await prisma.$connect();

  let handleRequest: WebHandler = async () => new Response(null, { status: 503 });
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Server not listening");
      const request = await toWebRequest(incoming, `http://127.0.0.1:${address.port}`);
      await sendWebResponse(outgoing, await handleRequest(request));
    } catch {
      outgoing.statusCode = 500;
      outgoing.end("Internal test server error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    await prisma.$disconnect();
    throw new Error("Auth E2E server did not expose a TCP address");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  const verificationUrls = new Map<string, string>();

  const { buildAuthOptions } = await import("../../src/lib/auth");
  const auth = betterAuth(
    buildAuthOptions(
      {
        APP_ORIGIN: origin,
        BETTER_AUTH_SECRET: "auth-e2e-secret-that-is-at-least-thirty-two-characters",
        GOOGLE_CLIENT_ID: "auth-e2e-google-client-id",
        GOOGLE_CLIENT_SECRET: "auth-e2e-google-client-secret",
        APPLE_CLIENT_ID: "auth-e2e-apple-client-id",
        APPLE_CLIENT_SECRET: "auth-e2e-apple-client-secret",
      },
      {
        database: prismaAdapter(prisma, { provider: "postgresql" }),
        sendEmail: async (message) => {
          if (message.subject !== "Verify your Sammlerraum email") return;
          const url = message.text.match(/https?:\/\/\S+/)?.[0];
          if (url === undefined) throw new Error("Verification email did not contain a URL");
          verificationUrls.set(message.to, url);
        },
      },
    ),
  );
  const sessionHandlers = createSessionRouteHandlers({
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createSecurityService(prisma as unknown as SecurityDatabase),
    appOrigin: origin,
  });

  handleRequest = async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/auth/")) return auth.handler(request);
    if (pathname === "/api/v1/account/sessions" && request.method === "GET") {
      return sessionHandlers.GET(request);
    }
    return new Response(null, { status: 404 });
  };

  return {
    origin,
    verificationUrlFor(email) {
      const url = verificationUrls.get(email);
      if (url === undefined) throw new Error("No verification email was captured");
      return url;
    },
    async removeUser(email) {
      verificationUrls.delete(email);
      await prisma.user.deleteMany({ where: { email } });
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      await prisma.$disconnect();
    },
  };
}
