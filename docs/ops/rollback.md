# Static Release Rollback

- Status: GitHub Pages rollback procedure accepted; known-good candidate required
- Primary owner: Repository owner
- Release procedure: [release.md](release.md)
- Operational boundary: [00-operational-contract.md](00-operational-contract.md)

## Rollback Triggers

Roll back a published candidate when the final HTTPS URL cannot boot; a critical user journey fails;
input, simulation, or replay determinism differs from the candidate; a required asset is missing or
unlicensed; an unexpected network or secret dependency appears; or the deployed artifact cannot be
tied to its claimed SHA.

Optional audio failure, a rejected clipboard permission with visible fallback, or a known Mayhem
readability tradeoff is not by itself a rollback trigger.

## Decision Tree

1. If the public link is unreachable or serves broken/stale files, unpublish the Pages site when
   immediate containment matters, then restore the previous known-good source revision through a
   new reviewed commit.
2. If the artifact loads but the defect is browser-specific, restore the previous artifact unless
   the affected browser was explicitly outside the published support matrix.
3. If the defect is asset-only and the procedural fallback is approved and tested, forward-fix the
   asset in a new candidate; otherwise restore the previous artifact.
4. If simulation, input, content, replay, or result behavior changed, restore first. Diagnose and
   version the forward fix separately.
5. If no previous known-good artifact or provider rollback control exists, stop the release and
   remove or clearly disable the public submission link until a verified candidate is available.

## Procedure

- Record the bad URL, observed time, deployed identity if available, candidate SHA, browser/device,
  and the first failed critical journey.
- Select the most recent known-good exact SHA with local, hosted, deployment, and URL evidence. Keep
  the failed run's retained Pages artifact as incident evidence; do not reuse it as a rollback when
  it is the faulty artifact.
- GitHub Pages does not provide this repository with an atomic pointer to an arbitrary older Pages
  artifact. Restore by reverting the bad source change in a new commit on `main`, allowing the same
  pinned workflow and lockfile to rebuild, retest, and redeploy it. Record that the rollback is a
  reproducible rebuild, not a byte-for-byte promotion of the old artifact.
- If rebuilding cannot be trusted or the known-good dependency graph is unavailable, unpublish the
  site in Settings → Pages instead of serving a knowingly broken candidate.
- Repeat the post-deploy checks in [release.md](release.md) against the restored URL.
- Preserve the bad SHA and reproduction seed. Do not rewrite or delete source history to hide the
  failed candidate.

## Data and Database Policy

Database rollback, backup restore, user-data reconciliation, and migration reversal are
`NOT_APPLICABLE`. The MVP has no database, server writes, or persisted user data. Browser refresh or
restart creates local state again.

## Forward-fix Gate

A forward fix receives a new commit SHA and, when runtime behavior or public output changes, the
appropriate product/content/simulation version review. Rerun the affected local, browser, audit,
asset, human, hosted, and final-URL evidence rather than inheriting the rolled-back candidate's
approval.

## Provider Limit

The retained Pages artifact is an evidence and diagnosis aid, not a guaranteed long-term rollback
slot. It expires after 30 days, and the configured deploy action consumes the artifact from its own
workflow run. This repository therefore does not claim instant immutable-artifact rollback. The
bounded recovery paths are a validated revert-and-redeploy or immediate unpublish.
