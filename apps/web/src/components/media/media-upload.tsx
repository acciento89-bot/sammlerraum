"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type MediaLink = {
  id: string;
  position: number;
  purpose?: "GALLERY" | "DETAIL";
  category?: string;
  visibility?: "PRIVATE" | "UNLISTED" | "PUBLIC";
  asset: { id: string; kind: string; status: string; mimeType: string; originalFileName: string };
};
export async function mutate(url: string, method: string, data?: unknown) {
  const response = await fetch(url, {
    method,
    ...(data
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data) }
      : {}),
  });
  if (!response.ok) throw new Error("actionError");
}

export function MediaUpload({
  itemId,
  document = false,
  category,
  visibility,
  maxBytes,
  onChange,
}: {
  itemId: string;
  document?: boolean;
  category?: string;
  visibility?: string;
  maxBytes: number;
  onChange(): Promise<void>;
}) {
  const t = useTranslations("Media");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const state = useRef<{ canceled: boolean; xhr?: XMLHttpRequest | undefined }>({
    canceled: false,
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      state.current.canceled = true;
      state.current.xhr?.abort();
    };
  }, []);
  function cancel() {
    state.current.canceled = true;
    state.current.xhr?.abort();
  }
  async function upload(file: File) {
    if (busy) return;
    setMessage("");
    if (file.size > maxBytes) {
      setMessage("tooLarge");
      return;
    }
    if (
      !(
        document
          ? ["application/pdf", "image/jpeg", "image/png", "image/webp"]
          : ["image/jpeg", "image/png", "image/webp"]
      ).includes(file.type)
    ) {
      setMessage("typeError");
      return;
    }
    state.current = { canceled: false };
    const operation = state.current;
    setBusy(true);
    setProgress(0);
    try {
      const asset = await new Promise<{ id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        operation.xhr = xhr;
        xhr.open("POST", document ? "/api/v1/media/documents" : "/api/v1/media/images");
        xhr.setRequestHeader("content-type", file.type);
        xhr.setRequestHeader("x-file-name", file.name);
        xhr.upload.onprogress = (event) => {
          if (mounted.current && event.lengthComputable)
            setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onerror = () => reject(new Error("actionError"));
        xhr.onabort = () => reject(new Error("canceled"));
        xhr.onload = () => {
          if (xhr.status !== 201) {
            reject(
              new Error(
                xhr.status === 413 ? "tooLarge" : xhr.status === 400 ? "typeError" : "actionError",
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(xhr.responseText).asset);
          } catch {
            reject(new Error("actionError"));
          }
        };
        xhr.send(file);
      });
      operation.xhr = undefined;
      if (operation.canceled) throw new Error("canceled");
      const path = `/api/v1/items/${itemId}/${document ? "documents" : "media"}`;
      // Do not abort a link request: observe its outcome, then undo the link if canceled.
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          document
            ? { assetId: asset.id, category, visibility }
            : { assetId: asset.id, purpose: "GALLERY" },
        ),
      });
      if (!response.ok) throw new Error("actionError");
      const { link } = (await response.json()) as { link: { id: string } };
      if (operation.canceled) {
        await mutate(`${path}/${link.id}`, "DELETE");
        throw new Error("canceled");
      }
      if (mounted.current) {
        await onChange();
        // Cancellation remains available while the linked listing refresh is in flight.
        if (operation.canceled) {
          await mutate(`${path}/${link.id}`, "DELETE");
          throw new Error("canceled");
        }
        setMessage("uploaded");
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(
          error instanceof Error && ["tooLarge", "typeError", "canceled"].includes(error.message)
            ? error.message
            : "actionError",
        );
        await onChange();
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="media-upload">
      <label>
        {t(document ? "uploadDocument" : "uploadImage")}
        <input
          type="file"
          disabled={busy}
          accept={
            document
              ? "application/pdf,image/jpeg,image/png,image/webp"
              : "image/jpeg,image/png,image/webp"
          }
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      <small>{t("limit", { mb: Math.round(maxBytes / 1024 / 1024) })}</small>
      {busy && (
        <div role="status">
          <label>
            {t("progress")}
            <progress max={100} value={progress} />
          </label>
          <button type="button" className="secondary-button" onClick={cancel}>
            {t("cancel")}
          </button>
        </div>
      )}
      {message && (
        <p role={message === "uploaded" || message === "canceled" ? "status" : "alert"}>
          {t(message)}
        </p>
      )}
    </div>
  );
}
