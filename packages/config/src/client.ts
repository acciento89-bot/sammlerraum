import { z } from "zod";

function applicationOrigin(value: string, context: z.RefinementCtx): string | never {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      context.addIssue({ code: "custom", message: "must be an HTTP(S) origin" });
      return z.NEVER;
    }
    return url.origin;
  } catch {
    context.addIssue({ code: "custom", message: "must be an HTTP(S) origin" });
    return z.NEVER;
  }
}

const clientSchema = z.object({
  NEXT_PUBLIC_APP_ORIGIN: z.string().transform(applicationOrigin),
});

const publicEnvironment = clientSchema.parse({
  NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
});

export const clientEnv = {
  APP_ORIGIN: publicEnvironment.NEXT_PUBLIC_APP_ORIGIN,
} as const;
