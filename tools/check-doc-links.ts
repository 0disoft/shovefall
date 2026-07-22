import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";

const ROOT_DOCUMENTS = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CHECKLIST.md",
  "CONTRIBUTING.md",
  "DEVELOPMENT.md",
  "README.md",
  "VALIDATION.md",
];

async function listMarkdownFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return listMarkdownFiles(path);
      }

      return entry.isFile() && extname(entry.name).toLowerCase() === ".md" ? [path] : [];
    }),
  );

  return files.flat();
}

function getRelativeLinkTargets(markdown: string): readonly string[] {
  const targets: string[] = [];
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of markdown.matchAll(pattern)) {
    const rawTarget = match[1]?.trim();

    if (
      rawTarget === undefined ||
      rawTarget.startsWith("#") ||
      /^[a-z][a-z+.-]*:/i.test(rawTarget)
    ) {
      continue;
    }

    const withoutTitle = rawTarget.startsWith("<")
      ? rawTarget.slice(1, rawTarget.indexOf(">"))
      : rawTarget.split(/\s+["']/u, 1)[0];
    const target = withoutTitle?.split(/[?#]/u, 1)[0];

    if (target !== undefined && target.length > 0) {
      targets.push(decodeURI(target));
    }
  }

  return targets;
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }

      throw error;
    });
}

async function main(): Promise<void> {
  const root = process.cwd();
  const markdownFiles = [
    ...ROOT_DOCUMENTS.map((path) => join(root, path)),
    ...(await listMarkdownFiles(join(root, "docs"))),
  ];
  const checks = await Promise.all(
    markdownFiles.map(async (file): Promise<readonly string[]> => {
      const markdown = await readFile(file, "utf8");
      const results = await Promise.all(
        getRelativeLinkTargets(markdown).map(async (target): Promise<string | undefined> => {
          const targetPath = normalize(resolve(dirname(file), target));

          return !targetPath.startsWith(root) || !(await pathExists(targetPath))
            ? `${relative(root, file)} -> ${target}`
            : undefined;
        }),
      );

      return results.filter((result): result is string => result !== undefined);
    }),
  );
  const missing = checks.flat();

  if (missing.length > 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, missing }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, checkedDocuments: markdownFiles.length }, null, 2)}\n`,
  );
}

await main();
