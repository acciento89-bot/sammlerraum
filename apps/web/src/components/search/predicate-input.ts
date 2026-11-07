/** Native datetime fields represent the explicitly labelled UTC clock, never the browser timezone. */
export function fromUtcControl(value: string) {
  if (!value) return "";
  const [date, time = ""] = value.split("T");
  const [clock = "", fraction = ""] = time.split(".");
  return `${date}T${clock.length === 5 ? `${clock}:00` : clock}.${fraction.padEnd(3, "0")}Z`;
}
export function toUtcControl(value: string) {
  return value.replace(/Z$/u, "");
}
