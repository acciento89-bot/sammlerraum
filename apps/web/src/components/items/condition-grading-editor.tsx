"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemCondition } from "@sammlerraum/contracts/condition";
import type { Grading } from "@sammlerraum/contracts/grading";
import type { ItemCatalogLink } from "@sammlerraum/contracts/catalog-reads";
import { catalogRequest, catalogError, type Locale } from "../catalog/catalog-client";
import { CatalogLinker } from "../catalog/catalog-linker";
import { ConditionEditor } from "./condition-editor";
import { GradingEditor } from "./grading-editor";
type State = { condition: ItemCondition; gradings: Grading[]; link: ItemCatalogLink };
export function ConditionGradingEditor({
  itemId,
  locale,
  quantity,
  readOnly,
}: {
  itemId: string;
  locale: Locale;
  quantity: number;
  readOnly: boolean;
}) {
  const t = useTranslations("Catalog");
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const [condition, gradings, link] = await Promise.all([
        catalogRequest<{ condition: ItemCondition }>(`/api/v1/items/${itemId}/condition`),
        catalogRequest<{ gradings: Grading[] }>(`/api/v1/items/${itemId}/gradings`),
        catalogRequest<{ link: ItemCatalogLink }>(`/api/v1/items/${itemId}/catalog-link`),
      ]);
      if (ticket === generation.current) {
        setData({ ...condition, ...gradings, ...link });
        setError("");
      }
    } catch (problem) {
      if (ticket === generation.current) setError(catalogError(problem, t));
      throw problem;
    }
  }, [itemId, t]);
  useEffect(() => {
    void reload().catch(() => undefined);
    return () => {
      generation.current++;
    };
  }, [reload]);
  return (
    <div className="item-reference-editors">
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => void reload().catch(() => undefined)}>
            {t("retry")}
          </button>
        </p>
      )}
      {data ? (
        <>
          <CatalogLinker
            itemId={itemId}
            locale={locale}
            link={data.link}
            readOnly={readOnly}
            onChange={reload}
          />
          <ConditionEditor
            itemId={itemId}
            locale={locale}
            condition={data.condition}
            linked={Boolean(data.link.catalogEntryId)}
            readOnly={readOnly}
            onChange={reload}
          />
          <GradingEditor
            itemId={itemId}
            gradings={data.gradings}
            quantity={quantity}
            readOnly={readOnly}
            onChange={reload}
          />
        </>
      ) : (
        !error && <p role="status">{t("loading")}</p>
      )}
    </div>
  );
}
