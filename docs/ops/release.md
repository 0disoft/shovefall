# Static Release Procedure

- Status: Ready for provider selection; deployment not authorized by this document
- Primary owner: Repository owner
- Current product version: `0.17.0`
- Validation source: [../../VALIDATION.md](../../VALIDATION.md)
- Submission package: [../product/05-submission-package.md](../product/05-submission-package.md)
- Asset ledger: [../assets/README.md](../assets/README.md)

## Release Types

- `local candidate`: a clean exact SHA with configured local checks and browser evidence.
- `hosted candidate`: the same SHA built by hosted CI and served at a temporary or final HTTPS URL.
- `contest release`: a hosted candidate with human-play, visual, asset, capture, and submission
  evidence complete.

Calling a build a candidate does not publish it. Calling a URL deployed does not prove that it
serves the intended SHA.

## Candidate Freeze

1. Record the full commit SHA, product/simulation/content versions, and intended host.
2. Confirm the child repository is clean and the remote branch resolves to the same SHA.
3. Run configured `shovefall_check`, `shovefall_smoke_dist`, `shovefall_audit_rounds`,
   `shovefall_profile_scale`, `shovefall_profile_browser`, and
   `ssealed_shovefall_doctor_strict` intents against that SHA.
4. Confirm replay fixtures and evidence documents name the current versions.
5. Freeze game rules and content. A later behavior, content, asset, or build change creates a new
   candidate and invalidates affected evidence.

## External Gates

Before deployment or contest submission, record all of the following:

- GitHub Actions workflow URL and conclusion for the exact candidate SHA.
- Branch-protection or manual-promotion decision; a workflow file alone is not enforcement.
- Hosting provider, project/site identifier, credential owner, base path, and rollback control.
- Named device, OS, browser/version, viewport, and critical-journey result.
- Human playtest batch and decision from
  [../product/04-playtest-protocol.md](../product/04-playtest-protocol.md).
- Approved visual direction and every shipped asset row from [../assets/README.md](../assets/README.md).

## Deployment Boundary

The repository currently has CI but no configured deployment intent or provider choice. Do not add
a provider token, publish command, Pages workflow, or hosting-specific configuration by guessing.
Once the owner selects a host, add one narrow provider-specific deployment contract with least
privilege, an exact artifact source, an immutable release identity, and an explicit rollback path.

## Post-deploy Verification

Against the final HTTPS URL and candidate SHA:

1. Hard refresh and verify the title, setup, and canvas render without console-fatal errors.
2. Run Quick Start through countdown, movement, shove, dodge, collapse, result, and restart.
3. Verify `기록 복사` succeeds in the secure context and denial still leaves visible manual data.
4. Test one 16-participant normal round and one 32-participant Mayhem boot.
5. Confirm optional audio can fail without blocking play.
6. Inspect network activity for unexpected origins, runtime API calls, mixed content, and missing
   assets.
7. Capture the final screenshot/video only after this verification and record their source SHA.

## Stop Conditions

Stop promotion when any required check is missing, stale, pending, or tied to another SHA; when the
public artifact cannot be tied to the candidate; when a critical journey fails; when an asset has
unknown provenance; or when the host cannot provide a known rollback action. Follow
[rollback.md](rollback.md) after a published regression.
