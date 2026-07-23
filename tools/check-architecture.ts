import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly packageManager?: string;
  readonly private?: boolean;
}

const FORBIDDEN_PACKAGES = new Set([
  "@angular/core",
  "matter-js",
  "phaser",
  "react",
  "svelte",
  "tailwindcss",
  "vue",
]);

const FORBIDDEN_HEADLESS_IMPORTS = new Set(["pixi.js"]);
const FORBIDDEN_HEADLESS_GLOBALS = [
  "document",
  "window",
  "performance.now",
  "Date.now",
  "Math.random",
];

const CLARISSIMI_REQUIRED_FRAGMENTS = [
  "pull_request_target:",
  "workflow_dispatch:",
  "permissions: {}",
  "name: Clarissimi review decision",
  "mode: gate",
  "gate-mode: ${{ vars.CLARISSIMI_GATE_MODE || 'advisory' }}",
  "github.event.pull_request.merged == true",
  "!startsWith(github.event.pull_request.head.ref, 'clarissimi/')",
  "mode: stage-draft",
  "comment-mode: upsert",
  "mode: promote-draft",
  "draft-path: ${{ inputs.draft-path }}",
  "markdown-summary: gallery",
  "include-automation-contributors: true",
  "uses: 0disoft/clarissimi@v0 # moving-v0",
] as const;

const CLARISSIMI_FORBIDDEN_FRAGMENTS = [
  "0disoft/clarissimi@main",
  "permissions: write-all",
  "write-all",
  "CLARISSIMI_PROVIDER_TOKEN",
] as const;

const PUBLIC_HTML_FORBIDDEN_DEVELOPER_IDS = [
  "developer-telemetry",
  "tick-value",
  "rate-value",
  "position-value",
  "seed-value",
  "hash-value",
] as const;

async function listTypeScriptFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    },
  );
  const files = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }

      return entry.isFile() && extname(entry.name) === ".ts" ? [path] : [];
    }),
  );

  return files.flat();
}

function getImportSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  const pattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;

  for (const match of source.matchAll(pattern)) {
    const specifier = match[2];

    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isPackageManifest(value: unknown): value is PackageManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    (!("dependencies" in value) || isStringRecord(value.dependencies)) &&
    (!("devDependencies" in value) || isStringRecord(value.devDependencies)) &&
    (!("packageManager" in value) || typeof value.packageManager === "string") &&
    (!("private" in value) || typeof value.private === "boolean")
  );
}

async function checkHeadlessFile(root: string, file: string): Promise<readonly string[]> {
  const source = await readFile(file, "utf8");
  const displayPath = relative(root, file).replaceAll("\\", "/");
  const violations: string[] = [];

  for (const specifier of getImportSpecifiers(source)) {
    if (FORBIDDEN_HEADLESS_IMPORTS.has(specifier)) {
      violations.push(`${displayPath} imports forbidden renderer: ${specifier}`);
    }
  }

  for (const globalName of FORBIDDEN_HEADLESS_GLOBALS) {
    if (source.includes(globalName)) {
      violations.push(`${displayPath} uses forbidden ambient global: ${globalName}`);
    }
  }

  return violations;
}

async function checkClarissimiWorkflow(root: string): Promise<readonly string[]> {
  const workflowPath = join(root, ".github", "workflows", "clarissimi.yml");
  const source = await readFile(workflowPath, "utf8");
  const violations: string[] = [];

  for (const fragment of CLARISSIMI_REQUIRED_FRAGMENTS) {
    if (!source.includes(fragment)) {
      violations.push(`.github/workflows/clarissimi.yml is missing contract fragment: ${fragment}`);
    }
  }

  for (const fragment of CLARISSIMI_FORBIDDEN_FRAGMENTS) {
    if (source.includes(fragment)) {
      violations.push(`.github/workflows/clarissimi.yml contains forbidden fragment: ${fragment}`);
    }
  }

  const gateStart = source.indexOf("  review-decision:");
  const stageStart = source.indexOf("  stage-draft:");
  const promoteStart = source.indexOf("  promote-draft:");

  if (gateStart < 0 || stageStart < 0 || promoteStart < 0) {
    violations.push("Clarissimi workflow must keep gate, stage-draft, and promote-draft jobs");
    return violations;
  }

  const gateJob = source.slice(gateStart, stageStart);
  const stageJob = source.slice(stageStart, promoteStart);
  const promoteJob = source.slice(promoteStart);

  if (/actions\/checkout@|contents: write/u.test(gateJob)) {
    violations.push("Clarissimi pull_request_target gate must not checkout code or write contents");
  }

  for (const [name, job] of [
    ["stage-draft", stageJob],
    ["promote-draft", promoteJob],
  ] as const) {
    if (!/contents: write/u.test(job) || !/pull-requests: write/u.test(job)) {
      violations.push(`Clarissimi ${name} must declare its scoped branch and pull-request writes`);
    }

    if (!/issues: read/u.test(job) || /issues: write/u.test(job)) {
      violations.push(`Clarissimi ${name} must keep issue access read-only`);
    }
  }

  return violations;
}

async function checkPublicHtml(root: string): Promise<readonly string[]> {
  const source = await readFile(join(root, "index.html"), "utf8");
  return PUBLIC_HTML_FORBIDDEN_DEVELOPER_IDS.filter((id) => source.includes(`id="${id}"`)).map(
    (id) => `index.html must not ship development-only element #${id}`,
  );
}

async function main(): Promise<void> {
  const root = process.cwd();
  const packagePath = join(root, "package.json");
  const parsedManifest: unknown = JSON.parse(await readFile(packagePath, "utf8"));

  if (!isPackageManifest(parsedManifest)) {
    throw new Error("package.json does not match the expected Shovefall manifest shape");
  }

  const manifest = parsedManifest;
  const dependencyNames = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  const violations: string[] = [];

  if (manifest.private !== true) {
    violations.push("package.json must remain private");
  }

  if (manifest.packageManager !== "bun@1.3.14") {
    violations.push("packageManager must remain pinned to bun@1.3.14");
  }

  for (const dependency of dependencyNames) {
    if (FORBIDDEN_PACKAGES.has(dependency)) {
      violations.push(`forbidden baseline dependency: ${dependency}`);
    }
  }

  const headlessFiles = (
    await Promise.all(
      ["simulation", "ai"].map((directory) => listTypeScriptFiles(join(root, "src", directory))),
    )
  ).flat();
  const headlessViolations = await Promise.all(
    headlessFiles.map((file) => checkHeadlessFile(root, file)),
  );
  violations.push(...headlessViolations.flat());
  violations.push(...(await checkClarissimiWorkflow(root)));
  violations.push(...(await checkPublicHtml(root)));

  if (violations.length > 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, violations }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        checkedDependencies: [...dependencyNames].toSorted(),
        clarissimiWorkflow: ".github/workflows/clarissimi.yml",
        headlessBoundaries: ["src/ai", "src/simulation"],
        publicHtmlBoundary: "index.html excludes development-only telemetry markup",
      },
      null,
      2,
    )}\n`,
  );
}

await main();
