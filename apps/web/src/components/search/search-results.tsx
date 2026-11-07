"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { type z } from "zod";
import { ItemSearchPageSchema } from "@sammlerraum/contracts/item-search";
import { hydrateReferences, type Choice } from "./reference-picker";
import { MetadataCache, RequestChannel } from "./search-state";
export type SearchPageData = z.infer<typeof ItemSearchPageSchema>;
export function SearchResults({
  data,
  locale,
  cache,
}: {
  data: SearchPageData;
  locale: "de" | "en";
  cache: MetadataCache;
}) {
  const t = useTranslations("Search");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const channel = useRef(new RequestChannel());
  useEffect(() => {
    const request = channel.current.begin();
    setError(false);
    setLabels({});
    const collections = [...new Set(data.items.map((item) => item.collectionId))];
    const categories = [
      ...new Set(
        data.items.flatMap((item) => (item.categoryTemplateId ? [item.categoryTemplateId] : [])),
      ),
    ];
    void Promise.all([
      cache.expand(request.signal, () =>
        hydrateReferences("collections", collections, "", locale, request.signal),
      ),
      cache.expand(request.signal, () =>
        hydrateReferences("categories", categories, "", locale, request.signal),
      ),
    ])
      .then(([collectionLabels, categoryLabels]) => {
        if (!channel.current.current(request.id)) return;
        const result: Record<string, string> = {};
        for (const [source, choices] of [
          ["collections", collectionLabels],
          ["categories", categoryLabels],
        ] as const)
          for (const choice of choices) {
            cache.set(`${locale}:${source}::${choice.id}`, choice);
            result[choice.id] = choice.label;
          }
        setLabels(result);
      })
      .catch(() => {
        if (channel.current.current(request.id)) setError(true);
      });
    return () => channel.current.cancel();
  }, [data, locale, cache, retry]);
  return (
    <>
      <p className="search-count" data-testid="search-total">
        {t("total", { count: data.total })}
      </p>
      <p>{t("ownedScope")}</p>
      <p className="field-help">
        {t("liveRead", {
          time: new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "medium",
            timeZone: "UTC",
          }).format(new Date(data.readAt)),
        })}
      </p>
      {error && (
        <p role="status">
          {t("referenceFailed")}{" "}
          <button type="button" className="secondary-button" onClick={() => setRetry(retry + 1)}>
            {t("retry")}
          </button>
        </p>
      )}
      {!data.items.length ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="search-results">
          {data.items.map((item) => (
            <li className="management-card" key={item.id}>
              <h3>
                <Link href={`/${locale}/items/${item.id}`} prefetch={false}>
                  {item.title}
                </Link>
              </h3>
              <dl>
                <div>
                  <dt>{t("collection")}</dt>
                  <dd>
                    {labels[item.collectionId] ??
                      cache.get<Choice>(`${locale}:collections::${item.collectionId}`)?.label ??
                      t("labelPending")}
                  </dd>
                </div>
                {item.categoryTemplateId && (
                  <div>
                    <dt>{t("category")}</dt>
                    <dd>{labels[item.categoryTemplateId] ?? t("labelPending")}</dd>
                  </div>
                )}
                <div>
                  <dt>{t("quantity")}</dt>
                  <dd>{new Intl.NumberFormat(locale).format(item.quantity)}</dd>
                </div>
                <div>
                  <dt>{t("lifecycle")}</dt>
                  <dd>
                    {t(
                      `lifecycles.${item.disposedAt ? "DISPOSED" : item.archivedAt ? "ARCHIVED" : "ACTIVE"}`,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("families.visibility")}</dt>
                  <dd>{t(`visibility.${item.visibility}`)}</dd>
                </div>
                <div>
                  <dt>{t("families.tradeStatus")}</dt>
                  <dd>{t(`trade.${item.tradeStatus}`)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
