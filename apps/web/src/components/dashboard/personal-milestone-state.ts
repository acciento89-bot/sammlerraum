import {
  parsePersonalMilestoneMutation,
  PersonalMilestoneDtoSchema,
  milestoneFail,
  type PersonalMilestoneDto,
  type PersonalMilestonePage,
} from "@sammlerraum/contracts/personal-milestones";
export type MilestoneDraft = {
  kind: "create" | "update";
  title: string;
  milestoneDate: string;
  original: Readonly<PersonalMilestoneDto> | null;
};
export function emptyMilestoneDraft(): MilestoneDraft {
  return { kind: "create", title: "", milestoneDate: "", original: null };
}
export function editMilestoneDraft(record: PersonalMilestoneDto): MilestoneDraft {
  return {
    kind: "update",
    title: record.title,
    milestoneDate: record.milestoneDate,
    original: Object.freeze({ ...record }),
  };
}
export function milestoneDraftDirty(draft: MilestoneDraft | null) {
  return (
    !!draft &&
    (draft.original
      ? draft.title !== draft.original.title || draft.milestoneDate !== draft.original.milestoneDate
      : !!draft.title || !!draft.milestoneDate)
  );
}
export function snapshotMilestoneDraft(draft: MilestoneDraft) {
  const input = Object.freeze(
    parsePersonalMilestoneMutation({ title: draft.title, milestoneDate: draft.milestoneDate }),
  );
  if (draft.kind === "update") {
    const result = PersonalMilestoneDtoSchema.safeParse(draft.original);
    if (!result.success) return milestoneFail("MILESTONE_INVALID");
    return Object.freeze({ kind: "update" as const, input, original: Object.freeze(result.data) });
  }
  if (draft.original !== null) return milestoneFail("MILESTONE_INVALID");
  return Object.freeze({ kind: "create" as const, input, original: null });
}
export function milestoneOnPage(
  page: PersonalMilestonePage,
  original: Readonly<PersonalMilestoneDto>,
):
  | { status: "not_on_page" }
  | { status: "older" }
  | { status: "current"; record: PersonalMilestoneDto } {
  const record = page.items.find((row) => row.id === original.id);
  if (!record) return { status: "not_on_page" };
  if (record.revision < original.revision) return { status: "older" };
  return { status: "current", record };
}
