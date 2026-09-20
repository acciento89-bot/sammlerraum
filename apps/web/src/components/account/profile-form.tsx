"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

type Profile = {
  handle: string;
  displayName: string;
  bio: string | null;
  avatarAssetId: string | null;
};

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const t = useTranslations("Profile");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/account/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle: data.get("handle"),
        displayName: data.get("displayName"),
        bio: String(data.get("bio") ?? "") || null,
        avatarAssetId: null,
      }),
    });
    setMessage(response.ok ? t("saved") : t("error"));
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        {t("handle")}
        <input
          name="handle"
          defaultValue={profile?.handle ?? ""}
          pattern="[a-z0-9][a-z0-9-]{2,63}"
          required
        />
      </label>
      <label>
        {t("displayName")}
        <input
          name="displayName"
          defaultValue={profile?.displayName ?? ""}
          maxLength={80}
          required
        />
      </label>
      <label>
        {t("bio")}
        <textarea name="bio" defaultValue={profile?.bio ?? ""} maxLength={500} />
      </label>
      <button type="submit">{t("save")}</button>
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
    </form>
  );
}
