"use client";
import type { ImportMapping } from "@sammlerraum/contracts/imports";
export function MappingEditor({
  locale,
  header,
  columnCount,
  mapping,
  onChange,
  disabled = false,
}: {
  locale: "de" | "en";
  header: (string | null)[] | null;
  columnCount: number;
  mapping: ImportMapping;
  onChange(value: ImportMapping): void;
  disabled?: boolean;
}) {
  const text = (de: string, en: string) => (locale === "de" ? de : en);
  const columns = Array.from({ length: Math.max(columnCount, header?.length ?? 0) }, (_, i) => ({
    value: String(i),
    label: header?.[i] || `${text("Spalte", "Column")} ${i + 1}`,
  }));
  const select = (
    label: string,
    value: number | undefined,
    change: (value: number | undefined) => void,
    required = false,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        disabled={disabled}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => change(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        {!required && <option value="">{text("Nicht importieren", "Do not import")}</option>}
        {columns.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
  const change = (field: "title" | "quantity", value: number | undefined) => {
    const next = { ...mapping, columns: { ...mapping.columns } };
    if (value === undefined && field === "quantity") delete next.columns.quantity;
    else if (value !== undefined) next.columns[field] = value;
    onChange(next);
  };
  return (
    <fieldset className="form-stack" disabled={disabled}>
      <legend>{text("Spalten zuordnen", "Map columns")}</legend>
      {select(
        text("Titelspalte", "Title column"),
        mapping.columns.title,
        (v) => change("title", v),
        true,
      )}
      {select(text("Mengenspalte", "Quantity column"), mapping.columns.quantity, (v) =>
        change("quantity", v),
      )}
      {select(
        text("Kennungsspalte", "Identifier column"),
        mapping.columns.identifier?.column,
        (v) => {
          const next = { ...mapping, columns: { ...mapping.columns } };
          if (v === undefined) delete next.columns.identifier;
          else
            next.columns.identifier = {
              column: v,
              type: mapping.columns.identifier?.type ?? "SKU",
            };
          onChange(next);
        },
      )}
      <label>
        {text("Kennungstyp", "Identifier type")}
        <input
          disabled={!mapping.columns.identifier}
          value={mapping.columns.identifier?.type ?? "SKU"}
          onChange={(e) => {
            if (mapping.columns.identifier)
              onChange({
                ...mapping,
                columns: {
                  ...mapping.columns,
                  identifier: { ...mapping.columns.identifier, type: e.target.value },
                },
              });
          }}
          maxLength={64}
        />
      </label>
    </fieldset>
  );
}
