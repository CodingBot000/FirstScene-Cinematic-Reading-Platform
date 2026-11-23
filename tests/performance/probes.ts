import type { Page } from "@playwright/test";
export async function installLifecycleProbe(page: Page, readerFailures = 0) {
  await page.addInitScript((readerFailures) => {
    let failedReaderObservations = 0;
    type Entry = {
      target: EventTarget;
      type: string;
      listener: EventListenerOrEventListenerObject;
      capture: boolean;
      label: string;
    };
    const entries: Entry[] = [];
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    const label = (target: EventTarget) =>
      target === window
        ? "window"
        : target === document
          ? "document"
          : typeof MediaQueryList !== "undefined" &&
              target instanceof MediaQueryList
            ? "media:" + target.media
            : null;
    const capture = (options?: boolean | AddEventListenerOptions) =>
      typeof options === "boolean" ? options : Boolean(options?.capture);
    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      const targetLabel = label(this);
      if (
        targetLabel &&
        listener &&
        !(typeof options === "object" && options.once) &&
        !entries.some(
          (e) =>
            e.target === this &&
            e.type === type &&
            e.listener === listener &&
            e.capture === capture(options),
        )
      ) {
        entries.push({
          target: this,
          type,
          listener,
          capture: capture(options),
          label: targetLabel,
        });
      }
      return Reflect.apply(nativeAdd, this, [type, listener, options]);
    };
    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options,
    ) {
      const index = entries.findIndex(
        (e) =>
          e.target === this &&
          e.type === type &&
          e.listener === listener &&
          e.capture === capture(options),
      );
      if (index >= 0) entries.splice(index, 1);
      return Reflect.apply(nativeRemove, this, [type, listener, options]);
    };
    const observed = new Map<ResizeObserver, Set<Element>>();
    const NativeResizeObserver = ResizeObserver;
    window.ResizeObserver = class extends NativeResizeObserver {
      observe(target: Element, options?: ResizeObserverOptions) {
        const targets = observed.get(this) ?? new Set<Element>();
        targets.add(target);
        observed.set(this, targets);
        super.observe(target, options);
        if (
          target.classList.contains("fs-reader") &&
          failedReaderObservations < readerFailures
        ) {
          failedReaderObservations++;
          throw new Error("P10_TEST_READER_LAYOUT_FAILURE");
        }
      }
      unobserve(target: Element) {
        const targets = observed.get(this);
        targets?.delete(target);
        if (!targets?.size) observed.delete(this);
        super.unobserve(target);
      }
      disconnect() {
        observed.delete(this);
        super.disconnect();
      }
    };
    (
      window as unknown as { firstsceneLeakProbe: { snapshot: () => unknown } }
    ).firstsceneLeakProbe = {
      snapshot: () => {
        const listeners: Record<string, number> = {};
        for (const entry of entries) {
          const key = entry.label + ":" + entry.type + ":" + entry.capture;
          listeners[key] = (listeners[key] ?? 0) + 1;
        }
        return {
          listeners: Object.fromEntries(Object.entries(listeners).sort()),
          resizeObservers: observed.size,
          failedReaderObservations,
        };
      },
    };
  }, readerFailures);
}
export async function lifecycleSnapshot(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        firstsceneLeakProbe: {
          snapshot: () => {
            listeners: Record<string, number>;
            resizeObservers: number;
            failedReaderObservations: number;
          };
        };
      }
    ).firstsceneLeakProbe.snapshot(),
  );
}
