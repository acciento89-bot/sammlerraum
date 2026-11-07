"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IMPORT_MAX_SOURCE_BYTES } from "@sammlerraum/contracts/imports";
export function ImportManager({ locale }: { locale: "de" | "en" }) {
  const text = (de: string, en: string) => (locale === "de" ? de : en),
    router = useRouter();
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "IMPORT_UNAVAILABLE");
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
