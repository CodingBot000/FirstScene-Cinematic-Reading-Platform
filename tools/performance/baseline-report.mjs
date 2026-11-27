import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { samples: 0, median: null, max: null, min: null };
  const high = Math.floor(sorted.length / 2);
  const low = Math.floor((sorted.length - 1) / 2);
  return {
    samples: sorted.length,
    median: (sorted[low] + sorted[high]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
  };
}

// Core Web Vitals uses the largest five-second layout-shift session window.
export function sessionWindowCls(shifts) {
  if (shifts === null) return null;
  let total = 0;
  let worst = 0;
  let start = -Infinity;
  let last = -Infinity;
  for (const { startTime, value } of shifts) {
    if (startTime - last >= 1000 || startTime - start >= 5000) {
      total = 0;
      start = startTime;
    }
    total += value;
    worst = Math.max(worst, total);
    last = startTime;
  }
  return worst;
}

export function recordNavigation(sample, gzipSizes) {
  const scripts = new Set(
    sample.resources
      .map((row) => row.path)
      .filter(
        (name) => name?.startsWith("/_next/static/") && name.endsWith(".js"),
      ),
  );
  let jsGzipBytes = 0;
  for (const name of scripts) {
    const file = name.slice("/_next/static/".length);
    if (
      !/^(?:[a-z0-9._~-]+\/)*[a-z0-9._~-]+\.js$/i.test(file) ||
      file.split("/").includes("..")
    )
      throw new Error("BASELINE_SCRIPT_PATH_INVALID");
    if (!gzipSizes.has(name)) {
      gzipSizes.set(
        name,
        gzipSync(fs.readFileSync(path.join("apps/web/.next/static", file)), {
          level: 9,
        }).length,
      );
    }
    jsGzipBytes += gzipSizes.get(name);
  }
  return {
    ...sample,
    initial: {
      requestCount: sample.resources.length + 1,
      transferBytes:
        sample.navigation.transferBytes +
        sample.resources.reduce((sum, row) => sum + row.transferBytes, 0),
      cachedResources: sample.resources.filter(
        (row) => row.transferBytes === 0 && row.decodedBytes > 0,
      ).length,
      jsGzipBytes,
      cls: sessionWindowCls(sample.layoutShifts),
    },
  };
}

function segment(row, width) {
  const pct = (number) =>
    Math.max(0, Math.min(100, (number / width) * 100)).toFixed(2);
  return (
    '<div class="track"><i style="left:' +
    pct(row.start) +
    "%;width:" +
    pct(row.end - row.start) +
    '%"></i></div>'
  );
}

function escapeHtml(label) {
  return String(label).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function representative(samples) {
  const ordered = [...samples].sort(
    (a, b) =>
      (a.lcp?.time ?? a.navigation.load) - (b.lcp?.time ?? b.navigation.load),
  );
  return ordered[Math.floor(ordered.length / 2)];
}

export function renderWaterfall(groups) {
  const routeViews = groups.map(({ route, cache, samples }) => {
    const run = representative(samples);
    const rows = [
      { path: route.path, kind: "document", ...run.navigation },
      ...run.resources,
    ].sort((a, b) => a.start - b.start);
    const end = Math.max(1, ...rows.map((row) => row.end));
    const list = rows
      .map(
        (row) =>
          "<tr><td>" +
          escapeHtml(row.path) +
          "</td><td>" +
          escapeHtml(row.kind) +
          "</td><td>" +
          Math.round(row.start) +
          "</td><td>" +
          Math.round(row.end) +
          "</td><td>" +
          Math.round(row.transferBytes / 1024) +
          "</td><td>" +
          segment(row, end) +
          "</td></tr>",
      )
      .join("");
    return (
      "<details><summary>" +
      escapeHtml(route.path + " · " + cache) +
      "</summary><table><caption>대표 실행 " +
      run.repeat +
      " · " +
      Math.round(end) +
      ' ms 범위</caption><thead><tr><th scope="col">요청</th>' +
      '<th scope="col">종류</th><th scope="col">시작 ms</th><th scope="col">종료 ms</th>' +
      '<th scope="col">전송 KiB</th><th scope="col">타임라인</th></tr></thead><tbody>' +
      list +
      "</tbody></table></details>"
    );
  });
  return (
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FirstScene 요청 워터폴</title>' +
    "<style>body{max-width:1180px;margin:2rem auto;padding:0 1rem;font:15px system-ui;color:#202729;background:#f8f9f8}summary{cursor:pointer;font-weight:650;padding:.75rem}details{border-bottom:1px solid #bcc5c7}table{width:100%;border-collapse:collapse;font-size:13px}caption{text-align:left;padding:.5rem}th,td{text-align:left;border-top:1px solid #dce1e1;padding:.4rem;overflow-wrap:anywhere}td:last-child{min-width:8rem}.track{position:relative;background:#e4eaec;height:.85rem}.track i{position:absolute;height:100%;background:#21667a}</style><h1>FirstScene 요청 워터폴</h1><p>경로와 캐시 조건마다 LCP 순서로 중앙 실행을 표시합니다.</p>" +
    routeViews.join("") +
    "</html>\n"
  );
}

export function summarizeRoutes(routes, runs, audits) {
  return routes.flatMap((route) =>
    ["cold", "warm"].map((cache) => {
      const samples = runs.filter(
        (run) => run.route === route.id && run.cache === cache,
      );
      return {
        route,
        cache,
        samples,
        metrics: {
          lcpMs: summarize(samples.map((run) => run.lcp?.time)),
          ttfbMs: summarize(samples.map((run) => run.navigation.ttfb)),
          resourceLoadDelayMs: summarize(
            samples.map((run) => run.lcp?.resourceLoadDelay),
          ),
          resourceLoadDurationMs: summarize(
            samples.map((run) => run.lcp?.resourceLoadDuration),
          ),
          elementRenderDelayMs: summarize(
            samples.map((run) => run.lcp?.elementRenderDelay),
          ),
          cls: summarize(samples.map((run) => run.initial.cls)),
          transferBytes: summarize(
            samples.map((run) => run.initial.transferBytes),
          ),
          requestCount: summarize(
            samples.map((run) => run.initial.requestCount),
          ),
          jsGzipBytes: summarize(samples.map((run) => run.initial.jsGzipBytes)),
          reactCommits: summarize(
            samples.map((run) => run.reactCommits?.length),
          ),
          longTasks: summarize(samples.map((run) => run.longTasks?.length)),
          frameIntervalMedianMs: summarize(
            samples.map((run) => summarize(run.frameIntervals ?? []).median),
          ),
          lighthouseTbtMs:
            cache === "cold"
              ? summarize(
                  audits
                    .filter((row) => row.route === route.id)
                    .map((row) => row.tbtMs),
                )
              : null,
        },
      };
    }),
  );
}
