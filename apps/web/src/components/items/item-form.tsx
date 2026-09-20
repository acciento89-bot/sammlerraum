"use client";

import type { Collection, CollectionNode } from "@sammlerraum/contracts/collections";
import type {
  CanonicalCustomFieldValue,
  CustomFieldDefinition,
  CustomFieldType,
} from "@sammlerraum/contracts/custom-fields";
import type { AcquisitionType, CollectibleItem, TradeStatus } from "@sammlerraum/contracts/items";
import type { StorageLocation } from "@sammlerraum/contracts/locations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { errorMessage } from "../collections/collections-manager";
import { CodeScanner } from "./code-scanner";
import {
  displayCustomFieldValue,
  integerCustomFieldValue,
  itemCurrencyOptions,
  majorUnits,
  minorUnits,
  tagsFromInput,
  tagsInputValue,
} from "./item-form-values";

type Identifier = { type: string; value: string };
type ItemMetadata = {
  identifiers: Array<Identifier & { id: string; itemId: string; normalizedValue: string }>;
  tags: string[];
  customFieldValues: Array<{
    fieldDefinitionId: string;
    type: CustomFieldType;
    value: CanonicalCustomFieldValue;
  }>;
  location: StorageLocation | null;
};
type ItemResponse = { item: CollectibleItem; metadata?: ItemMetadata };
type Translation = (key: string) => string;

const acquisitionTypes: AcquisitionType[] = [
  "PURCHASE",
  "GIFT",
  "TRADE",
  "INHERITANCE",
  "FOUND",
  "OTHER",
];
const tradeStatuses: TradeStatus[] = ["NOT_FOR_TRADE", "OPEN_TO_TRADE", "FOR_SALE", "RESERVED"];
const identifierTypes = [
  "EAN",
  "UPC",
  "ISBN",
  "SERIAL",
  "CERTIFICATE",
  "CATALOG",
  "MANUFACTURER",
  "INTERNAL",
  "OTHER",
];

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw response;
  return response.json() as Promise<T>;
}

export function ItemForm({
  locale,
  itemId,
  initialCollectionId = "",
}: {
  locale: "de" | "en";
  itemId?: string;
  initialCollectionId?: string;
}) {
  const t = useTranslations("ItemForm");
  const common = useTranslations("Management");
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState(initialCollectionId);
  const [nodes, setNodes] = useState<CollectionNode[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [item, setItem] = useState<CollectibleItem>();
  const [metadata, setMetadata] = useState<ItemMetadata>();
  const [identifiers, setIdentifiers] = useState<Identifier[]>([{ type: "EAN", value: "" }]);
  const [workingItemId, setWorkingItemId] = useState(itemId ?? "");
  const [initialLocationId, setInitialLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [collectionBody, locationBody, itemBody] = await Promise.all([
          read<{ collections: Collection[] }>("/api/v1/collections"),
          read<{ locations: StorageLocation[] }>("/api/v1/locations"),
          itemId ? read<ItemResponse>(`/api/v1/items/${itemId}`) : Promise.resolve(undefined),
        ]);
        if (cancelled) return;
        setCollections(collectionBody.collections);
        setLocations(locationBody.locations);
        if (itemBody) {
          setItem(itemBody.item);
          setMetadata(itemBody.metadata);
          setCollectionId(itemBody.item.collectionId);
          setWorkingItemId(itemBody.item.id);
          const loadedIdentifiers = itemBody.metadata?.identifiers.map(({ type, value }) => ({
            type,
            value,
          }));
          setIdentifiers(
            loadedIdentifiers?.length ? loadedIdentifiers : [{ type: "EAN", value: "" }],
          );
          const locationId = itemBody.metadata?.location?.id ?? null;
          setInitialLocationId(locationId);
        } else if (!initialCollectionId && collectionBody.collections[0]) {
          setCollectionId(collectionBody.collections[0].id);
        }
      } catch (problem) {
        setError(
          problem instanceof Response
            ? await errorMessage(problem, common("error"))
            : common("error"),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, initialCollectionId, common]);

  useEffect(() => {
    if (!collectionId) {
      setNodes([]);
      setFields([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      read<{ nodes: CollectionNode[] }>(`/api/v1/collections/${collectionId}/nodes`),
      read<{ customFields: CustomFieldDefinition[] }>(
        `/api/v1/collections/${collectionId}/custom-fields`,
      ),
    ])
      .then(([nodeBody, fieldBody]) => {
        if (!cancelled) {
          setNodes(nodeBody.nodes);
          setFields(fieldBody.customFields);
        }
      })
      .catch(async (problem) => {
        if (!cancelled) {
          setError(
            problem instanceof Response
              ? await errorMessage(problem, common("error"))
              : common("error"),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, common]);

  const inactive = Boolean(item?.archivedAt || item?.disposedAt);
  const valueByField = new Map(
    metadata?.customFieldValues.map((record) => [record.fieldDefinitionId, record.value]) ?? [],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collectionId || inactive) return;
    setSaving(true);
    setError("");
    setStatus("");
    const form = new FormData(event.currentTarget);
    let purchaseAmountMinor: number | null;
    try {
      purchaseAmountMinor = minorUnits(
        String(form.get("purchaseAmount") ?? ""),
        String(form.get("purchaseCurrency") ?? "EUR"),
      );
    } catch {
      setError(t("moneyInvalid"));
      setSaving(false);
      return;
    }
    const core = {
      nodeId: String(form.get("nodeId") ?? "") || null,
      title: form.get("title"),
      publicDescription: String(form.get("publicDescription") ?? "").trim() || null,
      privateNotes: String(form.get("privateNotes") ?? "").trim() || null,
      quantity: Number(form.get("quantity")),
      acquisitionType: form.get("acquisitionType"),
      acquisitionDate: String(form.get("acquisitionDate") ?? "") || null,
      purchaseAmountMinor,
      purchaseCurrency: purchaseAmountMinor === null ? null : form.get("purchaseCurrency"),
      visibility: form.get("visibility"),
      tradeStatus: form.get("tradeStatus"),
    };
    let targetId = workingItemId;
    let createdNow = false;
    const coreResponse = await fetch(targetId ? `/api/v1/items/${targetId}` : "/api/v1/items", {
      method: targetId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(targetId ? core : { ...core, collectionId }),
    });
    if (!coreResponse.ok) {
      setError(await errorMessage(coreResponse, common("error")));
      setSaving(false);
      return;
    }
    const coreBody = (await coreResponse.json()) as { item: CollectibleItem };
    setItem(coreBody.item);
    if (!targetId) {
      targetId = coreBody.item.id;
      createdNow = true;
      setWorkingItemId(targetId);
      setStatus(t("coreCreated"));
    }

    const cleanIdentifiers = identifiers
      .map((identifier) => ({ type: identifier.type, value: identifier.value.trim() }))
      .filter((identifier) => identifier.value);
    const tags = tagsFromInput(String(form.get("tags") ?? ""));
    const requests: Array<{ kind: string; response: Promise<Response> }> = [
      {
        kind: "identifiers",
        response: put(`/api/v1/items/${targetId}/identifiers`, {
          identifiers: cleanIdentifiers,
        }),
      },
      { kind: "tags", response: put(`/api/v1/items/${targetId}/tags`, { tags }) },
    ];

    try {
      for (const field of fields) {
        const enabled = form.has(`field-enabled-${field.id}`);
        const value = enabled ? customValue(field, form) : null;
        requests.push({
          kind: `field-${field.id}`,
          response: put(`/api/v1/items/${targetId}/custom-fields/${field.id}`, { value }),
        });
      }
    } catch {
      setError(t("fieldInvalid"));
      setSaving(false);
      return;
    }

    const selectedLocationId = String(form.get("locationId") ?? "") || null;
    if (selectedLocationId !== initialLocationId) {
      requests.push({
        kind: "location",
        response: put(`/api/v1/items/${targetId}/location`, {
          locationId: selectedLocationId,
        }),
      });
    }
    const responses = await Promise.all(
      requests.map(async (request) => ({ kind: request.kind, response: await request.response })),
    );
    const locationResponse = responses.find((entry) => entry.kind === "location")?.response;
    if (locationResponse?.ok) setInitialLocationId(selectedLocationId);
    const failed = responses.find((entry) => !entry.response.ok);
    if (failed) {
      setError(
        await errorMessage(
          failed.response,
          createdNow ? t("partialSaveError") : t("metadataSaveError"),
        ),
      );
      setStatus(t("retryWithoutDuplicate"));
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push(`/${locale}/items/${targetId}`);
    router.refresh();
  }

  async function archive() {
    if (!workingItemId || inactive || !window.confirm(t("archiveConfirm"))) return;
    const response = await fetch(`/api/v1/items/${workingItemId}/archive`, { method: "POST" });
    if (!response.ok) return setError(await errorMessage(response, common("error")));
    const body = (await response.json()) as { item: CollectibleItem };
    setItem(body.item);
    setStatus(t("archived"));
  }

  async function remove() {
    if (!workingItemId || !window.confirm(t("deleteConfirm"))) return;
    const response = await fetch(`/api/v1/items/${workingItemId}`, { method: "DELETE" });
    if (!response.ok) return setError(await errorMessage(response, common("error")));
    router.push(`/${locale}/collections/${collectionId}`);
    router.refresh();
  }

  if (loading) {
    return (
      <section className="management-shell">
        <p role="status">{common("loading")}</p>
      </section>
    );
  }

  return (
    <section className="management-shell">
      <nav className="management-nav" aria-label={common("navigation")}>
        <Link
          href={collectionId ? `/${locale}/collections/${collectionId}` : `/${locale}/collections`}
        >
          {t("back")}
        </Link>
      </nav>
      <header className="management-heading">
        <p className="eyebrow">{t(item ? "editEyebrow" : "newEyebrow")}</p>
        <h1>{item?.title ?? t("newTitle")}</h1>
        <p className="form-intro">{t("intro")}</p>
      </header>

      {item && metadata && (
        <ItemSummary item={item} metadata={metadata} fields={fields} locale={locale} t={t} />
      )}
      {inactive && (
        <p className="notice">{t(item?.disposedAt ? "disposedNotice" : "archivedNotice")}</p>
      )}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {collections.length === 0 ? (
        <div className="management-card">
          <p>{t("noCollections")}</p>
          <Link href={`/${locale}/collections`}>{t("createCollection")}</Link>
        </div>
      ) : (
        <form className="item-form" onSubmit={save}>
          <fieldset disabled={inactive || saving}>
            <legend>{t("basic")}</legend>
            {!item && (
              <label>
                {t("collection")}
                <select
                  name="collectionId"
                  value={collectionId}
                  onChange={(event) => setCollectionId(event.target.value)}
                  required
                >
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t("node")}
              <select name="nodeId" defaultValue={item?.nodeId ?? ""}>
                <option value="">{t("collectionRoot")}</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("title")}
              <input name="title" defaultValue={item?.title ?? ""} maxLength={200} required />
            </label>
            <label>
              {t("publicDescription")}
              <textarea
                name="publicDescription"
                defaultValue={item?.publicDescription ?? ""}
                maxLength={10000}
              />
              <span className="field-help">{t("publicDescriptionHelp")}</span>
            </label>
            <label>
              {t("privateNotes")}
              <textarea
                name="privateNotes"
                defaultValue={item?.privateNotes ?? ""}
                maxLength={10000}
              />
              <span className="field-help">{t("privateNotesHelp")}</span>
            </label>
            <div className="form-row">
              <label>
                {t("quantity")}
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={item?.quantity ?? 1}
                  required
                />
              </label>
              <label>
                {common("visibility")}
                <select name="visibility" defaultValue={item?.visibility ?? "PRIVATE"}>
                  <option value="PRIVATE">{common("visibilityPRIVATE")}</option>
                  <option value="UNLISTED">{common("visibilityUNLISTED")}</option>
                  <option value="PUBLIC">{common("visibilityPUBLIC")}</option>
                </select>
              </label>
            </div>
          </fieldset>

          <details open>
            <summary>{t("acquisition")}</summary>
            <fieldset disabled={inactive || saving} className="details-fields">
              <label>
                {t("acquisitionType")}
                <select name="acquisitionType" defaultValue={item?.acquisitionType ?? "OTHER"}>
                  {acquisitionTypes.map((type) => (
                    <option key={type} value={type}>
                      {t(`acquisitionType${type}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("acquisitionDate")}
                <input
                  name="acquisitionDate"
                  type="date"
                  defaultValue={item?.acquisitionDate ?? ""}
                />
              </label>
              <div className="form-row">
                <label>
                  {t("unitPrice")}
                  <input
                    name="purchaseAmount"
                    inputMode="decimal"
                    defaultValue={majorUnits(
                      item?.purchaseAmountMinor ?? null,
                      item?.purchaseCurrency ?? "EUR",
                    )}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  {t("currency")}
                  <select name="purchaseCurrency" defaultValue={item?.purchaseCurrency ?? "EUR"}>
                    {itemCurrencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                {t("tradeStatus")}
                <select name="tradeStatus" defaultValue={item?.tradeStatus ?? "NOT_FOR_TRADE"}>
                  {tradeStatuses.map((tradeStatus) => (
                    <option key={tradeStatus} value={tradeStatus}>
                      {t(`tradeStatus${tradeStatus}`)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </details>

          <details open>
            <summary>{t("organization")}</summary>
            <fieldset disabled={inactive || saving} className="details-fields">
              <label>
                {t("tags")}
                <input name="tags" defaultValue={tagsInputValue(metadata?.tags ?? [])} />
                <span className="field-help">{t("tagsHelp")}</span>
              </label>
              <label>
                {t("location")}
                <select name="locationId" defaultValue={metadata?.location?.id ?? ""}>
                  <option value="">{t("noLocation")}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </details>

          <details>
            <summary>{t("identifiers")}</summary>
            <fieldset disabled={inactive || saving} className="details-fields">
              {identifiers.map((identifier, index) => (
                <div className="identifier-row" key={index}>
                  <label>
                    {t("identifierType")}
                    <select
                      value={identifier.type}
                      onChange={(event) =>
                        setIdentifiers((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, type: event.target.value } : entry,
                          ),
                        )
                      }
                    >
                      {identifierTypes.map((type) => (
                        <option key={type} value={type}>
                          {t(`identifierType${type}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <CodeScanner
                    label={t("identifierValue")}
                    value={identifier.value}
                    disabled={inactive || saving}
                    onChange={(value) =>
                      setIdentifiers((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, value } : entry,
                        ),
                      )
                    }
                    copy={{
                      start: t("scanStart"),
                      stop: t("scanStop"),
                      unavailable: t("scanUnavailable"),
                      proposal: t("scanProposal"),
                      confirm: t("scanConfirm"),
                      cameraError: t("scanError"),
                    }}
                  />
                  {identifiers.length > 1 && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        setIdentifiers((current) =>
                          current.filter((_, entryIndex) => entryIndex !== index),
                        )
                      }
                    >
                      {t("removeIdentifier")}
                    </button>
                  )}
                </div>
              ))}
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  setIdentifiers((current) => [...current, { type: "OTHER", value: "" }])
                }
              >
                {t("addIdentifier")}
              </button>
            </fieldset>
          </details>

          {fields.length > 0 && (
            <details open>
              <summary>{t("customFields")}</summary>
              <fieldset disabled={inactive || saving} className="details-fields custom-fields">
                {fields.map((field) => (
                  <CustomFieldControl
                    key={field.id}
                    field={field}
                    value={valueByField.get(field.id)}
                    t={t}
                  />
                ))}
              </fieldset>
            </details>
          )}

          <div className="form-actions">
            <button type="submit" disabled={inactive || saving}>
              {saving ? t("saving") : t("save")}
            </button>
            {item && (
              <>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={inactive}
                  onClick={archive}
                >
                  {t("archive")}
                </button>
                <button className="danger-button" type="button" onClick={remove}>
                  {t("delete")}
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

async function put(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function customValue(field: CustomFieldDefinition, form: FormData): CanonicalCustomFieldValue {
  const name = `field-${field.id}`;
  switch (field.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "DATE":
    case "SINGLE_SELECT":
    case "URL":
      return String(form.get(name) ?? "");
    case "INTEGER":
      return integerCustomFieldValue(String(form.get(name)));
    case "DECIMAL":
      return String(form.get(name) ?? "").replace(",", ".");
    case "BOOLEAN":
      return form.has(name);
    case "MULTI_SELECT":
      return form.getAll(name).map(String);
    case "MONEY": {
      const currency = String(form.get(`${name}-currency`) ?? "");
      const amountMinor = minorUnits(String(form.get(`${name}-amount`) ?? ""), currency);
      if (amountMinor === null) throw new Error("money");
      return { amountMinor, currency };
    }
  }
}

function CustomFieldControl({
  field,
  value,
  t,
}: {
  field: CustomFieldDefinition;
  value: CanonicalCustomFieldValue | undefined;
  t: Translation;
}) {
  const name = `field-${field.id}`;
  const enabled = value !== undefined;
  const wrapper = (control: ReactNode) => (
    <div className="custom-field">
      <label className="checkbox-label">
        <input type="checkbox" name={`field-enabled-${field.id}`} defaultChecked={enabled} />
        {t("setCustomField")}
      </label>
      {control}
    </div>
  );
  if (field.type === "LONG_TEXT") {
    return wrapper(
      <label>
        {field.name}
        <textarea name={name} defaultValue={typeof value === "string" ? value : ""} />
      </label>,
    );
  }
  if (field.type === "BOOLEAN") {
    return wrapper(
      <label className="checkbox-label">
        <input name={name} type="checkbox" defaultChecked={value === true} />
        {field.name}
      </label>,
    );
  }
  if (field.type === "SINGLE_SELECT") {
    return wrapper(
      <label>
        {field.name}
        <select name={name} defaultValue={typeof value === "string" ? value : ""}>
          <option value="">{t("chooseOption")}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>,
    );
  }
  if (field.type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value : [];
    return wrapper(
      <fieldset>
        <legend>{field.name}</legend>
        {field.options.map((option) => (
          <label className="checkbox-label" key={option}>
            <input
              name={name}
              type="checkbox"
              value={option}
              defaultChecked={selected.includes(option)}
            />
            {option}
          </label>
        ))}
      </fieldset>,
    );
  }
  if (field.type === "MONEY") {
    const money =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as { amountMinor: number; currency: string })
        : undefined;
    return wrapper(
      <div className="form-row">
        <label>
          {field.name}
          <input
            name={`${name}-amount`}
            inputMode="decimal"
            defaultValue={money ? majorUnits(money.amountMinor, money.currency) : ""}
          />
        </label>
        <label>
          {t("currency")}
          <select name={`${name}-currency`} defaultValue={money?.currency ?? "EUR"}>
            {itemCurrencyOptions.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
      </div>,
    );
  }
  const inputType =
    field.type === "DATE"
      ? "date"
      : field.type === "URL"
        ? "url"
        : field.type === "INTEGER"
          ? "number"
          : "text";
  return wrapper(
    <label>
      {field.name}
      <input
        aria-label={field.name}
        name={name}
        type={inputType}
        step={field.type === "INTEGER" ? "1" : undefined}
        inputMode={field.type === "DECIMAL" ? "decimal" : undefined}
        defaultValue={typeof value === "number" || typeof value === "string" ? String(value) : ""}
      />
    </label>,
  );
}

function ItemSummary({
  metadata,
  fields,
  locale,
  t,
}: {
  item: CollectibleItem;
  metadata: ItemMetadata;
  fields: CustomFieldDefinition[];
  locale: "de" | "en";
  t: Translation;
}) {
  return (
    <section className="management-card item-summary" aria-label={t("savedDetails")}>
      {metadata.customFieldValues.map((record) => {
        const field = fields.find((candidate) => candidate.id === record.fieldDefinitionId);
        return field ? (
          <p key={record.fieldDefinitionId}>
            {field.name}: {displayCustomFieldValue(record.value, field.type, locale)}
          </p>
        ) : null;
      })}
      {metadata.location && <p>{metadata.location.name}</p>}
      {metadata.identifiers.length > 0 && (
        <ul className="plain-list">
          {metadata.identifiers.map((identifier) => (
            <li key={identifier.id}>{identifier.value}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
