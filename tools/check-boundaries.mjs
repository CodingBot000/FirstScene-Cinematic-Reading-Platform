import fs from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const outside = (relative) =>
  relative === ".." || relative.startsWith(".." + path.sep);
const owns = (root, file) => !outside(path.relative(root, file));
const sourcePattern = /\.[cm]?[jt]sx?$/;
const packageName = (specifier) =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");
const directive = (node, value) =>
  ts.isExpressionStatement(node) &&
  ts.isStringLiteral(node.expression) &&
  node.expression.text === value;

function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      ["node_modules", "dist", ".next", ".turbo", ".vercel"].includes(
        entry.name,
      )
    )
      return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return sourcePattern.test(file) ? [file] : [];
  });
}

function imports(source) {
  const entries = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : node;
      const bindings = ts.isImportDeclaration(node)
        ? clause?.namedBindings
        : node.exportClause;
      const typeOnly =
        clause?.isTypeOnly ||
        (!clause?.name &&
          bindings?.elements?.length > 0 &&
          bindings.elements.every((item) => item.isTypeOnly));
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier))
        entries.push({
          specifier: node.moduleSpecifier.text,
          typeOnly: Boolean(typeOnly),
        });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteralLike(expression))
        entries.push({ specifier: expression.text, typeOnly: node.isTypeOnly });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      entries.push({ specifier: node.arguments[0].text, typeOnly: false });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      entries.push({ specifier: node.argument.literal.text, typeOnly: true });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return entries;
}

function browserGlobal(source, names) {
  let used;
  function visit(node) {
    if (
      ts.isIdentifier(node) &&
      names.includes(node.text) &&
      (ts.isPropertyAccessExpression(node.parent) ||
        ts.isElementAccessExpression(node.parent)) &&
      node.parent.expression === node
    )
      used ??= node.text;
    if (!used) ts.forEachChild(node, visit);
  }
  visit(source);
  return used;
}

function cycles(graph, report) {
  const active = new Set();
  const visited = new Set();
  function visit(node) {
    if (active.has(node)) {
      const chain = [...active];
      report([...chain.slice(chain.indexOf(node)), node]);
      return;
    }
    if (visited.has(node)) return;
    active.add(node);
    for (const next of graph.get(node) ?? []) visit(next);
    active.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) visit(node);
}

function targets(value) {
  if (typeof value === "string") return [value];
  return value && typeof value === "object"
    ? Object.values(value).flatMap(targets)
    : [];
}

export function checkBoundaries(root, policy) {
  const errors = new Set();
  const packages = new Map();
  const relative = (file) => path.relative(root, file);
  const report = (file, message) => errors.add(relative(file) + ": " + message);
  for (const parent of ["packages", "apps"]) {
    const base = path.join(root, parent);
    for (const name of fs.readdirSync(base)) {
      const directory = path.join(base, name);
      const manifestPath = path.join(directory, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const config = path.join(directory, "tsconfig.json");
      const options = fs.existsSync(config)
        ? ts.readConfigFile(config, ts.sys.readFile).config
        : {};
      const compiler = ts.parseJsonConfigFileContent(
        options,
        ts.sys,
        directory,
      ).options;
      packages.set(manifest.name, { name, directory, manifest, compiler });
      if (
        parent === "packages" &&
        policy.requireExports &&
        (!manifest.exports || !manifest.types)
      )
        report(manifestPath, "Missing exports/types");
      for (const [key, entry] of Object.entries(manifest.exports ?? {})) {
        for (const target of targets(entry)) {
          if (
            !target.startsWith("./dist/") ||
            !owns(path.join(directory, "dist"), path.resolve(directory, target))
          )
            report(
              manifestPath,
              "Invalid export target " + key + " -> " + target,
            );
        }
      }
    }
  }

  const modules = new Map();
  for (const owner of packages.values()) {
    for (const file of sources(owner.directory)) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      if (owner.name === "reader-core") {
        const used = browserGlobal(source, policy.forbiddenInCore);
        if (used) report(file, "Core browser global " + used);
      }
      modules.set(file, {
        owner,
        client: source.statements.some((node) => directive(node, "use client")),
        imports: imports(source),
      });
    }
  }
  const moduleGraph = new Map();
  const packageGraph = new Map();
  const forbiddenClient = new Set(policy.forbiddenInClient);
  const browserPackages = new Set([
    "tokens",
    "story-schema",
    "ui",
    "reader-react",
    "reader-core",
    "ui-lab",
  ]);
  const builtIn = (value) => isBuiltin(value) || value.startsWith("node:");
  for (const [file, module] of modules) {
    const edges = [];
    const { owner } = module;
    const dependencies = packageGraph.get(owner.name) ?? new Set();
    packageGraph.set(owner.name, dependencies);
    for (const entry of module.imports) {
      const { specifier, typeOnly } = entry;
      const dependency = packages.get(packageName(specifier));
      const sourceOwner = (fileName) =>
        [...packages.values()].find((candidate) =>
          owns(candidate.directory, fileName),
        );
      let target;
      if (dependency) {
        if (dependency !== owner) dependencies.add(dependency.name);
        if (
          !policy.allowedInternalDependencies[owner.name]?.includes(
            dependency.name,
          )
        )
          report(file, "Illegal workspace dependency " + specifier);
        const subpath =
          specifier === packageName(specifier)
            ? "."
            : "." + specifier.slice(packageName(specifier).length);
        const exported = dependency.manifest.exports?.[subpath];
        if (!exported || !targets(exported).length)
          report(file, "Undeclared public export " + specifier);
        for (const exportedTarget of targets(exported)) {
          const unmatched = path.resolve(dependency.directory, exportedTarget);
          const out =
            dependency.compiler.outDir ??
            path.join(dependency.directory, "dist");
          const src =
            dependency.compiler.rootDir ??
            path.join(dependency.directory, "src");
          const sourceFile = path
            .resolve(src, path.relative(out, unmatched))
            .replace(/(?:\.d)?\.js$|\.d\.ts$/, "");
          target = [
            sourceFile + ".ts",
            sourceFile + ".tsx",
            sourceFile + ".js",
            sourceFile + ".jsx",
          ].find((candidate) => modules.has(candidate));
          if (target) break;
        }
      } else if (specifier.startsWith(policy.scope + "/")) {
        report(file, "Unknown workspace dependency " + specifier);
      } else if (!builtIn(specifier)) {
        const resolution = ts.resolveModuleName(
          specifier,
          file,
          owner.compiler,
          ts.sys,
        ).resolvedModule;
        const resolved =
          resolution && path.resolve(resolution.resolvedFileName);
        const candidate = resolved && sourceOwner(resolved);
        if (candidate && candidate !== owner) {
          report(
            file,
            "Workspace source bypass " +
              specifier +
              " -> " +
              relative(resolved),
          );
          dependencies.add(candidate.name);
        }
        if (resolved && modules.has(resolved)) target = resolved;
      }
      const serverOnly =
        builtIn(specifier) ||
        specifier === "server-only" ||
        forbiddenClient.has(packageName(specifier)) ||
        forbiddenClient.has(dependency?.name);
      if (
        browserPackages.has(owner.name) &&
        (serverOnly || packageName(specifier) === "next")
      )
        report(file, "Client package dependency " + specifier);
      if (
        owner.name === "reader-core" &&
        (policy.forbiddenInCore.includes(packageName(specifier)) ||
          (dependency?.name === "story-schema" && !typeOnly))
      )
        report(file, "Core runtime dependency " + specifier);
      if (
        target ||
        serverOnly ||
        (policy.readingRecords &&
          relative(file) === policy.readingRecords.cache)
      )
        edges.push({ target, typeOnly, serverOnly, specifier });
    }
    moduleGraph.set(file, edges);
  }

  cycles(packageGraph, (chain) =>
    errors.add("Package cycle: " + chain.join(" -> ")),
  );
  cycles(
    new Map(
      [...moduleGraph].map(([file, entries]) => [
        file,
        entries.flatMap(({ target }) => (target ? [target] : [])),
      ]),
    ),
    (chain) => errors.add("Module cycle: " + chain.map(relative).join(" -> ")),
  );
  if (policy.readingRecords) {
    const { featureRoot, cache, publicModules } = policy.readingRecords;
    const syncRoot = path.join(root, featureRoot, "reading-sync");
    const features = new Map();
    const feature = (file) => {
      const local = path.relative(path.join(root, featureRoot), file);
      return outside(local) ? null : local.split(path.sep)[0];
    };
    for (const [file, edges] of moduleGraph) {
      const owner = feature(file);
      for (const { target, specifier, serverOnly } of edges) {
        if (
          relative(file) === cache &&
          (serverOnly ||
            packageName(specifier) === "react" ||
            (target &&
              owns(path.join(root, "apps/web"), target) &&
              relative(target) !== cache))
        )
          report(file, "Reading cache must stay independent: " + specifier);
        if (!target) continue;
        if (
          owns(syncRoot, target) &&
          !owns(syncRoot, file) &&
          !publicModules.includes(relative(target))
        )
          report(file, "Reading sync internal import " + specifier);
        const dependency = feature(target);
        if (owner && dependency && owner !== dependency) {
          const dependencies = features.get(owner) ?? new Set();
          dependencies.add(dependency);
          features.set(owner, dependencies);
        }
      }
    }
    cycles(features, (chain) =>
      errors.add("Feature cycle: " + chain.join(" -> ")),
    );
  }

  for (const [file, module] of modules) {
    if (!module.client) continue;
    const visited = new Set();
    function follow(current, chain) {
      if (visited.has(current)) return;
      visited.add(current);
      for (const edge of moduleGraph.get(current) ?? []) {
        if (edge.typeOnly) continue;
        if (edge.serverOnly)
          errors.add(
            "Client reaches server dependency: " +
              [...chain.map(relative), edge.specifier].join(" -> "),
          );
        if (edge.target) follow(edge.target, [...chain, edge.target]);
      }
    }
    follow(file, [file]);
  }
  return [...errors];
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const policy = JSON.parse(
    fs.readFileSync("contracts/package-boundaries.json", "utf8"),
  );
  const failures = checkBoundaries(process.cwd(), policy);
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log("Package and module boundaries passed.");
  }
}
