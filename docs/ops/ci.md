# CI and GitHub Pages Deployment

- Status: GitHub Actions validation and GitHub Pages deployment observed green

## Operational Contract

`.github/workflows/ci.yml` is the source-owned hosted validation and GitHub Pages deployment workflow. It runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. The `Validate` job uses `ubuntu-24.04`, Bun `1.3.14`, the committed lockfile, and a fifteen-minute timeout.

The job performs these stages in order:

1. Check out only the triggering source revision without persisted Git credentials.
2. Install the exact Bun version and locked dependency graph without dependency lifecycle scripts.
3. Run `check`, the same aggregate merge-blocking command defined in `package.json` and `VALIDATION.md`.
4. Build and exercise the generated production artifact through `smoke-dist` in the runner's stable Chrome channel.
5. On `main` pushes and manual runs only, configure Pages and upload that already-tested `dist`
   directory as a 30-day artifact.

The dependent `Deploy GitHub Pages` job runs only after `Validate` succeeds and never runs for a
pull request. It deploys the uploaded artifact to the `github-pages` environment and publishes the
provider-returned URL as the environment URL.

A failed install, check, build, browser launch, smoke assertion, artifact upload, or Pages deployment fails the workflow. No `continue-on-error`, retry loop, package publication, cache restore, or repository secret is present. Pull-request runs may be cancelled when superseded. Main-branch runs are not cancelled in progress so a deployment is not cut off halfway; GitHub concurrency retains at most the newest pending run for the same workflow and ref.

The `Validate` job grants only `contents: read`. The deployment job grants `contents: read`,
`pages: write`, and `id-token: write`; every unspecified permission is `none`. No long-lived hosting
credential exists. Checkout, Bun setup, Pages configuration, Pages artifact upload, and Pages deploy
actions are pinned to reviewed full commit SHAs with release comments. Updating any pin requires a
fresh upstream release and provenance review.

## Evidence Boundary

Local `check` and `smoke-dist` results do not prove GitHub accepted or executed the workflow. A
hosted run must be inspected at the exact commit before calling CI green. A green `Validate` job
does not prove Pages deployed, and a green Pages deployment does not prove the public URL's critical
journey. Likewise, a green workflow is advisory until the repository's GitHub branch-protection
settings require the `Validate` check. Dashboard-only branch protection cannot be encoded or proven
by this repository.

The deterministic 64-round audit and browser scale profile are intentionally excluded from routine pushes because they are broader evidence with materially higher runner cost. They remain explicit configured local commands and may be promoted to scheduled or manual hosted jobs only after a runner-minute budget is accepted.

## Current Hosted Evidence

On 2026-07-23, [CI #9](https://github.com/0disoft/shovefall/actions/runs/29948626757)
attempt 1 for exact commit `7ded47cf72399bde49c9193ceaa9e6b76b4ebcf0` was rejected before
checkout because the account's Actions spending limit was exhausted. After the repository owner
increased that limit, attempt 2 ran the same commit and completed `Validate` successfully.

Provider job evidence reported successful setup, checkout, Bun setup, locked dependency install,
merge-blocking checks, production-artifact Chrome exercise, and cleanup. This proves the workflow
for exact SHA `7ded47cf72399bde49c9193ceaa9e6b76b4ebcf0`; it does not automatically cover later commits.
The original failure is classified as an account-level runner-admission failure rather than a
source, test, cache, artifact, or runner-image defect.

The subsequent Coal-Twilight runtime candidate also completed
[CI #10](https://github.com/0disoft/shovefall/actions/runs/29977438082) successfully in 53 seconds
for exact SHA `7809502b8c33a12ad9cdd86d2dceb66424585579`. This is the current hosted runtime
evidence; a later runtime or release-candidate change still requires its own exact-SHA run.

The first Pages-enabled run, [CI #12](https://github.com/0disoft/shovefall/actions/runs/29979359647),
completed both jobs for exact SHA `7794e9a47f89aefea1f39483680996a5236963ae`: `Validate` in 34
seconds and `Deploy GitHub Pages` in 10 seconds. The deployment consumed the artifact uploaded by
the validated job rather than rebuilding. The artifact digest was
`sha256:e3031183663b44eb4285a5499ee4e953dae6ee25e7daa8953fbd438b2a7d27ef`, and the
public URL critical path was then verified separately in Chrome.

## Owners and Failure Handling

- Primary owner: Repository owner
- Backup owner: None assigned
- Escalation path: Inspect the first failing stage and reproduce through the matching local validation name. A pre-job billing or spending-limit annotation must be resolved at the account boundary before rerunning unchanged code.

Dependency or action download failure is infrastructure evidence, not a source failure. Chrome image drift is isolated to `smoke-dist`; deterministic simulation truth remains owned by Vitest and replay hashes. A compromised or retagged action is contained by full-SHA pins, while runner-image and registry availability remain external risks.

## Deployment Boundary

- Required validation names: `check` and `smoke-dist`
- Public URL: `https://0disoft.github.io/shovefall/`
- Release blocker status: Hosted validation, Pages deployment, and public-URL Chrome smoke are green for Pages candidate SHA `7794e9a47f89aefea1f39483680996a5236963ae`; every later runtime or release-candidate change requires its own exact-SHA run, successful deploy job, and URL smoke.
- Remaining operational risk: Branch protection, runner-image Chrome drift, broader physical-device coverage, cross-browser coverage, and human playtest remain unproven until separately observed.
