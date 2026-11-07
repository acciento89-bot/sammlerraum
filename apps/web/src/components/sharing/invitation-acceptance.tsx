"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { managementRequest, managementError, ManagementProblem } from "./management-request";
export function InvitationAcceptance({
  locale,
  token,
  signedIn,
}: {
  locale: string;
  token: string;
  signedIn: boolean;
}) {
  const t = useTranslations("Collaboration"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [collection, setCollection] = useState<string | null>(null);
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const result = await managementRequest<{ collectionId: string }>(
        "/api/v1/invitations/accept",
        { token },
      );
      setCollection(result.collectionId);
    } catch (problem) {
      const code = problem instanceof ManagementProblem ? problem.code : "";
      setError(
        code === "INVITATION_RECIPIENT_MISMATCH"
          ? t("wrongRecipient")
          : code === "INVITATION_VERIFICATION_REQUIRED"
            ? t("verifyEmail")
            : code === "INVITATION_EXPIRED" || code === "INVITATION_REVOKED"
              ? t("invitationGone")
              : managementError(problem, t),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-shell">
      <div className="management-card">
        <p className="eyebrow">Sammlerraum</p>
        <h1>{t("acceptTitle")}</h1>
        <p>{t("acceptIntro")}</p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {collection ? (
          <>
            <p role="status">{t("invitationAccepted")}</p>
            <Link href={`/${locale}/collections/${collection}/members`}>{t("openMembers")}</Link>
          </>
        ) : signedIn ? (
          <button disabled={busy} onClick={() => void accept()}>
            {t("acceptInvitation")}
          </button>
        ) : (
          <Link
            href={`/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/invite/${token}`)}`}
          >
            {t("signInToAccept")}
          </Link>
        )}
      </div>
    </section>
  );
}
