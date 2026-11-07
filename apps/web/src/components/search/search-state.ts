/** Request generations reject late callbacks even when a transport ignores abort. */
export class RequestChannel {
  private generation = 0;
  private permanentlyClosed = false;
  get closed() {
    return this.permanentlyClosed;
  }
  close() {
    this.permanentlyClosed = true;
    this.cancel();
  }
  private control?: AbortController;
  begin() {
    if (this.closed) throw new DOMException("Session expired", "AbortError");
    this.control?.abort();
    this.control = new AbortController();
    return { id: ++this.generation, signal: this.control.signal };
  }
  current(id: number) {
    return id === this.generation && !this.control?.signal.aborted;
  }
  cancel() {
    this.control?.abort();
    ++this.generation;
  }
}
/** Labels only: drafts and normalized query operands never live in this cache. */
export class MetadataCache {
  private entries = new Map<string, { value: unknown; bytes: number }>();
  bytes = 0;
  private activeRequests = 0;
  private queued: Array<() => void> = [];
  private picker: string | null = null;
  private pickerListeners = new Set<(id: string | null) => void>();
  selectPicker(id: string | null) {
    this.picker = id;
    this.pickerListeners.forEach((listener) => listener(id));
  }
  watchPicker(listener: (id: string | null) => void) {
    this.pickerListeners.add(listener);
    listener(this.picker);
    return () => {
      this.pickerListeners.delete(listener);
    };
  }
  expand<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        const index = this.queued.indexOf(start);
        if (index >= 0) this.queued.splice(index, 1);
        reject(new DOMException("Aborted", "AbortError"));
      };
      const finish = () => {
        this.activeRequests--;
        this.queued.shift()?.();
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) {
          abort();
          this.queued.shift()?.();
          return;
        }
        this.activeRequests++;
        try {
          void work().then(resolve, reject).finally(finish);
        } catch (error) {
          reject(error);
          finish();
        }
      };
      if (signal.aborted) {
        abort();
        return;
      }
      if (this.activeRequests < 2) start();
      else {
        this.queued.push(start);
        signal.addEventListener("abort", abort, { once: true });
      }
    });
  }
  get size() {
    return this.entries.size;
  }
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as T;
  }
  set(key: string, value: unknown) {
    const bytes = new TextEncoder().encode(JSON.stringify({ key, value })).length;
    const old = this.entries.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.entries.delete(key);
    }
    if (bytes > 256 * 1024) return;
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.size > 150 || this.bytes > 256 * 1024) {
      const first = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(first)!.bytes;
      this.entries.delete(first);
    }
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
    this.selectPicker(null);
  }
}
