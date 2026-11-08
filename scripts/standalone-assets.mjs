import { symlink, realpath } from "node:fs/promises";
import { resolve } from "node:path";
/** Keep compiled audit runtime identical to the image: application code, static files and owned artwork. */
export async function ensureStandaloneAssets(web) {
  for (const name of [".next/static", "public"]) {
    const source = resolve(web, name),
      target = resolve(web, ".next/standalone/apps/web", name);
    try {
      await symlink(source, target, "dir");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if ((await realpath(target)) !== (await realpath(source)))
        throw new Error("Unexpected standalone asset target: " + name);
    }
  }
}
