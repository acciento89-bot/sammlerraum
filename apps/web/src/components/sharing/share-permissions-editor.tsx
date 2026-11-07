"use client";
import { useTranslations } from "next-intl";
import { SharePermissionsSchema } from "@sammlerraum/contracts/sharing";
import type { z } from "zod";
export type SharePermissions = z.infer<typeof SharePermissionsSchema>;
const booleans = [
  "images",
  "values",
  "privateNotes",
  "storageLocation",
  "insurance",
  "purchaseReceipts",
  "export",
] as const;
export function SharePermissionsEditor({
  value,
  onChange,
  documents,
  moreDocuments,
}: {
  value: SharePermissions;
  onChange: (value: SharePermissions) => void;
  documents: { id: string; itemId: string; name: string }[];
  moreDocuments: boolean;
}) {
  const t = useTranslations("Collaboration");
  return (
    <fieldset className="collaboration-permissions">
      <legend>{t("selectedContents")}</legend>
      <p>{t("safeDefaults")}</p>
      {booleans.map((key) => (
        <label className="checkbox-label" key={key}>
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
          />
          {t(key)}
        </label>
      ))}
      <details>
        <summary>{t("selectedDocuments")}</summary>
        {documents.map((doc) => (
          <label className="checkbox-label" key={doc.id}>
            <input
              type="checkbox"
              checked={value.documents.includes(doc.id)}
              onChange={(event) =>
                onChange({
                  ...value,
                  documents: event.target.checked
                    ? [...value.documents, doc.id]
                    : value.documents.filter((id) => id !== doc.id),
                })
              }
            />
            {doc.name}
          </label>
        ))}
        <label>
          {t("documentIds")}
          <textarea
            value={value.documents.join("\n")}
            onChange={(event) =>
              onChange({ ...value, documents: event.target.value.split(/\s+/).filter(Boolean) })
            }
            rows={3}
          />
        </label>
        {moreDocuments && <p>{t("moreTargets")}</p>}
      </details>
    </fieldset>
  );
}
