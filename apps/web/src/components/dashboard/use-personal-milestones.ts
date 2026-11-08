"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonalMilestonePage } from "@sammlerraum/contracts/personal-milestones";
import { RequestChannel } from "../search/search-state";
import { searchErrorKey } from "../search/search-client";
import { listMilestones } from "./personal-milestone-client";
export type MilestoneRead = {
  page: PersonalMilestonePage | null;
  cursor: string | undefined;
  loading: boolean;
  error: string;
  stale: boolean;
  nonce: number;
};
const initial: MilestoneRead = {
  page: null,
  cursor: undefined,
  loading: true,
  error: "",
  stale: false,
  nonce: 0,
};
/** Independent bounded list: inventory queries do not enter this hook. */
export function usePersonalMilestones(actor: string, limit: number, onClear?: () => void) {
  const channel = useRef(new RequestChannel()),
    clearRef = useRef(onClear);
  clearRef.current = onClear;
  const [state, setState] = useState<MilestoneRead>(initial);
  const load = useCallback(
    async (cursor?: string, refresh = false) => {
      if (channel.current.closed) return;
      const request = channel.current.begin();
      setState((old) => ({
        page: refresh && old.cursor === cursor ? old.page : null,
        cursor,
        loading: true,
        error: "",
        stale: false,
        nonce: request.id,
      }));
      try {
        const page = await listMilestones(request.signal, { limit, ...(cursor ? { cursor } : {}) });
        if (!channel.current.current(request.id)) return;
        setState({ page, cursor, loading: false, error: "", stale: false, nonce: request.id });
        return { page, nonce: request.id };
      } catch (error) {
        if (channel.current.current(request.id))
          setState((old) => ({
            ...old,
            loading: false,
            error: searchErrorKey(error),
            stale: !!old.page,
          }));
      }
    },
    [limit],
  );
  const invalidate = useCallback(() => {
    channel.current.cancel();
    setState((old) => ({ ...old, loading: false, stale: !!old.page }));
  }, []);
  useEffect(() => {
    const clear = () => {
      channel.current.close();
      setState({ ...initial, loading: false, error: "session" });
      clearRef.current?.();
    };
    window.addEventListener("sammlerraum:search-cleared", clear);
    void load();
    return () => {
      channel.current.cancel();
      window.removeEventListener("sammlerraum:search-cleared", clear);
    };
  }, [actor, load]);
  return { state, load, invalidate, closed: channel.current.closed };
}
