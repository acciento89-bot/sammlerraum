"use client";
import { useEffect, useRef, useState } from "react";
import { CollectorIllustration } from "./collector-illustration";
import { galleryCover } from "./gallery-cover";
export function ItemCover({ itemId, title }: { itemId: string; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<{ itemId: string; url: string } | null>(null);
  useEffect(() => {
    const node = container.current;
    const controller = new AbortController();
    setImage(null);
    if (!node || typeof IntersectionObserver === "undefined") return () => controller.abort();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void fetch(`/api/v1/items/${encodeURIComponent(itemId)}/media`, {
          cache: "no-store",
          signal: controller.signal,
        })
          .then(async (response) => (response.ok ? galleryCover(await response.json()) : null))
          .then((url) => {
            if (!controller.signal.aborted && url) setImage({ itemId, url });
          })
          .catch(() => {
            /* Unavailable artwork does not hide the collectible. */
          });
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [itemId]);
  return (
    <div ref={container} className="item-cover">
      {image?.itemId === itemId ? (
        <img
          className="item-card-cover"
          src={image.url}
          alt=""
          loading="lazy"
          width="640"
          height="420"
          onError={() => setImage(null)}
        />
      ) : (
        <CollectorIllustration seed={title} />
      )}
    </div>
  );
}
