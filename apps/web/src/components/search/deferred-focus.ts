/** Defer focus until React commits, without overriding a newer user intent. */
export class DeferredFocus {
  private generation = 0;
  afterRender(target: () => HTMLElement | null | undefined) {
    const generation = ++this.generation,
      origin = document.activeElement;
    requestAnimationFrame(() => {
      if (generation !== this.generation) return;
      const active = document.activeElement;
      if (active !== origin && !(origin && !origin.isConnected && active === document.body)) return;
      target()?.focus();
    });
  }
  cancel() {
    ++this.generation;
  }
}
