"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { InsuranceData, InsuranceTarget } from "@sammlerraum/contracts/insurance";
import { valuationCurrencyCodes } from "@sammlerraum/domain/money/currencies";
import { parseLocalizedMoney } from "@sammlerraum/domain/money/money";
import { formatStoredMoney } from "@sammlerraum/domain/money/legacy-money-policy";
import { privateApi } from "../exports/private-api";
import { ReportFieldSelector, type ReportField } from "../reports/report-field-selector";
type ProofOption = {
  assetId: string;
  fileName: string;
  byteSize: string;
  mimeType: string;
  itemId: string;
  itemTitle: string;
};
type Fields = {
  amount: string;
  currency: string;
  valuationDate: string;
  insurer: string;
  policyReference: string;
  notes: string;
};
const empty: Fields = {
  amount: "",
  currency: "EUR",
  valuationDate: "",
  insurer: "",
  policyReference: "",
  notes: "",
};
export function InsuranceManager({ locale }: { locale: "de" | "en" }) {
  const text = (de: string, en: string) => (locale === "de" ? de : en);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]),
    [collectionId, setCollectionId] = useState(""),
    [kind, setKind] = useState<"COLLECTION" | "ITEM">("COLLECTION"),
    [items, setItems] = useState<{ id: string; title: string }[]>([]),
    [itemId, setItemId] = useState(""),
    [search, setSearch] = useState(""),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [loaded, setLoaded] = useState<InsuranceData | null>(null),
    [fields, setFields] = useState<Fields>(empty),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [include, setInclude] = useState<ReportField[]>([]),
    [proofOptions, setProofOptions] = useState<ProofOption[]>([]),
    [selectedProofs, setSelectedProofs] = useState<Record<string, ProofOption>>({}),
    [proofCursor, setProofCursor] = useState<string | null>(null);
  const selectedProofBytes = Object.values(selectedProofs).reduce(
    (sum, proof) => sum + BigInt(proof.byteSize),
    0n,
  );
  const message = text(
    "Der Vorgang konnte nicht abgeschlossen werden. Bitte Ziel und aktuelle Daten erneut prüfen.",
    "The operation could not be completed. Check the target and current data again.",
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
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function apply(data: InsuranceData) {
    setLoaded(data);
    const value = data.insurance;
    setFields(
      value
        ? {
            amount: formatStoredMoney(
              { amountMinor: value.amountMinor, currency: value.currency },
              value.minorUnitExponent,
            ).replace(".", locale === "de" ? "," : "."),
            currency: value.currency,
            valuationDate: value.valuationDate,
            insurer: value.insurer ?? "",
            policyReference: value.policyReference ?? "",
            notes: value.notes ?? "",
          }
        : empty,
    );
    setDirty(false);
  }
  function target(): InsuranceTarget {
    if (!collectionId || (kind === "ITEM" && !itemId)) throw Error();
    return kind === "ITEM" ? { kind: "ITEM", itemId } : { kind: "COLLECTION", collectionId };
  }
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch {
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    await act(async () => {
      const t = target();
      apply(
        await privateApi<InsuranceData>(
          `/api/v1/insurance?kind=${t.kind}&id=${t.kind === "ITEM" ? t.itemId : t.collectionId}`,
        ),
      );
    });
  }
  async function findItems(cursor?: string) {
    await act(async () => {
      if (!collectionId) return;
      const result = await privateApi<{
        items: { id: string; title: string }[];
        nextCursor: string | null;
      }>("/api/v1/search/items", {
        text: search,
        limit: 50,
        f: JSON.stringify({
          version: 1,
          root: { kind: "collection", test: { op: "eq", value: collectionId } },
        }),
        ...(cursor ? { cursor } : {}),
      });
      setItems(result.items);
      setNextCursor(result.nextCursor);
      setItemId("");
      setLoaded(null);
    });
  }
  function change<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      if (!loaded) return;
      const amount = parseLocalizedMoney(fields.amount, locale, fields.currency);
      const result = await privateApi<InsuranceData>(
        "/api/v1/insurance",
        {
          target: loaded.target,
          expectedRevision: loaded.revision,
          insurance: {
            amountMinor: amount.amountMinor.toString(),
            currency: amount.currency,
            valuationDate: fields.valuationDate,
            insurer: fields.insurer,
            policyReference: fields.policyReference,
            notes: fields.notes,
          },
        },
        "PUT",
      );
      apply(result);
      setNotice(text("Versicherung gespeichert", "Insurance saved"));
    });
  }
  async function clear() {
    await act(async () => {
      if (!loaded) return;
      apply(
        await privateApi<InsuranceData>(
          "/api/v1/insurance",
          { target: loaded.target, expectedRevision: loaded.revision, insurance: null },
          "PUT",
        ),
      );
      setNotice(text("Versicherung entfernt", "Insurance cleared"));
    });
  }
  async function loadProofs(afterAssetId?: string) {
    await act(async () => {
      if (!collectionId) return;
      const options = await privateApi<{ items: ProofOption[]; nextAfterAssetId: string | null }>(
        "/api/v1/reports/insurance/proof-options",
        { scope: { kind: "COLLECTION", collectionId }, ...(afterAssetId ? { afterAssetId } : {}) },
      );
      setProofOptions(options.items);
      setProofCursor(options.nextAfterAssetId);
    });
  }
  async function report() {
    await act(async () => {
      if (!collectionId) return;
      await privateApi("/api/v1/reports/insurance", {
        scope: { kind: "COLLECTION", collectionId },
        locale,
        include,
        proofAssetIds: include.includes("proofs") ? Object.keys(selectedProofs) : [],
      });
      setNotice(text("Bericht beauftragt", "Report requested"));
    });
  }
  return (
    <section className="management-shell transfer-shell">
      <nav className="management-nav">
        <Link href={`/${locale}/collections`}>{text("Sammlungen", "Collections")}</Link>
        <Link href={`/${locale}/imports`}>{text("Importe", "Imports")}</Link>
        <Link href={`/${locale}/exports`}>
          {text("Exporte und Berichte", "Exports and reports")}
        </Link>
      </nav>
      <h1>{text("Versicherung und Berichte", "Insurance and reports")}</h1>
      <p>
        {text(
          "Versicherungswerte werden separat von Kaufpreisen geführt. Ein Exemplarwert gilt pro Stück, ein Sammlungswert für die gesamte Sammlung.",
          "Insurance values are stored separately from purchase prices. An item value is per unit; a collection value is the total for that collection.",
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section className="management-card form-stack">
        <h2>{text("Versicherungsziel auswählen", "Select insurance target")}</h2>
        <fieldset className="form-stack" disabled={busy || dirty}>
          <label>
            {text("Sammlung", "Collection")}
            <select
              aria-label={text("Sammlung", "Collection")}
              value={collectionId}
              onChange={(e) => {
                setCollectionId(e.target.value);
                setInclude([]);
                setProofOptions([]);
                setSelectedProofs({});
                setProofCursor(null);
                setLoaded(null);
                setItems([]);
                setItemId("");
              }}
            >
              <option value="">{text("Bitte auswählen", "Choose collection")}</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text("Zieltyp", "Target type")}
            <select
              aria-label={text("Zieltyp", "Target type")}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as "COLLECTION" | "ITEM");
                setLoaded(null);
              }}
            >
              <option value="COLLECTION">{text("Sammlung gesamt", "Collection total")}</option>
              <option value="ITEM">{text("Exemplar pro Stück", "Item per unit")}</option>
            </select>
          </label>
          {kind === "ITEM" && (
            <>
              <label>
                {text("Exemplar suchen", "Find item")}
                <input value={search} onChange={(e) => setSearch(e.target.value)} maxLength={200} />
              </label>
              <button disabled={!collectionId} onClick={() => void findItems()}>
                {text("Exemplare suchen", "Search items")}
              </button>
              <label>
                {text("Exemplar", "Item")}
                <select
                  aria-label={text("Exemplar", "Item")}
                  value={itemId}
                  onChange={(e) => {
                    setItemId(e.target.value);
                    setLoaded(null);
                  }}
                >
                  <option value="">{text("Bitte auswählen", "Choose item")}</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={!nextCursor} onClick={() => void findItems(nextCursor!)}>
                {text("Weitere Exemplare", "More items")}
              </button>
            </>
          )}
          <button
            disabled={!collectionId || (kind === "ITEM" && !itemId)}
            onClick={() => void load()}
          >
            {text("Versicherungsdaten laden", "Load insurance data")}
          </button>
        </fieldset>
      </section>
      {loaded && (
        <form className="management-card form-stack" onSubmit={save}>
          <h2>
            {loaded.target.kind === "ITEM"
              ? text("Versicherungswert pro Stück", "Insurance value per unit")
              : text(
                  "Versicherungswert der gesamten Sammlung",
                  "Insurance value for the entire collection",
                )}
          </h2>
          <fieldset className="form-stack" disabled={busy}>
            <label>
              {text("Versicherungswert", "Insurance value")}
              <input
                value={fields.amount}
                onChange={(e) => change("amount", e.target.value)}
                required
                inputMode="decimal"
                maxLength={80}
              />
            </label>
            <label>
              {text("Währung", "Currency")}
              <input
                aria-label={text("Währung", "Currency")}
                value={fields.currency}
                onChange={(e) => change("currency", e.target.value.toUpperCase())}
                required
                pattern="[A-Z]{3}"
                maxLength={3}
                list="insurance-currencies"
              />
              <datalist id="insurance-currencies">
                {valuationCurrencyCodes.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </label>
            <label>
              {text("Bewertungsdatum", "Valuation date")}
              <input
                type="date"
                value={fields.valuationDate}
                onChange={(e) => change("valuationDate", e.target.value)}
                required
              />
            </label>
            <label>
              {text("Versicherer", "Insurer")}
              <input
                value={fields.insurer}
                onChange={(e) => change("insurer", e.target.value)}
                maxLength={200}
              />
            </label>
            <label>
              {text("Police / Vertragsnummer", "Policy reference")}
              <input
                value={fields.policyReference}
                onChange={(e) => change("policyReference", e.target.value)}
                maxLength={500}
              />
            </label>
            <label>
              {text("Interne Versicherungsnotizen", "Private insurance notes")}
              <textarea
                value={fields.notes}
                onChange={(e) => change("notes", e.target.value)}
                maxLength={2000}
              />
            </label>
            <button type="submit" disabled={!dirty}>
              {text("Versicherungsdaten speichern", "Save insurance data")}
            </button>
            <button type="button" disabled={!loaded.insurance} onClick={() => void clear()}>
              {text("Versicherungsdaten entfernen", "Clear insurance data")}
            </button>
            <button type="button" disabled={!dirty} onClick={() => apply(loaded)}>
              {text("Änderungen verwerfen", "Discard changes")}
            </button>
          </fieldset>
          {dirty && <p role="status">{text("Ungespeicherte Änderungen", "Unsaved changes")}</p>}
        </form>
      )}
      <section className="management-card form-stack">
        <h2>{text("Privaten PDF-Bericht erstellen", "Create a private PDF report")}</h2>
        <p>
          {text(
            "Der Bericht umfasst die oben ausgewählte gesamte Sammlung. Private Zusatzfelder werden nur bei ausdrücklicher Auswahl aufgenommen.",
            "The report covers the entire collection selected above. Private additional fields appear only when explicitly selected.",
          )}
        </p>
        <ReportFieldSelector
          locale={locale}
          value={include}
          onChange={(value) => {
            setInclude(value);
            if (!value.includes("proofs")) {
              setSelectedProofs({});
              setProofOptions([]);
              setProofCursor(null);
            }
          }}
          disabled={busy || dirty}
        />

        {include.includes("proofs") && (
          <fieldset className="form-stack" disabled={busy || dirty}>
            <legend>{text("Belege auswählen", "Choose proof documents")}</legend>
            <p>
              {text(
                "Maximal 20 Belege. Bilder und Belege dürfen zusammen höchstens 16 MiB umfassen.",
                "At most 20 proof documents. Images and proofs together must not exceed 16 MiB.",
              )}
            </p>
            <button disabled={!collectionId} onClick={() => void loadProofs()}>
              {text("Belege laden", "Load proofs")}
            </button>
            {proofOptions.map((proof) => (
              <label key={proof.assetId}>
                <input
                  type="checkbox"
                  checked={Object.hasOwn(selectedProofs, proof.assetId)}
                  disabled={
                    !Object.hasOwn(selectedProofs, proof.assetId) &&
                    Object.keys(selectedProofs).length >= 20
                  }
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelectedProofs((prev) => {
                      const next = { ...prev };
                      if (checked && Object.keys(next).length < 20) next[proof.assetId] = proof;
                      else if (!checked) delete next[proof.assetId];
                      return next;
                    });
                  }}
                />
                {proof.fileName} · {proof.itemTitle} ·{" "}
                {String((BigInt(proof.byteSize) + 1023n) / 1024n)}KiB
              </label>
            ))}
            <button disabled={!proofCursor} onClick={() => void loadProofs(proofCursor!)}>
              {text("Weitere Belege", "More proofs")}
            </button>
            <p aria-live="polite">
              {text("Ausgewählte Belege", "Selected proofs")}: {Object.keys(selectedProofs).length}
              /20 · {String((selectedProofBytes + 1023n) / 1024n)}KiB
            </p>
            {Object.values(selectedProofs).map((proof) => (
              <p key={proof.assetId}>{proof.fileName}</p>
            ))}
            {selectedProofBytes > 16777216n && (
              <p role="alert">
                {text("Die Auswahl überschreitet 16 MiB.", "The selection exceeds 16 MiB.")}
              </p>
            )}
          </fieldset>
        )}
        <button
          disabled={
            busy ||
            dirty ||
            !collectionId ||
            (include.includes("proofs") &&
              (!Object.keys(selectedProofs).length || selectedProofBytes > 16777216n))
          }
          onClick={() => void report()}
        >
          {text("PDF-Bericht erstellen", "Create PDF report")}
        </button>
        <Link href={`/${locale}/exports`}>
          {text("Berichte ansehen und herunterladen", "View and download reports")}
        </Link>
      </section>
    </section>
  );
}
