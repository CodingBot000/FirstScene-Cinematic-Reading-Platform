import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

const idle = { shaders: 0, programs: 0, vao: 0, observers: 0, listeners: 0 };
declare global {
  interface Window {
    portalLifetime: () => {
      created: typeof idle;
      active: typeof idle;
      boundProgramDeletes: number;
    };
  }
}

function observePortalLifetime(forceShaderFailure: boolean) {
  const created = {
    shaders: 0,
    programs: 0,
    vao: 0,
    observers: 0,
    listeners: 0,
  };
  const active = { ...created };
  const tracked = new WeakMap<object, keyof typeof created>();
  let mountedInThisTask = false;
  let boundProgramDeletes = 0;
  const observe = <T extends object>(
    object: T | null,
    kind: keyof typeof created,
  ) => {
    if (object && mountedInThisTask) {
      tracked.set(object, kind);
      created[kind]++;
      active[kind]++;
    }
    return object;
  };
  const release = (object: object | null) => {
    if (!object) return;
    const kind = tracked.get(object);
    if (kind) {
      tracked.delete(object);
      active[kind]--;
    }
  };

  const getContext = HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: function (
      this: HTMLCanvasElement,
      type: string,
      ...options: unknown[]
    ) {
      const context = Reflect.apply(getContext, this, [type, ...options]);
      if (
        context &&
        type === "webgl2" &&
        this.matches(".cinematic-webgl-canvas")
      ) {
        mountedInThisTask = true;
        queueMicrotask(() => (mountedInThisTask = false));
      }
      return context;
    },
  });
  const gl = WebGL2RenderingContext.prototype;
  const createShader = gl.createShader;
  const deleteShader = gl.deleteShader;
  const createProgram = gl.createProgram;
  const deleteProgram = gl.deleteProgram;
  const createVertexArray = gl.createVertexArray;
  const deleteVertexArray = gl.deleteVertexArray;
  const getShaderParameter = gl.getShaderParameter;
  gl.createShader = function (type) {
    return observe(createShader.call(this, type), "shaders");
  };
  gl.deleteShader = function (shader) {
    release(shader);
    deleteShader.call(this, shader);
  };
  gl.createProgram = function () {
    return observe(createProgram.call(this), "programs");
  };
  gl.deleteProgram = function (program) {
    if (
      program &&
      tracked.has(program) &&
      this.getParameter(this.CURRENT_PROGRAM) === program
    )
      boundProgramDeletes++;
    release(program);
    deleteProgram.call(this, program);
  };
  gl.createVertexArray = function () {
    return observe(createVertexArray.call(this), "vao");
  };
  gl.deleteVertexArray = function (vao) {
    release(vao);
    deleteVertexArray.call(this, vao);
  };
  gl.getShaderParameter = function (shader, pname) {
    if (
      forceShaderFailure &&
      tracked.has(shader) &&
      pname === this.COMPILE_STATUS
    )
      return false;
    return getShaderParameter.call(this, shader, pname);
  };

  const Resize = window.ResizeObserver;
  window.ResizeObserver = class extends Resize {
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      observe(this, "observers");
    }
    override disconnect() {
      release(this);
      super.disconnect();
    }
  };
  const Intersection = window.IntersectionObserver;
  window.IntersectionObserver = class extends Intersection {
    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      super(callback, options);
      observe(this, "observers");
    }
    override disconnect() {
      release(this);
      super.disconnect();
    }
  };
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const portalEvents = new Set([
    "pointermove",
    "webglcontextlost",
    "visibilitychange",
    "pagehide",
    "pageshow",
    "scroll",
  ]);
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (portalEvents.has(type)) observe(listener, "listeners");
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (
    type,
    listener,
    options,
  ) {
    if (portalEvents.has(type)) release(listener);
    return remove.call(this, type, listener, options);
  };
  window.portalLifetime = () => ({ created, active, boundProgramDeletes });
}

test("GPU-04 twenty portal mounts and unmounts release every GL object, observer, and listener", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(observePortalLifetime, false);
  await page.goto("/");
  const canvas = page.locator(".cinematic-webgl-canvas");
  const header = page.locator(".site-header");
  const lifetime = () => page.evaluate(() => window.portalLifetime());
  for (let mount = 1; mount <= 20; mount++) {
    await expect(canvas).toHaveAttribute("data-renderer", "webgl2");
    expect((await lifetime()).active).toEqual({
      shaders: 2,
      programs: 1,
      vao: 1,
      observers: 2,
      listeners: 6,
    });
    await header.getByRole("link", { name: "탐색", exact: true }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(canvas).toHaveCount(0);
    await expect.poll(async () => (await lifetime()).active).toEqual(idle);
    expect((await lifetime()).created.vao).toBe(mount);
    if (mount < 20) await header.locator(".wordmark").click();
  }
  const observed = await lifetime();
  expect(observed.boundProgramDeletes).toBe(0);
  expect(observed.created).toEqual({
    shaders: 40,
    programs: 20,
    vao: 20,
    observers: 40,
    listeners: 120,
  });
  await testInfo.attach("portal-resource-balance", {
    body: JSON.stringify(observed),
    contentType: "application/json",
  });
});

test("GPU-04 a delayed portal import cannot mount after leaving Home", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(observePortalLifetime, false);
  const directory = "apps/web/.next/static/chunks";
  const chunk = readdirSync(directory).find(
    (name) =>
      name.endsWith(".js") &&
      readFileSync(join(directory, name), "utf8").includes(
        "PORTAL_SHADER_CREATE",
      ),
  );
  if (!chunk) throw new Error("PORTAL_CHUNK_REQUIRED");
  let started = false;
  let allow!: () => void;
  const held = new Promise<void>((resolve) => (allow = resolve));
  await page.route("**/_next/static/chunks/" + chunk, async (route) => {
    started = true;
    await held;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(() => started).toBe(true);
    await page
      .locator(".site-header")
      .getByRole("link", { name: "탐색", exact: true })
      .click();
    await expect(page).toHaveURL(/\/discover$/);
    const loaded = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/" + chunk) && response.ok(),
    );
    allow();
    expect(await (await loaded).finished()).toBeNull();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await page.evaluate(() => window.portalLifetime().created)).toEqual(
      idle,
    );
  } finally {
    allow();
  }
  await page.locator(".site-header .wordmark").click();
  await expect(page.locator(".cinematic-webgl-canvas")).toHaveAttribute(
    "data-renderer",
    "webgl2",
  );
});

test("GPU-04 a failed shader compile retains the cover and releases partial resources", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(observePortalLifetime, true);
  await page.goto("/");
  await expect(page.locator(".cinematic-webgl-canvas")).toHaveAttribute(
    "data-renderer",
    "fallback",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const observed = await page.evaluate(() => window.portalLifetime());
  expect(observed.created.shaders).toBe(1);
  expect(observed.active).toEqual(idle);
});
