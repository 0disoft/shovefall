# CI and GitHub Pages Deployment

- Status: GitHub Actions validation and GitHub Pages deployment observed green

## Operational Contract

`.github/workflows/ci.yml` is the source-owned hosted validation and GitHub Pages deployment workflow. It runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. The `Validate` job uses `ubuntu-24.04`, Bun `1.3.14`, the committed lockfile, and a fifteen-minute timeout.

The job performs these stages in order:

1. Check out only the triggering source revision without persisted Git credentials.
2. Install the exact Bun version and locked dependency graph without dependency lifecycle scripts.
3. Run `check`, the same aggregate merge-blocking command defined in `package.json` and `VALIDATION.md`.
4. Build and exercise the generated production artifact through `smoke-dist` in the runner's stable Chrome channel.
5. On `main` pushes and manual runs only, capture and upload a clean exact-SHA submission-media
   bundle with two PNGs, one WebM, and its provenance manifest.
6. Configure Pages and upload the already-tested `dist` directory as a 30-day artifact.

The dependent `Deploy GitHub Pages` job runs only after `Validate` succeeds and never runs for a
pull request. It deploys the uploaded artifact to the `github-pages` environment and publishes the
provider-returned URL as the environment URL.

A failed install, check, build, browser launch, smoke assertion, artifact upload, or Pages deployment fails the workflow. No `continue-on-error`, retry loop, package publication, cache restore, or repository secret is present. Pull-request runs may be cancelled when superseded. Main-branch runs are not cancelled in progress so a deployment is not cut off halfway; GitHub concurrency retains at most the newest pending run for the same workflow and ref.

`capture:submission` runs only after the production browser smoke and before the Pages handoff. It refuses tracked worktree drift, writes only ignored local capture output, and binds its 1920×1080 images, short video, browser diagnostics, versions, and file checksums to the full `GITHUB_SHA`. CI uploads the result as `shovefall-submission-capture-<sha>` for 30 days with missing files treated as failure. Pull-request merge refs skip both capture and upload, so they cannot be mistaken for submission-candidate media.

The `Validate` job grants only `contents: read`. The deployment job grants `contents: read`,
`pages: write`, and `id-token: write`; every unspecified permission is `none`. No long-lived hosting
credential exists. Checkout, Bun setup, Pages configuration, Pages artifact upload, and Pages deploy
actions are pinned to reviewed full commit SHAs with release comments. Updating any pin requires a
fresh upstream release and provenance review.

`.github/workflows/clarissimi.yml` separately owns contributor-recognition automation. Its
`pull_request_target` gate is read-only and never checks out contributor code. A merged source pull
request may start a scoped `stage-draft` job that writes only a Clarissimi review branch and opens a
sanitized draft review pull request. An approved checked-in draft can be promoted only through a
manual dispatch, which opens another review pull request rather than committing recognition
directly to `main`. Repository Actions defaults remain read-only; only these two jobs request
`contents: write` and `pull-requests: write`, with `issues: read`.

The repository owner deliberately selected `0disoft/clarissimi@v0` so consumer workflows follow
maintainer-approved `0.x` Action releases without following development branch `main`. On
2026-07-23, the upstream `v0` ref resolved to Clarissimi v0.6.0 commit
`97398d030aaddf9568210181dda93031fd800584`. This moving ref is the one exception to the default
full-SHA Action policy. A regression rolls back by disabling the Clarissimi workflow or pinning the
last reviewed immutable release or commit; it never justifies broadening permissions or bypassing
the draft-review path.

On 2026-07-23, the GitHub repository setting that allows Actions to create and approve pull requests
was confirmed enabled while the default `GITHUB_TOKEN` permission remained `Read repository
contents and packages permissions`. That setting enables `stage-draft` and `promote-draft`; it does
not replace the workflow's explicit job permissions or make the advisory gate merge enforcement.
The stable check name is `Clarissimi review decision`; switching repository variable
`CLARISSIMI_GATE_MODE` from its default `advisory` to `required` is a later promotion decision after
real contributor traffic has exercised the workflow.

## Evidence Boundary

Local `check` and `smoke-dist` results do not prove GitHub accepted or executed the workflow. A
hosted run must be inspected at the exact commit before calling CI green. A green `Validate` job
does not prove Pages deployed, and a green Pages deployment does not prove the public URL's critical
journey. Likewise, a green workflow is advisory until the repository's GitHub branch-protection
settings require the `Validate` or `Clarissimi review decision` check. Dashboard-only branch
protection and the Actions pull-request permission cannot be encoded or proven by this repository.

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

The Boat candidate completed [CI run 30025468513](https://github.com/0disoft/shovefall/actions/runs/30025468513) for exact implementation SHA `d32e66711d87db21fc0b2d4adf1261d2cd52d9e0`. `Validate` completed in 3 minutes 52 seconds, including the slower Ubuntu production Chrome smoke, and the dependent Pages deployment completed in 10 seconds from the tested artifact. A fresh public session then confirmed `v0.29.0` and the `배 1회 · 5초 동안 물 위 이동` setting at the Pages URL.

The Bomb candidate completed [CI run 30030306125](https://github.com/0disoft/shovefall/actions/runs/30030306125) for exact SHA `9b82be027846192464aff861ec7e7dd86e86cd19`. Merge checks, eleven isolated production Chrome paths, artifact upload, and the dependent Pages deployment all passed. A fresh public session confirmed `v0.30.0`, the `시한폭탄 2개 · 5초 뒤 주변을 날려` setting, and no console warnings or errors.

The Grappling Hook candidate completed [CI run 30038218455](https://github.com/0disoft/shovefall/actions/runs/30038218455) for exact SHA `4dc23456673d08ba15228776bdce15e2b768bcd5`. `Validate` completed in 4 minutes 19 seconds with merge checks, thirteen production Chrome paths, Pages configuration, and exact tested-artifact upload. The dependent Pages job completed in 11 seconds without rebuilding. A fresh cache-busted public session confirmed `v0.32.0`, the `구조 갈고리 2회 · 땅이나 벽을 붙잡아` setting, an active Hard-AI WebGL arena with changing survivors, and no browser log entries.

The widened-island candidate completed [CI run 30043768628](https://github.com/0disoft/shovefall/actions/runs/30043768628) for exact implementation SHA `732f95f3a777220d0410612a2fb95840a8e7e721`. `Validate` completed in 3 minutes 49 seconds with merge checks, all thirteen production Chrome paths, Pages configuration, and exact tested-artifact upload. The dependent Pages job completed in 10 seconds without rebuilding. A fresh cache-busted public session confirmed `v0.33.0`, the eight-lake version record, a running 50-participant WebGL arena, zero developer-panel nodes, and no browser warnings or errors.

The protected-core pressure candidate completed [CI run 30052278919](https://github.com/0disoft/shovefall/actions/runs/30052278919) for exact SHA `bd34d78fe9f80dd091c1df1725cfa07d88ab4860`. Merge checks, all thirteen production Chrome paths, Pages configuration, tested-artifact upload, and the dependent Pages deployment succeeded. A fresh cache-busted public session confirmed the `v0.34.0` menu, an active 50-participant Hard-AI WebGL arena, changing survivor state, and no browser warnings or errors.

The current `0.34.0` runtime candidate completed [CI run 30055148110](https://github.com/0disoft/shovefall/actions/runs/30055148110) for exact SHA `c0ddda93e1d75520909c79888c342f4b57747d7f`. `Validate` passed all 173 tests and thirteen production Chrome paths, uploaded the exact tested artifact, and the dependent Pages job deployed it. A fresh cache-busted public session separately confirmed the menu, active fixed-50 Hard-AI WebGL arena, changing tick and survivor state, one canvas, and no browser warnings or errors.

Follow-up validation-only SHA `3863e3f1ac4f6f5f9ef539d1eb23e569543de145` completed [CI run 30056108194](https://github.com/0disoft/shovefall/actions/runs/30056108194). `Validate` passed 176 tests including the new host-preflight contract, all thirteen production Chrome paths, tested-artifact upload, and the dependent Pages deployment. The application bundle remained unchanged. A cache-busted public session then confirmed the `v0.34.0` version record and zero browser warnings or errors.

## Owners and Failure Handling

- Primary owner: Repository owner
- Backup owner: None assigned
- Escalation path: Inspect the first failing stage and reproduce through the matching local validation name. A pre-job billing or spending-limit annotation must be resolved at the account boundary before rerunning unchanged code.

Dependency or action download failure is infrastructure evidence, not a source failure. Chrome image drift is isolated to `smoke-dist`; deterministic simulation truth remains owned by Vitest and replay hashes. A compromised or retagged action is contained by full-SHA pins, while runner-image and registry availability remain external risks.

## Deployment Boundary

- Required validation names: `check` and `smoke-dist`
- Public URL: `https://0disoft.github.io/shovefall/`
- Release blocker status: Hosted validation, Pages deployment, and public version/50-participant arena smoke are green for exact runtime SHA `c0ddda93e1d75520909c79888c342f4b57747d7f`; every later runtime or release-candidate change requires its own exact-SHA run, successful deploy job, and URL smoke.
- Remaining operational risk: Branch protection, real merged-contributor Clarissimi staging and
  promotion, runner-image Chrome drift, broader physical-device coverage, cross-browser coverage,
  and human playtest remain unproven until separately observed.
