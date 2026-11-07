/** Allow only an exact invitation route in the already selected locale; never arbitrary redirects. */
export function invitationReturnPath(value: unknown, locale: "de" | "en") {
  return typeof value === "string" &&
    value.length === `/${locale}/invite/`.length + 43 &&
    new RegExp(`^/${locale}/invite/[A-Za-z0-9_-]{43}$`).test(value)
    ? value
    : `/${locale}/account/profile`;
}
