"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { DocumentCategorySchema } from "@sammlerraum/contracts/media";
import { MediaUpload, type MediaLink } from "./media-upload";

export function DocumentManager({
  itemId,
  documents,
  maxBytes,
  reload,
  action,
  busy,
}: {
  itemId: string;
  documents: MediaLink[];
  maxBytes: number;
  reload(): Promise<void>;
  action(path: string, method: string, data?: unknown): Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations("Media");
  const [category, setCategory] = useState("PURCHASE_RECEIPT");
  const [visibility, setVisibility] = useState("PRIVATE");
  return (
    <section className="management-card" aria-label={t("documents")}>
      <h2>{t("documents")}</h2>
      <p>{t("privateDefault")}</p>
      <label>
        {t("category")}
        <select
          aria-label={t("category")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {DocumentCategorySchema.options.map((value) => (
            <option key={value} value={value}>
              {t(`categories.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("documentVisibility")}
        <select
          aria-label={t("documentVisibility")}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          {["PRIVATE", "UNLISTED", "PUBLIC"].map((value) => (
            <option value={value} key={value}>
              {t(`visibility.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <MediaUpload
        itemId={itemId}
        document
        category={category}
        visibility={visibility}
        maxBytes={maxBytes}
        onChange={reload}
      />
      <ul className="media-documents">
        {documents.map((link) => (
          <li key={link.id}>
            <strong>{link.asset.originalFileName}</strong>
            <p>{t(`states.${link.asset.status}`)}</p>
            {link.asset.status === "FAILED" && <p>{t("failedHelp")}</p>}
            <label>
              {t("category")}
              <select
                aria-label={`${t("category")}: ${link.asset.originalFileName}`}
                disabled={busy}
                value={link.category}
                onChange={(e) =>
                  void action(`/documents/${link.id}`, "PATCH", {
                    category: e.target.value,
                    visibility: link.visibility,
                  })
                }
              >
                {DocumentCategorySchema.options.map((value) => (
                  <option key={value} value={value}>
                    {t(`categories.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("documentVisibility")}
              <select
                aria-label={`${t("documentVisibility")}: ${link.asset.originalFileName}`}
                disabled={busy}
                value={link.visibility}
                onChange={(e) =>
                  void action(`/documents/${link.id}`, "PATCH", {
                    category: link.category,
                    visibility: e.target.value,
                  })
                }
              >
                {["PRIVATE", "UNLISTED", "PUBLIC"].map((value) => (
                  <option key={value} value={value}>
                    {t(`visibility.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            {link.asset.status === "READY" && (
              <a href={`/api/v1/media/${link.asset.id}/original`} target="_blank" rel="noreferrer">
                {t("download")}
              </a>
            )}
            <button
              type="button"
              disabled={busy}
              className="secondary-button"
              onClick={() => void action(`/documents/${link.id}`, "DELETE")}
            >
              {t("remove")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
