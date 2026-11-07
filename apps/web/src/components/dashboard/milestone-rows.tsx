"use client";
import { useTranslations } from "next-intl";
import type { PersonalMilestoneDto } from "@sammlerraum/contracts/personal-milestones";
import { observationTime } from "../valuations/valuation-money";
export function MilestoneRows({
  items,
  locale,
  onEdit,
  onDelete,
  busy = false,
  metadata = false,
}: {
  items: PersonalMilestoneDto[];
  locale: "de" | "en";
  onEdit?: (row: PersonalMilestoneDto) => void;
  onDelete?: (row: PersonalMilestoneDto) => void;
  busy?: boolean;
  metadata?: boolean;
}) {
  const t = useTranslations("Milestones");
  return (
    <ul className="milestone-list">
      {items.map((row) => (
        <li className="management-card" key={row.id} data-testid="milestone-row">
          <article aria-label={row.title}>
            <h3 className="milestone-title">{row.title}</h3>
            <p>
              <span>{t("enteredDate")}: </span>
              <time dateTime={row.milestoneDate}>{row.milestoneDate}</time>
            </p>
            {metadata && (
              <>
                <p className="field-help">
                  {t("recorded", { time: observationTime(row.createdAt, "MILLISECOND", locale) })}
                </p>
                <p className="field-help">
                  {t("edited", { time: observationTime(row.updatedAt, "MILLISECOND", locale) })}
                </p>
              </>
            )}
            <div className="milestone-actions">
              {onEdit && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  aria-label={t("editNamed", { title: row.title })}
                  onClick={() => onEdit(row)}
                >
                  {t("edit")}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  aria-label={t("deleteNamed", { title: row.title })}
                  onClick={() => onDelete(row)}
                >
                  {t("delete")}
                </button>
              )}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
