import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, readdir, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";

import type { StorageProvider } from "./types";

export type StorageErrorCode = "INVALID_STORAGE_KEY" | "STORAGE_NOT_FOUND" | "STORAGE_IO_ERROR";

const messages: Record<StorageErrorCode, string> = {
  INVALID_STORAGE_KEY: "Invalid storage key",
  STORAGE_NOT_FOUND: "Stored object not found",
  STORAGE_IO_ERROR: "Storage operation failed",
};

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(messages[code]);
    this.name = "StorageError";
  }
}

function filesystemCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
}

function safeError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  return new StorageError(
    filesystemCode(error) === "ELOOP" ? "INVALID_STORAGE_KEY" : "STORAGE_IO_ERROR",
  );
}

function partsFor(key: string): string[] {
  if (
    typeof key !== "string" ||
    !key ||
    key.includes("\0") ||
    key.includes("\\") ||
    key.includes(":") ||
    isAbsolute(key) ||
    win32.isAbsolute(key)
  ) {
    throw new StorageError("INVALID_STORAGE_KEY");
  }
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new StorageError("INVALID_STORAGE_KEY");
  }
  return parts;
}

async function inspect(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (filesystemCode(error) === "ENOENT") return null;
    throw error;
  }
}

function assertDirectory(stat: Awaited<ReturnType<typeof lstat>>) {
  if (stat.isSymbolicLink()) throw new StorageError("INVALID_STORAGE_KEY");
  if (!stat.isDirectory()) throw new StorageError("STORAGE_IO_ERROR");
}

function assertObject(stat: Awaited<ReturnType<typeof lstat>> | null) {
  if (stat?.isSymbolicLink()) throw new StorageError("INVALID_STORAGE_KEY");
  if (stat && !stat.isFile()) throw new StorageError("STORAGE_IO_ERROR");
}

export type StorageStagingLocker = <T>(
  id: string,
  work: () => Promise<T>,
  wait?: boolean,
) => Promise<T | false>;
const activeTemporary = new Set<string>();
const stagingName =
  /^\.storage-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.tmp$/i;

type StagingScanEntry = { path: string } | { error: unknown };
export type StorageCleanupCursor = { walk?: AsyncGenerator<StagingScanEntry> };

async function* stagingPaths(directory: string): AsyncGenerator<StagingScanEntry> {
  let entries;
  try {
    const stat = await inspect(directory);
    if (!stat) return;
    assertDirectory(stat);
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    // Report a failed subtree as one budgeted entry, then resume its parent's
    // healthy siblings. A later traversal will retry this directory.
    yield { error };
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    yield { path };
    if (entry.isDirectory() && !entry.isSymbolicLink()) yield* stagingPaths(path);
  }
}

// Production callers share the staging locker with maintenance and retain the cursor between polls.
// No directory descriptors remain open while a bounded scan is paused.
export async function cleanupLocalStorageTemporaryFiles(
  root: string,
  options: {
    maxAgeHours: number;
    withLock: StorageStagingLocker;
    maxEntries?: number;
    cursor?: StorageCleanupCursor;
  },
) {
  const budget = options.maxEntries ?? 1000;
  if (
    !isAbsolute(root) ||
    !Number.isSafeInteger(options.maxAgeHours) ||
    options.maxAgeHours < 1 ||
    !Number.isSafeInteger(budget) ||
    budget < 1
  )
    throw new StorageError("STORAGE_IO_ERROR");
  const cursor = options.cursor ?? {};
  cursor.walk ??= stagingPaths(resolve(root));
  const cutoff = Date.now() - options.maxAgeHours * 3_600_000;
  let failure: unknown;
  try {
    for (let count = 0; count < budget; count++) {
      const next = await cursor.walk.next();
      if (next.done) {
        delete cursor.walk;
        break;
      }
      if ("error" in next.value) {
        failure ??= next.value.error;
        continue;
      }
      const path = next.value.path;
      try {
        const match = stagingName.exec(path.split(sep).at(-1)!);
        if (!match || activeTemporary.has(path)) continue;
        const before = await inspect(path);
        if (!before?.isFile() || before.isSymbolicLink() || before.mtimeMs > cutoff) continue;
        await options.withLock(`staging:${match[1]}`, async () => {
          const current = await inspect(path);
          if (
            current?.isFile() &&
            !current.isSymbolicLink() &&
            current.mtimeMs <= cutoff &&
            !activeTemporary.has(path)
          )
            await unlink(path).catch((error) => {
              if (filesystemCode(error) !== "ENOENT") throw error;
            });
        });
      } catch (error) {
        // Inspection, lock and deletion failures must not discard scan progress.
        // Keep reporting failure to the worker while trying later eligible files.
        failure ??= error;
      }
    }
  } catch (error) {
    // Only an unexpected iterator failure closes it; normal filesystem errors
    // are contained inside the traversal and per-entry work above.
    await cursor.walk?.return(undefined).catch(() => undefined);
    delete cursor.walk;
    throw safeError(error);
  } finally {
    if (!options.cursor) await cursor.walk?.return(undefined);
  }
  if (failure) throw safeError(failure);
}

export class LocalPersistentStorage implements StorageProvider {
  readonly root: string;

  constructor(
    root: string,
    private readonly withStagingLock?: StorageStagingLocker,
  ) {
    if (!isAbsolute(root)) throw new StorageError("STORAGE_IO_ERROR");
    this.root = resolve(root);
  }

  private async pathFor(key: string, create: boolean): Promise<string | null> {
    const parts = partsFor(key);
    try {
      let rootStat = await inspect(this.root);
      if (!rootStat && create) {
        await mkdir(this.root, { recursive: true });
        rootStat = await lstat(this.root);
      }
      if (!rootStat) return null;
      assertDirectory(rootStat);
      const canonicalRoot = await realpath(this.root);
      let parent = this.root;
      for (const part of parts.slice(0, -1)) {
        parent = join(parent, part);
        let stat = await inspect(parent);
        if (!stat && create) {
          try {
            await mkdir(parent);
          } catch (error) {
            if (filesystemCode(error) !== "EEXIST") throw error;
          }
          stat = await lstat(parent);
        }
        if (!stat) return null;
        assertDirectory(stat);
        const canonicalParent = await realpath(parent);
        const offset = relative(canonicalRoot, canonicalParent);
        if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
          throw new StorageError("INVALID_STORAGE_KEY");
        }
      }
      return join(parent, parts[parts.length - 1]!);
    } catch (error) {
      throw safeError(error);
    }
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = (await this.pathFor(key, true))!;
    const id = randomUUID();
    const temporary = join(dirname(path), `.storage-${id}.tmp`);
    const write = async () => {
      activeTemporary.add(temporary);
      try {
        assertObject(await inspect(path));
        // Keep incomplete writes private until same-directory rename publishes them.
        const handle = await open(
          temporary,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        assertObject(await inspect(path));
        await rename(temporary, path);
      } catch (error) {
        throw safeError(error);
      } finally {
        await unlink(temporary).catch(() => undefined);
        activeTemporary.delete(temporary);
      }
    };
    if (this.withStagingLock) {
      const result = await this.withStagingLock(`staging:${id}`, write, true);
      if (result === false) throw new StorageError("STORAGE_IO_ERROR");
    } else await write();
  }

  async read(key: string): Promise<Uint8Array> {
    const path = await this.pathFor(key, false);
    if (!path) throw new StorageError("STORAGE_NOT_FOUND");
    try {
      const stat = await inspect(path);
      assertObject(stat);
      if (!stat) throw new StorageError("STORAGE_NOT_FOUND");
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!(await handle.stat()).isFile()) throw new StorageError("STORAGE_IO_ERROR");
        return new Uint8Array(await handle.readFile());
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (filesystemCode(error) === "ENOENT") throw new StorageError("STORAGE_NOT_FOUND");
      throw safeError(error);
    }
  }

  async delete(key: string): Promise<void> {
    const path = await this.pathFor(key, false);
    if (!path) return;
    try {
      const stat = await inspect(path);
      assertObject(stat);
      if (stat) await unlink(path);
    } catch (error) {
      if (filesystemCode(error) === "ENOENT") return;
      throw safeError(error);
    }
  }

  async exists(key: string): Promise<boolean> {
    const path = await this.pathFor(key, false);
    if (!path) return false;
    try {
      const stat = await inspect(path);
      assertObject(stat);
      return stat !== null;
    } catch (error) {
      throw safeError(error);
    }
  }
}
