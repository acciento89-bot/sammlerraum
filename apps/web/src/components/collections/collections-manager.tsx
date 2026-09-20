"use client";

import type { Collection, Visibility } from "@sammlerraum/contracts/collections";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

type ApiErrorBody = { error?: { requestId?: string } };

export function CollectionsManager({ locale }: { locale: "de" | "en" }) {
  const t = useTranslations("Collections");
  const common = useTranslations("Management");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/v1/collections", { cache: "no-store" });
    if (response.ok) {
      const body = (await response.json()) as { collections: Collection[] };
      setCollections(body.collections);
      setError("");
    } else {
      setError(await errorMessage(response, common("error")));
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/v1/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        visibility: data.get("visibility") as Visibility,
      }),
    });
    if (!response.ok) return setError(await errorMessage(response, common("error")));
    form.reset();
    await load();
  }

  return (
    <section className="management-shell">
      <nav className="management-nav" aria-label={common("navigation")}>
        <Link aria-current="page" href={`/${locale}/collections`}>
          {t("title")}
        </Link>
        <Link href={`/${locale}/account/profile`}>{common("account")}</Link>
      </nav>
      <header className="management-heading">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="form-intro">{t("intro")}</p>
      </header>

      <div className="management-grid">
        <section className="management-card" aria-labelledby="new-collection-title">
          <h2 id="new-collection-title">{t("newTitle")}</h2>
          <form className="form-stack" onSubmit={create}>
            <label>
              {t("name")}
              <input name="name" maxLength={120} required />
            </label>
            <VisibilitySelect label={common("visibility")} name="visibility" t={common} />
            <button type="submit">{t("create")}</button>
          </form>
        </section>

        <section className="management-card wide" aria-labelledby="collection-list-title">
          <h2 id="collection-list-title">{t("yourCollections")}</h2>
          {loading ? (
            <p role="status">{common("loading")}</p>
          ) : collections.length === 0 ? (
            <p className="empty-state">{t("empty")}</p>
          ) : (
            <ul className="collection-list">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <Link href={`/${locale}/collections/${collection.id}`}>
                    <strong>{collection.name}</strong>
                    <span>{common(`visibility${collection.visibility}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function VisibilitySelect({
  label,
  name,
  value = "PRIVATE",
  t,
}: {
  label: string;
  name: string;
  value?: Visibility;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        <option value="PRIVATE">{t("visibilityPRIVATE")}</option>
        <option value="UNLISTED">{t("visibilityUNLISTED")}</option>
        <option value="PUBLIC">{t("visibilityPUBLIC")}</option>
      </select>
    </label>
  );
}

export async function errorMessage(response: Response, fallback: string): Promise<string> {
  let requestId = response.headers.get("x-request-id") ?? "";
  try {
    const body = (await response.json()) as ApiErrorBody;
    requestId ||= body.error?.requestId ?? "";
  } catch {
    // The status and server-provided request id are enough for a safe client error.
  }
  return requestId ? `${fallback} (${requestId})` : fallback;
}
