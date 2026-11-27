// Runs only in the disposable browser. Raw URLs and operation bodies stay in it.
export function installBaselineProbe({
  journey = false,
  frameCount = 180,
} = {}) {
  const { performance, PerformanceObserver } = window;
  const supported = PerformanceObserver.supportedEntryTypes;
  const state = {
    lcp: null,
    shifts: [],
    longTasks: [],
    events: [],
    frames: [],
    reactCommits: [],
    renderers: 0,
    dropped: 0,
    resourceBufferFull: false,
    transitions: [],
    slides: [],
    decodes: [],
    markNames: [],
    completion: false,
    slowDecode: false,
  };
  const observers = [];

  function observe(type, consume, options = {}) {
    if (!supported.includes(type)) return;
    const observer = new PerformanceObserver((list, _observer, details) => {
      state.dropped += details?.droppedEntriesCount ?? 0;
      list.getEntries().forEach(consume);
    });
    observer.observe({ type, buffered: true, ...options });
    observers.push({ observer, consume });
  }
  state.flush = () => {
    for (const { observer, consume } of observers)
      observer.takeRecords().forEach(consume);
  };

  observe("largest-contentful-paint", ({ startTime, url, element }) => {
    state.lcp = { startTime, url, element: element?.tagName ?? null };
  });
  observe("layout-shift", ({ startTime, value, hadRecentInput }) => {
    if (!hadRecentInput) state.shifts.push({ startTime, value });
  });
  observe("longtask", ({ startTime, duration }) => {
    state.longTasks.push({ startTime, duration });
  });
  observe(
    "event",
    ({
      name,
      startTime,
      duration,
      processingStart,
      processingEnd,
      interactionId,
    }) => {
      state.events.push({
        name,
        startTime,
        duration,
        inputDelay: processingStart - startTime,
        processingTime: processingEnd - processingStart,
        interactionId,
      });
    },
    { durationThreshold: 16 },
  );

  let previous = null;
  function frame(now) {
    if (previous !== null) state.frames.push(now - previous);
    previous = now;
    if (state.frames.length < frameCount) window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
  performance.setResourceTimingBufferSize(2000);
  performance.addEventListener("resourcetimingbufferfull", () => {
    state.resourceBufferFull = true;
  });

  // React's pinned DevTools hook exposes commit events in the release build.
  // We collect their timestamps only, without inspecting the fiber.
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => ++state.renderers,
      onCommitFiberRoot(_renderer, _root, _priority, didError) {
        state.reactCommits.push({
          time: performance.now(),
          didError: !!didError,
        });
      },
      onCommitFiberUnmount() {},
    };
  }

  window.firstsceneBaseline = state;
  state.mark = (name) => {
    if (state.markNames.includes(name)) return;
    state.markNames.push(name);
    performance.mark(name);
  };
  if (!journey) return;

  const startTransition = document.startViewTransition;
  if (startTransition) {
    document.startViewTransition = function (...args) {
      const transition = Reflect.apply(startTransition, this, args);
      const row = {
        types: Array.from(transition.types ?? []),
        start: performance.now(),
        update: null,
        ready: null,
        finished: null,
        skipped: false,
      };
      state.transitions.push(row);
      void transition.updateCallbackDone.then(
        () => {
          row.update = performance.now();
        },
        () => {},
      );
      void transition.ready.then(
        () => {
          row.ready = performance.now();
          row.coverAnimation = document
            .getAnimations()
            .some(
              (animation) =>
                animation.effect?.pseudoElement?.includes("(cover-") &&
                Number(animation.effect.getTiming().duration) > 0,
            );
        },
        () => {
          row.skipped = true;
        },
      );
      void transition.finished.then(
        () => {
          row.finished = performance.now();
        },
        () => {
          row.skipped = true;
        },
      );
      return transition;
    };
  }

  const animate = window.Element.prototype.animate;
  if (animate) {
    window.Element.prototype.animate = function (...args) {
      const animation = Reflect.apply(animate, this, args);
      if (!this.closest(".fs-reader")) return animation;
      const row = { start: performance.now(), settled: null, cancelled: false };
      state.slides.push(row);
      void animation.finished.then(
        () => {
          row.settled = performance.now();
        },
        () => {
          row.settled = performance.now();
          row.cancelled = true;
        },
      );
      return animation;
    };
  }

  const decode = window.HTMLImageElement.prototype.decode;
  if (decode) {
    window.HTMLImageElement.prototype.decode = function (...args) {
      if (!this.closest(".fs-reader")) return Reflect.apply(decode, this, args);
      const row = {
        start: performance.now(),
        end: null,
        injectedDelayMs: state.slowDecode ? 350 : 0,
        failed: false,
      };
      state.decodes.push(row);
      const result = Reflect.apply(decode, this, args);
      const complete = () => {
        row.end = performance.now();
      };
      return result.then(
        async () => {
          if (row.injectedDelayMs)
            await new Promise((resolve) =>
              window.setTimeout(resolve, row.injectedDelayMs),
            );
          complete();
        },
        (error) => {
          row.failed = true;
          complete();
          throw error;
        },
      );
    };
  }

  const setItem = window.Storage.prototype.setItem;
  function readJson(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  window.Storage.prototype.setItem = function (key, value) {
    const result = Reflect.apply(setItem, this, [key, value]);
    if (state.completion && key === "firstscene:sync:v1") {
      const queue = readJson(value)?.queue;
      if (
        Array.isArray(queue) &&
        queue.some((item) => item?.body?.completed === true)
      )
        state.mark("sync_enqueue");
    }
    return result;
  };

  const send = window.fetch;
  window.fetch = function (input, init) {
    const response = Reflect.apply(send, this, [input, init]);
    if (
      !state.completion ||
      typeof input !== "string" ||
      new URL(input, window.location.href).pathname !==
        "/api/v1/progress/post-office" ||
      init?.method !== "PUT" ||
      typeof init.body !== "string" ||
      readJson(init.body)?.completed !== true
    )
      return response;
    return response.then((result) => {
      if (result.ok) state.mark("sync_ack");
      return result;
    });
  };
  const stamp = new window.MutationObserver(() => {
    if (state.completion && document.querySelector(".reader-completion-stamp"))
      state.mark("completion_stamp");
  });
  stamp.observe(document, { childList: true, subtree: true });
}

export function readBaselineSample() {
  const { performance } = window;
  const probe = window.firstsceneBaseline;
  probe?.flush();
  const supported = window.PerformanceObserver.supportedEntryTypes;
  const path = (address) => {
    if (!address) return null;
    const url = new URL(address, window.location.href);
    if (url.origin !== window.location.origin) return "(cross-origin)";
    return url.pathname;
  };
  const resourceRows = performance.getEntriesByType("resource");
  const timing = (row) => ({
    start: row.startTime,
    request: row.requestStart,
    response: row.responseStart,
    end: row.responseEnd,
    transferBytes: row.transferSize,
    encodedBytes: row.encodedBodySize,
    decodedBytes: row.decodedBodySize,
  });
  const [navigation] = performance.getEntriesByType("navigation");
  const fcp =
    performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
    null;
  const lcp = probe?.lcp ?? null;
  const lcpResource = lcp?.url
    ? resourceRows.findLast(
        (row) => row.name === lcp.url && row.responseEnd <= lcp.startTime,
      )
    : null;
  const ttfb = navigation.responseStart - navigation.startTime;
  const resourceStart = lcpResource?.requestStart || lcpResource?.startTime;
  const supportedTypes = [
    "largest-contentful-paint",
    "event",
    "layout-shift",
    "longtask",
  ];
  return {
    observedThroughMs: performance.now(),
    visibility: document.visibilityState,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio,
    },
    supported: Object.fromEntries(
      supportedTypes.map((type) => [type, supported.includes(type)]),
    ),
    resourceBufferFull: probe?.resourceBufferFull ?? null,
    observerDropped: probe?.dropped ?? null,
    navigation: {
      ...timing(navigation),
      ttfb,
      domContentLoaded: navigation.domContentLoadedEventEnd,
      load: navigation.loadEventEnd,
      fcp,
    },
    lcp: lcp
      ? {
          time: lcp.startTime,
          element: lcp.element,
          image: path(lcp.url),
          ttfb,
          resourceLoadDelay: lcpResource
            ? Math.max(0, resourceStart - ttfb)
            : lcp.url
              ? null
              : 0,
          resourceLoadDuration: lcpResource
            ? lcpResource.responseEnd - resourceStart
            : lcp.url
              ? null
              : 0,
          elementRenderDelay: lcpResource
            ? Math.max(0, lcp.startTime - lcpResource.responseEnd)
            : lcp.url
              ? null
              : Math.max(0, lcp.startTime - ttfb),
        }
      : null,
    resources: resourceRows.map((row) => ({
      path: path(row.name),
      kind: row.initiatorType,
      ...timing(row),
    })),
    images: Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth > 0)
      .map((image) => ({
        currentSrc: path(image.currentSrc),
        width: image.naturalWidth,
      })),
    layoutShifts: probe?.shifts ?? null,
    longTasks: probe?.longTasks ?? null,
    events: probe?.events ?? null,
    frameIntervals: probe?.frames ?? null,
    reactCommits: probe?.renderers ? probe.reactCommits : null,
    transitions: probe?.transitions ?? null,
    slides: probe?.slides ?? null,
    decodes: probe?.decodes ?? null,
    marks: probe
      ? probe.markNames.map((name) => ({
          name,
          time: performance.getEntriesByName(name, "mark")[0].startTime,
        }))
      : null,
  };
}
