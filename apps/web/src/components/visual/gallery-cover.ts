import { z } from "zod";
const response = z.object({ images: z.array(z.unknown()).max(1000) });
const link = z.object({
  purpose: z.literal("GALLERY"),
  position: z.number().int().nonnegative(),
  asset: z.object({ id: z.uuid(), kind: z.literal("IMAGE"), status: z.literal("READY") }),
});
/** URLs stay on the existing authorized media route; documents never become covers. */
export function galleryCover(value: unknown): string | null {
  const parsed = response.safeParse(value);
  if (!parsed.success) return null;
  const images = parsed.data.images.flatMap((value) => {
    const row = link.safeParse(value);
    return row.success ? [row.data] : [];
  });
  images.sort((a, b) => a.position - b.position);
  return images[0] ? `/api/v1/media/${images[0].asset.id}/medium` : null;
}
