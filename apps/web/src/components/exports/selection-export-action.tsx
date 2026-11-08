"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ExportRequest } from "@sammlerraum/contracts/exports";
import {
  parseItemSearchQuery,
  type NormalizedItemSearchQuery,
} from "@sammlerraum/contracts/item-search";
import { privateApi } from "./private-api";

/** Export the applied selection, never a partial result page or uncommitted filter draft. */
export function SelectionExportAction({
  locale,
  scope,
  query,
  label,
  disabled = false,
}: {
  locale: "de" | "en";
  scope: ExportRequest["scope"];
  query?: NormalizedItemSearchQuery;
  label: string;
  disabled?: boolean;
}) {
  const text = (de: string, en: string) => (locale === "de" ? de : en),
    router = useRouter(),
    flight = useRef(false);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const identity = JSON.stringify({ scope, query });
  useEffect(() => {
    setOpen(false);
    setError("");
  }, [identity]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || flight.current) return;
    const data = new FormData(event.currentTarget);
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await privateApi("/api/v1/exports", {
        scope,
        locale,
        format: data.get("format"),
        ...(query
          ? {
              query: parseItemSearchQuery({
                text: query.text,
                filter: query.filter,
                lifecycle: query.lifecycle,
                limit: 20,
              }),
            }
          : {}),
        includePrivateNotes: data.get("privateNotes") === "on",
        includeLocations: data.get("locations") === "on",
      });
      router.push(`/${locale}/exports`);
    } catch {
      setError(
        text(
          "Export nicht bestätigt. Prüfe zuerst den Verlauf unter Exporte und Berichte, bevor du erneut einen Auftrag anlegst.",
          "Export not confirmed. Check Exports and reports before requesting another job.",
        ),
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}>
        {scope.kind === "SUBTREE"
          ? text("Teilbaum exportieren", "Export subtree")
          : text("Suchergebnis exportieren", "Export search results")}
      </button>
    );
  return (
    <form className="management-card form-stack transfer-shell" onSubmit={submit}>
      <h3>{text("Auswahl exportieren", "Export selection")}</h3>
      <p>{label}</p>
      <p>
        {scope.kind === "SUBTREE"
          ? text(
              "Enthält diesen Bereich und alle untergeordneten Bereiche, keine benachbarten Bereiche.",
              "Includes this branch and its descendants, excluding siblings.",
            )
          : text(
              "Enthält alle Treffer der angewendeten Suche, nicht nur die aktuelle Seite. Ungespeicherte Filteränderungen werden nicht übernommen.",
              "Includes every match of the applied search, not just the current page. Unapplied filter changes are excluded.",
            )}
      </p>
      <p>
        {text(
          "Privater Download, 24 Stunden verfügbar. Private Notizen und Lagerorte sind zunächst ausgeschaltet.",
          "Private download, available for 24 hours. Private notes and storage locations start off.",
        )}
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <a href={`/${locale}/exports`}>{text("Exportverlauf öffnen", "Open export history")}</a>
        </p>
      )}
      <fieldset className="form-stack" disabled={disabled || busy}>
        <legend>{text("Exportoptionen", "Export options")}</legend>
        <label>
          {text("Dateiformat", "File format")}
          <select name="format">
            <option>CSV</option>
            <option>XLSX</option>
          </select>
        </label>
        <label>
          <input type="checkbox" name="privateNotes" />
          {text("Private Notizen einschließen", "Include private notes")}
        </label>
        <label>
          <input type="checkbox" name="locations" />
          {text("Lagerorte einschließen", "Include storage locations")}
        </label>
        <button type="submit">
          {busy
            ? text("Wird beauftragt …", "Requesting …")
            : text("Auswahl exportieren", "Export selection")}
        </button>
      </fieldset>
      <button type="button" disabled={busy} onClick={() => setOpen(false)}>
        {text("Abbrechen", "Cancel")}
      </button>
    </form>
  );
}
