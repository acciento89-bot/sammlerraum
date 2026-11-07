"use client";
import type { InsuranceReportOptions } from "@sammlerraum/contracts/reports";
export type ReportField = InsuranceReportOptions["include"][number];
export function ReportFieldSelector({
  locale,
  value,
  onChange,
  disabled = false,
}: {
  locale: "de" | "en";
  value: ReportField[];
  onChange(value: ReportField[]): void;
  disabled?: boolean;
}) {
  const text = (de: string, en: string) => (locale === "de" ? de : en);
  const fields: [ReportField, string][] = [
    ["images", text("Bilder", "Images")],
    ["values", text("Kaufwerte", "Purchase values")],
    ["identifiers", text("Kennungen", "Identifiers")],
    ["privateNotes", text("Private Notizen", "Private notes")],
    ["storageLocations", text("Lagerorte", "Storage locations")],
    ["insurance", text("Versicherungsdaten", "Insurance data")],
    ["policyReferences", text("Police / Vertragsnummern", "Policy references")],
    ["proofs", text("Belege", "Proof documents")],
  ];
  function toggle(field: ReportField, checked: boolean) {
    let next = checked ? [...value, field] : value.filter((v) => v !== field);
    if (!next.includes("insurance")) next = next.filter((v) => v !== "policyReferences");
    onChange(next);
  }
  return (
    <fieldset className="form-stack" disabled={disabled}>
      <legend>{text("PDF-Felder ausdrücklich auswählen", "Explicitly select PDF fields")}</legend>
      <p>
        {text(
          "Alle Zusatzfelder sind zunächst ausgeschaltet. Kaufwerte sind keine unabhängige Wertermittlung.",
          "All additional fields start off. Purchase values are not an independent appraisal.",
        )}
      </p>
      {fields.map(([field, label]) => (
        <label key={field}>
          <input
            type="checkbox"
            checked={value.includes(field)}
            disabled={disabled || (field === "policyReferences" && !value.includes("insurance"))}
            onChange={(e) => toggle(field, e.target.checked)}
          />
          {label}
        </label>
      ))}
      <div className="report-field-summary" aria-live="polite">
        <strong>{text("Enthaltene Zusatzfelder", "Included additional fields")}</strong>
        <p>
          {value.length
            ? fields
                .filter(([field]) => value.includes(field))
                .map(([, label]) => label)
                .join(" · ")
            : text("Keine", "None")}
        </p>
        <p>
          {text(
            "Basis: Titel, Stückzahl, Sammlungszuordnung und Berichtszeitpunkt.",
            "Base: title, quantity, collection reference and report time.",
          )}
        </p>
      </div>
    </fieldset>
  );
}
