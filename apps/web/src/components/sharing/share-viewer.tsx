"use client";
import { ScopedSearchPanel } from "../search/scoped-search-panel";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ShareResolutionSchema, type ResolveShareSchema } from "@sammlerraum/contracts/sharing";
type Access = z.infer<typeof ResolveShareSchema>;
type View = z.infer<typeof ShareResolutionSchema>["data"];
const labels = {
  de: {
    title: "Geteilte Auswahl",
    intro: "Ein ausgewählter Einblick in eine Sammlung.",
    readonly: "Nur ansehen",
    loading: "Auswahl wird geladen …",
    open: "Auswahl öffnen",
    pin: "Diese Freigabe ist mit einer PIN geschützt.",
    badPin: "Die PIN stimmt nicht. Bitte erneut versuchen.",
    gone: "Diese Freigabe ist nicht mehr verfügbar.",
    missing:
      "Diese Auswahl ist nicht verfügbar. Für eine persönliche Freigabe bitte anmelden und den Link erneut öffnen.",
    busy: "Zu viele PIN-Versuche. Bitte in 15 Minuten erneut versuchen.",
    error: "Die Auswahl konnte gerade nicht geladen werden. Bitte erneut versuchen.",
    retry: "Erneut versuchen",
    login: "Anmelden",
    empty: "In dieser Auswahl sind aktuell keine Objekte sichtbar.",
    quantity: "Anzahl",
    notes: "Freigegebene Notizen",
    location: "Standort",
    insurance: "Versicherung",
    collectionInsurance: "Versicherung der Sammlung",
    purchase: "Anschaffung",
    valuation: "Bewertung",
    unknown: "Einheit nicht bestätigt",
    policy: "Policenreferenz",
    document: "Beleg herunterladen",
    image: "Bild anzeigen",
    export: "Auswahl herunterladen",
    more: "Weitere Objekte",
    close: "Bild schließen",
    perUnit: "je Stück",
    preview: "Freigegebenes Sammlungsbild",
  },
  en: {
    title: "Shared selection",
    intro: "A selected view into a collection.",
    readonly: "View only",
    loading: "Loading selection …",
    open: "Open selection",
    pin: "This selection is protected with a PIN.",
    badPin: "That PIN is incorrect. Please try again.",
    gone: "This selection is no longer available.",
    missing:
      "This selection is not available. For a personal share, sign in and open this link again.",
    busy: "Too many PIN attempts. Please try again in 15 minutes.",
    error: "The selection could not be loaded. Please try again.",
    retry: "Try again",
    login: "Sign in",
    empty: "No items are currently visible in this selection.",
    quantity: "Quantity",
    notes: "Shared notes",
    location: "Location",
    insurance: "Insurance",
    collectionInsurance: "Collection insurance",
    purchase: "Acquisition",
    valuation: "Valuation",
    unknown: "Unit not confirmed",
    policy: "Policy reference",
    document: "Download document",
    image: "View image",
    export: "Download selection",
    more: "More items",
    close: "Close image",
    perUnit: "per unit",
    preview: "Shared collection image",
  },
} as const;
const errorEnvelope = z.object({ error: z.object({ code: z.string() }) });
class ShareRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
async function responseError(response: Response): Promise<never> {
  const data = errorEnvelope.safeParse(await response.json().catch(() => null));
  throw new ShareRequestError(data.success ? data.data.error.code : "SHARE_UNAVAILABLE");
}
function exactAmount(raw: string, exponent: number) {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) return raw;
  const sign = raw.startsWith("-") ? "-" : "",
    digits = raw.replace(/^-/u, "").padStart(exponent + 1, "0");
  return exponent
    ? `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`
    : sign + digits;
}
export function ShareViewer({ identifier, locale }: { identifier: string; locale: "de" | "en" }) {
  const t = labels[locale],
    base: Access = identifier.length === 43 ? { token: identifier } : { shareId: identifier };
  const [access, setAccess] = useState<Access>(base),
    [view, setView] = useState<View | null>(null),
    [pin, setPin] = useState(""),
    [pinNeeded, setPinNeeded] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(true),
    [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const previewUrl = useRef<string | null>(null);
  function closePreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  }
  function failed(error: unknown) {
    const code = error instanceof ShareRequestError ? error.code : "SHARE_UNAVAILABLE";
    setView(null);
    closePreview();
    setPinNeeded(code === "SHARE_PIN_REQUIRED" || code === "SHARE_PIN_INVALID");
    setNotice(
      code === "SHARE_PIN_REQUIRED"
        ? t.pin
        : code === "SHARE_PIN_INVALID"
          ? t.badPin
          : code === "SHARE_REVOKED" || code === "SHARE_EXPIRED"
            ? t.gone
            : code === "SHARE_NOT_FOUND"
              ? t.missing
              : code === "SHARE_RATE_LIMITED"
                ? t.busy
                : t.error,
    );
  }
  async function load(request: Access, append = false, signal?: AbortSignal) {
    const response = await fetch("/api/v1/shares/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) await responseError(response);
    const parsed = ShareResolutionSchema.safeParse(await response.json());
    if (!parsed.success) throw new ShareRequestError("SHARE_INTEGRITY");
    if (signal?.aborted) return;
    const result = parsed.data;
    setAccess({
      ...base,
      ...(result.accessToken
        ? { accessToken: result.accessToken }
        : "accessToken" in request
          ? { accessToken: request.accessToken }
          : {}),
    });
    setView((previous) =>
      append && previous
        ? { ...result.data, items: [...previous.items, ...result.data.items] }
        : result.data,
    );
    setNotice("");
    setPinNeeded(false);
    setPin("");
  }
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    load(base, false, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) failed(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      controller.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
    // The capability is scoped to this route; never persist it in local/session storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier, locale]);
  async function open(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await load({ ...base, pin });
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!view?.next) return;
    setBusy(true);
    try {
      await load({ ...access, after: view.next }, true);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function asset(kind: "IMAGE" | "DOCUMENT", linkId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/shares/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access, kind, linkId }),
        cache: "no-store",
      });
      if (!response.ok) await responseError(response);
      const blob = await response.blob();
      if (blob.size > 26214400) throw new ShareRequestError("SHARE_INTEGRITY");
      if (kind === "IMAGE") {
        if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type))
          throw new ShareRequestError("SHARE_INTEGRITY");
        closePreview();
        const url = URL.createObjectURL(blob);
        previewUrl.current = url;
        setPreview({ id: linkId, url });
      } else save(blob, `shared-${linkId}.pdf`);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function download() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/shares/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(access),
        cache: "no-store",
      });
      if (!response.ok) await responseError(response);
      save(await response.blob(), `shared-${view!.shareId}.json`);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shared-shell" id="main-content" aria-busy={busy}>
      <header className="shared-heading">
        <a className="brand" href={`/${locale}`}>
          Sammlerraum
        </a>
        <span className="shared-badge">{t.readonly}</span>
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </header>
      {busy && !view && <p role="status">{t.loading}</p>}
      {notice && (
        <p role="alert" className="shared-notice">
          {notice}
        </p>
      )}
      {pinNeeded && (
        <form className="shared-pin" onSubmit={open}>
          <label htmlFor="shared-pin">PIN</label>
          <input
            id="shared-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6,12}"
            minLength={6}
            maxLength={12}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <button disabled={busy} type="submit">
            {t.open}
          </button>
        </form>
      )}
      {!view && !pinNeeded && !busy && (
        <div className="shared-actions">
          <button
            onClick={() => {
              setBusy(true);
              load(base)
                .catch(failed)
                .finally(() => setBusy(false));
            }}
          >
            {t.retry}
          </button>
          <a href={`/${locale}/login`}>{t.login}</a>
        </div>
      )}
      {view && (
        <>
          <ScopedSearchPanel locale={locale} target={{ kind: "SHARE", access }} />
          <div className="shared-actions">
            <span>
              {view.items.length}{" "}
              {locale === "de"
                ? view.items.length === 1
                  ? "Objekt"
                  : "Objekte"
                : view.items.length === 1
                  ? "item"
                  : "items"}
            </span>
            {view.exportAllowed && (
              <button disabled={busy} onClick={download}>
                {t.export}
              </button>
            )}
          </div>
          {view.insurance?.amountMinor !== null && view.insurance?.amountMinor !== undefined && (
            <section className="shared-card">
              <h2>{t.collectionInsurance}</h2>
              <p>
                {view.insurance.minorUnitExponent === null
                  ? `${view.insurance.amountMinor} · ${t.unknown}`
                  : exactAmount(view.insurance.amountMinor, view.insurance.minorUnitExponent)}{" "}
                {view.insurance.currency}
              </p>
              {view.insurance.insurer && <p>{view.insurance.insurer}</p>}
              {view.insurance.policyReference && (
                <p>
                  {t.policy}: {view.insurance.policyReference}
                </p>
              )}
            </section>
          )}
          {!view.items.length && <p>{t.empty}</p>}
          <div className="shared-grid">
            {view.items.map((item) => (
              <article className="shared-card" key={item.id}>
                <h2>{item.title}</h2>
                {item.publicDescription && (
                  <p className="shared-description">{item.publicDescription}</p>
                )}
                <dl>
                  <dt>{t.quantity}</dt>
                  <dd>{item.quantity}</dd>
                  {item.privateNotes && (
                    <>
                      <dt>{t.notes}</dt>
                      <dd className="shared-description">{item.privateNotes}</dd>
                    </>
                  )}
                  {item.storageLocation && (
                    <>
                      <dt>{t.location}</dt>
                      <dd>{item.storageLocation.name}</dd>
                    </>
                  )}
                  {item.purchase?.raw && (
                    <>
                      <dt>{t.purchase}</dt>
                      <dd>
                        {item.purchase.interpretation.kind === "INTERPRETED"
                          ? `${item.purchase.interpretation.decimal} ${item.purchase.raw.currency}`
                          : `${item.purchase.raw.amountMinor} ${item.purchase.raw.currency} · ${t.unknown}`}
                      </dd>
                    </>
                  )}
                  {item.valuation && (
                    <>
                      <dt>{t.valuation}</dt>
                      <dd>
                        {exactAmount(item.valuation.amountMinor, item.valuation.minorUnitExponent)}{" "}
                        {item.valuation.currency}
                        {item.valuation.basis === "PER_UNIT" ? ` · ${t.perUnit}` : ""}
                      </dd>
                    </>
                  )}
                  {item.insurance?.amountMinor !== null &&
                    item.insurance?.amountMinor !== undefined && (
                      <>
                        <dt>{t.insurance}</dt>
                        <dd>
                          {item.insurance.minorUnitExponent === null
                            ? `${item.insurance.amountMinor} · ${t.unknown}`
                            : exactAmount(
                                item.insurance.amountMinor,
                                item.insurance.minorUnitExponent,
                              )}{" "}
                          {item.insurance.currency} · {t.perUnit}
                          {item.insurance.insurer && (
                            <span className="shared-line">{item.insurance.insurer}</span>
                          )}
                          {item.insurance.policyReference && (
                            <span className="shared-line">
                              {t.policy}: {item.insurance.policyReference}
                            </span>
                          )}
                        </dd>
                      </>
                    )}
                </dl>
                {!!item.images?.length && (
                  <div className="shared-attachments">
                    {item.images.map((image) => (
                      <div key={image.id}>
                        <button
                          disabled={busy}
                          className="secondary-button"
                          onClick={() => asset("IMAGE", image.id)}
                        >
                          {image.title || t.image}
                        </button>
                        {preview?.id === image.id && (
                          <figure>
                            <img src={preview.url} alt={image.title || t.preview} />
                            <button className="text-button" onClick={closePreview}>
                              {t.close}
                            </button>
                          </figure>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!!item.documents?.length && (
                  <div className="shared-attachments">
                    {item.documents.map((document) => (
                      <button
                        key={document.id}
                        disabled={busy}
                        className="secondary-button"
                        onClick={() => asset("DOCUMENT", document.id)}
                      >
                        {document.title || t.document} ↓
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
          {view.next && (
            <button disabled={busy} onClick={more}>
              {t.more}
            </button>
          )}
        </>
      )}
    </main>
  );
}
