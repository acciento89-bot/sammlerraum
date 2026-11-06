"use client";
import { PurchaseCosts } from "./purchase-costs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { DashboardData } from "@sammlerraum/contracts/dashboard";
import { MetadataCache, RequestChannel } from "./search-state";
import { observationTime } from "../valuations/valuation-money";
import { hydrateReferences, type Choice } from "./reference-picker";
import {
  formatDashboardInteger as integer,
  formatDashboardMoney as money,
} from "./dashboard-format";

export function DashboardResults({
  data,
  locale,
  cache,
}: {
  data: DashboardData;
  locale: "de" | "en";
  cache: MetadataCache;
}) {
  const t = useTranslations("Dashboard"),
    search = useTranslations("Search");
  const [labels, setLabels] = useState<Record<string, string>>({}),
    [metadataError, setMetadataError] = useState(false),
    [retry, setRetry] = useState(0);
  const channel = useRef(new RequestChannel());
  useEffect(() => {
    const request = channel.current.begin();
    setLabels({});
    setMetadataError(false);
    const ids = [...new Set(data.condition.groups.map((row) => row.categoryTemplateId))],
      batches: string[][] = [];
    for (let offset = 0; offset < ids.length; offset += 50)
      batches.push(ids.slice(offset, offset + 50));
    void Promise.all(
      batches.map((batch) =>
        cache.expand(request.signal, () =>
          hydrateReferences("categories", batch, "", locale, request.signal),
        ),
      ),
    )
      .then((groups) => {
        if (!channel.current.current(request.id)) return;
        const result: Record<string, string> = {};
        for (const choice of groups.flat()) {
          result[choice.id] = choice.label;
          cache.set(`${locale}:categories::${choice.id}`, choice);
        }
        setLabels(result);
      })
      .catch(() => {
        if (channel.current.current(request.id)) setMetadataError(true);
      });
    return () => channel.current.cancel();
  }, [data, locale, cache, retry]);
  const date = (value: string) => observationTime(value, "MILLISECOND", locale);
  const span = (from: string, to: string) =>
    from === to ? date(from) : `${date(from)} – ${date(to)}`;
  const pair = (value: { itemCount: number; unitCount: string }) =>
    t("pair", {
      items: integer(String(value.itemCount), locale),
      units: integer(value.unitCount, locale),
    });
  const category = (id: string) =>
    labels[id] ?? cache.get<Choice>(`${locale}:categories::${id}`)?.label ?? t("labelPending");
  const missingKeys = [
    "category",
    "condition",
    "acquisitionDate",
    "purchaseAmount",
    "ownEstimate",
    "grading",
    "catalogLink",
    "image",
    "document",
  ] as const;
  const exclusions = ["NO_ESTIMATE", "INSUFFICIENT_HISTORY", "NONCOMPARABLE_DENOMINATION"] as const;
  return (
    <div className="dashboard-content">
      <p>{t("ownedScope")}</p>
      <p className="field-help">{t("readAt", { time: date(data.readAt) })}</p>
      <dl className="dashboard-metrics">
        <div className="management-card">
          <dt>{t("selectedRows")}</dt>
          <dd data-testid="dashboard-selection-rows">
            {integer(String(data.selection.itemCount), locale)}
          </dd>
        </div>
        <div className="management-card">
          <dt>{t("selectedUnits")}</dt>
          <dd data-testid="dashboard-selection-units">
            {integer(data.selection.unitCount, locale)}
          </dd>
        </div>
        <div className="management-card">
          <dt>{t("matchedCollections")}</dt>
          <dd data-testid="dashboard-matched-collections">
            {integer(String(data.selection.matchedCollectionCount), locale)}
          </dd>
        </div>
        <div className="management-card">
          <dt>{t("ownedCollections")}</dt>
          <dd data-testid="dashboard-owned-collections">
            {integer(String(data.collections.ownedLiveCount), locale)}
          </dd>
          <p className="field-help">{t("ownedCollectionsHelp")}</p>
        </div>
      </dl>
      <section aria-labelledby="dashboard-values-heading">
        <h3 id="dashboard-values-heading">{t("ownValues")}</h3>
        <p>{t("manualBasis")}</p>
        <p role="status">{t(`states.${data.manualValues.state}`)}</p>
        <p>
          {t("valueCoverage", {
            contributors: pair(data.manualValues.contributors),
            missing: pair(data.manualValues.missing),
          })}
        </p>
        {(data.manualValues.groups ?? []).map((group) => (
          <article
            className="management-card"
            key={`${group.currency}:${group.minorUnitExponent}`}
            data-testid={`dashboard-manual-${group.currency}-${group.minorUnitExponent}`}
          >
            <h4>
              {group.currency} · {t("ownEstimate")}
            </h4>
            <p className="dashboard-money">
              {money(group.totalMinor, group.minorUnitExponent, locale)} {group.currency}
            </p>
            <p>{t("storedScale", { scale: group.minorUnitExponent })}</p>
            <p>
              {t("groupCoverage", {
                contributors: pair(group.contributors),
                other: pair(group.otherDenomination),
              })}
            </p>
            <p className="field-help">
              {t("observations", { time: span(group.observedAtFrom, group.observedAtTo) })}
            </p>
            <h5>{t("topOwnItems")}</h5>
            <p>
              {t("limited", {
                shown: group.topItems.items.length,
                eligible: group.topItems.eligibleCount,
              })}
              {group.topItems.hasMore ? ` · ${t("moreAvailable")}` : ""}
            </p>
            <ol>
              {group.topItems.items.map((item) => (
                <li key={item.id}>
                  <Link href={`/${locale}/items/${item.id}`} prefetch={false}>
                    {item.title}
                  </Link>
                  <p>
                    {t("valuedItem", {
                      quantity: integer(String(item.quantity), locale),
                      perUnit: money(item.perUnitMinor, group.minorUnitExponent, locale),
                      weighted: money(item.weightedMinor, group.minorUnitExponent, locale),
                      currency: group.currency,
                    })}
                  </p>
                  <p className="field-help">{date(item.observedAt)} UTC</p>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </section>
      <section aria-labelledby="dashboard-change-heading">
        <h3 id="dashboard-change-heading">{t("changeTitle")}</h3>
        <p>{t("changeHelp")}</p>
        <p role="status">{t(`states.${data.manualChange.state}`)}</p>
        <p>{t("comparable", { value: pair(data.manualChange.comparable) })}</p>
        <ul>
          {exclusions.map((key) => (
            <li key={key}>
              {t(`exclusions.${key}`)}: {pair(data.manualChange.excluded[key])}
            </li>
          ))}
        </ul>
        {(data.manualChange.groups ?? []).map((group) => (
          <article
            className="management-card"
            key={`${group.currency}:${group.minorUnitExponent}`}
            data-testid={`dashboard-change-${group.currency}-${group.minorUnitExponent}`}
          >
            <h4>
              {group.currency} · {t("ownEstimate")}
            </h4>
            <p className="dashboard-money">
              {money(group.deltaMinor, group.minorUnitExponent, locale)} {group.currency}
            </p>
            <p>{t("storedScale", { scale: group.minorUnitExponent })}</p>
            <p>{t("comparable", { value: pair(group.contributors) })}</p>
            <p>
              {t("previousObservations", {
                time: span(group.previousObservedAtFrom, group.previousObservedAtTo),
              })}
            </p>
            <p>
              {t("latestObservations", {
                time: span(group.latestObservedAtFrom, group.latestObservedAtTo),
              })}
            </p>
          </article>
        ))}
      </section>
      <section aria-labelledby="dashboard-trade-heading">
        <h3 id="dashboard-trade-heading">{t("tradeTitle")}</h3>
        <p>{t("tradeReady", { value: pair(data.tradeReady) })}</p>
        <ul>
          {data.trade.map((row) => (
            <li key={row.tradeStatus}>
              {search(`trade.${row.tradeStatus}`)}: {pair(row)}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="dashboard-missing-heading">
        <h3 id="dashboard-missing-heading">{t("missingTitle")}</h3>
        <p>{t("missingHelp")}</p>
        <dl className="dashboard-facts">
          {missingKeys.map((key) => (
            <div key={key}>
              <dt>{t(`missing.${key}`)}</dt>
              <dd>{pair(data.missing[key])}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="dashboard-condition-heading">
        <h3 id="dashboard-condition-heading">{t("conditionTitle")}</h3>
        <p>{t("conditionMissing", { value: pair(data.condition.missing) })}</p>
        {metadataError && (
          <p role="status">
            {t("metadataFailed")}{" "}
            <button className="secondary-button" onClick={() => setRetry((value) => value + 1)}>
              {search("retry")}
            </button>
          </p>
        )}
        {data.condition.groups.length ? (
          <ul>
            {data.condition.groups.map((group) => (
              <li key={`${group.categoryTemplateId}:${group.conditionOptionId}`}>
                <strong>
                  {category(group.categoryTemplateId)} ·{" "}
                  {locale === "de" ? group.labelDe : group.labelEn}
                </strong>
                <p>{pair(group)}</p>
                {!group.optionActive && <p>{t("optionInactive")}</p>}
                {!group.schemeActive && <p>{t("schemeInactive")}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("noConditionGroups")}</p>
        )}
      </section>
      <section aria-labelledby="dashboard-grading-heading">
        <h3 id="dashboard-grading-heading">{t("gradingTitle")}</h3>
        <p>
          {t("gradingCounts", {
            items: integer(String(data.grading.gradedItemCount), locale),
            records: integer(String(data.grading.gradingRecordCount), locale),
          })}
        </p>
        <p className="field-help">{t("gradingHelp")}</p>
        <ul>
          {data.grading.groups.map((row, index) => (
            <li key={index}>
              {row.providerKey} · {row.grade}:{" "}
              {t("gradingCounts", {
                items: integer(String(row.itemCount), locale),
                records: integer(String(row.recordCount), locale),
              })}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="dashboard-collections-heading">
        <h3 id="dashboard-collections-heading">{t("topCollections")}</h3>
        <p>{t("collectionRankHelp")}</p>
        <p>
          {t("limited", {
            shown: data.topCollections.items.length,
            eligible: data.topCollections.eligibleCount,
          })}
          {data.topCollections.hasMore ? ` · ${t("moreAvailable")}` : ""}
        </p>
        <ol>
          {data.topCollections.items.map((row) => (
            <li key={row.id}>
              <Link href={`/${locale}/collections/${row.id}`} prefetch={false}>
                {row.name}
              </Link>
              <p>{pair(row)}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="dashboard-recent-heading">
        <h3 id="dashboard-recent-heading">{t("recentTitle")}</h3>
        <p>{t("recentHelp")}</p>
        <p>
          {t("limited", {
            shown: data.recentAdditions.items.length,
            eligible: data.recentAdditions.eligibleCount,
          })}
          {data.recentAdditions.hasMore ? ` · ${t("moreAvailable")}` : ""}
        </p>
        <ol>
          {data.recentAdditions.items.map((row) => (
            <li key={row.id}>
              <Link href={`/${locale}/items/${row.id}`} prefetch={false}>
                {row.title}
              </Link>
              <p>
                {t("recentItem", {
                  quantity: integer(String(row.quantity), locale),
                  time: date(row.createdAt),
                })}
              </p>
            </li>
          ))}
        </ol>
      </section>
      {"coverage" in data.purchaseTotals && (
        <PurchaseCosts data={data.purchaseTotals} locale={locale} />
      )}
      <section aria-labelledby="dashboard-capabilities-heading">
        <h3 id="dashboard-capabilities-heading">{t("capabilitiesTitle")}</h3>
        <p>{t("capabilitiesHelp")}</p>
        <dl className="dashboard-facts" data-testid="dashboard-unavailable">
          {!("coverage" in data.purchaseTotals) && (
            <div>
              <dt>{t("purchaseTotals")}</dt>
              <dd>{t("purchaseUnavailable")}</dd>
            </div>
          )}
          <div>
            <dt>{t("marketValues")}</dt>
            <dd>{t("marketUnavailable")}</dd>
          </div>
          <div>
            <dt>{t("duplicates")}</dt>
            <dd>{t("relationsUnavailable")}</dd>
          </div>
          <div>
            <dt>{t("wishlist")}</dt>
            <dd>{t("relationsUnavailable")}</dd>
          </div>
          <div>
            <dt>{t("shared")}</dt>
            <dd>{t("sharedUnavailable")}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
