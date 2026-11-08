"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { SearchPreference } from "@sammlerraum/domain/seo/search-preference-service";
export function SearchIndexingControl({ preference }: { preference: SearchPreference | null }) {
  const t = useTranslations("SearchIndexing");
  const [value, setValue] = useState(preference),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  useEffect(() => {
    setReady(true);
  }, []);
  useEffect(() => {
    setValue(preference);
  }, [preference]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy || !value) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/v1/account/search-indexing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      if (response.status === 409) {
        const fresh = await fetch("/api/v1/account/search-indexing", { cache: "no-store" });
        if (!fresh.ok) throw new Error("Preference unavailable");
        setValue((await fresh.json()).preference);
        setFeedback({ error: true, message: t("conflict") });
      } else {
        if (!response.ok) throw new Error("Preference unavailable");
        setValue((await response.json()).preference);
        setFeedback({ error: false, message: t("saved") });
      }
    } catch {
      setFeedback({ error: true, message: t("error") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card" aria-labelledby="search-indexing-heading">
      <h2 id="search-indexing-heading">{t("title")}</h2>
      <p id="search-indexing-explanation">{t("explanation")}</p>
      <p>{t("removal")}</p>
      {!value ? (
        <p>{t("createProfile")}</p>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.searchEngineIndexingEnabled}
              disabled={!ready || busy}
              aria-describedby="search-indexing-explanation"
              onChange={(event) =>
                setValue({ ...value, searchEngineIndexingEnabled: event.target.checked })
              }
            />
            {t("allow")}
          </label>
          <label>
            {t("language")}
            <select
              value={value.publicLocale}
              disabled={!ready || busy}
              onChange={(event) =>
                setValue({ ...value, publicLocale: event.target.value as "de" | "en" })
              }
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
          <button type="submit" disabled={!ready || busy}>
            {t("save")}
          </button>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "error" : "success"}
            >
              {feedback.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
