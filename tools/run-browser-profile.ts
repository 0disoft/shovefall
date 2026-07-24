import { spawnSync } from "node:child_process";

import { sampleHostCpu } from "./browser-profile-preflight";

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    shell: false,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main(): Promise<void> {
  run("bun", ["run", "build"]);
  const qualification = await sampleHostCpu();
  process.stdout.write(
    `${JSON.stringify({ kind: "browser-profile-host-preflight", ...qualification })}\n`,
  );

  if (!qualification.accepted) {
    throw new Error(
      `Browser profile host rejected: average CPU ${qualification.averagePercent}% (limit ${qualification.averageLimitPercent}%), maximum ${qualification.maximumPercent}% (limit ${qualification.maximumLimitPercent}%).`,
    );
  }

  run("bun", ["run", "profile:browser:execute"]);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
