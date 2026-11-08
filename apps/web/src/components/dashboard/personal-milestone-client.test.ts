import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  listMilestones,
  MilestoneMutationUnknownError,
} from "./personal-milestone-client";
import { SearchHttpError } from "../search/search-client";
const dto = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Café",
  milestoneDate: "0001-01-01",
  revision: 1,
  dateBasis: "OWNER_ENTERED" as const,
  createdAt: "2026-11-05T12:00:00.001Z",
  updatedAt: "2026-11-05T12:00:00.001Z",
};
const input = { title: " Cafe\u0301 ", milestoneDate: dto.milestoneDate };
function responding(value: unknown, status = 200) {
  const fetch = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(value), { status }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("private milestone client protocol", () => {
  it("sends a normalized private POST body and accepts the matching real-contract acknowledgement", async () => {
    const fetch = responding(dto, 201),
      signal = new AbortController().signal;
    expect(await createMilestone(input, signal)).toEqual(dto);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("/api/v1/dashboard/milestones");
    const init = fetch.mock.calls[0]![1]!;
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Café",
      milestoneDate: dto.milestoneDate,
    });
  });
  it("uses fetched CAS identity and accepts only the matching full replacement acknowledgement", async () => {
    const fetch = responding({ ...dto, revision: 2, title: "Changed" });
    expect(
      await updateMilestone(
        dto,
        { title: "Changed", milestoneDate: dto.milestoneDate },
        new AbortController().signal,
      ),
    ).toMatchObject({ id: dto.id, revision: 2 });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({
      title: "Changed",
      milestoneDate: dto.milestoneDate,
      expectedRevision: 1,
    });
  });
  it.each([
    { id: "00000000-0000-4000-8000-000000000002" },
    { revision: 1 },
    { title: "Different" },
    { createdAt: "2026-11-05T12:00:00.000Z" },
  ])("treats a mismatched update acknowledgement as unknown, never retrying %j", async (patch) => {
    const fetch = responding({ ...dto, title: "Changed", revision: 2, ...patch });
    await expect(
      updateMilestone(
        dto,
        { title: "Changed", milestoneDate: dto.milestoneDate },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(MilestoneMutationUnknownError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("binds deletion acknowledgement to the submitted identity", async () => {
    const fetch = responding({ id: dto.id });
    expect(await deleteMilestone(dto, new AbortController().signal)).toEqual({ id: dto.id });
    expect(fetch.mock.calls[0]![1]!.method).toBe("DELETE");
    responding({ id: "00000000-0000-4000-8000-000000000002" });
    await expect(deleteMilestone(dto, new AbortController().signal)).rejects.toBeInstanceOf(
      MilestoneMutationUnknownError,
    );
  });
  it.each([400, 401, 403, 404, 409, 413, 414])(
    "preserves explicit HTTP rejection %s instead of calling it an unknown write",
    async (status) => {
      responding(
        { error: { code: status === 409 ? "MILESTONE_CONFLICT" : "MILESTONE_INVALID" } },
        status,
      );
      await expect(createMilestone(input, new AbortController().signal)).rejects.toMatchObject({
        status,
      });
    },
  );
  it("does not send invalid local values or recast them as an unknown transaction", async () => {
    const fetch = responding(dto, 201);
    await expect(
      createMilestone({ ...input, milestoneDate: "1900-02-29" }, new AbortController().signal),
    ).rejects.toMatchObject({ code: "MILESTONE_INVALID" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([500, 503])("retains uncertainty after a server failure %s", async (status) => {
    const fetch = responding({ error: { code: "SEARCH_UNAVAILABLE" } }, status);
    await expect(createMilestone(input, new AbortController().signal)).rejects.toBeInstanceOf(
      MilestoneMutationUnknownError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("treats lost, malformed and oversized successful acknowledgements as unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Error("transport dropped");
      }),
    );
    await expect(createMilestone(input, new AbortController().signal)).rejects.toBeInstanceOf(
      MilestoneMutationUnknownError,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not JSON", { status: 201 })),
    );
    await expect(createMilestone(input, new AbortController().signal)).rejects.toBeInstanceOf(
      MilestoneMutationUnknownError,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(dto) + " ".repeat(65536), { status: 201 })),
    );
    await expect(createMilestone(input, new AbortController().signal)).rejects.toBeInstanceOf(
      MilestoneMutationUnknownError,
    );
  });
  it("posts bounded list cursors privately and rejects a fake empty fallback or oversized response", async () => {
    const page = {
        version: 1,
        scope: "OWNED",
        selectionBasis: "ALL_PERSONAL_MILESTONES",
        readAt: dto.createdAt,
        items: [dto],
        total: 1,
        nextCursor: null,
      },
      fetch = responding(page);
    expect(await listMilestones(new AbortController().signal, { limit: 5 })).toEqual(page);
    expect(fetch.mock.calls[0]![0]).toBe("/api/v1/dashboard/milestones/query");
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({ limit: 5 });
    responding({});
    await expect(listMilestones(new AbortController().signal)).rejects.toBeInstanceOf(
      SearchHttpError,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(page) + " ".repeat(65536))),
    );
    await expect(listMilestones(new AbortController().signal)).rejects.toBeInstanceOf(
      SearchHttpError,
    );
  });
});
