import type {
  CatalogText,
  CatalogSource,
  CatalogAttributeDefinition,
  CanonicalCatalogAttributeValue,
} from "@sammlerraum/contracts/catalog";
import { integerCustomFieldValue, minorUnits } from "../items/item-form-values";
export function readText(form: FormData): CatalogText {
  return {
    language: String(form.get("textLanguage")),
    title: String(form.get("title")),
    description: String(form.get("description") ?? ""),
    translations: Array.from({ length: Number(form.get("translationCount") ?? 0) }, (_, index) => ({
      language: String(form.get(`translationLanguage-${index}`)),
      title: String(form.get(`translationTitle-${index}`)),
      description: String(form.get(`translationDescription-${index}`) ?? ""),
    })),
  };
}
export function readSources(form: FormData): CatalogSource[] {
  return Array.from({ length: Number(form.get("sourceCount") ?? 0) }, (_, index) => {
    const source: CatalogSource = {};
    for (const field of ["url", "note", "license"] as const) {
      const value = String(form.get(`source-${field}-${index}`) ?? "").trim();
      if (value) source[field] = value;
    }
    return source;
  });
}
export function readAttributes(form: FormData, definitions: CatalogAttributeDefinition[]) {
  return definitions
    .filter((field) => form.has(`attribute-enabled-${field.id}`))
    .map((field) => {
      const name = `attribute-${field.id}`;
      let value: CanonicalCatalogAttributeValue = String(form.get(name) ?? "");
      if (field.type === "BOOLEAN") value = form.has(name);
      if (field.type === "INTEGER") value = integerCustomFieldValue(String(form.get(name) ?? ""));
      if (field.type === "MULTI_SELECT") value = form.getAll(name).map(String);
      if (field.type === "MONEY") {
        const currency = String(form.get(`${name}-currency`));
        const amount = minorUnits(String(form.get(`${name}-amount`)), currency);
        if (amount === null) throw new Error("Invalid amount");
        value = { amountMinor: amount, currency };
      }
      return { definitionId: field.id, value };
    });
}
