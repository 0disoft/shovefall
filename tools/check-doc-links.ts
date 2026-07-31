import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import {
  FIXED_COLLAPSE_SPEED,
  FIXED_INITIAL_ITEM_COUNT,
  FIXED_ITEM_RESPAWN_SECONDS,
} from "../src/app/settings";
import {
  PUBLIC_LAKE_COUNT,
  PUBLIC_MAXIMUM_LAKE_SIZE,
  PUBLIC_MINIMUM_LAKE_SIZE,
  PUBLIC_TOTAL_LAKE_BUDGET,
} from "../src/simulation/arena";
import { CONTENT_VERSION, PRODUCT_VERSION, SIMULATION_VERSION } from "../src/simulation/versions";

const ROOT_DOCUMENTS = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CHECKLIST.md",
  "CONTRIBUTING.md",
  "DEVELOPMENT.md",
  "README.md",
  "VALIDATION.md",
];

const REQUIRED_CUSTOM_DOCUMENTS = [
  "docs/README.md",
  "docs/product/00-product-brief.md",
  "docs/product/01-roadmap.md",
  "docs/product/02-spec.md",
  "docs/product/03-risk-register.md",
  "docs/product/04-playtest-protocol.md",
  "docs/product/05-submission-package.md",
  "docs/assets/README.md",
  "docs/frontend/FRONTEND_DESIGN.md",
  "docs/web-app/README.md",
  "docs/web-app/routing-and-rendering.md",
  "docs/web-app/browser-state.md",
  "docs/integrations/backend-api.md",
  "docs/ops/00-operational-contract.md",
  "docs/ops/release.md",
  "docs/ops/rollback.md",
] as const;

const SCAFFOLD_MARKERS = [
  "Status: Draft",
  "UNASSIGNED",
  "UNDECIDED",
  "intentionally a scaffold",
] as const;

const CURRENT_PRODUCT_CONTRACTS = [
  {
    path: "docs/ops/release.md",
    required: [
      `Current product version: \`${PRODUCT_VERSION}\``,
      `Product \`${PRODUCT_VERSION}\`, simulation \`${SIMULATION_VERSION}\`, and content \`${CONTENT_VERSION}\``,
      `${PUBLIC_LAKE_COUNT} separated ${PUBLIC_MINIMUM_LAKE_SIZE}–${PUBLIC_MAXIMUM_LAKE_SIZE}-tile lakes`,
      `${PUBLIC_TOTAL_LAKE_BUDGET}-tile budget`,
      "No public round time limit.",
      "reports remain v11",
    ],
    forbidden: ["16-participant normal round", "32-participant Mayhem boot"],
  },
  {
    path: "docs/product/02-spec.md",
    required: [
      "no public round time limit",
      `exactly ${PUBLIC_LAKE_COUNT} separated ${PUBLIC_MINIMUM_LAKE_SIZE}–${PUBLIC_MAXIMUM_LAKE_SIZE}-tile lakes under a ${PUBLIC_TOTAL_LAKE_BUDGET}-tile total budget`,
      "kill-triggered direct six-trait progression",
      `fixed ${FIXED_COLLAPSE_SPEED[0]?.toUpperCase()}${FIXED_COLLAPSE_SPEED.slice(1)} collapse`,
      `${FIXED_INITIAL_ITEM_COUNT} initial map items`,
      `one new item every ${FIXED_ITEM_RESPAWN_SECONDS} seconds`,
    ],
    forbidden: ["75-second hard round limit"],
  },
] as const;

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
  const scaffoldMarkers = (
    await Promise.all(
      REQUIRED_CUSTOM_DOCUMENTS.map(async (path): Promise<readonly string[]> => {
        const markdown = await readFile(join(root, path), "utf8");

        return SCAFFOLD_MARKERS.filter((marker) => markdown.includes(marker)).map(
          (marker) => `${path} -> ${marker}`,
        );
      }),
    )
  ).flat();
  const productContractDrift = (
    await Promise.all(
      CURRENT_PRODUCT_CONTRACTS.map(async ({ path, required, forbidden }) => {
        const markdown = await readFile(join(root, path), "utf8");
        return [
          ...required
            .filter((value) => !markdown.includes(value))
            .map((value) => `${path} -> missing current contract: ${value}`),
          ...forbidden
            .filter((value) => markdown.includes(value))
            .map((value) => `${path} -> removed public mode: ${value}`),
        ];
      }),
    )
  ).flat();

  if (missing.length > 0 || scaffoldMarkers.length > 0 || productContractDrift.length > 0) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, missing, scaffoldMarkers, productContractDrift }, null, 2)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        checkedDocuments: markdownFiles.length,
        checkedCustomDocuments: REQUIRED_CUSTOM_DOCUMENTS.length,
        checkedProductContracts: CURRENT_PRODUCT_CONTRACTS.length,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
