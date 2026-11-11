import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { prisma } from "@sammlerraum/db/client";
import { auth } from "../../../../lib/auth";
import { adminUsers, parseAdminQuery, requireAdmin } from "../../../../lib/admin-users";
import { ApiError } from "@sammlerraum/contracts/errors";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Sammlerraum · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "de" | "en" }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const de = locale === "de";
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  try {
    await requireAdmin(prisma, session.user.id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  }
  const wire = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
      wire.append(key, item);
  }
  let query;
  try {
    query = parseAdminQuery(new Request(`https://admin.invalid/?${wire}`));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 400) throw error;
    return (
      <section className={styles.panel}>
        <h1>{de ? "Ungültiger Filter" : "Invalid filter"}</h1>
        <Link href={`/${locale}/admin`}>{de ? "Filter zurücksetzen" : "Reset filters"}</Link>
      </section>
    );
  }
  const data = await adminUsers(prisma, session.user.id, query);
  const format = new Intl.DateTimeFormat(de ? "de-DE" : "en-GB", {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const pageHref = (page: number) =>
    `/${locale}/admin?${new URLSearchParams({ q: query.q, verified: query.verified, page: String(page) })}`;
  const cards = de
    ? [
        ["Konten insgesamt", data.summary.total],
        ["E-Mail bestätigt", data.summary.verified],
        ["Heute registriert", data.summary.today],
        ["Letzte 7 Kalendertage", data.summary.lastSevenDays],
      ]
    : [
        ["Total accounts", data.summary.total],
        ["Email verified", data.summary.verified],
        ["Registered today", data.summary.today],
        ["Last 7 calendar days", data.summary.lastSevenDays],
      ];
  return (
    <section className={styles.admin}>
      <header>
        <p className={styles.eyebrow}>{de ? "Geschützter Inhaberbereich" : "Private owner area"}</p>
        <h1>{de ? "Nutzer & Registrierungen" : "Users & registrations"}</h1>
        <p>
          {de
            ? "Direkt aus deiner Sammlerraum-Datenbank. Enthält auch eigene Konten und Testkonten; keine Zuordnung zu Werbeklicks."
            : "Directly from your Sammlerraum database. Includes owner and test accounts; these figures do not attribute advertising clicks."}
        </p>
      </header>
      <div className={styles.metrics}>
        {cards.map(([label, count]) => (
          <div className={styles.panel} key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      <div className={styles.panel}>
        <form className={styles.filters} action={`/${locale}/admin`} method="get">
          <label>
            {de ? "Name oder E-Mail" : "Name or email"}
            <input type="search" name="q" maxLength={120} defaultValue={query.q} />
          </label>
          <label>
            {de ? "E-Mail-Status" : "Email status"}
            <select name="verified" defaultValue={query.verified}>
              <option value="all">{de ? "Alle" : "All"}</option>
              <option value="yes">{de ? "Bestätigt" : "Verified"}</option>
              <option value="no">{de ? "Nicht bestätigt" : "Unverified"}</option>
            </select>
          </label>
          <button type="submit">{de ? "Suchen" : "Search"}</button>
          <Link href={`/${locale}/admin`}>{de ? "Zurücksetzen" : "Reset"}</Link>
        </form>
        <p>
          {data.matched} {de ? "Konten gefunden" : "accounts found"}
        </p>
        <div className={styles.tableWrap}>
          <table>
            <caption className={styles.caption}>
              {de ? "Registrierte Konten · neueste zuerst" : "Registered accounts · newest first"}
            </caption>
            <thead>
              <tr>
                <th>{de ? "Name" : "Name"}</th>
                <th>E-Mail</th>
                <th>{de ? "Registriert" : "Registered"}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name || "—"}</td>
                  <td>{user.email}</td>
                  <td>{format.format(user.createdAt)}</td>
                  <td>
                    <span className={user.emailVerified ? styles.verified : styles.pending}>
                      {user.emailVerified
                        ? de
                          ? "Bestätigt"
                          : "Verified"
                        : de
                          ? "Unbestätigt"
                          : "Unverified"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.users.length === 0 && (
          <p role="status">
            {de
              ? "Keine Konten auf dieser Seite. Bitte Filter oder Seitenauswahl ändern."
              : "No accounts on this page. Adjust the filters or page selection."}
          </p>
        )}
        <nav className={styles.pagination} aria-label={de ? "Nutzerseiten" : "User pages"}>
          {query.page > 1 && (
            <Link href={pageHref(query.page - 1)}>{de ? "← Zurück" : "← Previous"}</Link>
          )}
          <span>
            {de ? "Seite" : "Page"} {query.page}
          </span>
          {query.page * 25 < data.matched && query.page < 4000 && (
            <Link href={pageHref(query.page + 1)}>{de ? "Weiter →" : "Next →"}</Link>
          )}
        </nav>
      </div>
      <p className={styles.note}>
        {de
          ? "Nur lesender Zugriff · Zeiten: Europe/Berlin · Stand:"
          : "Read-only access · Time zone: Europe/Berlin · Updated:"}{" "}
        {format.format(new Date(data.generatedAt))}
      </p>
    </section>
  );
}
