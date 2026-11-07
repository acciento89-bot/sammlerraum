"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PersonalMilestoneError,
  type PersonalMilestoneDto,
} from "@sammlerraum/contracts/personal-milestones";
import { CollectorNavigation } from "../search/collector-navigation";
import { SearchLabel } from "../search/search-label";
import { RequestChannel } from "../search/search-state";
import { SearchHttpError } from "../search/search-client";
import { useCollectorConfirmation } from "../search/use-saved-confirmation";
import { containDialogTab } from "../search/dialog-keyboard";
import { DeferredFocus } from "../search/deferred-focus";
import { observationTime } from "../valuations/valuation-money";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  MilestoneMutationUnknownError,
} from "./personal-milestone-client";
import {
  emptyMilestoneDraft,
  editMilestoneDraft,
  milestoneDraftDirty,
  snapshotMilestoneDraft,
  milestoneOnPage,
  type MilestoneDraft,
} from "./personal-milestone-state";
import { usePersonalMilestones } from "./use-personal-milestones";
import { MilestoneRows } from "./milestone-rows";
type Operation = "create" | "update" | "delete";
type Editor = {
  draft: MilestoneDraft | null;
  target: Readonly<PersonalMilestoneDto> | null;
  busy: boolean;
  unknown: Operation | null;
  problem: string;
  receipt: { operation: Operation; id: string; revision?: number } | null;
};
const initialEditor = (): Editor => ({
  draft: null,
  target: null,
  busy: false,
  unknown: null,
  problem: "",
  receipt: null,
});
function errorKey(error: unknown) {
  if (error instanceof PersonalMilestoneError) return "invalid";
  if (error instanceof SearchHttpError) {
    if (error.status === 409) return "conflict";
    if (error.status === 404) return "notFound";
    if (error.status === 401) return "session";
    if (error.status === 403) return "forbidden";
    if ([400, 413, 414].includes(error.status)) return "invalid";
  }
  return "failed";
}
export function PersonalMilestoneManager({
  actor,
  locale,
}: {
  actor: string;
  locale: "de" | "en";
}) {
  const t = useTranslations("Milestones"),
    write = useRef(new RequestChannel()),
    focus = useRef(new DeferredFocus()),
    titleInput = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    deleteDialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<Editor>(initialEditor),
    editorRef = useRef(editor);
  editorRef.current = editor;
  const [deleteOpen, setDeleteOpen] = useState(false),
    [inspection, setInspection] = useState<{
      nonce: number;
      result: ReturnType<typeof milestoneOnPage>;
    } | null>(null);
  const { state, load, invalidate, closed } = usePersonalMilestones(actor, 20, () => {
    write.current.close();
    focus.current.cancel();
    setEditor(initialEditor());
    setDeleteOpen(false);
    setInspection(null);
  });
  const protectedDraft = milestoneDraftDirty(editor.draft) || editor.busy || !!editor.unknown;
  const confirmation = useCollectorConfirmation(
    protectedDraft,
    () => {
      if (editorRef.current.busy) return false;
      if (deleteDialog.current?.open) {
        deleteDialog.current.close();
        setDeleteOpen(false);
        return () => setDeleteOpen(true);
      }
    },
    {
      copy: {
        title: t("discardTitle"),
        body: editor.unknown ? t("discardUnknown") : t("discardHelp"),
        cancel: t("cancel"),
        discard: t("discard"),
      },
      onDiscard: () => {
        setEditor(initialEditor());
        setDeleteOpen(false);
        setInspection(null);
        focus.current.cancel();
      },
    },
  );
  useEffect(() => {
    if (deleteOpen) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleteOpen]);
  useEffect(
    () => () => {
      write.current.cancel();
      focus.current.cancel();
    },
    [],
  );
  function proceed(action: () => void) {
    if (closed || editorRef.current.busy) return;
    if (protectedDraft) confirmation.confirm(action);
    else action();
  }
  function begin(row?: PersonalMilestoneDto) {
    if (row && (state.stale || state.loading || !!state.error)) return;
    proceed(() => {
      setEditor({
        ...initialEditor(),
        draft: row ? editMilestoneDraft(row) : emptyMilestoneDraft(),
      });
      setDeleteOpen(false);
      setInspection(null);
      focus.current.afterRender(() => titleInput.current);
    });
  }
  function remove(row: PersonalMilestoneDto) {
    if (state.stale || state.loading || !!state.error) return;
    opener.current = document.activeElement as HTMLElement;
    proceed(() => {
      setEditor({ ...initialEditor(), target: Object.freeze({ ...row }) });
      setInspection(null);
      setDeleteOpen(true);
    });
  }
  function dismiss() {
    if (editorRef.current.busy) return;
    proceed(() => {
      setEditor(initialEditor());
      setDeleteOpen(false);
      setInspection(null);
      focus.current.afterRender(() => heading.current);
    });
  }
  async function refresh(cursor?: string, same = false) {
    setInspection(null);
    return load(cursor, same);
  }
  async function inspect() {
    if (closed || editorRef.current.busy) return;
    const original = editorRef.current.draft?.original ?? editorRef.current.target;
    setInspection(null);
    const result = await load();
    const current = editorRef.current.draft?.original ?? editorRef.current.target;
    if (result && original && current?.id === original.id && current.revision === original.revision)
      setInspection({ nonce: result.nonce, result: milestoneOnPage(result.page, original) });
  }
  async function save() {
    if (
      closed ||
      write.current.closed ||
      editorRef.current.busy ||
      editorRef.current.unknown ||
      ["conflict", "notFound"].includes(editorRef.current.problem) ||
      !editorRef.current.draft
    )
      return;
    let submitted: ReturnType<typeof snapshotMilestoneDraft>;
    try {
      submitted = snapshotMilestoneDraft(editorRef.current.draft);
    } catch {
      setEditor((old) => ({ ...old, problem: "invalid" }));
      focus.current.afterRender(() => titleInput.current);
      return;
    }
    const request = write.current.begin();
    setEditor((old) => ({ ...old, busy: true, problem: "", receipt: null }));
    setInspection(null);
    invalidate();
    try {
      const row =
        submitted.kind === "update" && submitted.original
          ? await updateMilestone(submitted.original, submitted.input, request.signal)
          : await createMilestone(submitted.input, request.signal);
      if (!write.current.current(request.id)) return;
      setEditor({
        ...initialEditor(),
        receipt: { operation: submitted.kind, id: row.id, revision: row.revision },
      });
      focus.current.afterRender(() => heading.current);
      await load();
    } catch (error) {
      if (!write.current.current(request.id)) return;
      setEditor((old) => ({
        ...old,
        busy: false,
        unknown: error instanceof MilestoneMutationUnknownError ? error.operation : null,
        problem: error instanceof MilestoneMutationUnknownError ? "" : errorKey(error),
      }));
    }
  }
  async function confirmDelete() {
    if (
      closed ||
      write.current.closed ||
      editorRef.current.busy ||
      editorRef.current.unknown ||
      !editorRef.current.target
    )
      return;
    const target = editorRef.current.target,
      request = write.current.begin();
    setEditor((old) => ({ ...old, busy: true, problem: "", receipt: null }));
    setInspection(null);
    invalidate();
    try {
      await deleteMilestone(target, request.signal);
      if (!write.current.current(request.id)) return;
      setEditor({ ...initialEditor(), receipt: { operation: "delete", id: target.id } });
      setDeleteOpen(false);
      focus.current.afterRender(() => heading.current);
      await load();
    } catch (error) {
      if (!write.current.current(request.id)) return;
      setEditor((old) => ({
        ...old,
        busy: false,
        unknown: error instanceof MilestoneMutationUnknownError ? "delete" : null,
        problem: error instanceof MilestoneMutationUnknownError ? "" : errorKey(error),
      }));
    }
  }
  const latest = inspection?.nonce === state.nonce ? inspection.result : null;
  return (
    <section className="management-shell milestone-manager">
      <CollectorNavigation locale={locale} current="milestones" />
      <Link href={`/${locale}/dashboard`} prefetch={false}>
        {t("backDashboard")}
      </Link>
      <header className="management-heading">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 ref={heading} tabIndex={-1}>
          {t("title")}
        </h1>
        <p>{t("scope")}</p>
        <p>{t("dateHelp")}</p>
      </header>
      {state.error === "session" ? (
        <div role="alert">
          <p>{t("session")}</p>
          <Link href={`/${locale}/login`} prefetch={false}>
            {t("signIn")}
          </Link>
        </div>
      ) : (
        <>
          <div className="milestone-actions">
            <button type="button" disabled={editor.busy || closed} onClick={() => begin()}>
              {t("new")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={state.loading || editor.busy || closed}
              onClick={() => void refresh(state.cursor, true)}
            >
              {t("refresh")}
            </button>
          </div>
          {editor.receipt && (
            <p role="status" data-testid="milestone-ack">
              {t(`ack.${editor.receipt.operation}`)}
              {editor.receipt.revision
                ? ` · ${t("revision", { revision: editor.receipt.revision })}`
                : ""}
            </p>
          )}
          {editor.unknown && (
            <div role="alert" data-testid="milestone-unknown">
              <p>{t(`unknown.${editor.unknown}`)}</p>
              <button type="button" disabled={state.loading} onClick={() => void inspect()}>
                {t("inspect")}
              </button>
            </div>
          )}
          {editor.problem && (
            <div role="alert">
              <p>{t(`errors.${editor.problem}`)}</p>
              {["conflict", "notFound"].includes(editor.problem) && (
                <button type="button" disabled={state.loading} onClick={() => void inspect()}>
                  {t("inspect")}
                </button>
              )}
            </div>
          )}
          {latest && (
            <section className="management-card" aria-label={t("latestTitle")}>
              <h2>{t("latestTitle")}</h2>
              {latest.status === "current" ? (
                <>
                  <p>{latest.record.title}</p>
                  <p>
                    <time dateTime={latest.record.milestoneDate}>
                      {latest.record.milestoneDate}
                    </time>
                  </p>
                  <p>{t("revision", { revision: latest.record.revision })}</p>
                  <button type="button" onClick={() => begin(latest.record)}>
                    {t("adopt")}
                  </button>
                </>
              ) : (
                <p>{latest.status === "not_on_page" ? t("notOnPage") : t("olderRead")}</p>
              )}
            </section>
          )}
          {editor.draft && (
            <form
              className="management-card milestone-editor"
              aria-label={editor.draft.kind === "create" ? t("createTitle") : t("editTitle")}
              aria-busy={editor.busy}
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <h2>{editor.draft.kind === "create" ? t("createTitle") : t("editTitle")}</h2>
              <SearchLabel>
                {t("name")}
                <input
                  ref={titleInput}
                  required
                  maxLength={240}
                  value={editor.draft.title}
                  disabled={editor.busy || !!editor.unknown}
                  onChange={(event) => {
                    const title = event.target.value;
                    setEditor((old) => ({
                      ...old,
                      problem: ["conflict", "notFound"].includes(old.problem) ? old.problem : "",
                      draft: old.draft ? { ...old.draft, title } : null,
                    }));
                  }}
                />
              </SearchLabel>
              <p className="field-help">{t("titleHelp")}</p>
              <SearchLabel>
                {t("enteredDate")}
                <input
                  type="date"
                  required
                  min="0001-01-01"
                  max="9999-12-31"
                  value={editor.draft.milestoneDate}
                  disabled={editor.busy || !!editor.unknown}
                  onChange={(event) => {
                    const milestoneDate = event.target.value;
                    setEditor((old) => ({
                      ...old,
                      problem: ["conflict", "notFound"].includes(old.problem) ? old.problem : "",
                      draft: old.draft ? { ...old.draft, milestoneDate } : null,
                    }));
                  }}
                />
              </SearchLabel>
              {editor.draft.original && (
                <p className="field-help">
                  {t("revision", { revision: editor.draft.original.revision })}
                </p>
              )}
              <div className="milestone-actions">
                <button
                  type="submit"
                  disabled={
                    editor.busy ||
                    !!editor.unknown ||
                    ["conflict", "notFound"].includes(editor.problem)
                  }
                >
                  {editor.busy ? t("saving") : t("save")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={editor.busy}
                  onClick={dismiss}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          )}
          <section aria-labelledby="milestone-list-heading" aria-busy={state.loading}>
            <h2 id="milestone-list-heading">{t("listTitle")}</h2>
            {state.loading && <p role="status">{t("loading")}</p>}
            {state.error && (
              <div role="alert">
                <p>{t("loadFailed")}</p>
                <button type="button" onClick={() => void refresh(state.cursor, true)}>
                  {t("retry")}
                </button>
              </div>
            )}
            {state.stale && <p role="status">{t("stale")}</p>}
            {state.page && (
              <>
                <p data-testid="milestone-total">{t("total", { count: state.page.total })}</p>
                <p className="field-help">
                  {t("readAt", { time: observationTime(state.page.readAt, "MILLISECOND", locale) })}
                </p>
                {state.page.total === 0 ? (
                  <p>{t("empty")}</p>
                ) : (
                  <MilestoneRows
                    items={state.page.items}
                    locale={locale}
                    metadata
                    onEdit={begin}
                    onDelete={remove}
                    busy={editor.busy || state.loading || state.stale || !!state.error}
                  />
                )}
                <p className="field-help">{t("pagingHelp")}</p>
              </>
            )}
            <div className="milestone-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!state.cursor || state.loading || editor.busy}
                onClick={() => void refresh()}
              >
                {t("first")}
              </button>
              <button
                type="button"
                disabled={!state.page?.nextCursor || state.loading || editor.busy}
                onClick={() => void refresh(state.page!.nextCursor!)}
              >
                {t("next")}
              </button>
            </div>
          </section>
        </>
      )}
      <dialog
        ref={deleteDialog}
        className="search-confirm milestone-dialog"
        aria-labelledby="milestone-delete-title"
        aria-busy={editor.busy}
        onKeyDown={containDialogTab}
        onCancel={(event) => {
          if (editor.busy) event.preventDefault();
          else setDeleteOpen(false);
        }}
        onClose={() => opener.current?.focus()}
      >
        <h2 id="milestone-delete-title">{t("deleteTitle")}</h2>
        <p>{t("deleteHelp")}</p>
        <p className="milestone-title">{editor.target?.title}</p>
        {editor.unknown && <p role="alert">{t("unknown.delete")}</p>}
        {editor.problem && <p role="alert">{t(`errors.${editor.problem}`)}</p>}
        <div className="milestone-actions">
          <button
            type="button"
            autoFocus
            className="secondary-button"
            disabled={editor.busy}
            onClick={() => setDeleteOpen(false)}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={
              editor.busy || !!editor.unknown || ["conflict", "notFound"].includes(editor.problem)
            }
            onClick={() => void confirmDelete()}
          >
            {editor.busy ? t("deleting") : t("delete")}
          </button>
        </div>
      </dialog>
      {confirmation.node}
    </section>
  );
}
