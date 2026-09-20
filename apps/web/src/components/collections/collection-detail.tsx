"use client";

import type { Collection, CollectionNode } from "@sammlerraum/contracts/collections";
import type {
  CustomFieldDefinition,
  CustomFieldType,
} from "@sammlerraum/contracts/custom-fields";
import type { CollectibleItem } from "@sammlerraum/contracts/items";
import type { LocationType, StorageLocation } from "@sammlerraum/contracts/locations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { errorMessage, VisibilitySelect } from "./collections-manager";

const fieldTypes: CustomFieldType[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "INTEGER",
  "DECIMAL",
  "DATE",
  "BOOLEAN",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "URL",
  "MONEY",
];
const locationTypes: LocationType[] = ["ROOM", "CABINET", "SHELF", "DRAWER", "BOX", "OTHER"];

type DetailData = {
  collection: Collection;
  nodes: CollectionNode[];
  customFields: CustomFieldDefinition[];
  locations: StorageLocation[];
  items: CollectibleItem[];
};

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw response;
  return response.json() as Promise<T>;
}

export function CollectionDetail({
  collectionId,
  locale,
}: {
  collectionId: string;
  locale: "de" | "en";
}) {
  const t = useTranslations("CollectionDetail");
  const common = useTranslations("Management");
  const router = useRouter();
  const [data, setData] = useState<DetailData>();
  const [error, setError] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("SHORT_TEXT");

  const load = useCallback(async () => {
    try {
      const [collectionBody, nodesBody, fieldsBody, locationsBody, itemsBody] = await Promise.all([
        read<{ collection: Collection }>(`/api/v1/collections/${collectionId}`),
        read<{ nodes: CollectionNode[] }>(`/api/v1/collections/${collectionId}/nodes`),
        read<{ customFields: CustomFieldDefinition[] }>(
          `/api/v1/collections/${collectionId}/custom-fields`,
        ),
        read<{ locations: StorageLocation[] }>("/api/v1/locations"),
        read<{ items: CollectibleItem[] }>(
          `/api/v1/items?collectionId=${encodeURIComponent(collectionId)}`,
        ),
      ]);
      setData({
        collection: collectionBody.collection,
        nodes: nodesBody.nodes,
        customFields: fieldsBody.customFields,
        locations: locationsBody.locations,
        items: itemsBody.items,
      });
      setError("");
    } catch (problem) {
      setError(
        problem instanceof Response
          ? await errorMessage(problem, common("error"))
          : common("error"),
      );
    }
  }, [collectionId, common]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(url: string, method: string, body?: unknown) {
    setError("");
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      setError(await errorMessage(response, common("error")));
      return false;
    }
    await load();
    return true;
  }

  if (!data) {
    return (
      <section className="management-shell">
        <p role="status">{common("loading")}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  async function updateCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(`/api/v1/collections/${collectionId}`, "PATCH", {
      name: form.get("name"),
      visibility: form.get("visibility"),
    });
  }

  async function deleteCollection() {
    if (!window.confirm(t("deleteConfirm"))) return;
    const response = await fetch(`/api/v1/collections/${collectionId}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await errorMessage(response, common("error")));
      return;
    }
    router.push(`/${locale}/collections`);
    router.refresh();
  }

  async function createNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const saved = await mutate(`/api/v1/collections/${collectionId}/nodes`, "POST", {
      name: form.get("name"),
      parentId: String(form.get("parentId") ?? "") || null,
      visibility: form.get("visibility"),
    });
    if (saved) element.reset();
  }

  async function createField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const options = String(form.get("options") ?? "")
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);
    const saved = await mutate(
      `/api/v1/collections/${collectionId}/custom-fields`,
      "POST",
      { name: form.get("name"), type: form.get("type"), options },
    );
    if (saved) {
      element.reset();
      setFieldType("SHORT_TEXT");
    }
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const saved = await mutate("/api/v1/locations", "POST", {
      name: form.get("name"),
      parentId: String(form.get("parentId") ?? "") || null,
      type: form.get("type"),
      visibility: form.get("visibility"),
    });
    if (saved) element.reset();
  }

  return (
    <section className="management-shell">
      <nav className="management-nav" aria-label={common("navigation")}>
        <Link href={`/${locale}/collections`}>{t("back")}</Link>
        <Link href={`/${locale}/account/profile`}>{common("account")}</Link>
      </nav>
      <header className="management-heading management-heading-row">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{data.collection.name}</h1>
        </div>
        <Link className="primary-link" href={`/${locale}/items/new?collectionId=${collectionId}`}>
          {t("addItem")}
        </Link>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="management-grid">
        <details className="management-card">
          <summary>{t("settings")}</summary>
          <form className="form-stack" onSubmit={updateCollection}>
            <label>
              {t("collectionName")}
              <input name="name" defaultValue={data.collection.name} maxLength={120} required />
            </label>
            <VisibilitySelect
              label={common("visibility")}
              name="visibility"
              value={data.collection.visibility}
              t={common}
            />
            <button type="submit">{common("save")}</button>
            <button className="danger-button" type="button" onClick={deleteCollection}>
              {t("delete")}
            </button>
          </form>
        </details>

        <section className="management-card" aria-labelledby="new-node-heading">
          <h2 id="new-node-heading">{t("newNode")}</h2>
          <form className="form-stack" onSubmit={createNode}>
            <label>
              {t("nodeName")}
              <input name="name" maxLength={120} required />
            </label>
            <ParentSelect
              label={t("nodeParent")}
              name="parentId"
              none={t("root")}
              records={data.nodes}
            />
            <VisibilitySelect label={common("visibility")} name="visibility" t={common} />
            <button type="submit">{t("createNode")}</button>
          </form>
        </section>

        <section className="management-card wide" aria-labelledby="hierarchy-heading">
          <h2 id="hierarchy-heading">{t("hierarchy")}</h2>
          {data.nodes.length === 0 ? (
            <p className="empty-state">{t("noNodes")}</p>
          ) : (
            <RecordTree
              records={data.nodes}
              render={(node) => (
                <NodeEditor node={node} all={data.nodes} mutate={mutate} t={t} common={common} />
              )}
            />
          )}
        </section>

        <section className="management-card" aria-labelledby="field-heading">
          <h2 id="field-heading">{t("newField")}</h2>
          <form className="form-stack" onSubmit={createField}>
            <label>
              {t("fieldName")}
              <input name="name" maxLength={120} required />
            </label>
            <label>
              {t("fieldType")}
              <select
                name="type"
                value={fieldType}
                onChange={(event) => setFieldType(event.target.value as CustomFieldType)}
              >
                {fieldTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`fieldType${type}`)}
                  </option>
                ))}
              </select>
            </label>
            {(fieldType === "SINGLE_SELECT" || fieldType === "MULTI_SELECT") && (
              <label>
                {t("fieldOptions")}
                <textarea name="options" required />
                <span className="field-help">{t("fieldOptionsHelp")}</span>
              </label>
            )}
            <button type="submit">{t("createField")}</button>
          </form>
          <ul className="plain-list">
            {data.customFields.map((field) => (
              <li key={field.id}>
                <strong>{field.name}</strong>
                <span>{t(`fieldType${field.type}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="management-card" aria-labelledby="location-heading">
          <h2 id="location-heading">{t("newLocation")}</h2>
          <form className="form-stack" onSubmit={createLocation}>
            <label>
              {t("locationName")}
              <input name="name" maxLength={120} required />
            </label>
            <ParentSelect
              label={t("locationParent")}
              name="parentId"
              none={t("locationRoot")}
              records={data.locations}
            />
            <label>
              {t("locationType")}
              <select name="type" defaultValue="OTHER">
                {locationTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`locationType${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <VisibilitySelect label={common("visibility")} name="visibility" t={common} />
            <button type="submit">{t("createLocation")}</button>
          </form>
        </section>

        <section className="management-card wide" aria-labelledby="locations-heading">
          <h2 id="locations-heading">{t("locations")}</h2>
          {data.locations.length === 0 ? (
            <p className="empty-state">{t("noLocations")}</p>
          ) : (
            <RecordTree
              records={data.locations}
              render={(location) => (
                <LocationEditor location={location} all={data.locations} mutate={mutate} t={t} />
              )}
            />
          )}
        </section>

        <section className="management-card wide" aria-labelledby="items-heading">
          <div className="section-heading-row">
            <h2 id="items-heading">{t("items")}</h2>
            <Link href={`/${locale}/items/new?collectionId=${collectionId}`}>{t("addItem")}</Link>
          </div>
          {data.items.length === 0 ? (
            <p className="empty-state">{t("noItems")}</p>
          ) : (
            <ul className="collection-list">
              {data.items.map((item) => (
                <li key={item.id}>
                  <Link href={`/${locale}/items/${item.id}`}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.quantity} · {common(`visibility${item.visibility}`)}
                      {item.archivedAt ? ` · ${t("archived")}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

type TreeRecord = { id: string; parentId: string | null; name: string };

function RecordTree<T extends TreeRecord>({
  records,
  render,
}: {
  records: T[];
  render(record: T): ReactNode;
}) {
  function branch(parentId: string | null): ReactNode {
    const children = records.filter((record) => record.parentId === parentId);
    if (children.length === 0) return null;
    return (
      <ul role={parentId === null ? "tree" : "group"} className="management-tree">
        {children.map((record) => (
          <li role="treeitem" key={record.id}>
            {render(record)}
            {branch(record.id)}
          </li>
        ))}
      </ul>
    );
  }
  return branch(null);
}

function ParentSelect<T extends TreeRecord>({
  label,
  name,
  none,
  records,
  value = "",
  exclude,
}: {
  label: string;
  name: string;
  none: string;
  records: T[];
  value?: string;
  exclude?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        <option value="">{none}</option>
        {records
          .filter((record) => record.id !== exclude)
          .map((record) => (
            <option key={record.id} value={record.id}>
              {record.name}
            </option>
          ))}
      </select>
    </label>
  );
}

type Mutation = (url: string, method: string, body?: unknown) => Promise<boolean>;
type Translation = (key: string) => string;

function NodeEditor({
  node,
  all,
  mutate,
  t,
  common,
}: {
  node: CollectionNode;
  all: CollectionNode[];
  mutate: Mutation;
  t: Translation;
  common: Translation;
}) {
  return (
    <details>
      <summary>{node.name}</summary>
      <form
        className="compact-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await mutate(`/api/v1/collections/${node.collectionId}/nodes/${node.id}`, "PATCH", {
            name: form.get("name"),
            parentId: String(form.get("parentId") ?? "") || null,
            visibility: form.get("visibility"),
          });
        }}
      >
        <label>
          {t("nodeName")}
          <input name="name" defaultValue={node.name} required />
        </label>
        <ParentSelect
          label={t("nodeParent")}
          name="parentId"
          none={t("root")}
          records={all}
          value={node.parentId ?? ""}
          exclude={node.id}
        />
        <VisibilitySelect
          label={common("visibility")}
          name="visibility"
          value={node.visibility}
          t={common}
        />
        <button type="submit">{common("save")}</button>
      </form>
    </details>
  );
}

function LocationEditor({
  location,
  all,
  mutate,
  t,
}: {
  location: StorageLocation;
  all: StorageLocation[];
  mutate: Mutation;
  t: Translation;
}) {
  return (
    <details>
      <summary>{location.name}</summary>
      <form
        className="compact-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await mutate(`/api/v1/locations/${location.id}`, "PATCH", {
            parentId: String(form.get("parentId") ?? "") || null,
          });
        }}
      >
        <ParentSelect
          label={t("locationParent")}
          name="parentId"
          none={t("locationRoot")}
          records={all}
          value={location.parentId ?? ""}
          exclude={location.id}
        />
        <button type="submit">{t("moveLocation")}</button>
      </form>
    </details>
  );
}
