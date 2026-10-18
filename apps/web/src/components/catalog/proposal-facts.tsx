"use client";
import { useTranslations } from "next-intl";
import type { CatalogEntryRevision, CategoryTemplate } from "@sammlerraum/contracts/catalog";
import type { CatalogProposalOperation } from "@sammlerraum/contracts/catalog-proposals";
import { CatalogFacts, TextFacts, SourceFacts, AttributeFacts } from "./catalog-facts";
import { variantLabel } from "./catalog-search";
import type { Locale } from "./catalog-client";
export type Proposal = {
  id: string;
  targetEntryId: string | null;
  baseRevision: number | null;
  patch: CatalogProposalOperation;
  summary: string;
  source?: { url?: string; note?: string; license?: string } | null;
  state: "PENDING" | "APPROVED" | "REJECTED" | "CONFLICT";
  createdAt: string;
  moderatedAt: string | null;
  decisionReason: string | null;
  resultEntryId: string | null;
  resultRevision: number | null;
};
export function ProposalFacts({
  proposal,
  base,
  category,
  locale,
}: {
  proposal: Proposal;
  base: CatalogEntryRevision | null;
  category: CategoryTemplate | null;
  locale: Locale;
}) {
  const t = useTranslations("Catalog");
  const patch = proposal.patch;
  const text = "input" in patch && "text" in patch.input ? patch.input.text : undefined;
  const sources = "input" in patch && "sources" in patch.input ? patch.input.sources : undefined;
  const attributes =
    "input" in patch && "attributes" in patch.input ? patch.input.attributes : undefined;
  return (
    <>
      <h3>{t("submittedValues")}</h3>
      <p>{t(`operations.${patch.kind}`)}</p>
      {text && <TextFacts text={text} locale={locale} />}{" "}
      {(patch.kind === "ADD_VARIANT" || patch.kind === "UPDATE_VARIANT") && (
        <p>{variantLabel(patch.input, locale)}</p>
      )}
      {(patch.kind === "ADD_IDENTIFIER" || patch.kind === "UPDATE_IDENTIFIER") && (
        <p>
          {patch.input.namespace} · {patch.input.type} · {patch.input.value}
          {patch.input.variantId &&
            base?.state.variants.find((row) => row.id === patch.input.variantId) && (
              <>
                {" "}
                ·{" "}
                {variantLabel(
                  base.state.variants.find((row) => row.id === patch.input.variantId)!,
                  locale,
                )}
              </>
            )}
        </p>
      )}
      {patch.kind === "REMOVE_IDENTIFIER" && (
        <p>
          {t("removingReference")}:{" "}
          {base?.state.identifiers.find((row) => row.id === patch.identifierId)?.value ??
            t("unavailableAttribute")}
        </p>
      )}
      {attributes && <AttributeFacts attributes={attributes} category={category} locale={locale} />}{" "}
      {sources && <SourceFacts sources={sources} />}{" "}
      {base && (
        <details>
          <summary>
            {t("beforeChange")} · {t("revision")} {base.revision}
          </summary>
          <CatalogFacts state={base.state} category={category} locale={locale} />
        </details>
      )}
    </>
  );
}
