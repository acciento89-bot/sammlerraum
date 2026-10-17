"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ItemCatalogLink } from "@sammlerraum/contracts/catalog-reads";
import type { CatalogEntryRevision } from "@sammlerraum/contracts/catalog";
import { CatalogSearch, variantLabel } from "./catalog-search";
import { authoredTitle, catalogRequest, catalogError, type Locale } from "./catalog-client";
export function CatalogLinker({
  itemId,
  locale,
  link,
  readOnly,
  onChange,
}: {
  itemId: string;
  locale: Locale;
  link: ItemCatalogLink;
  readOnly: boolean;
  onChange: () => Promise<void>;
}) {
  const t = useTranslations("Catalog");
  const [selected, setSelected] = useState<CatalogEntryRevision | null>(null);
  const [variant, setVariant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function choose(entryId: string) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const body = await catalogRequest<{ entry: CatalogEntryRevision }>(
        `/api/v1/catalog/entries/${entryId}`,
      );
      if (ticket === generation.current) {
        setSelected(body.entry);
        setVariant("");
      }
    } catch (problem) {
      if (ticket === generation.current) setError(catalogError(problem, t));
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function save(event?: FormEvent, unlink = false) {
    event?.preventDefault();
    if (busy || readOnly || (!selected && !unlink)) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await catalogRequest(
        `/api/v1/items/${itemId}/catalog-link`,
        unlink ? "DELETE" : "PUT",
        unlink ? undefined : { entryId: selected!.state.id, variantId: variant || null },
      );
      await onChange();
      setSelected(null);
      setStatus(t(unlink ? "unlinked" : "linked"));
    } catch (problem) {
      setError(catalogError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-card" aria-label={t("linkSection")}>
      <h2>{t("linkSection")}</h2>
      {link.entry ? (
        <div>
          <Link href={`/${locale}/catalog/${link.entry.id}`}>
            {authoredTitle(link.entry.text, locale)}
          </Link>
          {link.variant && (
            <p>
              {variantLabel(link.variant, locale)}
              {!link.variant.active && <> — {t("retained")}</>}
            </p>
          )}
        </div>
      ) : (
        <p className="empty-state">{t("notLinked")}</p>
      )}
      {readOnly ? (
        <p>{t("readOnly")}</p>
      ) : (
        <>
          {link.entry && (
            <>
              <p className="field-help">{t("unlinkHelp")}</p>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void save(undefined, true)}
              >
                {t("unlink")}
              </button>
            </>
          )}
          <details open={!link.entry}>
            <summary>{t("findReference")}</summary>
            <CatalogSearch
              locale={locale}
              initialCategory={link.categoryTemplateId ?? ""}
              onChoose={(id) => void choose(id)}
            />
          </details>
          {selected && (
            <form className="compact-form" onSubmit={(event) => void save(event)}>
              <h3>{authoredTitle(selected.state.text, locale)}</h3>
              <label>
                {t("chooseVariant")}
                <select
                  aria-label={t("chooseVariant")}
                  value={variant}
                  onChange={(event) => setVariant(event.target.value)}
                  disabled={busy}
                >
                  <option value="">{t("entryOnly")}</option>
                  {selected.state.variants.map((row) => (
                    <option key={row.id} value={row.id}>
                      {variantLabel(row, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button type="submit" disabled={busy}>
                  {t("linkItem")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelected(null)}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {busy && <p role="status">{t("loading")}</p>}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
