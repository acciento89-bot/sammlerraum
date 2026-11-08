import type { MoneySubject } from "@sammlerraum/contracts/legacy-money";
import type { SearchReadTransaction } from "../search/search-read";
import { readMoneyFact, requireMoneyToken } from "../money/legacy-money-store";
/** Retain exact raw digits and evidenced interpretation, never tokens, receipt text or auth rows. */
export async function captureMoneyAuditSnapshot(
  tx: SearchReadTransaction,
  subject: MoneySubject,
  actorId: string,
) {
  const who = { userId: actorId },
    view = await readMoneyFact(tx, subject, who),
    fact = await requireMoneyToken(tx, subject, who, view.factToken);
  return {
    family: subject.family,
    fieldDefinitionId: subject.family === "CUSTOM" ? subject.fieldDefinitionId : null,
    generation: fact.generation,
    sequence: fact.sequence,
    raw: fact.view.raw,
    interpretation: fact.view.interpretation,
  };
}
