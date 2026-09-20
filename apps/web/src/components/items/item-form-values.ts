export function minorUnits(input: string): number | null {
  if (input.trim() === "") return null;
  const normalized = input.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error("money");
  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) throw new Error("money");
  return amount;
}

export function majorUnits(amount: number | null): string {
  if (amount === null) return "";
  return (amount / 100).toFixed(2);
}
