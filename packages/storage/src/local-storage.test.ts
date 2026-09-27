import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalPersistentStorage } from "@sammlerraum/storage";

const roots: string[] = [];

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "sammlerraum-storage-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("never allows a storage key to escape the configured root", async () => {
  const root = await temporaryRoot();
  const storage = new LocalPersistentStorage(root);

  await expect(storage.put("../secret", Buffer.from("x"))).rejects.toMatchObject({
    code: "INVALID_STORAGE_KEY",
  });
});

describe("LocalPersistentStorage", () => {
  it("persists nested bytes and atomically replaces an existing object", async () => {
    const root = await temporaryRoot();
    const storage = new LocalPersistentStorage(join(root, "uploads"));
    const key = "originals/123e4567-e89b-12d3-a456-426614174000/photo.jpg";

    await storage.put(key, Uint8Array.from([0, 255, 17]));
    expect(await storage.exists(key)).toBe(true);
    expect(await storage.read(key)).toEqual(Uint8Array.from([0, 255, 17]));

    await storage.put(key, Uint8Array.from([42, 43]));
    expect(await storage.read(key)).toEqual(Uint8Array.from([42, 43]));
    expect(
      await readdir(join(root, "uploads/originals/123e4567-e89b-12d3-a456-426614174000")),
    ).toEqual(["photo.jpg"]);

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.read(key)).rejects.toMatchObject({ code: "STORAGE_NOT_FOUND" });
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it.each([
    "",
    ".",
    "..",
    "../secret",
    "a/../secret",
    "a/./b",
    "a//b",
    "/secret",
    "a\\..\\secret",
    "C:\\secret",
    "a\0b",
    "a/",
  ])("rejects malformed key %j before every operation", async (key) => {
    const storage = new LocalPersistentStorage(await temporaryRoot());
    for (const operation of [
      () => storage.put(key, Buffer.from("x")),
      () => storage.read(key),
      () => storage.delete(key),
      () => storage.exists(key),
    ]) {
      await expect(operation()).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    }
  });

  it("blocks a symlinked parent for every operation without touching the external file", async () => {
    const root = await temporaryRoot();
    const uploads = join(root, "uploads");
    const external = join(root, "external");
    await mkdir(uploads);
    await mkdir(external);
    await writeFile(join(external, "photo.jpg"), "outside");
    await symlink(external, join(uploads, "originals"));
    const storage = new LocalPersistentStorage(uploads);

    for (const operation of [
      () => storage.put("originals/photo.jpg", Buffer.from("inside")),
      () => storage.read("originals/photo.jpg"),
      () => storage.delete("originals/photo.jpg"),
      () => storage.exists("originals/photo.jpg"),
    ]) {
      await expect(operation()).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    }
    expect(await readFile(join(external, "photo.jpg"), "utf8")).toBe("outside");
  });

  it("blocks a symlink at the leaf for every operation", async () => {
    const root = await temporaryRoot();
    const uploads = join(root, "uploads");
    const external = join(root, "external.txt");
    await mkdir(uploads);
    await writeFile(external, "outside");
    await symlink(external, join(uploads, "photo.jpg"));
    const storage = new LocalPersistentStorage(uploads);

    for (const operation of [
      () => storage.put("photo.jpg", Buffer.from("inside")),
      () => storage.read("photo.jpg"),
      () => storage.delete("photo.jpg"),
      () => storage.exists("photo.jpg"),
    ]) {
      await expect(operation()).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    }
    expect(await readFile(external, "utf8")).toBe("outside");
  });

  it("rejects a symlinked configured root", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "external"));
    await symlink(join(root, "external"), join(root, "uploads"));
    const storage = new LocalPersistentStorage(join(root, "uploads"));

    await expect(storage.put("photo.jpg", Buffer.from("x"))).rejects.toMatchObject({
      code: "INVALID_STORAGE_KEY",
    });
    expect(await readdir(join(root, "external"))).toEqual([]);
  });

  it("rejects a symlinked configured root with a trailing slash", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "external"));
    await symlink(join(root, "external"), join(root, "uploads"));
    const storage = new LocalPersistentStorage(`${join(root, "uploads")}/`);

    await expect(storage.put("photo.jpg", Buffer.from("x"))).rejects.toMatchObject({
      code: "INVALID_STORAGE_KEY",
    });
    expect(await readdir(join(root, "external"))).toEqual([]);
  });

  it("fails safely when the target is a directory", async () => {
    const root = await temporaryRoot();
    const storage = new LocalPersistentStorage(root);
    await storage.put("photo.jpg", Buffer.from("before"));
    await mkdir(join(root, "blocked"));

    await expect(storage.put("blocked", Buffer.from("after"))).rejects.toMatchObject({
      code: "STORAGE_IO_ERROR",
    });
    expect(await readFile(join(root, "photo.jpg"), "utf8")).toBe("before");
    expect((await readdir(root)).sort()).toEqual(["blocked", "photo.jpg"]);
  });
});
