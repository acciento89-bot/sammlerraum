import { createHash } from "node:crypto";
import {
  CATALOG_PROPOSAL_MAX_BYTES,
  CatalogProposalOperationSchema,
} from "@sammlerraum/contracts/catalog-proposals";
import { legacyMoneyFail } from "@sammlerraum/contracts/legacy-money";
import { serializeCatalogSnapshot } from "./catalog-service";
/** M4 foundation only: not an authority, and not connected to submission/approval. */
export function digestCatalogMoneyPatch(input: unknown): string {
  try {
    const parsed = CatalogProposalOperationSchema.safeParse(input);
    if (!parsed.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
    const serialized = serializeCatalogSnapshot(parsed.data);
    if (Buffer.byteLength(serialized) > CATALOG_PROPOSAL_MAX_BYTES)
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    return createHash("sha256").update(serialized, "utf8").digest("hex");
  } catch {
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  }
}
