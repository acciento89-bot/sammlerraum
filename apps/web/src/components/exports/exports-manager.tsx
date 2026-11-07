"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { privateApi, type ArtifactHistory, type ArtifactHistoryItem } from "./private-api";
export function ExportsManager({ locale }: { locale: "de" | "en" }) {
  const text = (de: string, en: string) => (locale === "de" ? de : en);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]),
    [scope, setScope] = useState("ALL"),
    [history, setHistory] = useState<ArtifactHistory | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [before, setBefore] = useState<ArtifactHistory["nextBefore"]>(null),
    [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const message = text(
    "Der Vorgang konnte nicht abgeschlossen werden. Bitte den Stand aktualisieren.",
    "The operation could not be completed. Refresh the current state.",
  );
  useEffect(() => {
    let active = true;
    privateApi<{ collections: { id: string; name: string }[] }>("/api/v1/collections")
      .then((v) => {
        if (active) setCollections(v.collections);
      })
      .catch(() => {
        if (active) setError(message);
      });
    return () => {
      active = false;
    };
  }, [locale]);
  useEffect(() => {
    let active = true,
      loading = false;
    const token = ++generation.current;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const query = before ? "?before=" + encodeURIComponent(JSON.stringify(before)) : "";
        const next = await privateApi<ArtifactHistory>("/api/v1/exports" + query);
        if (active && generation.current === token) {
          setHistory(next);
          setError("");
        }
      } catch {
        if (active) setError(message);
      } finally {
        loading = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [before, retry]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await privateApi("/api/v1/exports", {
        scope:
          scope === "ALL"
            ? { kind: "ALL" }
            : { kind: "COLLECTION", collectionId: data.get("collection") },
        format: data.get("format"),
        locale,
        includePrivateNotes: data.get("privateNotes") === "on",
        includeLocations: data.get("locations") === "on",
      });
      setNotice(text("Export beauftragt", "Export requested"));
      setBefore(null);
      setRetry((v) => v + 1);
    } catch {
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  const status = (item: ArtifactHistoryItem) =>
    item.expired
      ? text("Abgelaufen", "Expired")
      : item.status === "READY"
        ? text("Bereit", "Ready")
        : item.status === "FAILED"
          ? text("Fehlgeschlagen", "Failed")
          : item.status === "CANCELLED"
            ? text("Abgebrochen", "Cancelled")
            : text("Wird erstellt", "Building");
  return (
    <section className="management-shell transfer-shell">
      <nav className="management-nav">
        <Link href={`/${locale}/collections`}>{text("Sammlungen", "Collections")}</Link>
        <Link href={`/${locale}/imports`}>{text("Importe", "Imports")}</Link>
        <Link href={`/${locale}/search`}>
          {text("Suche und Auswahl-Export", "Search and selection export")}
        </Link>
        <Link href={`/${locale}/insurance`}>
          {text("Versicherung und PDF", "Insurance and PDF")}
        </Link>
      </nav>
      <h1>{text("Exporte und Berichte", "Exports and reports")}</h1>
      <p>
        {text(
          "Dateien bleiben privat und sind 24 Stunden verfügbar. Der Inhalt zeigt den bei der Erstellung erfassten Stand.",
          "Files remain private and are available for 24 hours. Their content reflects the captured state at generation time.",
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form className="management-card form-stack" onSubmit={create}>
        <fieldset className="form-stack" disabled={busy}>
          <legend>{text("Neuen Tabellenexport erstellen", "Create a new tabular export")}</legend>
          <label>
            {text("Umfang", "Scope")}
            <select
              aria-label={text("Umfang", "Scope")}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="ALL">{text("Gesamter Bestand", "All inventory")}</option>
              <option value="COLLECTION">{text("Eine Sammlung", "One collection")}</option>
            </select>
          </label>
          {scope === "COLLECTION" && (
            <label>
              {text("Sammlung", "Collection")}
              <select aria-label={text("Sammlung", "Collection")} name="collection" required>
                <option value="">{text("Bitte auswählen", "Choose collection")}</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {text("Dateiformat", "File format")}
            <select aria-label={text("Dateiformat", "File format")} name="format">
              <option>CSV</option>
              <option>XLSX</option>
            </select>
          </label>
          <label>
            <input name="privateNotes" type="checkbox" />
            {text("Private Notizen einschließen", "Include private notes")}
          </label>
          <label>
            <input name="locations" type="checkbox" />
            {text("Lagerorte einschließen", "Include storage locations")}
          </label>
          <button type="submit">
            {busy
              ? text("Wird beauftragt …", "Requesting …")
              : text("Export erstellen", "Create export")}
          </button>
        </fieldset>
      </form>
      <section aria-labelledby="export-history">
        <h2 id="export-history">{text("Exporthistorie", "Export history")}</h2>
        <button onClick={() => setRetry((v) => v + 1)}>
          {text("Stand aktualisieren", "Refresh status")}
        </button>
        {history?.items.length === 0 && (
          <p>{text("Noch keine Exporte oder Berichte.", "No exports or reports yet.")}</p>
        )}
        {history?.items.map((item) => (
          <article className="management-card" key={item.kind + item.id}>
            <h3>
              {item.format} · {status(item)}
            </h3>
            <p>
              {new Date(item.createdAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")} ·{" "}
              {text("Verfügbar bis", "Available until")}{" "}
              {new Date(item.expiresAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}
            </p>
            {item.downloadAvailable && (
              <a
                href={`/api/v1/exports/download?kind=${item.kind}&id=${item.id}`}
                download
              >{`${item.format} ${text("herunterladen", "download")}`}</a>
            )}
          </article>
        ))}
        <div className="management-actions">
          {before && (
            <button onClick={() => setBefore(null)}>
              {text("Neueste Einträge", "Latest entries")}
            </button>
          )}
          <button
            disabled={!history?.hasMore}
            onClick={() => {
              if (history?.nextBefore) setBefore(history.nextBefore);
            }}
          >
            {text("Ältere Einträge", "Older entries")}
          </button>
        </div>
      </section>
    </section>
  );
}
