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
        headlessBoundaries: ["src/ai", "src/simulation"],
      },
      null,
      2,
    )}\n`,
  );
}

await main();
