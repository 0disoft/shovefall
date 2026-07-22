# CI

- Status: GitHub Actions workflow configured; hosted result and branch protection are external gates

## Operational Contract

`.github/workflows/ci.yml` is the source-owned hosted validation workflow. It runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. One `Validate` job uses `ubuntu-24.04`, Bun `1.3.14`, the committed lockfile, and a fifteen-minute timeout.

The job performs these stages in order:

1. Check out only the triggering source revision without persisted Git credentials.
2. Install the exact Bun version and locked dependency graph without dependency lifecycle scripts.
3. Run `check`, the same aggregate merge-blocking command defined in `package.json` and `VALIDATION.md`.
4. Build and exercise the generated production artifact through `smoke-dist` in the runner's stable Chrome channel.

A failed install, check, build, browser launch, or smoke assertion fails the job. No `continue-on-error`, retry loop, deployment, release, package publication, artifact upload, cache restore, or secret is present. Superseded runs on the same workflow and ref are cancelled to avoid charging runner time for stale commits.

The workflow-level token grants only `contents: read`; every unspecified permission is `none`. Third-party actions are pinned to reviewed full commit SHAs with release comments. Updating either pin requires a fresh upstream release and provenance review.

## Evidence Boundary

Local `check` and `smoke-dist` results do not prove GitHub accepted or executed the workflow. A hosted run must be inspected at the exact commit before calling CI green. Likewise, a green workflow is advisory until the repository's GitHub branch-protection settings require the `Validate` check. Dashboard-only branch protection cannot be encoded or proven by this repository.

The deterministic 64-round audit and browser scale profile are intentionally excluded from routine pushes because they are broader evidence with materially higher runner cost. They remain explicit configured local commands and may be promoted to scheduled or manual hosted jobs only after a runner-minute budget is accepted.

## Owners and Failure Handling

- Primary owner: Repository owner
- Backup owner: None assigned
- Escalation path: Inspect the first failing stage and reproduce through the matching local validation name. Do not rerun until green without explaining the failure.

Dependency or action download failure is infrastructure evidence, not a source failure. Chrome image drift is isolated to `smoke-dist`; deterministic simulation truth remains owned by Vitest and replay hashes. A compromised or retagged action is contained by full-SHA pins, while runner-image and registry availability remain external risks.

## Release Boundary

- Required validation names: `check` and `smoke-dist`
- Release blocker status: A failed exact-SHA hosted run blocks release consideration; no release is currently authorized.
- Remaining operational risk: Hosted run status, branch protection, runner-image Chrome drift, physical-device coverage, cross-browser coverage, static hosting, and deployment smoke remain unproven until separately observed.
