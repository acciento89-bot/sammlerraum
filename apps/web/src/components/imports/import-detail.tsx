"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ImportJobDto,
  ImportMapping,
  ImportPreviewPage,
  ImportDecisionInput,
  ImportProfileDto,
} from "@sammlerraum/contracts/imports";
import { ImportMappingSchema } from "@sammlerraum/contracts/imports";
import { loadMoneyCapabilities, requireMoneyAuthoring } from "../money/legacy-money-client";
import { MappingEditor } from "./mapping-editor";
import { importApi } from "./import-api";
type State = {
  job: ImportJobDto;
  approved: boolean;
  header: (string | null)[] | null;
  columnCount: number;
  savedRows: number;
  errorCode: string | null;
  expiresAt: string;
};
type ProfileCursor = { normalizedName: string; id: string };
type ProfilePage = { profiles: ImportProfileDto[]; nextAfter: ProfileCursor | null };
type Review = ImportPreviewPage & { decisions: ImportDecisionInput[] };
export function ImportDetail({ locale, jobId }: { locale: "de" | "en"; jobId: string }) {
  const text = (de: string, en: string) => (locale === "de" ? de : en);
  const [state, setState] = useState<State | null>(null),
    [mapping, setMapping] = useState<ImportMapping>({
      schemaVersion: 1,
      locale,
      columns: { title: 0 },
    }),
    [review, setReview] = useState<Review | null>(null),
    [cursor, setCursor] = useState(0),
    [choices, setChoices] = useState<Record<string, ImportDecisionInput>>({}),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [profiles, setProfiles] = useState<ImportProfileDto[]>([]),
    [profile, setProfile] = useState<ImportProfileDto | null>(null),
    [profileCursor, setProfileCursor] = useState<ProfileCursor | null>(null),
    [profilePageStart, setProfilePageStart] = useState<ProfileCursor | null>(null),
    [profileName, setProfileName] = useState(""),
    [moneyAuthoringEnabled, setMoneyAuthoringEnabled] = useState(false),
    [targets, setTargets] = useState<
      Record<string, { id: string; title: string; quantity: number }>
    >({});
  const message = text(
    "Der Vorgang konnte nicht abgeschlossen werden. Lade den aktuellen Stand und prüfe deine Auswahl erneut.",
    "The operation could not be completed. Reload the current state and check your selection.",
  );
  useEffect(() => {
    let active = true;
    loadMoneyCapabilities()
      .then(requireMoneyAuthoring)
      .then(() => {
        if (active) setMoneyAuthoringEnabled(true);
      })
      .catch(() => {
        if (active) setMoneyAuthoringEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [jobId]);
  async function refresh() {
    const next = await importApi<State>(`status?id=${jobId}`);
    setState(next);
    return next;
  }
  async function rows(after = 0) {
    const page = await importApi<Review>("preview-page", {
      jobId,
      limit: 50,
      afterRowNumber: after,
    });
    setReview(page);
    setTargets({});
    setCursor(after);
    setChoices(Object.fromEntries(page.decisions.map((d) => [d.rowNumber, d])));
    setDirty(false);
  }
  useEffect(() => {
    let active = true;
    importApi<State>(`status?id=${jobId}`)
      .then((next) => {
        if (!active) return;
        setState(next);
        setMapping(
          next.job.mapping ?? { schemaVersion: 1, locale: next.job.locale, columns: { title: 0 } },
        );
        if (next.job.status === "REVIEW_READY") void rows().catch(() => setError(message));
      })
      .catch(() => {
        if (active) setError(message);
      });
    importApi<ProfilePage>("profiles")
      .then((v) => {
        if (active) {
          setProfiles(v.profiles);
          setProfileCursor(v.nextAfter);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [jobId]);
  useEffect(() => {
    if (!state || !["AWAITING_UPLOAD", "PARSING", "COMMITTING"].includes(state.job.status)) return;
    let active = true,
      inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      importApi<State>(`status?id=${jobId}`)
        .then((next) => {
          if (active)
            setState((prev) => (!prev || next.job.revision >= prev.job.revision ? next : prev));
        })
        .catch(() => {
          if (active) setError(message);
        })
        .finally(() => {
          inFlight = false;
        });
    }, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [state?.job.status, jobId]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch {
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  async function profilePage(after: ProfileCursor | null) {
    await act(async () => {
      const result = await importApi<ProfilePage>(
        after ? "profiles?after=" + encodeURIComponent(JSON.stringify(after)) : "profiles",
      );
      setProfiles(result.profiles);
      setProfileCursor(result.nextAfter);
      setProfilePageStart(after);
    });
  }
  async function preview() {
    await act(async () => {
      if (!state) return;
      let current = state.job;
      const checked = ImportMappingSchema.safeParse(mapping),
        checkedProfile = profile ? ImportMappingSchema.safeParse(profile.mapping) : null;
      const selectedProfile =
        profile &&
        checked.success &&
        checkedProfile?.success &&
        JSON.stringify(checked.data) === JSON.stringify(checkedProfile.data)
          ? profile
          : null;
      for (let batch = 0; batch <= 100; batch++) {
        const result = await importApi<{ job: ImportJobDto; complete: boolean }>("preview", {
          jobId,
          expectedRevision: current.revision,
          ...((current.mappingProfile ?? selectedProfile)
            ? {
                mappingProfileId: (current.mappingProfile ?? selectedProfile)!.id,
                expectedProfileRevision: (current.mappingProfile ?? selectedProfile)!.revision,
              }
            : { mapping }),
        });
        current = result.job;
        setState((prev) => (prev ? { ...prev, job: current } : prev));
        if (result.complete) {
          await refresh();
          await rows();
          return;
        }
      }
      throw Error();
    });
  }
  const choose = (value: ImportDecisionInput) => {
    setChoices((prev) => ({ ...prev, [value.rowNumber]: value }));
    setDirty(true);
  };
  async function save() {
    await act(async () => {
      if (!state || !review) return;
      const decisions = Object.values(choices);
      let revision = state.job.revision;
      for (let start = 0; start < decisions.length; start += 20) {
        const result = await importApi<{ revision: number }>("decisions", {
          jobId,
          expectedRevision: revision,
          previewGeneration: state.job.previewGeneration,
          decisions: decisions.slice(start, start + 20),
        });
        revision = result.revision;
        setState((prev) => (prev ? { ...prev, job: { ...prev.job, revision } } : prev));
      }
      setDirty(false);
      await refresh();
      await rows(cursor);
    });
  }
  async function merge(rowNumber: string, targetItemId: string) {
    if (busy) return;
    setChoices((prev) => {
      const next = { ...prev };
      delete next[rowNumber];
      return next;
    });
    setTargets((prev) => {
      const next = { ...prev };
      delete next[rowNumber];
      return next;
    });
    setDirty(true);
    await act(async () => {
      if (!state) return;
      const target = await importApi<{
        preconditionToken: string;
        item: { title: string; quantity: number };
      }>("merge-target", {
        jobId,
        previewGeneration: state.job.previewGeneration,
        rowNumber: Number(rowNumber),
        targetItemId,
      });
      setTargets((prev) => ({
        ...prev,
        [rowNumber]: { id: targetItemId, title: target.item.title, quantity: target.item.quantity },
      }));
      choose({
        rowNumber: Number(rowNumber),
        action: "MERGE",
        targetItemId,
        expectedTargetToken: target.preconditionToken,
        fields: [],
      });
    });
  }
  async function saveProfile() {
    await act(async () => {
      const result = await importApi<ImportProfileDto>("profile", {
        name: profileName,
        mapping,
        ...(profile ? { profileId: profile.id, expectedRevision: profile.revision } : {}),
      });
      setProfile(result);
      setProfiles((prev) => [...prev.filter((p) => p.id !== result.id), result]);
    });
  }
  if (!state)
    return (
      <section className="management-shell transfer-shell">
        <h1>{text("Import laden", "Load import")}</h1>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  const job = state.job,
    editable = job.status === "PARSED" || job.status === "PREVIEWING",
    complete = job.status === "COMPLETED";
  const labels: Record<string, string> = {
    AWAITING_UPLOAD: text("Datei wird eingelesen", "Reading source"),
    PARSING: text("Datei wird geprüft", "Checking source"),
    PARSED: text("Bereit für Spaltenzuordnung", "Ready to map columns"),
    PREVIEWING: text("Vorschau wird aufgebaut", "Building preview"),
    REVIEW_READY: text("Zeilen prüfen und entscheiden", "Review rows and decide"),
    COMMITTING: text("Import wird übernommen", "Committing import"),
    COMPLETED: text("Import abgeschlossen", "Import complete"),
    FAILED: text("Import fehlgeschlagen", "Import failed"),
    CANCELLED: text("Import abgebrochen", "Import cancelled"),
  };
  return (
    <section className="management-shell transfer-shell">
      <nav className="management-nav">
        <Link href={`/${locale}/imports`}>{text("Neuer Import", "New import")}</Link>
        <Link href={`/${locale}/collections`}>{text("Sammlungen", "Collections")}</Link>
      </nav>
      <h1>{text("Import prüfen", "Review import")}</h1>
      <p role="status">{labels[job.status]}</p>
      <p>
        {job.source.fileName} · {job.progress.parsedRows} {text("gelesene Zeilen", "parsed rows")} ·{" "}
        {job.progress.committedRows} {text("bearbeitete Datenzeilen", "processed data rows")}
      </p>
      {error && <p role="alert">{error}</p>}
      {state.errorCode === "IMPORT_PLAN_LIMIT_REACHED" && (
        <p role="alert">
          {text(
            "Import am Tariflimit gestoppt. Bereits abgeschlossene Stapel bleiben erhalten. Bitte freien Platz schaffen oder den Tarif erweitern und nur die übrigen Zeilen neu importieren.",
            "Import stopped at the plan limit. Completed batches are retained. Free capacity or upgrade your plan, then import only the remaining rows.",
          )}
        </p>
      )}
      {state.errorCode &&
        state.errorCode !== "IMPORT_PLAN_LIMIT_REACHED" &&
        state.approved === false && (
          <p role="alert">
            {text(
              "Die Quelle oder der aktuelle Bestand konnte nicht sicher verarbeitet werden. Bitte einen neuen Import mit korrigierter Datei starten.",
              "The source or current inventory could not be processed safely. Start a new import with a corrected file.",
            )}
          </p>
        )}
      {!complete && job.status !== "CANCELLED" && (
        <button
          disabled={busy || dirty}
          onClick={() =>
            void act(async () => {
              await refresh();
              await loadMoneyCapabilities()
                .then(requireMoneyAuthoring)
                .then(() => setMoneyAuthoringEnabled(true))
                .catch(() => setMoneyAuthoringEnabled(false));
              if (job.status === "REVIEW_READY") await rows(cursor);
            })
          }
        >
          {text("Stand aktualisieren", "Refresh status")}
        </button>
      )}
      {state.approved === false &&
        !["COMMITTING", "COMPLETED", "CANCELLED"].includes(job.status) && (
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const cancelled = await importApi<ImportJobDto>("cancel", {
                  jobId,
                  expectedRevision: job.revision,
                });
                setState((prev) => (prev ? { ...prev, job: cancelled } : prev));
                setDirty(false);
                setReview(null);
              })
            }
          >
            {text("Import abbrechen", "Cancel import")}
          </button>
        )}
      {state.approved && job.status === "FAILED" && (
        <p role="alert">
          {text(
            "Der freigegebene Import wurde gestoppt. Die ersten",
            "The approved import stopped. The first",
          )}{" "}
          {job.progress.committedRows}{" "}
          {text(
            "Datenzeilen sind bereits bearbeitet, einschließlich übersprungener Zeilen. Prüfe den Bestand vor einem neuen Import; vorhandene Änderungen werden nicht zurückgenommen.",
            "data rows have already been processed, including skipped rows. Check inventory before starting a new import; existing changes are not undone.",
          )}
        </p>
      )}
      {job.mapping?.columns.purchaseMoney &&
        !moneyAuthoringEnabled &&
        job.status === "REVIEW_READY" && (
          <p role="status">
            {text(
              "Kaufpreisimporte sind derzeit nicht freigeschaltet. Aktualisiere den Stand oder brich den noch nicht freigegebenen Auftrag ab.",
              "Purchase-value imports are currently unavailable. Refresh the state or cancel this unapproved job.",
            )}
          </p>
        )}
      {editable && (
        <div className="management-card form-stack">
          <MappingEditor
            locale={locale}
            header={state.header}
            columnCount={state.columnCount}
            mapping={mapping}
            moneyAuthoringEnabled={moneyAuthoringEnabled}
            onChange={setMapping}
            disabled={busy || job.status === "PREVIEWING"}
          />
          <label>
            {text("Zuordnungsprofil laden", "Load mapping profile")}
            <select
              aria-label={text("Zuordnungsprofil laden", "Load mapping profile")}
              disabled={busy || job.status === "PREVIEWING"}
              value={profile?.id ?? ""}
              onChange={(e) => {
                const selected = profiles.find((p) => p.id === e.target.value) ?? null;
                setProfile(selected);
                if (selected) {
                  setMapping({ ...selected.mapping, locale: job.locale });
                  setProfileName(selected.name);
                }
              }}
            >
              <option value="">{text("Eigene Zuordnung", "Custom mapping")}</option>
              {[
                ...(profile && !profiles.some((p) => p.id === profile.id) ? [profile] : []),
                ...profiles,
              ].map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="management-actions">
            <button
              disabled={busy || job.status === "PREVIEWING" || profilePageStart === null}
              onClick={() => void profilePage(null)}
            >
              {text("Erste Profile", "First profiles")}
            </button>
            <button
              disabled={busy || job.status === "PREVIEWING" || profileCursor === null}
              onClick={() => void profilePage(profileCursor)}
            >
              {text("Weitere Profile", "More profiles")}
            </button>
          </div>
          <label>
            {text("Profilname", "Profile name")}
            <input
              value={profileName}
              maxLength={120}
              onChange={(e) => setProfileName(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            disabled={
              busy || !profileName.trim() || !ImportMappingSchema.safeParse(mapping).success
            }
            onClick={() => void saveProfile()}
          >
            {text("Profil speichern", "Save profile")}
          </button>
          <button
            disabled={busy || !ImportMappingSchema.safeParse(mapping).success}
            onClick={() => void preview()}
          >
            {text("Vorschau erstellen", "Build preview")}
          </button>
        </div>
      )}
      {job.status === "REVIEW_READY" && (
        <>
          <p>
            {state.savedRows} / {job.progress.totalRows}{" "}
            {text("Entscheidungen gespeichert", "decisions saved")}
          </p>
          {review?.items.map(({ rowNumber, preview: row }) => {
            const choice = choices[rowNumber];
            return (
              <article className="management-card form-stack" key={rowNumber}>
                <h2>
                  {text("Zeile", "Row")} {rowNumber}:{" "}
                  {row.values?.title ?? text("Ungültige Zeile", "Invalid row")}
                </h2>
                <p>
                  {row.status === "CONFLICT"
                    ? text("Konflikt", "Conflict")
                    : row.status === "INVALID"
                      ? text("Fehler", "Error")
                      : text("Bereit", "Ready")}
                </p>
                {row.values && (
                  <dl>
                    <dt>{text("Stückzahl", "Quantity")}</dt>
                    <dd>{row.values.quantity}</dd>
                    {row.values.identifier && (
                      <>
                        <dt>{text("Kennung", "Identifier")}</dt>
                        <dd>
                          {row.values.identifier.type}: {row.values.identifier.value}
                        </dd>
                      </>
                    )}
                    {row.values.acquiredOn && (
                      <>
                        <dt>{text("Erwerbsdatum", "Acquired on")}</dt>
                        <dd>{row.values.acquiredOn}</dd>
                      </>
                    )}
                    {row.values.purchaseMoney && (
                      <>
                        <dt>{text("Kaufpreis pro Stück", "Purchase value per unit")}</dt>
                        <dd>
                          {row.values.purchaseMoney.kind === "CANONICAL"
                            ? `${row.values.purchaseMoney.receipt.normalizedDecimal.replace(".", locale === "de" ? "," : ".")} ${row.values.purchaseMoney.receipt.raw.currency}`
                            : `${row.values.purchaseMoney.raw.amountMinor} ${row.values.purchaseMoney.raw.currency} · ${text("Einheit unbekannt", "Unknown unit")}`}
                        </dd>
                      </>
                    )}
                  </dl>
                )}
                {row.errors.length > 0 && (
                  <p>
                    {text("Ungültige Werte prüfen", "Check invalid values")}:{" "}
                    {row.errors
                      .map(
                        (error) =>
                          ({
                            row: text("Zeile", "Row"),
                            title: text("Titel", "Title"),
                            quantity: text("Stückzahl", "Quantity"),
                            identifier: text("Kennung", "Identifier"),
                            purchaseMoney: text("Kaufpreis", "Purchase value"),
                            acquiredOn: text("Erwerbsdatum", "Acquired date"),
                          })[error.field],
                      )
                      .join(", ")}
                  </p>
                )}
                <label>
                  {`${text("Entscheidung für Zeile", "Decision for row")} ${rowNumber}`}
                  <select
                    aria-label={`${text("Entscheidung für Zeile", "Decision for row")} ${rowNumber}`}
                    disabled={busy}
                    value={choice?.action ?? ""}
                    onChange={(e) => {
                      const action = e.target.value;
                      if (action === "MERGE") {
                        setChoices((prev) => {
                          const next = { ...prev };
                          delete next[rowNumber];
                          return next;
                        });
                        setDirty(true);
                        void merge(rowNumber, row.matchingItemIds[0]!);
                      } else if (
                        action === "CREATE" ||
                        action === "CREATE_SEPARATE" ||
                        action === "SKIP"
                      )
                        choose({ rowNumber: Number(rowNumber), action });
                      else {
                        setChoices((prev) => {
                          const next = { ...prev };
                          delete next[rowNumber];
                          return next;
                        });
                        setDirty(true);
                      }
                    }}
                  >
                    <option value="">{text("Bitte entscheiden", "Choose action")}</option>
                    {row.allowedActions.map((action) => (
                      <option key={action} value={action}>
                        {
                          {
                            CREATE: text("Neu anlegen", "Create"),
                            CREATE_SEPARATE: text("Als separates Exemplar", "Create separate item"),
                            SKIP: text("Überspringen", "Skip"),
                            MERGE: text(
                              "Bestehendes Exemplar aktualisieren",
                              "Update existing item",
                            ),
                          }[action]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                {choice?.action === "MERGE" && (
                  <fieldset className="form-stack" disabled={busy}>
                    <legend>
                      {text("Nur ausgewählte Felder ersetzen", "Replace selected fields only")}
                    </legend>
                    {targets[rowNumber]?.id === choice.targetItemId && (
                      <p>
                        {text("Bestehendes Exemplar", "Existing item")}: {targets[rowNumber]!.title}{" "}
                        · {text("Stückzahl", "Quantity")}: {targets[rowNumber]!.quantity}
                      </p>
                    )}
                    <label>
                      {text("Ziel-Exemplar", "Target item")}
                      <select
                        value={choice.targetItemId}
                        onChange={(e) => void merge(rowNumber, e.target.value)}
                      >
                        {row.matchingItemIds.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(["title", "quantity", "identifier", "purchaseMoney", "acquiredOn"] as const)
                      .filter(
                        (field) =>
                          field === "title" ||
                          field === "quantity" ||
                          (field === "identifier" && job.mapping?.columns.identifier) ||
                          (field === "purchaseMoney" && job.mapping?.columns.purchaseMoney) ||
                          (field === "acquiredOn" && job.mapping?.columns.acquiredOn),
                      )
                      .map((field) => (
                        <label key={field}>
                          <input
                            type="checkbox"
                            checked={choice.fields.includes(field)}
                            onChange={(e) => {
                              const fields = e.target.checked
                                ? [...choice.fields, field]
                                : choice.fields.filter((v) => v !== field);
                              choose({ ...choice, fields });
                            }}
                          />
                          {
                            {
                              title: text("Titel ersetzen", "Replace title"),
                              quantity: text(
                                "Stückzahl ersetzen, nicht addieren",
                                "Replace quantity, do not add",
                              ),
                              identifier: text("Kennung ersetzen", "Replace identifier"),
                              purchaseMoney: text("Kaufpreis ersetzen", "Replace purchase value"),
                              acquiredOn: text("Erwerbsdatum ersetzen", "Replace acquired date"),
                            }[field]
                          }
                        </label>
                      ))}
                  </fieldset>
                )}
              </article>
            );
          })}
          <div className="management-actions">
            <button
              disabled={
                busy ||
                !Object.values(choices).length ||
                !dirty ||
                Object.values(choices).some((c) => c.action === "MERGE" && !c.fields.length)
              }
              onClick={() => void save()}
            >
              {text("Entscheidungen speichern", "Save decisions")}
            </button>
            <button
              disabled={
                busy ||
                dirty ||
                state.savedRows !== job.progress.totalRows ||
                (!!job.mapping?.columns.purchaseMoney && !moneyAuthoringEnabled)
              }
              onClick={() =>
                void act(async () => {
                  await importApi("approve", {
                    jobId,
                    expectedRevision: job.revision,
                    previewGeneration: job.previewGeneration,
                  });
                  setState(null);
                  await refresh();
                })
              }
            >
              {text("Import starten", "Start import")}
            </button>
          </div>
          {review && (
            <nav aria-label={text("Vorschauseiten", "Preview pages")}>
              <button
                disabled={busy || dirty || cursor === 0}
                onClick={() => void act(() => rows(Math.max(0, cursor - 50)))}
              >
                {text("Vorherige Zeilen", "Previous rows")}
              </button>
              <button
                disabled={busy || dirty || !review.hasMore}
                onClick={() => void act(() => rows(review.nextAfterRowNumber!))}
              >
                {text("Weitere Zeilen", "More rows")}
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
