import { afterEach, expect, it, vi } from "vitest";
import { DeferredFocus } from "./deferred-focus";
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const callbacks: FrameRequestCallback[] = [],
    body = { isConnected: true },
    button = { isConnected: true };
  const doc = { activeElement: button as unknown, body };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("requestAnimationFrame", (work: FrameRequestCallback) => {
    callbacks.push(work);
    return callbacks.length;
  });
  return { doc, button, flush: () => callbacks.splice(0).forEach((work) => work(0)) };
}
it("does not steal focus after the user moved to another control", () => {
  const f = fixture(),
    focus = vi.fn(),
    guard = new DeferredFocus();
  guard.afterRender(() => ({ focus }) as unknown as HTMLElement);
  f.doc.activeElement = { isConnected: true };
  f.flush();
  expect(focus).not.toHaveBeenCalled();
});
it("restores focus after the activating node was removed", () => {
  const f = fixture(),
    focus = vi.fn(),
    guard = new DeferredFocus();
  guard.afterRender(() => ({ focus }) as unknown as HTMLElement);
  f.button.isConnected = false;
  f.doc.activeElement = f.doc.body;
  f.flush();
  expect(focus).toHaveBeenCalledOnce();
});
it("only the latest queued intent may move focus", () => {
  const f = fixture(),
    old = vi.fn(),
    current = vi.fn(),
    guard = new DeferredFocus();
  guard.afterRender(() => ({ focus: old }) as unknown as HTMLElement);
  guard.afterRender(() => ({ focus: current }) as unknown as HTMLElement);
  f.flush();
  expect(old).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledOnce();
});
it("cancels pending focus on unmount or private editor replacement", () => {
  const f = fixture(),
    focus = vi.fn(),
    guard = new DeferredFocus();
  guard.afterRender(() => ({ focus }) as unknown as HTMLElement);
  guard.cancel();
  f.flush();
  expect(focus).not.toHaveBeenCalled();
});
