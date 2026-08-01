interface GitHubRun {
  readonly conclusion: string | null;
  readonly databaseId: number;
  readonly headSha: string;
  readonly status: string;
  readonly url: string;
}

interface GitHubJob {
  readonly conclusion: string | null;
  readonly name: string;
  readonly status: string;
  readonly url: string;
}

interface GitHubRunView {
  readonly conclusion: string | null;
  readonly headSha: string;
  readonly jobs: readonly GitHubJob[];
  readonly status: string;
  readonly url: string;
}

const REPOSITORY = "0disoft/shovefall";
const WORKFLOW = "CI";
const REQUIRED_JOBS = Object.freeze(["Validate", "Production Chrome", "Deploy GitHub Pages"]);
const POLL_INTERVAL_MILLISECONDS = 10_000;
const TIMEOUT_MILLISECONDS = 12 * 60 * 1_000;

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr.trim() || "unknown error"}`,
    );
  }

  return result.stdout.trim();
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }

  return Object.fromEntries(Object.entries(value));
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }

  return value;
}

function requireNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }

  return requireString(value, path);
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${path} must be a safe integer`);
  }

  return value;
}

function parseJob(value: unknown, path: string): GitHubJob {
  const record = requireRecord(value, path);
  return Object.freeze({
    conclusion: requireNullableString(record.conclusion, `${path}.conclusion`),
    name: requireString(record.name, `${path}.name`),
    status: requireString(record.status, `${path}.status`),
    url: requireString(record.url, `${path}.url`),
  });
}

function parseRun(value: unknown, path: string): GitHubRun {
  const record = requireRecord(value, path);
  return Object.freeze({
    conclusion: requireNullableString(record.conclusion, `${path}.conclusion`),
    databaseId: requireNumber(record.databaseId, `${path}.databaseId`),
    headSha: requireString(record.headSha, `${path}.headSha`),
    status: requireString(record.status, `${path}.status`),
    url: requireString(record.url, `${path}.url`),
  });
}

function getHeadSha(): string {
  return run("git", ["rev-parse", "HEAD"]);
}

function listRuns(): readonly GitHubRun[] {
  const parsed: unknown = JSON.parse(
    run("gh", [
      "run",
      "list",
      "--repo",
      REPOSITORY,
      "--workflow",
      WORKFLOW,
      "--branch",
      "main",
      "--limit",
      "20",
      "--json",
      "conclusion,databaseId,headSha,status,url",
    ]),
  );

  if (!Array.isArray(parsed)) {
    throw new Error("GitHub run list must be an array");
  }

  return Object.freeze(parsed.map((value, index) => parseRun(value, `runs[${index}]`)));
}

function viewRun(databaseId: number): GitHubRunView {
  const parsed: unknown = JSON.parse(
    run("gh", [
      "run",
      "view",
      String(databaseId),
      "--repo",
      REPOSITORY,
      "--json",
      "conclusion,headSha,jobs,status,url",
    ]),
  );
  const record = requireRecord(parsed, "run");
  if (!Array.isArray(record.jobs)) {
    throw new Error("run.jobs must be an array");
  }

  return Object.freeze({
    conclusion: requireNullableString(record.conclusion, "run.conclusion"),
    headSha: requireString(record.headSha, "run.headSha"),
    jobs: Object.freeze(record.jobs.map((value, index) => parseJob(value, `run.jobs[${index}]`))),
    status: requireString(record.status, "run.status"),
    url: requireString(record.url, "run.url"),
  });
}

const headSha = getHeadSha();
const deadline = Date.now() + TIMEOUT_MILLISECONDS;

async function waitForDeployment(): Promise<void> {
  const observedRun = listRuns().find((candidate) => candidate.headSha === headSha);

  if (observedRun?.status === "completed") {
    const detail = viewRun(observedRun.databaseId);
    const requiredJobs = REQUIRED_JOBS.map((name) => detail.jobs.find((job) => job.name === name));
    const missingJobs = REQUIRED_JOBS.filter((_, index) => requiredJobs[index] === undefined);
    const foundJobs = requiredJobs.filter((job): job is GitHubJob => job !== undefined);
    const failedJobs = foundJobs.filter((job) => job.conclusion !== "success");

    if (detail.headSha !== headSha) {
      throw new Error(
        `GitHub run ${observedRun.databaseId} belongs to ${detail.headSha}, not ${headSha}`,
      );
    }
    if (missingJobs.length > 0) {
      throw new Error(
        `GitHub run ${observedRun.databaseId} is missing jobs: ${missingJobs.join(", ")}`,
      );
    }
    if (detail.conclusion !== "success" || failedJobs.length > 0) {
      throw new Error(
        `GitHub run ${observedRun.databaseId} failed: ${JSON.stringify({
          conclusion: detail.conclusion,
          failedJobs: failedJobs.map(({ conclusion, name, url }) => ({ conclusion, name, url })),
          url: detail.url,
        })}`,
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          headSha,
          runId: observedRun.databaseId,
          runUrl: detail.url,
          jobs: foundJobs.map(({ conclusion, name, url }) => ({ conclusion, name, url })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (Date.now() >= deadline) {
    throw new Error(
      `Timed out waiting for GitHub Pages deployment for ${headSha}; last observed run: ${JSON.stringify(observedRun ?? null)}`,
    );
  }

  await delay(POLL_INTERVAL_MILLISECONDS);
  return waitForDeployment();
}

await waitForDeployment();
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
