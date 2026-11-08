import { expect, it } from "vitest";
import { galleryCover } from "./gallery-cover";
const id = "87ee1678-0d7c-4bed-8dad-916fdabce096";
const image = (purpose = "GALLERY", status = "READY", kind = "IMAGE") => ({
  purpose,
  position: 0,
  asset: { id, status, kind },
});
it("uses only a ready gallery photo; never a private document or detail attachment", () => {
  expect(galleryCover({ images: [image()] })).toBe(`/api/v1/media/${id}/medium`);
  expect(
    galleryCover({
      images: [image("DETAIL"), image("GALLERY", "PENDING"), image("GALLERY", "READY", "DOCUMENT")],
    }),
  ).toBeNull();
  expect(galleryCover({ documents: [image()] })).toBeNull();
});
it("rejects malformed or external asset identifiers and unexpected responses", () => {
  for (const body of [
    null,
    {},
    [],
    {
      images: [
        { ...image(), asset: { id: "https://tracker.test/x", status: "READY", kind: "IMAGE" } },
      ],
    },
    { images: [null] },
  ])
    expect(galleryCover(body)).toBeNull();
});
it("chooses the first photo by gallery order rather than incidental array order", () => {
  const second = "176f5d6e-1f22-4bd1-9b74-30ca248c204e";
  expect(
    galleryCover({
      images: [
        { ...image(), position: 2 },
        { ...image(), position: 0, asset: { id: second, status: "READY", kind: "IMAGE" } },
      ],
    }),
  ).toBe(`/api/v1/media/${second}/medium`);
});
