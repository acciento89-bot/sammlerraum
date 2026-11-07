"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { importApi } from "./import-api";
import type { ImportJobDto } from "@sammlerraum/contracts/imports";
import { IMPORT_MAX_SOURCE_BYTES } from "@sammlerraum/contracts/imports";
export function ImportManager({ locale }: { locale: "de" | "en" }) {
  const text = (de: string, en: string) => (locale === "de" ? de : en),
    router = useRouter();
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recent, setRecent] = useState<{ job: ImportJobDto; expiresAt: string }[]>([]),
    [historyError, setHistoryError] = useState(false),
    [historyRetry, setHistoryRetry] = useState(0);
  const uploadKey = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/v1/collections", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw Error("COLLECTIONS_UNAVAILABLE");
        return r.json();
      })
      .then((body) => {
        if (active) setCollections(body.collections);
      })
      .catch(() => {
        if (active)
          setError(text("Sammlungen konnten nicht geladen werden.", "Could not load collections."));
      });
    return () => {
      active = false;
    };
  }, [locale]);
  useEffect(() => {
    let active = true,
      loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const result = await importApi<{ jobs: { job: ImportJobDto; expiresAt: string }[] }>(
          "recent",
        );
        if (active) {
          setRecent(result.jobs);
          setHistoryError(false);
        }
      } catch {
        if (active) setHistoryError(true);
      } finally {
        loading = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [locale, historyRetry]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget),
      file = data.get("source");
    if (!(file instanceof File) || !file.size || file.size > IMPORT_MAX_SOURCE_BYTES) {
      setError(
        text(
          "Bitte eine CSV- oder XLSX-Datei bis 20 MiB auswählen.",
          "Choose a CSV or XLSX file up to 20 MiB.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      uploadKey.current ??= crypto.randomUUID();
      const format = data.get("format");
      const body = new FormData();
      body.append(
        "metadata",
        JSON.stringify({
          collectionId: data.get("collection"),
          locale,
          fileName: file.name,
          format,
          uploadRequestId: uploadKey.current,
          parserOptions: {
            format,
            hasHeader: data.get("header") === "on",
            delimiter: data.get("delimiter"),
            sourceProfile: data.get("profile"),
          },
        }),
      );
      body.append("file", file);
      const response = await fetch("/api/v1/imports/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.code ?? "IMPORT_UNAVAILABLE");
      router.push(`/${locale}/imports/${result.job.id}`);
    } catch {
      setError(
        text(
          "Upload nicht abgeschlossen. Bitte Quelle und Grenzen prüfen oder dieselbe Datei erneut versuchen.",
          "Upload did not complete. Check the source and limits, or retry the same file.",
        ),
      );
      setBusy(false);
    }
  }
  return (
    <section className="management-shell transfer-shell">
      <nav className="management-nav">
        <Link href={`/${locale}/collections`}>{text("Sammlungen", "Collections")}</Link>
        <Link href={`/${locale}/exports`}>{text("Exporte", "Exports")}</Link>
        <Link href={`/${locale}/insurance`}>{text("Versicherung", "Insurance")}</Link>
      </nav>
      <h1>{text("Bestand importieren", "Import inventory")}</h1>
      <p>
        {text(
          "Datei hochladen → Spalten prüfen → Zeilen entscheiden → Import freigeben. Der Bestand ändert sich erst nach deiner Freigabe.",
          "Upload → map columns → decide rows → approve. Your inventory changes only after approval.",
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      <section aria-labelledby="recent-imports">
        <h2 id="recent-imports">{text("Deine Importaufträge", "Your import jobs")}</h2>
        <button onClick={() => setHistoryRetry((v) => v + 1)}>
          {text("Aufträge aktualisieren", "Refresh jobs")}
        </button>
        {historyError && (
          <p role="alert">
            {text("Aufträge konnten nicht geladen werden.", "Could not load import jobs.")}
          </p>
        )}
        {recent.length === 0 && !historyError && (
          <p>{text("Noch keine aktuellen Importaufträge.", "No current import jobs yet.")}</p>
        )}
        {recent.map(({ job }) => (
          <article className="management-card" key={job.id}>
            <Link href={`/${locale}/imports/${job.id}`}>
              <strong>{job.source.fileName}</strong> ·{" "}
              {job.status === "COMPLETED"
                ? text("Abgeschlossen", "Complete")
                : job.status === "CANCELLED"
                  ? text("Abgebrochen", "Cancelled")
                  : job.status === "FAILED"
                    ? text("Fehlgeschlagen", "Failed")
                    : job.status === "COMMITTING"
                      ? text("Wird übernommen", "Committing")
                      : ["PARSED", "PREVIEWING", "REVIEW_READY"].includes(job.status)
                        ? text("Prüfung und Freigabe offen", "Awaiting review and approval")
                        : text("Datei wird eingelesen", "Reading source")}
            </Link>
            <p>
              {job.progress.parsedRows} {text("gelesene Zeilen", "parsed rows")} ·{" "}
              {job.progress.committedRows} {text("bearbeitete Datenzeilen", "processed data rows")}
            </p>
          </article>
        ))}
      </section>
      <form
        className="form-stack"
        onSubmit={upload}
        onChange={() => {
          uploadKey.current = null;
        }}
      >
        <fieldset className="form-stack" disabled={busy}>
          <legend>{text("Quelldatei", "Source file")}</legend>
          <label>
            {text("Zielsammlung", "Target collection")}
            <select
              aria-label={text("Zielsammlung", "Target collection")}
              name="collection"
              required
            >
              <option value="">{text("Bitte auswählen", "Choose collection")}</option>
              {collections.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text("Datei auswählen", "Choose file")}
            <input type="file" name="source" accept=".csv,.xlsx" required />
          </label>
          <label>
            {text("Dateiformat", "File format")}
            <select name="format">
              <option value="CSV">CSV</option>
              <option value="XLSX">XLSX</option>
            </select>
          </label>
          <label>
            <input type="checkbox" name="header" defaultChecked />
            {text("Erste Zeile enthält Spaltenüberschriften", "First row contains headers")}
          </label>
          <label>
            {text("Trennzeichen (CSV)", "Delimiter (CSV)")}
            <select name="delimiter">
              <option value=",">{text("Komma", "Comma")}</option>
              <option value=";">{text("Semikolon", "Semicolon")}</option>
              <option value={"\t"}>Tab</option>
            </select>
          </label>
          <label>
            {text("Quellprofil", "Source profile")}
            <select name="profile">
              <option value="GENERIC">{text("Allgemeine Datei", "Generic file")}</option>
              <option value="SAMMLERRAUM_TABULAR_V1">Sammlerraum V1</option>
            </select>
          </label>
          <p>
            {text(
              "Quellen werden 24 Stunden aufbewahrt. Maximal drei aktive Importe und 20 Quellen gleichzeitig.",
              "Sources are retained for 24 hours. At most three active imports and 20 retained sources.",
            )}
          </p>
          <button type="submit">
            {busy
              ? text("Wird hochgeladen …", "Uploading …")
              : text("Datei hochladen", "Upload file")}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
