import type { CollectibleAnalysis, AIReportedUsage } from "@sammlerraum/contracts/ai";
/** Authorized processed image bytes only. No storage credentials, user identity, URLs or documents. */
export type AICollectibleImage = Readonly<{ bytes: Uint8Array; mimeType: "image/webp" }>;
export type AIAnalysisInput = Readonly<{
  images: readonly AICollectibleImage[];
  signal: AbortSignal;
}>;
export type AIAnalysisOutput = Readonly<{ analysis: CollectibleAnalysis; usage: AIReportedUsage }>;
export interface AIProvider {
  readonly id: string;
  readonly model: string;
  analyzeCollectible(input: AIAnalysisInput): Promise<AIAnalysisOutput>;
}
