"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { createCollaborationManagementService } from "@sammlerraum/domain/collaboration/management-service";
import { managementRequest, managementError } from "./management-request";
type Listing = Awaited<
  ReturnType<ReturnType<typeof createCollaborationManagementService>["getSharedCollections"]>
>;
export function SharedCollections({ locale }: { locale: string }) {
  const t = useTranslations("Collaboration"),
    [data, setData] = useState<Listing | null>(null),
    [error, setError] = useState("");
  const load = useCallback(
    async (after?: string) => {
      try {
        const value = await managementRequest<Listing>(
          `/api/v1/collaboration/collections${after ? `?afterCollectionId=${after}` : ""}`,
        );
        setData((previous) =>
          after && previous
            ? { ...value, collections: [...previous.collections, ...value.collections] }
            : value,
        );
        setError("");
      } catch (problem) {
        setError(managementError(problem, t));
      }
    },
    [t],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="management-card wide">
      <h2>{t("sharedCollections")}</h2>
      <p>{t("sharedCollectionsIntro")}</p>
      {error && <p role="alert">{error}</p>}
      <ul className="collection-list">
        {data?.collections.map((collection) => (
          <li key={collection.id}>
            <Link href={`/${locale}/collections/${collection.id}/workspace`}>
              <strong>{collection.name}</strong>
              <span>{t(`role${collection.role}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {data && !data.collections.length && <p>{t("noSharedCollections")}</p>}
      {data?.next && (
        <button type="button" onClick={() => void load(data.next!)}>
          {t("loadMore")}
        </button>
      )}
    </section>
  );
}
