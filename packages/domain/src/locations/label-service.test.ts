import { expect, it, vi } from "vitest";

import { createLabelService, type LabelDatabase } from "./label-service";

const location = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Private cabinet",
  qrToken: "a".repeat(43),
};

it("resolves an owner's valid label token but never exposes private location contents to an unauthorized actor", async () => {
  const findFirst = vi.fn(
    async ({ where }: { where: { ownerId: string; qrToken?: string; id?: string } }) =>
      where.ownerId === "owner" && (where.qrToken === location.qrToken || where.id === location.id)
        ? location
        : null,
  );
  const database = { storageLocation: { findFirst } } as unknown as LabelDatabase;
  const service = createLabelService(database, "owner", "https://example.test");

  const resolved = await service.resolveLabelToken(location.qrToken);
  expect(resolved.locationId).toBe(location.id);
  await expect(
    createLabelService(database, null, "https://example.test").getLocationContentsForActor(
      location.id,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    createLabelService(database, "stranger", "https://example.test").resolveLabelToken(
      location.qrToken,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(findFirst).toHaveBeenCalledTimes(2);
  expect(findFirst).toHaveBeenCalledWith({
    where: { ownerId: "owner", qrToken: location.qrToken },
    select: { id: true },
  });
});

it("prints only the owner location name, short code, and stable scan URL", async () => {
  const database = {
    storageLocation: {
      findFirst: vi.fn().mockResolvedValue({
        ...location,
        parentId: null,
        type: "DRAWER",
        visibility: "PRIVATE",
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    collectibleItem: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "00000000-0000-4000-8000-000000000002",
          collectionId: "00000000-0000-4000-8000-000000000003",
          title: "Secret value",
          quantity: 1,
          privateNotes: "Hidden",
        },
      ]),
    },
  } as unknown as LabelDatabase;
  const service = createLabelService(database, "owner", "https://example.test/");
  const printable = await service.getPrintableLabel(location.id);
  expect(printable).toEqual({
    name: "Private cabinet",
    shortCode: "00000000",
    url: `https://example.test/l/${location.qrToken}`,
  });
  expect(JSON.stringify(printable)).not.toContain("Secret value");
  expect(JSON.stringify(printable)).not.toContain("Hidden");
  await expect(service.resolveLabelToken("not-a-token")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(database.storageLocation.findFirst).toHaveBeenCalledTimes(1);
});
