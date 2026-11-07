"use client";
import { LEGACY_MONEY_PROFILE_ID } from "@sammlerraum/contracts/legacy-money";
import type { ImportMapping } from "@sammlerraum/contracts/imports";
export function MappingEditor({
  locale,
  header,
  columnCount,
  mapping,
  onChange,
  disabled = false,
  moneyAuthoringEnabled = false,
}: {
  locale: "de" | "en";
  header: (string | null)[] | null;
  columnCount: number;
  mapping: ImportMapping;
  onChange(value: ImportMapping): void;
  disabled?: boolean;
  moneyAuthoringEnabled?: boolean;
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
        <option value="">
          {required
            ? text("Bitte auswählen", "Choose column")
            : text("Nicht importieren", "Do not import")}
        </option>
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
  const money = mapping.columns.purchaseMoney;
  const setMoney = (value: ImportMapping["columns"]["purchaseMoney"]) => {
    const next = { ...mapping, columns: { ...mapping.columns } };
    if (value === undefined) delete next.columns.purchaseMoney;
    else next.columns.purchaseMoney = value;
    onChange(next);
  };
  function mode(value: string) {
    if (!money) return;
    const clean = {
      amountColumn: money.amountColumn,
      ...(money.fixedCurrency !== undefined
        ? { fixedCurrency: money.fixedCurrency }
        : money.currencyColumn !== undefined
          ? { currencyColumn: money.currencyColumn }
          : {}),
    };
    setMoney(
      value === "DECIMAL"
        ? { ...clean, sourceKind: "DECIMAL", profileId: LEGACY_MONEY_PROFILE_ID }
        : value === "RAW_LEGACY"
          ? {
              ...clean,
              sourceKind: "RAW",
              profileId: null,
              sourceContract: "LEGACY_UNKNOWN_RAW_V1",
            }
          : {
              ...clean,
              sourceKind: "RAW",
              profileId: LEGACY_MONEY_PROFILE_ID,
              sourceContract: "CANONICAL_MINOR_UNITS_V1",
            },
    );
  }
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

      {select(
        text("Erwerbsdatumsspalte", "Acquisition date column"),
        mapping.columns.acquiredOn?.column,
        (value) => {
          const next = { ...mapping, columns: { ...mapping.columns } };
          if (value === undefined) delete next.columns.acquiredOn;
          else
            next.columns.acquiredOn = {
              column: value,
              format: mapping.columns.acquiredOn?.format ?? "YYYY-MM-DD",
            };
          onChange(next);
        },
      )}
      {mapping.columns.acquiredOn && (
        <label>
          {text("Datumsformat", "Date format")}
          <select
            aria-label={text("Datumsformat", "Date format")}
            value={mapping.columns.acquiredOn.format}
            onChange={(event) => {
              if (mapping.columns.acquiredOn)
                onChange({
                  ...mapping,
                  columns: {
                    ...mapping.columns,
                    acquiredOn: {
                      ...mapping.columns.acquiredOn,
                      format: event.target.value as "YYYY-MM-DD" | "DD.MM.YYYY",
                    },
                  },
                });
            }}
          >
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="DD.MM.YYYY">DD.MM.YYYY</option>
          </select>
        </label>
      )}
      {!moneyAuthoringEnabled && (
        <p>
          {text(
            "Der Kaufpreisimport ist aktuell nicht freigeschaltet. Andere Spalten können weiterhin importiert werden.",
            "Purchase-value import is currently unavailable. Other columns can still be imported.",
          )}
        </p>
      )}
      <fieldset className="form-stack" disabled={disabled || !moneyAuthoringEnabled}>
        <legend>
          {text("Kaufpreise ausdrücklich zuordnen", "Explicitly map purchase values")}
        </legend>
        {select(text("Kaufpreisspalte", "Purchase amount column"), money?.amountColumn, (value) =>
          setMoney(
            value === undefined
              ? undefined
              : money
                ? { ...money, amountColumn: value }
                : {
                    amountColumn: value,
                    sourceKind: "DECIMAL",
                    profileId: LEGACY_MONEY_PROFILE_ID,
                    fixedCurrency: "",
                  },
          ),
        )}
        {money && (
          <>
            <label>
              {text("Bedeutung der Beträge", "Amount meaning")}
              <select
                aria-label={text("Bedeutung der Beträge", "Amount meaning")}
                value={
                  money.sourceKind === "DECIMAL"
                    ? "DECIMAL"
                    : money.profileId === null
                      ? "RAW_LEGACY"
                      : "RAW_CANONICAL"
                }
                onChange={(event) => mode(event.target.value)}
              >
                <option value="DECIMAL">
                  {text(
                    "Dezimalbetrag ohne Tausendertrennzeichen",
                    "Decimal amount without grouping",
                  )}
                </option>
                <option value="RAW_LEGACY">
                  {text(
                    "Ganzzahl mit unbekannter Einheit bewahren",
                    "Preserve integer with unknown unit",
                  )}
                </option>
                <option value="RAW_CANONICAL">
                  {text(
                    "Ganzzahl mit ausdrücklich belegter Einheit",
                    "Integer with explicit evidenced unit",
                  )}
                </option>
              </select>
            </label>
            <p>
              {money.sourceKind === "DECIMAL"
                ? text(
                    "Zulässig: 12,34 oder 12.34, ohne Tausendertrennzeichen. Die Währung wird ausdrücklich festgelegt.",
                    "Accepted: 12.34 or 12,34, without grouping. Currency is explicitly selected.",
                  )
                : money.profileId === null
                  ? text(
                      "Die Ganzzahl bleibt ohne vermutete Dezimalstellen gespeichert. Sie ist kein interpretierter Preis.",
                      "The integer stays stored without an inferred scale. It is not an interpreted price.",
                    )
                  : text(
                      "Nur für Quellen mit eigener Exponenten- und Einheitenkennungsspalte. Beide müssen zum vereinbarten Währungsprofil passen.",
                      "Only for sources with explicit exponent and unit-key columns matching the pinned currency profile.",
                    )}
            </p>
            <label>
              {text("Währungsquelle", "Currency source")}
              <select
                aria-label={text("Währungsquelle", "Currency source")}
                value={money.fixedCurrency === undefined ? "COLUMN" : "FIXED"}
                onChange={(event) => {
                  const next = { ...money };
                  delete next.fixedCurrency;
                  delete next.currencyColumn;
                  if (event.target.value === "FIXED") next.fixedCurrency = "";
                  setMoney(next);
                }}
              >
                <option value="FIXED">{text("Feste Währung", "Fixed currency")}</option>
                <option value="COLUMN">{text("Währung aus Spalte", "Currency from column")}</option>
              </select>
            </label>
            {money.fixedCurrency !== undefined ? (
              <label>
                {text("Feste Währung", "Fixed currency")}
                <input
                  value={money.fixedCurrency}
                  maxLength={3}
                  onChange={(event) =>
                    setMoney({ ...money, fixedCurrency: event.target.value.toUpperCase() })
                  }
                />
              </label>
            ) : (
              select(
                text("Währungsspalte", "Currency column"),
                money.currencyColumn,
                (value) => {
                  const next = { ...money };
                  if (value === undefined) delete next.currencyColumn;
                  else next.currencyColumn = value;
                  setMoney(next);
                },
                true,
              )
            )}
            {money.sourceKind === "RAW" && money.profileId !== null && (
              <>
                {select(
                  text("Exponentenspalte", "Exponent column"),
                  money.exponentColumn,
                  (value) => {
                    const next = { ...money };
                    if (value === undefined) delete next.exponentColumn;
                    else next.exponentColumn = value;
                    setMoney(next);
                  },
                  true,
                )}
                {select(
                  text("Einheitenkennungsspalte", "Unit-key column"),
                  money.unitKeyColumn,
                  (value) => {
                    const next = { ...money };
                    if (value === undefined) delete next.unitKeyColumn;
                    else next.unitKeyColumn = value;
                    setMoney(next);
                  },
                  true,
                )}
              </>
            )}
          </>
        )}
      </fieldset>
      {money && (
        <button type="button" disabled={disabled} onClick={() => setMoney(undefined)}>
          {text("Kaufpreiszuordnung entfernen", "Remove purchase-value mapping")}
        </button>
      )}
    </fieldset>
  );
}
