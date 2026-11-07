"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import {
  classifySecurityFailure,
  finishReauthentication,
  inPlacePasswordCredentials,
  providerTranslationKey,
  remainingFreshMilliseconds,
} from "./account-ui-state";

type Method = {
  id: string;
  type: "password" | "provider" | "passkey";
  provider: string;
  name: string | null;
};
type Session = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  current: boolean;
};

export function PasskeyManager({
  email,
  initialFreshUntil,
  locale,
  initialMethods,
  initialSessions,
}: {
  email: string;
  initialFreshUntil: number;
  locale: string;
  initialMethods: Method[];
  initialSessions: Session[];
}) {
  const t = useTranslations("Security");
  const [methods, setMethods] = useState(initialMethods);
  const [sessions, setSessions] = useState(initialSessions);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [freshUntil, setFreshUntil] = useState(initialFreshUntil);
  const [fresh, setFresh] = useState(remainingFreshMilliseconds(initialFreshUntil) > 0);
  useEffect(() => {
    const remaining = remainingFreshMilliseconds(freshUntil);
    setFresh(remaining > 0);
    if (remaining === 0) return;
    const timer = window.setTimeout(() => setFresh(false), remaining);
    return () => window.clearTimeout(timer);
  }, [freshUntil]);
  async function reloadMethods() {
    const response = await fetch("/api/v1/account/recovery-methods", { cache: "no-store" });
    if (response.ok) setMethods((await response.json()).methods);
  }
  async function addPasskey() {
    setError("");
    const result = await authClient.passkey.addPasskey({ name });
    if (result.error) setError(t("error"));
    else {
      setName("");
      await reloadMethods();
    }
  }
  async function removeMethod(id: string) {
    const response = await fetch("/api/v1/account/recovery-methods", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ methodId: id }),
    });
    if (response.ok) return reloadMethods();
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    const failure = classifySecurityFailure(body?.error?.code ?? "");
    if (failure === "reauthenticate") {
      setFreshUntil(0);
      setFresh(false);
      setError(t("reauthRequired"));
    } else if (failure === "recovery-required") setError(t("recoveryRequired"));
    else setError(t("error"));
  }
  async function revoke(id: string) {
    const response = await fetch("/api/v1/account/sessions", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    });
    if (response.ok) setSessions((all) => all.filter((session) => session.id !== id));
    else setError(t("error"));
  }
  async function reloadSessions() {
    const response = await fetch("/api/v1/account/sessions", { cache: "no-store" });
    if (response.ok) setSessions((await response.json()).sessions);
  }
  async function link(provider: "google" | "apple") {
    await authClient.linkSocial({ provider, callbackURL: `/${locale}/account/security` });
  }
  async function reauthenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("reauthPassword") ?? "");
    const deadline = await finishReauthentication(
      () => authClient.signIn.email(inPlacePasswordCredentials(email, password)),
      reloadSessions,
    );
    if (deadline === null) setError(t("error"));
    else {
      setError("");
      setFreshUntil(deadline);
      setFresh(true);
    }
  }
  return (
    <div className="security-grid">
      {!fresh && (
        <section className="settings-card wide">
          <h2>{t("reauthTitle")}</h2>
          <p>{t("reauthIntro")}</p>
          <form className="inline-form" onSubmit={reauthenticate}>
            <label>
              {t("reauthPassword")}
              <input
                name="reauthPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit">{t("reauth")}</button>
          </form>
        </section>
      )}
      <section className="settings-card">
        <h2>{t("methods")}</h2>
        <ul className="method-list">
          {methods
            .filter((m) => m.type !== "passkey")
            .map((method) => (
              <li key={method.id}>
                <span>{t(providerTranslationKey(method.provider))}</span>
                {fresh && method.type === "provider" && (
                  <button onClick={() => removeMethod(method.id)}>
                    {t("removeProvider", { provider: t(providerTranslationKey(method.provider)) })}
                  </button>
                )}
              </li>
            ))}
        </ul>
        <div className="social-buttons">
          <button onClick={() => link("google")}>{t("linkGoogle")}</button>
          <button onClick={() => link("apple")}>{t("linkApple")}</button>
        </div>
      </section>
      <section className="settings-card">
        <h2>{t("passkeys")}</h2>
        {fresh && (
          <div className="inline-form">
            <label>
              {t("passkeyName")}
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button onClick={addPasskey}>{t("addPasskey")}</button>
          </div>
        )}
        <ul className="method-list">
          {methods
            .filter((m) => m.type === "passkey")
            .map((method) => (
              <li key={method.id}>
                <span>{method.name ?? t("unnamedPasskey")}</span>
                {fresh && (
                  <button onClick={() => removeMethod(method.id)}>
                    {t("removePasskey", { name: method.name ?? t("unnamedPasskey") })}
                  </button>
                )}
              </li>
            ))}
        </ul>
      </section>
      <section className="settings-card wide">
        <h2>{t("sessions")}</h2>
        <ul className="session-list">
          {sessions.map((session) => (
            <li data-testid="account-session" key={session.id}>
              <div>
                <strong>{session.current ? t("current") : t("other")}</strong>
                <span>{session.userAgent ?? t("unknownDevice")}</span>
              </div>
              {!session.current && (
                <button onClick={() => revoke(session.id)}>{t("revoke")}</button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
