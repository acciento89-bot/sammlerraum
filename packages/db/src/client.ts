import { serverEnv } from "@sammlerraum/config/server";

import { createPrismaClient } from "./create-client";

export const prisma = createPrismaClient(serverEnv.DATABASE_URL);
