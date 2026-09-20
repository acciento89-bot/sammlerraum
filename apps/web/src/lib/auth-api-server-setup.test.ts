import type { Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

const resources = vi.hoisted(() => ({
  databaseConnected: false,
  server: undefined as Server | undefined,
}));

vi.mock("@sammlerraum/db/create-client", () => ({
  createPrismaClient: () => ({
    $connect: async () => {
      resources.databaseConnected = true;
    },
    $disconnect: async () => {
      resources.databaseConnected = false;
    },
  }),
}));

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    createServer: (...arguments_: unknown[]) => {
      const server = (actual.createServer as (...args: unknown[]) => Server)(...arguments_);
      resources.server = server;
      return server;
    },
  };
});

vi.mock("./auth", () => ({
  buildAuthOptions: () => {
    throw new Error("injected auth initialization failure");
  },
}));

import { startAuthApiServer } from "../../e2e/support/auth-api-server";

describe("auth API server setup", () => {
  afterEach(async () => {
    if (resources.server?.listening) {
      await new Promise<void>((resolve) => resources.server?.close(() => resolve()));
    }
    resources.databaseConnected = false;
    resources.server = undefined;
  });

  it("closes acquired resources when auth initialization fails", async () => {
    await expect(startAuthApiServer("postgresql://test:test@localhost:5432/test")).rejects.toThrow(
      "injected auth initialization failure",
    );

    expect(resources.server?.listening).toBe(false);
    expect(resources.databaseConnected).toBe(false);
  });
});
