import {
  useLinuxWebkit,
  runLinuxWebkit,
  mergeBrowserReports,
} from "./browser-runtime.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
const root = process.cwd();
const evidence = path.join(root, "evidence/package-consumer");
const names = ["tokens", "story-schema", "ui", "reader-core", "reader-react"];
const cleanEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: os.tmpdir(),
  CI: "1",
  npm_config_ignore_scripts: "true",
};
const log = [];
async function writeResult(value) {
  const temporaryReport = path.join(evidence, "result.tmp.json");
  await fs.writeFile(temporaryReport, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temporaryReport, path.join(evidence, "result.json"));
}
async function run(command, args, cwd = root, env = cleanEnv) {
  const started = Date.now();
  const result = await new Promise((resolve, reject) => {
    let stdout = "",
      stderr = "";
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  log.push({
    command: [command, ...args].join(" ").replaceAll(root, "<workspace>"),
    durationMs: Date.now() - started,
    exitCode: result.code,
  });
  await fs.appendFile(
    path.join(evidence, "commands.txt"),
    `$ ${command} ${args.join(" ")}\n${result.stdout}${result.stderr}\n`,
  );
  if (result.code !== 0) throw new Error("CONSUMER_COMMAND_FAILED:" + command);
  return result.stdout;
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let temporary, server;
try {
  await fs.mkdir(evidence, { recursive: true });
  await writeResult({
    status: "IN_PROGRESS",
    observedAt: new Date().toISOString(),
  });
  await fs.writeFile(path.join(evidence, "commands.txt"), "");
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), "firstscene-consumer-"));
  temporary = await fs.realpath(temporary);
  await fs.writeFile(
    path.join(temporary, ".firstscene-owned"),
    "FirstScene disposable package consumer\n",
  );
  await fs.mkdir(path.join(temporary, "tarballs"));
  await fs.mkdir(path.join(evidence, "tarballs"), { recursive: true });
  const tarballs = [];
  const dependencies = { react: "19.3.1", "react-dom": "19.3.1" };
  const overrides = {};
  for (const name of names) {
    const file = `firstscene-${name}-0.1.0.tgz`,
      target = path.join(temporary, "tarballs", file);
    await run("pnpm", [
      "--filter",
      `@firstscene/${name}`,
      "pack",
      "--out",
      target,
      "--json",
    ]);
    const list = (await run("tar", ["-tzf", target])).trim().split("\n");
    if (list.some((file) => !/^package\/(?:package\.json|dist\/)/.test(file)))
      throw new Error("TARBALL_CONTAINS_NONEXPORT_SOURCE");
    const packed = JSON.parse(
      await run("tar", ["-xOf", target, "package/package.json"]),
    );
    if (
      packed.private ||
      packed.name !== `@firstscene/${name}` ||
      Object.values(packed.dependencies ?? {}).some((value) =>
        String(value).includes("workspace:"),
      )
    )
      throw new Error("TARBALL_BOUNDARY_INVALID");
    await fs.copyFile(target, path.join(evidence, "tarballs", file));
    const bytes = await fs.readFile(target);
    dependencies[packed.name] = `file:./tarballs/${file}`;
    overrides[packed.name] = `file:./tarballs/${file}`;
    tarballs.push({
      name: packed.name,
      version: packed.version,
      file: `tarballs/${file}`,
      sha256: sha(bytes),
      bytes: bytes.length,
      entries: list,
    });
  }
  const pkg = {
    name: "firstscene-external-consumer",
    private: true,
    type: "module",
    version: "0.1.0",
    packageManager: "pnpm@10.14.0",
    dependencies,
    devDependencies: {
      vite: "8.3.8",
      typescript: "6.0.3",
      "@types/react": "19.3.0",
      "@types/react-dom": "19.3.0",
    },
    pnpm: { overrides },
  };
  await fs.writeFile(
    path.join(temporary, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );
  await fs.writeFile(
    path.join(temporary, "index.html"),
    '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FirstScene React consumer</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
  );
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      noEmit: true,
      resolveJsonModule: true,
      esModuleInterop: true,
      skipLibCheck: false,
      verbatimModuleSyntax: true,
    },
    include: ["main.tsx", "style.d.ts"],
  };
  await fs.writeFile(
    path.join(temporary, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2),
  );
  await fs.writeFile(
    path.join(temporary, "style.d.ts"),
    'declare module "*.css";\n',
  );
  for (const file of ["main.tsx", "style.css"])
    await fs.copyFile(
      path.join(root, "tools/consumer-template", file),
      path.join(temporary, file),
    );
  await fs.copyFile(
    path.join(root, "content/generated/stories/post-office.json"),
    path.join(temporary, "story.json"),
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "content/generated/assets.json"), "utf8"),
  );
  // Export only public rendering props, not raw paths/generation provenance.
  const assets = Object.fromEntries(
    manifest.assets.map(({ id, variants, alt, decorative, focalPoint }) => [
      id,
      { variants, alt, decorative, ...(focalPoint ? { focalPoint } : {}) },
    ]),
  );
  await fs.writeFile(
    path.join(temporary, "assets.json"),
    JSON.stringify(assets),
  );
  await fs.mkdir(path.join(temporary, "public"));
  await fs.cp(
    path.join(root, "apps/web/public/assets"),
    path.join(temporary, "public/assets"),
    { recursive: true },
  );
  await run("pnpm", ["install", "--ignore-scripts"], temporary);
  await run(
    "pnpm",
    ["install", "--frozen-lockfile", "--ignore-scripts"],
    temporary,
  );
  await run("pnpm", ["exec", "tsc", "--noEmit"], temporary);
  await run("pnpm", ["exec", "vite", "build"], temporary);
  const tree = JSON.parse(
    await run("pnpm", ["list", "--json", "--depth", "Infinity"], temporary),
  );
  const nodeModules = await fs.readdir(
    path.join(temporary, "node_modules/.pnpm"),
  );
  if (
    nodeModules.some((name) =>
      /^(?:next|pg|@firstscene\+server-data|@firstscene\+content-compiler)@/.test(
        name,
      ),
    )
  )
    throw new Error("CONSUMER_PRIVATE_DEPENDENCY");
  const resolved = [];
  for (const name of names) {
    const file = await fs.realpath(
      path.join(temporary, "node_modules/@firstscene", name),
    );
    if (!file.startsWith(temporary + path.sep))
      throw new Error("WORKSPACE_ALIAS_IN_CONSUMER");
    resolved.push({
      name: `@firstscene/${name}`,
      insideIsolatedConsumer: true,
    });
  }
  const source = path.join(evidence, "source");
  await fs.mkdir(source, { recursive: true });
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "index.html",
    "tsconfig.json",
    "style.d.ts",
    "main.tsx",
    "style.css",
    "story.json",
    "assets.json",
  ])
    await fs.copyFile(path.join(temporary, file), path.join(source, file));
  await fs.cp(path.join(temporary, "tarballs"), path.join(source, "tarballs"), {
    recursive: true,
  });
  const dist = path.join(temporary, "dist");
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".avif": "image/avif",
    ".webp": "image/webp",
    ".json": "application/json",
  };
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://127.0.0.1").pathname,
      );
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      const file = path.resolve(dist, relative);
      if (!file.startsWith(dist + path.sep)) throw new Error("BAD_PATH");
      const bytes = await fs.readFile(file);
      res.writeHead(200, {
        "content-type": mime[path.extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await run(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "tools/consumer-playwright.config.ts",
      ...(useLinuxWebkit() ? ["--project=consumer-chromium"] : []),
    ],
    root,
    { ...cleanEnv, FIRSTSCENE_CONSUMER_URL: origin },
  );
  if (useLinuxWebkit()) {
    const file = path.join(evidence, "browser-results.json");
    const host = JSON.parse(await fs.readFile(file, "utf8"));
    const linux = await runLinuxWebkit("consumer", { consumerDirectory: dist });
    await fs.writeFile(
      file,
      JSON.stringify(mergeBrowserReports([host, linux.report]), null, 2) + "\n",
    );
    if (linux.exitCode) throw new Error("LINUX_CONSUMER_BROWSER_FAILED");
  }
  const browserBytes = await fs.readFile(
    path.join(evidence, "browser-results.json"),
  );
  const browserResult = JSON.parse(browserBytes);
  if (
    browserResult.stats?.unexpected !== 0 ||
    browserResult.stats?.expected !== 2
  )
    throw new Error("CONSUMER_BROWSER_EVIDENCE_INVALID");
  const artifact = path.join(root, "artifacts/package-consumer-demo");
  await fs.mkdir(artifact, { recursive: true });
  await fs.cp(dist, artifact, { recursive: true });
  const archive = path.join(artifact, "firstscene-consumer-static.tgz");
  await run("tar", ["-czf", archive, "-C", temporary, "dist"]);
  const archiveBytes = await fs.readFile(archive);
  const report = {
    observedAt: new Date().toISOString(),
    status: "PASS",
    sourceCommit: (await run("git", ["rev-parse", "HEAD"])).trim(),
    node: process.version,
    isolatedTemporaryConsumer: true,
    workspaceAliases: false,
    nextOrDatabaseDependencies: false,
    paidApiCalls: 0,
    publication: false,
    tarballs,
    resolved,
    dependencyTreeSha256: sha(JSON.stringify(tree)),
    lockfileSha256: sha(await fs.readFile(path.join(source, "pnpm-lock.yaml"))),
    browserReport: "evidence/package-consumer/browser-results.json",
    browserReportSha256: sha(browserBytes),
    localStaticArtifact: "artifacts/package-consumer-demo",
    staticArchive: {
      path: "artifacts/package-consumer-demo/firstscene-consumer-static.tgz",
      bytes: archiveBytes.length,
      sha256: sha(archiveBytes),
    },
    commands: log,
  };
  await writeResult(report);
  await fs.rm(path.join(evidence, "failure.json"), { force: true });
  console.log(
    JSON.stringify({
      status: "PASS",
      packages: 5,
      externalConsumer: true,
      nextOrDatabaseDependencies: false,
      publication: false,
      evidence: "evidence/package-consumer/result.json",
    }),
  );
} catch (error) {
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    path.join(evidence, "failure.json"),
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        status: "FAILED",
        code: error.message,
        commands: log,
      },
      null,
      2,
    ) + "\n",
  );
  await writeResult({
    observedAt: new Date().toISOString(),
    status: "FAILED",
    code: error.message,
    commands: log,
  });
  console.error(
    JSON.stringify({
      status: "FAILED",
      code: error.message,
      evidence: "evidence/package-consumer/failure.json",
    }),
  );
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (temporary) {
    const marker = await fs
      .readFile(path.join(temporary, ".firstscene-owned"), "utf8")
      .catch(() => null);
    if (
      marker === "FirstScene disposable package consumer\n" &&
      path.basename(temporary).startsWith("firstscene-consumer-")
    )
      await fs.rm(temporary, { recursive: true });
  }
}
