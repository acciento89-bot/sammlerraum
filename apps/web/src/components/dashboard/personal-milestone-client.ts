import { z } from "zod";
import {
  PersonalMilestoneDtoSchema,
  PersonalMilestonePageSchema,
  parsePersonalMilestoneMutation,
  parsePersonalMilestoneUpdate,
  parsePersonalMilestoneDelete,
  parsePersonalMilestonePageInput,
  PERSONAL_MILESTONE_MAX_BODY_BYTES,
  PERSONAL_MILESTONE_MAX_RESPONSE_BYTES,
  type PersonalMilestoneDto,
} from "@sammlerraum/contracts/personal-milestones";
import { searchRequest, SearchHttpError } from "../search/search-client";
const base = "/api/v1/dashboard/milestones",
  deleted = z.object({ id: z.string().uuid() }).strict();
export class MilestoneMutationUnknownError extends Error {
  constructor(readonly operation: "create" | "update" | "delete") {
    super("MILESTONE_MUTATION_OUTCOME_UNKNOWN");
  }
}
async function mutation<T>(
  operation: MilestoneMutationUnknownError["operation"],
  work: () => Promise<T>,
) {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof SearchHttpError &&
      [400, 401, 403, 404, 409, 413, 414].includes(error.status)
    )
      throw error;
    throw new MilestoneMutationUnknownError(operation);
  }
}
function boundedBody<T>(input: T): T {
  if (new TextEncoder().encode(JSON.stringify(input)).length > PERSONAL_MILESTONE_MAX_BODY_BYTES)
    throw new SearchHttpError(413, "MILESTONE_INVALID");
  return input;
}
export function listMilestones(signal: AbortSignal, query: unknown = {}) {
  return searchRequest(
    `${base}/query`,
    PersonalMilestonePageSchema,
    signal,
    boundedBody(parsePersonalMilestonePageInput(query)),
    "POST",
    PERSONAL_MILESTONE_MAX_RESPONSE_BYTES,
  );
}
export async function createMilestone(input: unknown, signal: AbortSignal) {
  const body = boundedBody(parsePersonalMilestoneMutation(input));
  return mutation("create", async () => {
    const row = await searchRequest(
      base,
      PersonalMilestoneDtoSchema,
      signal,
      body,
      "POST",
      PERSONAL_MILESTONE_MAX_RESPONSE_BYTES,
    );
    if (row.revision !== 1 || row.title !== body.title || row.milestoneDate !== body.milestoneDate)
      throw Error("Invalid creation acknowledgement");
    return row;
  });
}
export async function updateMilestone(
  original: Readonly<PersonalMilestoneDto>,
  input: unknown,
  signal: AbortSignal,
) {
  const record = PersonalMilestoneDtoSchema.parse(original),
    body = boundedBody(
      parsePersonalMilestoneUpdate({
        ...parsePersonalMilestoneMutation(input),
        expectedRevision: record.revision,
      }),
    );
  return mutation("update", async () => {
    const row = await searchRequest(
      `${base}/${record.id}`,
      PersonalMilestoneDtoSchema,
      signal,
      body,
      "PATCH",
      PERSONAL_MILESTONE_MAX_RESPONSE_BYTES,
    );
    if (
      row.id !== record.id ||
      row.revision !== record.revision + 1 ||
      row.createdAt !== record.createdAt ||
      row.updatedAt < record.updatedAt ||
      row.title !== body.title ||
      row.milestoneDate !== body.milestoneDate
    )
      throw Error("Invalid update acknowledgement");
    return row;
  });
}
export async function deleteMilestone(
  original: Readonly<PersonalMilestoneDto>,
  signal: AbortSignal,
) {
  const record = PersonalMilestoneDtoSchema.parse(original),
    body = boundedBody(parsePersonalMilestoneDelete({ expectedRevision: record.revision }));
  return mutation("delete", async () => {
    const result = await searchRequest(
      `${base}/${record.id}`,
      deleted,
      signal,
      body,
      "DELETE",
      PERSONAL_MILESTONE_MAX_RESPONSE_BYTES,
    );
    if (result.id !== record.id) throw Error("Invalid deletion acknowledgement");
    return result;
  });
}
