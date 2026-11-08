"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { z } from "zod";
import { CustomFieldDefinitionSchema } from "@sammlerraum/contracts/custom-fields";
import {
  AICaptureSchema,
  AIAnalysisJobSchema,
  AIAnalysisDetailSchema,
  AIReviewSchema,
  AIApplyReceiptSchema,
  type AIAnalysisJob,
  type AIReview,
} from "@sammlerraum/contracts/ai";
class ClientFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
async function json<T>(url: string, schema: z.ZodType<T>, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z
      .object({ error: z.object({ code: z.string() }).passthrough() })
      .passthrough()
      .safeParse(body);
    throw new ClientFailure(error.success ? error.data.error.code : "AI_UNAVAILABLE");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ClientFailure("AI_UNAVAILABLE");
  return parsed.data;
}
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const errorCode = (error: unknown) =>
  error instanceof ClientFailure ? error.code : "AI_UNAVAILABLE";
export function AnalysisCapture({
  itemId,
  locale,
}: {
  itemId: string;
  locale: "de" | "en";
  actor: string;
}) {
  const t = useTranslations("AI");
  const [capture, setCapture] = useState<z.infer<typeof AICaptureSchema> | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [consent, setConsent] = useState(false),
    [job, setJob] = useState<AIAnalysisJob | null>(null),
    [review, setReview] = useState<AIReview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [paused, setPaused] = useState(false),
    [cycle, setCycle] = useState(0),
    [reviewCycle, setReviewCycle] = useState(0);
  const mounted = useRef(false),
    generation = useRef(0),
    requestKey = useRef<string | null>(null);
  const active = job?.status === "PENDING" || job?.status === "PROCESSING";
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await json(
        `/api/v1/items/${itemId}/ai`,
        z.object({ capture: AICaptureSchema }).strict(),
        signal ? { signal } : {},
      );
      return result.capture;
    },
    [itemId],
  );
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController(),
      epoch = ++generation.current;
    void load(controller.signal)
      .then((value) => {
        if (mounted.current && epoch === generation.current) {
          setCapture(value);
          setJob(value.latestJob);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && mounted.current) setError(errorCode(error));
      });
    return () => {
      mounted.current = false;
      generation.current++;
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!job || !active) return;
    const controller = new AbortController(),
      epoch = generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined,
      attempts = 0;
    setPaused(false);
    const poll = async () => {
      try {
        const result = await json(
          `/api/v1/ai/analyses/${job.id}`,
          z.object({ detail: AIAnalysisDetailSchema }).strict(),
          { signal: controller.signal },
        );
        if (controller.signal.aborted || !mounted.current || epoch !== generation.current) return;
        setError(null);
        setJob(result.detail.job);
        if (result.detail.job.status !== "PENDING" && result.detail.job.status !== "PROCESSING")
          return;
      } catch (error) {
        if (controller.signal.aborted || !mounted.current || epoch !== generation.current) return;
        setError(errorCode(error));
      }
      if (++attempts >= 24) {
        setPaused(true);
        return;
      }
      timer = setTimeout(() => void poll(), Math.min(1000 * 2 ** Math.min(attempts, 3), 8000));
    };
    timer = setTimeout(() => void poll(), 500);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [job?.id, active, cycle]);
  useEffect(() => {
    setReview(null);
    if (job?.status !== "READY") return;
    const controller = new AbortController(),
      epoch = generation.current;
    void json(
      `/api/v1/ai/analyses/${job.id}/review`,
      z.object({ review: AIReviewSchema }).strict(),
      { signal: controller.signal },
    )
      .then((result) => {
        if (mounted.current && epoch === generation.current) setReview(result.review);
      })
      .catch((error) => {
        if (!controller.signal.aborted && mounted.current) setError(errorCode(error));
      });
    return () => controller.abort();
  }, [job?.id, job?.status, reviewCycle]);
  async function start() {
    if (busy || active || !capture?.enabled || !consent || selected.length < 1) return;
    setBusy(true);
    setError(null);
    generation.current++;
    setReview(null);
    requestKey.current ??= crypto.randomUUID();
    try {
      const result = await json(
        `/api/v1/items/${itemId}/ai`,
        z.object({ job: AIAnalysisJobSchema }).strict(),
        post({ assetIds: selected, requestKey: requestKey.current }),
      );
      if (!mounted.current) return;
      requestKey.current = null;
      setJob(result.job);
      setCapture(await load());
    } catch (error) {
      if (mounted.current) setError(errorCode(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function cancel() {
    if (!job || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await json(
        `/api/v1/ai/analyses/${job.id}/cancel`,
        z.object({ job: AIAnalysisJobSchema }).strict(),
        post({}),
      );
      if (mounted.current) {
        generation.current++;
        setJob(result.job);
        requestKey.current = null;
        setCapture(await load());
      }
    } catch (error) {
      if (mounted.current) setError(errorCode(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const message = (code: string) =>
    t(
      [
        "AI_ITEM_CHANGED",
        "AI_LIMIT_REACHED",
        "AI_SOURCE_NOT_AUTHORIZED",
        "AI_ITEM_NOT_FOUND",
        "AI_REQUEST_CONFLICT",
        "AI_INVALID_SELECTION",
        "AI_RESPONSE_REFUSED",
      ].includes(code)
        ? `errors.${code}`
        : "errors.AI_UNAVAILABLE",
    );
  return (
    <section className="management-shell ai-shell">
      <nav className="management-nav">
        <Link href={`/${locale}/items/${itemId}`}>{t("back")}</Link>
      </nav>
      <header className="management-heading">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="form-intro">{t("intro")}</p>
      </header>
      {error && (
        <div role="alert" className="notice">
          <p>{message(error)}</p>
          {job?.status === "READY" && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setError(null);
                setReviewCycle((value) => value + 1);
              }}
            >
              {t("refresh")}
            </button>
          )}
        </div>
      )}
      {!capture && !error && <p role="status">{t("loading")}</p>}
      {capture && (
        <>
          <section className="management-card ai-usage" aria-label={t("usageTitle")}>
            <h2>{t("usageTitle")}</h2>
            <p data-testid="ai-usage">
              {t("usage", {
                count: capture.usage.requests,
                limit: capture.monthlyLimit,
                period: capture.usage.period,
              })}
            </p>
            <p>{t("usageNote")}</p>
          </section>
          <section className="management-card ai-photos">
            <h2>{t("photos")}</h2>
            <p>{t("selectionHint")}</p>
            {!capture.enabled && <p className="notice">{t("unavailable")}</p>}
            {capture.photos.length === 0 ? (
              <p>
                {t("noPhotos")} <Link href={`/${locale}/items/${itemId}`}>{t("addPhotos")}</Link>
              </p>
            ) : (
              <fieldset disabled={busy || active}>
                <legend>{t("photos")}</legend>
                <div className="ai-photo-grid">
                  {capture.photos.map((photo, index) => (
                    <label
                      key={photo.assetId}
                      className={
                        selected.includes(photo.assetId) ? "ai-photo is-selected" : "ai-photo"
                      }
                    >
                      <img
                        src={`/api/v1/media/${photo.assetId}/medium`}
                        alt={t("photo", { number: index + 1 })}
                        width={640}
                        height={480}
                      />
                      <span>
                        <input
                          type="checkbox"
                          aria-label={t("photo", { number: index + 1 })}
                          checked={selected.includes(photo.assetId)}
                          disabled={!selected.includes(photo.assetId) && selected.length >= 4}
                          onChange={(event) => {
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, photo.assetId]
                                : current.filter((id) => id !== photo.assetId),
                            );
                            requestKey.current = null;
                            setConsent(false);
                          }}
                        />
                        {t("photo", { number: index + 1 })}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="ai-check">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy || active}
                onChange={(event) => setConsent(event.target.checked)}
              />
              {t("consent")}
            </label>
            <div className="form-actions">
              <button
                type="button"
                disabled={
                  busy ||
                  active ||
                  !capture.enabled ||
                  !consent ||
                  selected.length === 0 ||
                  capture.usage.requests >= capture.monthlyLimit
                }
                onClick={() => void start()}
              >
                {busy ? t("working") : t("analyze")}
              </button>
            </div>
          </section>
        </>
      )}
      {job && (
        <section className="management-card ai-progress" role="status" aria-live="polite">
          <h2>{t(`status.${job.status}`)}</h2>
          <p>{t("imageCount", { count: job.imageCount })}</p>
          {job.status === "FAILED" && <p>{message(job.errorCode ?? "AI_UNAVAILABLE")}</p>}
          {active && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {t("cancel")}
            </button>
          )}
          {paused && (
            <>
              <p>{t("paused")}</p>
              <button
                type="button"
                onClick={() => {
                  setCycle((value) => value + 1);
                }}
              >
                {t("checkAgain")}
              </button>
            </>
          )}
        </section>
      )}
      {review && (
        <AnalysisReview
          key={`${review.job.id}:${review.baseline}`}
          review={review}
          onRefresh={() => setReviewCycle((value) => value + 1)}
          onApplied={async () => {
            setCapture(await load());
            setReviewCycle((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
function AnalysisReview({
  review,
  onRefresh,
  onApplied,
}: {
  review: AIReview;
  onRefresh(): void;
  onApplied(): Promise<void>;
}) {
  const t = useTranslations("AI"),
    [title, setTitle] = useState(false),
    [category, setCategory] = useState(false),
    [targets, setTargets] = useState({ manufacturer: "", seriesOrSet: "", year: "" }),
    [identifiers, setIdentifiers] = useState<number[]>([]),
    [candidate, setCandidate] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [receipt, setReceipt] = useState(review.decision),
    [fieldName, setFieldName] = useState(""),
    [newField, setNewField] = useState<"SHORT_TEXT" | "INTEGER" | null>(null);
  const nonce = useRef<string | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const changed = () => {
    nonce.current = null;
    setError(null);
  };
  async function apply(reject = false) {
    if (busy || receipt) return;
    setBusy(true);
    setError(null);
    nonce.current ??= crypto.randomUUID();
    const input = {
      requestKey: nonce.current,
      baseline: review.baseline,
      title: !reject && title,
      category: !reject && category,
      manufacturerFieldId: reject ? null : targets.manufacturer || null,
      seriesOrSetFieldId: reject ? null : targets.seriesOrSet || null,
      yearFieldId: reject ? null : targets.year || null,
      identifierIndices: reject ? [] : identifiers,
      catalogCandidateIndex: reject ? null : candidate,
    };
    try {
      const result = await json(
        `/api/v1/ai/analyses/${review.job.id}/apply`,
        z.object({ receipt: AIApplyReceiptSchema }).strict(),
        post(input),
      );
      if (mounted.current) {
        setReceipt(result.receipt);
        await onApplied();
      }
    } catch (error) {
      if (mounted.current) setError(errorCode(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function createField() {
    if (!newField || busy || fieldName.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await json(
        `/api/v1/collections/${review.item.collectionId}/custom-fields`,
        z.object({ customField: CustomFieldDefinitionSchema }).strict(),
        post({ name: fieldName, type: newField }),
      );
      if (mounted.current) {
        setNewField(null);
        onRefresh();
      }
    } catch (error) {
      if (mounted.current) setError(errorCode(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="management-card ai-review" data-testid="ai-review">
      <h2>{t("review")}</h2>
      <aside className="ai-warning" data-testid="ai-warning">
        <strong>{t("advisory")}</strong>
        <ul>
          {review.analysis.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </aside>
      <p>
        {t("currentTitle")}: <strong data-testid="ai-current-title">{review.item.title}</strong>
      </p>
      {error && (
        <div className="notice" role="alert">
          <p>
            {t(
              error === "AI_ITEM_CHANGED"
                ? "errors.AI_ITEM_CHANGED"
                : error === "AI_REQUEST_CONFLICT"
                  ? "errors.AI_REQUEST_CONFLICT"
                  : "errors.AI_INVALID_SELECTION",
            )}
          </p>
          <button type="button" onClick={onRefresh}>
            {t("refresh")}
          </button>
        </div>
      )}
      {receipt ? (
        <div className="ai-decision notice" data-testid="ai-decision" role="status">
          <h3>{t("decisionTitle")}</h3>
          <p>
            {receipt.accepted.length
              ? t("applied", { count: receipt.accepted.length })
              : t("rejected")}
          </p>
        </div>
      ) : (
        <>
          <fieldset disabled={busy}>
            <legend>{t("selectChanges")}</legend>
            <div className="ai-suggestion">
              <label className="ai-check">
                <input
                  type="checkbox"
                  checked={title}
                  disabled={review.analysis.title === null}
                  onChange={(event) => {
                    changed();
                    setTitle(event.target.checked);
                  }}
                />
                {t("acceptTitle")}
              </label>
              <p>{review.analysis.title ?? t("notSuggested")}</p>
            </div>
            <div className="ai-suggestion">
              <label className="ai-check">
                <input
                  type="checkbox"
                  checked={category}
                  disabled={review.analysis.categoryKey === null}
                  onChange={(event) => {
                    changed();
                    setCategory(event.target.checked);
                  }}
                />
                {t("acceptCategory")}
              </label>
              <p>{review.analysis.categoryKey ?? t("notSuggested")}</p>
            </div>
            {(["manufacturer", "seriesOrSet", "year"] as const).map((key) => (
              <div className="ai-suggestion" key={key}>
                <h3>{t(key)}</h3>
                <p>{review.analysis[key] ?? t("notSuggested")}</p>
                <label htmlFor={`ai-${review.job.id}-${key}`}>
                  {t("destination", { field: t(key) })}
                </label>
                <select
                  id={`ai-${review.job.id}-${key}`}
                  value={targets[key]}
                  disabled={review.analysis[key] === null}
                  onChange={(event) => {
                    changed();
                    setTargets((current) => ({ ...current, [key]: event.target.value }));
                  }}
                >
                  <option value="">{t("doNotApply")}</option>
                  {review.fields
                    .filter((field) => field.type === (key === "year" ? "INTEGER" : "SHORT_TEXT"))
                    .map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.name}
                        {field.value === null ? "" : ` · ${field.value}`}
                      </option>
                    ))}
                </select>
                {review.analysis[key] !== null && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setNewField(key === "year" ? "INTEGER" : "SHORT_TEXT");
                      setFieldName(t(key));
                    }}
                  >
                    {t("createField")}
                  </button>
                )}
              </div>
            ))}
            {review.fieldsTruncated && <p>{t("fieldLimit")}</p>}
            {newField && (
              <div className="ai-field-create">
                <label>
                  {t("fieldName")}
                  <input
                    maxLength={120}
                    value={fieldName}
                    onChange={(event) => setFieldName(event.target.value)}
                  />
                </label>
                <p>{t("createFieldHint")}</p>
                <button
                  type="button"
                  disabled={!fieldName.trim()}
                  onClick={() => void createField()}
                >
                  {t("saveField")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setNewField(null)}
                >
                  {t("cancel")}
                </button>
              </div>
            )}
            <div className="ai-suggestion">
              <h3>{t("identifiers")}</h3>
              <p>{t("mergeNote")}</p>
              {review.analysis.identifiers.length === 0 && <p>{t("notSuggested")}</p>}
              {review.analysis.identifiers.map((identifier, index) => (
                <label key={index} className="ai-check">
                  <input
                    type="checkbox"
                    checked={identifiers.includes(index)}
                    onChange={(event) => {
                      changed();
                      setIdentifiers((current) =>
                        event.target.checked
                          ? [...current, index]
                          : current.filter((value) => value !== index),
                      );
                    }}
                  />
                  {t("acceptIdentifier", { type: identifier.type, value: identifier.value })}
                </label>
              ))}
            </div>
            <div className="ai-suggestion">
              <h3>{t("catalog")}</h3>
              <p>{t("catalogNote")}</p>
              <label className="ai-check">
                <input
                  type="radio"
                  name={`ai-catalog-${review.job.id}`}
                  checked={candidate === null}
                  onChange={() => {
                    changed();
                    setCandidate(null);
                  }}
                />
                {t("doNotLink")}
              </label>
              {review.catalogCandidates.map((value) => (
                <div key={value.index}>
                  <label className="ai-check">
                    <input
                      type="radio"
                      name={`ai-catalog-${review.job.id}`}
                      checked={candidate === value.index}
                      onChange={() => {
                        changed();
                        setCandidate(value.index);
                      }}
                    />
                    {value.title ?? t("catalogReference")}
                  </label>
                  <p>{t("confidence", { percent: Math.round(value.confidence * 100) })}</p>
                  <ul>
                    {value.evidence.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={() => void apply()}>
              {busy ? t("working") : t("apply")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void apply(true)}
            >
              {t("rejectAll")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
