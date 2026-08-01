interface GitHubRun {
  readonly conclusion: string | null;
  readonly databaseId: number;
  readonly headSha: string;
  readonly name: string;
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
const POLL_INTERVAL_MILLISECONDS = 15_000;
const TIMEOUT_MILLISECONDS = 12 * 60 * 1_000;
const GITHUB_API_HEADERS = Object.freeze({
  accept: "application/vnd.github+json",
  "user-agent": "shovefall-deployment-waiter",
  "x-github-api-version": "2022-11-28",
});

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
    url: requireString(record.html_url, `${path}.html_url`),
  });
}

function parseRun(value: unknown, path: string): GitHubRun {
  const record = requireRecord(value, path);
  return Object.freeze({
    conclusion: requireNullableString(record.conclusion, `${path}.conclusion`),
    databaseId: requireNumber(record.id, `${path}.id`),
    headSha: requireString(record.head_sha, `${path}.head_sha`),
    name: requireString(record.name, `${path}.name`),
    status: requireString(record.status, `${path}.status`),
    url: requireString(record.html_url, `${path}.html_url`),
  });
}

function getHeadSha(): string {
  return run("git", ["rev-parse", "HEAD"]);
}

async function fetchGitHubJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { headers: GITHUB_API_HEADERS });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} ${response.statusText}: ${url}`);
  }

  return response.json();
}

async function listRuns(): Promise<readonly GitHubRun[]> {
  const url = new URL(`https://api.github.com/repos/${REPOSITORY}/actions/runs`);
  url.searchParams.set("head_sha", headSha);
  url.searchParams.set("per_page", "20");
  const record = requireRecord(await fetchGitHubJson(url), "response");
  if (!Array.isArray(record.workflow_runs)) {
    throw new Error("response.workflow_runs must be an array");
  }

  return Object.freeze(
    record.workflow_runs
      .map((value, index) => parseRun(value, `response.workflow_runs[${index}]`))
      .filter((candidate) => candidate.name === WORKFLOW),
  );
}

async function viewRun(runState: GitHubRun): Promise<GitHubRunView> {
  const url = new URL(
    `https://api.github.com/repos/${REPOSITORY}/actions/runs/${runState.databaseId}/jobs`,
  );
  url.searchParams.set("per_page", "100");
  const record = requireRecord(await fetchGitHubJson(url), "response");
  if (!Array.isArray(record.jobs)) {
    throw new Error("response.jobs must be an array");
  }

  return Object.freeze({
    conclusion: runState.conclusion,
    headSha: runState.headSha,
    jobs: Object.freeze(
      record.jobs.map((value, index) => parseJob(value, `response.jobs[${index}]`)),
    ),
    status: runState.status,
    url: runState.url,
  });
}

const headSha = getHeadSha();
const deadline = Date.now() + TIMEOUT_MILLISECONDS;

async function waitForDeployment(): Promise<void> {
  const observedRun = (await listRuns()).find((candidate) => candidate.headSha === headSha);

  if (observedRun?.status === "completed") {
    const detail = await viewRun(observedRun);
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
