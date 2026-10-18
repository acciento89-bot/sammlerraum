import type {
  ManualValuationDto,
  ManualValuationInputDto,
  ValuationSummaryDto,
  SourceHistoryDto,
  SummaryOptions,
  MarketScope,
} from "@sammlerraum/contracts/valuations";
export class ValuationHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export type ValuationTransport = {
  summary(options: SummaryOptions, signal?: AbortSignal): Promise<ValuationSummaryDto>;
  source(selector: string, cursor?: string, signal?: AbortSignal): Promise<SourceHistoryDto>;
  append(input: ManualValuationInputDto): Promise<ManualValuationDto>;
};
export type ValuationState = {
  summary: ValuationSummaryDto | null;
  source: SourceHistoryDto | null;
  selector: string | null;
  ack: ManualValuationDto | null;
  mutation: "idle" | "submitting" | "saved" | "rejected" | "unknown";
  error: string;
  access: "" | "session" | "missing";
  loading: boolean;
  sourceLoading: boolean;
  stale: boolean;
  externalInvalidated: boolean;
  options: SummaryOptions;
  draftVersion: number;
};
/** Independent read/source generations and synchronous write guard. No write is retried. */
export class ValuationController {
  state: ValuationState = {
    summary: null,
    source: null,
    selector: null,
    ack: null,
    mutation: "idle",
    error: "",
    access: "",
    loading: false,
    sourceLoading: false,
    stale: false,
    externalInvalidated: false,
    options: { scope: "CURRENT_MAPPING" },
    draftVersion: 0,
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private sourceSequence = 0;
  private readAbort?: AbortController;
  private sourceAbort?: AbortController;
  private writing = false;
  private saveRefreshPending = false;
  private blocked = false;
  private disposed = false;
  constructor(private transport: ValuationTransport) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<ValuationState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  get canAppend() {
    return (
      !this.blocked &&
      this.state.summary?.lifecycle === "ACTIVE" &&
      !this.writing &&
      this.state.mutation !== "unknown" &&
      !this.state.access
    );
  }
  private invalidate() {
    this.readAbort?.abort();
    this.sourceAbort?.abort();
    this.sourceSequence++;
    return ++this.epoch;
  }
  dispose() {
    this.disposed = true;
    this.invalidate();
  }
  private current(epoch: number) {
    return !this.disposed && epoch === this.epoch;
  }
  private privateFailure(error: unknown, summary: boolean) {
    if (
      !(error instanceof ValuationHttpError) ||
      !(error.status === 401 || (summary && error.status === 404))
    )
      return false;
    this.invalidate();
    this.saveRefreshPending = false;
    this.update({
      summary: null,
      externalInvalidated: true,
      source: null,
      selector: null,
      ack: null,
      access: error.status === 401 ? "session" : "missing",
      loading: false,
      sourceLoading: false,
      error: "",
      mutation: "idle",
      draftVersion: this.state.draftVersion + 1,
    });
    return true;
  }
  async load(options: SummaryOptions = { scope: this.state.options.scope }, recover = true) {
    const epoch = this.invalidate();
    const abort = new AbortController();
    this.readAbort = abort;
    const selected = {
      scope: this.state.options.scope,
      ...options,
      manualLimit: 20,
      groupLimit: 4,
    };
    this.update({
      loading: true,
      sourceLoading: false,
      source: null,
      selector: null,
      error: this.state.mutation === "unknown" ? "unknown" : "",
      options: selected,
      stale: !!this.state.summary,
    });
    try {
      const summary = await this.transport.summary(selected, abort.signal);
      if (!this.current(epoch)) return;
      this.saveRefreshPending = false;
      this.update({
        summary,
        externalInvalidated: false,
        loading: false,
        stale: false,
        access: "",
        ...(this.state.ack &&
        summary.manual.history.records.some((row) => row.id === this.state.ack!.id)
          ? { ack: null }
          : {}),
      });
    } catch (error) {
      if (!this.current(epoch) || this.privateFailure(error, true)) return;
      if (error instanceof ValuationHttpError && error.code === "VALUATION_CURSOR_STALE") {
        if (recover) {
          const recoveryEpoch = this.epoch + 1;
          await this.load({ scope: selected.scope }, false);
          if (this.current(recoveryEpoch) && !this.state.access)
            this.update({ error: "mappingChanged" });
          return;
        }
        this.update({ loading: false, error: "mappingChanged" });
        return;
      }
      this.update({
        loading: false,
        error: this.saveRefreshPending ? "refreshAfterSave" : "readError",
      });
    }
  }
  async scope(scope: MarketScope) {
    if (this.writing || this.state.mutation === "unknown") return;
    // Preserve the manual form's mounted identity. The view hides external facts
    // whose returned scope differs from the selected request scope.
    await this.load({ scope });
  }
  async source(selector: string, cursor?: string) {
    if (
      this.writing ||
      this.state.loading ||
      this.state.externalInvalidated ||
      this.state.mutation === "unknown"
    )
      return;
    this.sourceAbort?.abort();
    const abort = new AbortController();
    this.sourceAbort = abort;
    const epoch = this.epoch,
      sequence = ++this.sourceSequence;
    this.update({ selector, source: null, sourceLoading: true, error: "" });
    try {
      const source = await this.transport.source(selector, cursor, abort.signal);
      if (!this.current(epoch) || sequence !== this.sourceSequence) return;
      const summary = this.state.summary;
      const selected = summary?.external.groups.find((group) => group.source === selector);
      if (
        !summary ||
        source.itemId !== summary.itemId ||
        source.scope !== summary.external.scope ||
        source.catalog.entryId !== summary.catalog?.entryId ||
        source.catalog.variantId !== summary.catalog?.variantId ||
        source.catalog.revision !== summary.catalog?.revision ||
        !selected ||
        Object.keys(selected.key).some(
          (key) =>
            selected.key[key as keyof typeof selected.key] !==
            source.key[key as keyof typeof source.key],
        )
      )
        throw new Error("Source context changed");
      this.update({ source, sourceLoading: false });
    } catch (error) {
      if (
        !this.current(epoch) ||
        sequence !== this.sourceSequence ||
        this.privateFailure(error, false)
      )
        return;
      const externalRejected =
        error instanceof ValuationHttpError &&
        (error.status === 404 || error.code === "VALUATION_CURSOR_STALE");
      // Reject the cached directory, seed rows and off-page derived claims together.
      // A failed owner recheck may retain manual context, never restore these facts.
      this.update({
        source: null,
        selector: null,
        sourceLoading: false,
        ...(externalRejected ? { externalInvalidated: true } : {}),
      });
      if (externalRejected) {
        const recoveryEpoch = this.epoch + 1;
        await this.load({ scope: this.state.options.scope }, false);
        if (this.current(recoveryEpoch) && !this.state.access)
          this.update({ error: "mappingChanged" });
      } else this.update({ error: "readError" });
    }
  }
  async append(input: ManualValuationInputDto) {
    if (this.writing || this.state.mutation === "unknown" || this.blocked) return;
    this.writing = true;
    this.saveRefreshPending = false;
    const epoch = this.invalidate();
    const frozen = Object.freeze({ ...input });
    this.update({ mutation: "submitting", loading: false, sourceLoading: false, error: "" });
    try {
      const ack = await this.transport.append(frozen);
      if (!this.current(epoch)) return;
      this.saveRefreshPending = true;
      this.update({ ack, mutation: "saved", draftVersion: this.state.draftVersion + 1 });
      await this.load({ scope: this.state.options.scope });
    } catch (error) {
      if (!this.current(epoch) || this.privateFailure(error, true)) return;
      if (error instanceof ValuationHttpError && error.status >= 400 && error.status < 500) {
        if (error.code === "ITEM_INACTIVE" || error.code === "VALUATION_LIMIT_EXCEEDED")
          this.blocked = true;
        this.update({
          mutation: "rejected",
          error:
            error.code === "ITEM_INACTIVE"
              ? "inactive"
              : error.code === "VALUATION_LIMIT_EXCEEDED"
                ? "limit"
                : "validationError",
        });
        if (error.code === "ITEM_INACTIVE") {
          const recoveryEpoch = this.epoch + 1;
          await this.load({ scope: this.state.options.scope });
          if (this.current(recoveryEpoch) && !this.state.access) this.update({ error: "inactive" });
        }
      } else this.update({ mutation: "unknown", error: "unknown" });
    } finally {
      this.writing = false;
      if (!this.disposed) this.update({});
    }
  }
  newEntry() {
    if (this.writing) return;
    this.update({ mutation: "idle", error: "", draftVersion: this.state.draftVersion + 1 });
  }
}
