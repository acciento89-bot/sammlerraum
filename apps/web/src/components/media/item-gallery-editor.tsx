"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DocumentManager } from "./document-manager";
import { MediaUpload, mutate, type MediaLink } from "./media-upload";

type Listing = {
  images: MediaLink[];
  documents: MediaLink[];
  limits: { maxImageBytes: number; maxDocumentBytes: number };
};
export function ItemGalleryEditor({ itemId }: { itemId: string }) {
  const t = useTranslations("Media");
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragging = useRef<string | null>(null);
  const active = useRef(true);
  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/items/${itemId}/media`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as Listing;
      if (active.current) {
        setData(body);
        setError(false);
      }
    } catch {
      if (active.current) setError(true);
    }
  }, [itemId]);
  useEffect(() => {
    active.current = true;
    void reload();
    return () => {
      active.current = false;
    };
  }, [reload]);
  const pending =
    data &&
    [...data.images, ...data.documents].some((link) =>
      ["PENDING", "PROCESSING", "UPLOADING"].includes(link.asset.status),
    );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void reload(), 2000);
    return () => clearInterval(timer);
  }, [pending, reload]);
  async function action(path: string, method: string, body?: unknown) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await mutate(`/api/v1/items/${itemId}${path}`, method, body);
      await reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const gallery =
    data?.images.filter((link) => link.purpose === "GALLERY" && link.asset.kind === "IMAGE") ?? [];
  function move(id: string, position: number) {
    const order = gallery.map((link) => link.id).filter((linkId) => linkId !== id);
    order.splice(position, 0, id);
    void action("/media", "PUT", { linkIds: order });
  }
  return (
    <div className="item-media">
      {error && (
        <p role="alert">
          {t("actionError")}{" "}
          <button type="button" onClick={() => void reload()}>
            {t("retry")}
          </button>
        </p>
      )}
      {!data ? (
        <>{!error && <p role="status">{t("loading")}</p>}</>
      ) : (
        <>
          <section className="management-card" aria-label={t("gallery")}>
            <h2>{t("gallery")}</h2>
            <p>{t("titleHelp")}</p>
            <MediaUpload itemId={itemId} maxBytes={data.limits.maxImageBytes} onChange={reload} />
            <ol className="media-grid">
              {gallery.map((link, index) => (
                <li
                  key={link.id}
                  data-link-id={link.id}
                  draggable={!busy}
                  onDragStart={() => {
                    dragging.current = link.id;
                  }}
                  onDragEnd={() => {
                    dragging.current = null;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging.current) move(dragging.current, index);
                    dragging.current = null;
                  }}
                >
                  {link.asset.status === "READY" ? (
                    <img
                      src={`/api/v1/media/${link.asset.id}/medium`}
                      alt={link.asset.originalFileName}
                      width={320}
                      height={240}
                    />
                  ) : (
                    <p role="status">{t(`states.${link.asset.status}`)}</p>
                  )}
                  <strong>{link.asset.originalFileName}</strong>
                  {index === 0 && <span className="eyebrow">{t("titleImage")}</span>}
                  {link.asset.status === "FAILED" && <p>{t("failedHelp")}</p>}
                  <div className="form-actions">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => move(link.id, 0)}
                    >
                      {t("setTitle")}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`${t("up")}: ${link.asset.originalFileName}`}
                      disabled={busy || index === 0}
                      onClick={() => move(link.id, index - 1)}
                    >
                      {t("up")}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`${t("down")}: ${link.asset.originalFileName}`}
                      disabled={busy || index === gallery.length - 1}
                      onClick={() => move(link.id, index + 1)}
                    >
                      {t("down")}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void action(`/media/${link.id}`, "DELETE")}
                    >
                      {t("remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {data.images
              .filter((link) => link.purpose === "DETAIL")
              .map((link) => (
                <p key={link.id}>
                  {link.asset.originalFileName}{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void action(`/media/${link.id}`, "DELETE")}
                  >
                    {t("remove")}
                  </button>
                </p>
              ))}
          </section>
          <DocumentManager
            itemId={itemId}
            documents={data.documents}
            maxBytes={data.limits.maxDocumentBytes}
            reload={reload}
            action={action}
            busy={busy}
          />
        </>
      )}
    </div>
  );
}
