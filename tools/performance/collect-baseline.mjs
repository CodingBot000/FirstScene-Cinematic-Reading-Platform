import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import lighthouse from "./lighthouse.config.mjs";
import { runAudit } from "./lighthouse-runner.mjs";
import { withProductionServer } from "./server.mjs";
import { installBaselineProbe, readBaselineSample } from "./baseline-probe.mjs";
import {
  exerciseBaselineJourneys,
  measureFilterOverhead,
} from "./baseline-journeys.mjs";
import {
  digest,
  recordNavigation,
  renderWaterfall,
  summarize,
  summarizeRoutes,
} from "./baseline-report.mjs";

const flags = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
if ([...flags].some((arg) => arg !== "--trace" && arg !== "--smoke"))
  throw new Error("BASELINE_ARGUMENT_INVALID");
const smoke = flags.has("--smoke");
const repeats = smoke ? 1 : 5;
const postLoadMs = 1200;
const { width, height, deviceScaleFactor } =
  lighthouse.settings.screenEmulation;
const throttle = lighthouse.settings.throttling;
const profile = {
  viewport: { width, height },
  deviceScaleFactor,
  cpuSlowdown: throttle.cpuSlowdownMultiplier,
  latencyMs: throttle.requestLatencyMs,
  downloadBytesPerSecond: (throttle.downloadThroughputKbps * 1024) / 8,
  uploadBytesPerSecond: (throttle.uploadThroughputKbps * 1024) / 8,
  postLoadMs,
};
const classicRoot = "content/classics/works";
const classics = fs
  .readdirSync(classicRoot)
  .filter((file) => file.endsWith(".json"))
  .map((file) => {
    const entry = JSON.parse(
      fs.readFileSync(path.join(classicRoot, file), "utf8"),
    );
    return {
      id: file.slice(0, -5),
      codePoints: Array.from(entry.text.normalize("NFC")).length,
    };
  })
  .sort((a, b) => b.codePoints - a.codePoints || a.id.localeCompare(b.id));
if (!classics.length) throw new Error("BASELINE_CLASSICS_MISSING");

const routes = [
  { id: "home", path: "/" },
  { id: "introduction", path: "/stories/post-office" },
  { id: "reader", path: "/read/post-office" },
  { id: "discover", path: "/discover" },
  { id: "classic-detail", path: "/stories/classic-camellias" },
  { id: "classic-reader", path: "/read/classic-camellias" },
  { id: "longest-classic", path: "/read/" + classics[0].id },
  { id: "library", path: "/library" },
  { id: "settings", path: "/settings" },
].filter(
  (route) =>
    !smoke || ["home", "discover", "longest-classic"].includes(route.id),
);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const buildId = fs.readFileSync("apps/web/.next/BUILD_ID", "utf8").trim();
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  LANG: "ko_KR.UTF-8",
};
const privateRoot = "artifacts/private/performance-baseline";
fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
const output = fs.mkdtempSync(
  path.join(privateRoot, commit.slice(0, 12) + "-"),
);
const result = {
  schemaVersion: 1,
  taskId: "FS-FSE-01",
  status: "IN_PROGRESS",
  purpose: smoke ? "smoke" : "baseline",
  observedAt: new Date().toISOString(),
  sourceCommit: commit,
  productionBuildId: buildId,
  environment: {
    ...profile,
    node: process.version,
    os: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    chromium: null,
    playwright: JSON.parse(
      fs.readFileSync("node_modules/@playwright/test/package.json", "utf8"),
    ).version,
  },
  protocol: {
    repeats,
    warmup: "One unmeasured home visit before sampling",
    cold: "Fresh browser context",
    warm: "Immediate reload in the same context with HTTP cache retained; local and session storage and cookies cleared",
    observerWindow:
      "Through 1200 ms after the load event and heading visibility",
    eventThresholdMs: 16,
    tbt: "Lighthouse audit from separate fresh cold profiles; warm TBT not collected",
    react:
      "DevTools hook commit timestamps; render duration unavailable in standard build",
    device:
      "Chromium mobile viewport and DevTools throttle; no device or field claims",
  },
  classics,
  routes,
  runs: [],
  lighthouse: [],
  overhead: [],
  journeys: null,
  artifacts: [],
  releaseReady: false,
};
const gzipSizes = new Map();
let step = "setup";
function json(file, content) {
  fs.writeFileSync(
    path.join(output, file),
    JSON.stringify(content, null, 2) + "\n",
    { mode: 0o600 },
  );
}

async function withPage(
  browser,
  origin,
  action,
  { probe = true, journey = false } = {},
) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    await context.addInitScript((expected) => {
      if (window.location.origin === expected) {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
    }, origin);
    if (probe) await context.addInitScript(installBaselineProbe, { journey });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", {
      rate: profile.cpuSlowdown,
    });
    await cdp.send("Network.emulateNetworkConditionsByRule", {
      offline: false,
      matchedNetworkConditions: [
        {
          urlPattern: "",
          latency: profile.latencyMs,
          downloadThroughput: profile.downloadBytesPerSecond,
          uploadThroughput: profile.uploadBytesPerSecond,
        },
      ],
    });
    return await action(page, context);
  } finally {
    await context.close();
  }
}

async function sample(page, response) {
  if (!response?.ok()) throw new Error("BASELINE_NAVIGATION_FAILED");
  await page
    .getByRole("heading", { level: 1 })
    .first()
    .waitFor({ state: "visible" });
  await page.waitForTimeout(postLoadMs);
  const snapshot = await page.evaluate(readBaselineSample);
  if (
    snapshot.visibility !== "visible" ||
    snapshot.resourceBufferFull ||
    snapshot.observerDropped > 0 ||
    snapshot.navigation.load <= 0
  )
    throw new Error("BASELINE_SAMPLE_INVALID");
  return recordNavigation(snapshot, gzipSizes);
}

async function collectBrowser(origin) {
  const browser = await chromium.launch({ channel: "chromium", env });
  try {
    result.environment.chromium = browser.version();
    await withPage(browser, origin, (page) => page.goto(origin), {
      probe: false,
    });
    for (const route of routes) {
      step = route.id;
      for (let repeat = 1; repeat <= repeats; repeat++) {
        await withPage(browser, origin, async (page, context) => {
          result.runs.push({
            route: route.id,
            repeat,
            cache: "cold",
            ...(await sample(
              page,
              await page.goto(origin + route.path, { waitUntil: "load" }),
            )),
          });
          await context.clearCookies();
          result.runs.push({
            route: route.id,
            repeat,
            cache: "warm",
            ...(await sample(page, await page.reload({ waitUntil: "load" }))),
          });
        });
        json("baseline.json", result);
      }
      console.log(JSON.stringify({ route: route.id, captured: repeats * 2 }));
    }

    step = "overhead";
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const states = repeat % 2 ? [false, true] : [true, false];
      const pair = { repeat };
      for (const probe of states) {
        pair[probe ? "on" : "off"] = await withPage(
          browser,
          origin,
          (page) => measureFilterOverhead(page, origin, probe),
          { probe, journey: probe },
        );
      }
      result.overhead.push(pair);
    }
    result.overheadSummary = summarize(
      result.overhead.map(({ on, off }) => on.filterMs - off.filterMs),
    );
    json("baseline.json", result);

    step = "journeys";
    let traceSession;
    let tracing = false;
    try {
      if (flags.has("--trace")) {
        traceSession = await browser.newBrowserCDPSession();
        await traceSession.send("Tracing.start", {
          categories: "devtools.timeline,blink.user_timing,loading",
          transferMode: "ReturnAsStream",
        });
        tracing = true;
      }
      result.journeys = await withPage(
        browser,
        origin,
        (page) => exerciseBaselineJourneys(page, origin),
        { journey: true },
      );
    } finally {
      if (tracing) {
        const finish = once(traceSession, "Tracing.tracingComplete");
        await traceSession.send("Tracing.end");
        const [{ stream }] = await finish;
        const traceFile = path.join(output, "journey.trace.json");
        const fd = fs.openSync(traceFile, "wx", 0o600);
        try {
          let end = false;
          while (!end) {
            const chunk = await traceSession.send("IO.read", {
              handle: stream,
            });
            fs.writeSync(
              fd,
              Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "utf8"),
            );
            end = chunk.eof;
          }
        } finally {
          fs.closeSync(fd);
          await traceSession.send("IO.close", { handle: stream });
        }
      }
      await traceSession?.detach();
    }
    json("baseline.json", result);
  } finally {
    await browser.close();
  }
}

async function collectLighthouse(origin) {
  for (const route of routes) {
    step = "lighthouse-" + route.id;
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const file = path.join(output, "lighthouse-raw.json");
      try {
        const code = await runAudit(
          [
            "node_modules/lighthouse/cli/index.js",
            origin + route.path,
            "--config-path=tools/performance/lighthouse.config.mjs",
            "--output=json",
            "--output-path=" + file,
            "--quiet",
            "--no-enable-error-reporting",
          ],
          env,
        );
        if (code) throw new Error("BASELINE_LIGHTHOUSE_PROCESS_FAILED");
        const raw = fs.readFileSync(file);
        const audit = JSON.parse(raw);
        const tbtMs = audit.audits?.["total-blocking-time"]?.numericValue;
        if (audit.runtimeError || !Number.isFinite(tbtMs))
          throw new Error("BASELINE_TBT_MISSING");
        result.lighthouse.push({
          route: route.id,
          cache: "cold",
          repeat,
          tbtMs,
          version: audit.lighthouseVersion,
          rawReportSha256: digest(raw),
        });
        json("baseline.json", result);
      } finally {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
    }
    console.log(JSON.stringify({ lighthouse: route.id, captured: repeats }));
  }
}

try {
  await withProductionServer(({ origin }) => collectBrowser(origin));
  await withProductionServer(({ origin }) => collectLighthouse(origin));
  step = "report";
  if (
    result.runs.length !== 2 * repeats * routes.length ||
    result.lighthouse.length !== repeats * routes.length ||
    result.overhead.length !== repeats ||
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !==
      commit ||
    fs.readFileSync("apps/web/.next/BUILD_ID", "utf8").trim() !== buildId
  )
    throw new Error("BASELINE_INCOMPLETE");
  const groups = summarizeRoutes(routes, result.runs, result.lighthouse);
  result.summary = groups.map(({ route, cache, metrics }) => ({
    route,
    cache,
    metrics,
  }));
  fs.writeFileSync(
    path.join(output, "waterfall.html"),
    renderWaterfall(groups),
    { mode: 0o600 },
  );
  result.status = "PASS";
} catch (error) {
  result.status = "FAIL";
  result.failure = {
    step,
    code: /^[A-Z_]+$/.test(error.message) ? error.message : error.name,
    location: error.stack?.match(
      /(?:baseline-journeys|baseline-probe|collect-baseline)\.mjs:\d+:\d+/,
    )?.[0],
  };
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  json("baseline.json", result);
  const files = [
    "baseline.json",
    "waterfall.html",
    "journey.trace.json",
  ].filter((file) => fs.existsSync(path.join(output, file)));
  json("index.json", {
    status: result.status,
    purpose: result.purpose,
    sourceCommit: commit,
    buildId,
    failure: result.failure ?? null,
    observations: result.runs.length,
    audits: result.lighthouse.length,
    artifacts: files.map((file) => {
      const bytes = fs.readFileSync(path.join(output, file));
      return { file, bytes: bytes.length, sha256: digest(bytes) };
    }),
  });
  console.log(
    JSON.stringify({
      status: result.status,
      purpose: result.purpose,
      report: path.join(output, "index.json"),
      failure: result.failure,
    }),
  );
}
