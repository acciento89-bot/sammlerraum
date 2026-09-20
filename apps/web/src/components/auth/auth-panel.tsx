"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { authClient } from "../../lib/auth-client";

type Props = { locale: "de" | "en"; mode: "login" | "register" };

export function AuthPanel({ locale, mode }: Props) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const result =
      mode === "register"
        ? await authClient.signUp.email({
            name: String(data.get("name") ?? ""),
            email,
            password,
            callbackURL: `/${locale}/login`,
          })
        : await authClient.signIn.email({
            email,
            password,
            callbackURL: `/${locale}/account/profile`,
          });
    if (result.error) return setError(t("genericError"));
    if (mode === "register") setMessage(t("checkEmail"));
    else router.push(`/${locale}/account/profile`);
  }

  async function social(provider: "google" | "apple") {
    await authClient.signIn.social({ provider, callbackURL: `/${locale}/account/profile` });
  }

  async function resend() {
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: `/${locale}/login`,
    });
    setMessage(result.error ? t("genericError") : t("verificationResent"));
  }

  async function resetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resetEmail = String(new FormData(event.currentTarget).get("resetEmail") ?? "");
    await authClient.requestPasswordReset({ email: resetEmail, redirectTo: `/${locale}/login` });
    setMessage(t("resetSent"));
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("newPassword") ?? "");
    const result = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
    setMessage(result.error ? t("genericError") : t("resetDone"));
  }

  async function passkeySignIn() {
    const result = await authClient.signIn.passkey();
    if (result.error) setError(t("genericError"));
    else router.push(`/${locale}/account/profile`);
  }

  return (
    <section className="account-shell" aria-labelledby="auth-title">
      <div className="auth-card">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 id="auth-title">{t(mode === "login" ? "loginTitle" : "registerTitle")}</h1>
        <p className="form-intro">{t(mode === "login" ? "loginIntro" : "registerIntro")}</p>
        {token ? (
          <form className="form-stack" onSubmit={resetPassword}>
            <label>
              {t("newPassword")}
              <input
                name="newPassword"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <button type="submit">{t("savePassword")}</button>
          </form>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            {mode === "register" && (
              <label>
                {t("name")}
                <input name="name" autoComplete="name" required />
              </label>
            )}
            <label>
              {t("email")}
              <input
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              {t("password")}
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>
            <button type="submit">{t(mode === "login" ? "login" : "register")}</button>
          </form>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {mode === "register" && message && (
          <button className="text-button" onClick={resend}>
            {t("resend")}
          </button>
        )}
        {mode === "login" && !token && (
          <>
            <div className="divider">
              <span>{t("or")}</span>
            </div>
            <div className="social-buttons">
              <button onClick={() => social("google")}>{t("google")}</button>
              <button onClick={() => social("apple")}>{t("apple")}</button>
              <button onClick={passkeySignIn}>{t("passkeySignIn")}</button>
            </div>
            <button className="text-button" onClick={() => setForgot(!forgot)}>
              {t("forgot")}
            </button>
            {forgot && (
              <form className="form-stack inset-form" onSubmit={resetRequest}>
                <label>
                  {t("resetEmail")}
                  <input name="resetEmail" type="email" autoComplete="email" required />
                </label>
                <button type="submit">{t("sendReset")}</button>
              </form>
            )}
          </>
        )}
        <p className="auth-switch">
          <Link href={`/${locale}/${mode === "login" ? "register" : "login"}`}>
            {t(mode === "login" ? "toRegister" : "toLogin")}
          </Link>
        </p>
      </div>
    </section>
  );
}
