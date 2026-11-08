export async function privateApi<T>(path: string, input?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(
    path,
    input === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          cache: "no-store",
        },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.code ?? "TRANSFER_UNAVAILABLE");
  return body as T;
}
export type ArtifactHistoryItem = {
  id: string;
  kind: "TABULAR" | "REPORT";
  format: "CSV" | "XLSX" | "PDF";
  status: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  downloadAvailable: boolean;
  errorCode: string | null;
};
export type ArtifactHistory = {
  items: ArtifactHistoryItem[];
  hasMore: boolean;
  nextBefore: { createdAt: string; id: string; kind: "TABULAR" | "REPORT" } | null;
};
