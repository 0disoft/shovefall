# Contributing

- Status: Accepted public contribution workflow
- Owner: Repository owner

Issues, playtest reports, documentation fixes, balance ideas, and pull requests are welcome. Keep
one change reason per pull request when practical so the gameplay, validation, and contributor
recognition evidence remain reviewable.

## Before Opening a Pull Request

1. Read [AGENTS.md](AGENTS.md), [VALIDATION.md](VALIDATION.md), and the source-of-truth document for
   the area being changed.
2. Do not commit secrets, generated `dist`, dependency directories, browser caches, local playtest
   records, or assets without a provenance entry in [docs/assets/README.md](docs/assets/README.md).
3. Run the narrowest relevant validations from [VALIDATION.md](VALIDATION.md). A gameplay or runtime
   change normally needs `check` and the affected browser smoke; a documentation-only change needs
   `docs`.
4. Fill in the pull request template with actual results and explicit skipped checks. Do not call a
   local result hosted evidence or a bot simulation a human playtest.

## Review and Contributor Recognition

[Clarissimi](https://github.com/0disoft/clarissimi) runs as a separate least-privilege workflow:

- `Clarissimi review decision` is initially advisory. It reads the pull request and trusted
  maintainer decision comments without checking out or executing contributor code.
- After a non-Clarissimi pull request is merged, Clarissimi opens or updates a review pull request
  containing only a sanitized `.clarissimi/drafts/*.json` recognition draft.
- Merging a source pull request does not publish recognition automatically. A maintainer must review
  the draft, set `maintainerApprovalStatus` to `approved` or `auto_approved`, merge that draft review
  pull request, and manually run `Clarissimi contributor recognition` with the exact checked-in
  draft path.
- The manual promotion opens a second recognition pull request. Public `CONTRIBUTORS.md` and
  `.clarissimi/` ledger outputs change only if that final pull request is reviewed and merged.
- AI-agent and bot contributions may be included, but they follow the same maintainer approval path.

Clarissimi does not auto-close, rank, or moderate issues. Issue triage remains a repository-owner
decision, and issue discussion alone does not create a public contributor record.

## Trust and Safety Boundary

The `pull_request_target` event is used only for the read-only gate and trusted post-merge draft
staging. The gate contains no checkout step, no provider credential, and no execution of fork code.
Write permissions exist only in post-merge draft staging and manual promotion jobs. Generated
Clarissimi branches are excluded from restaging so the workflow cannot recursively recognize its
own proposals.

The workflow intentionally follows the maintainer-approved moving `0disoft/clarissimi@v0` release
line. It never consumes `main`. If that line regresses, disable the workflow or replace `@v0` with
the last reviewed immutable release while the failure is investigated.

## Review Blockers

- Untrusted pull request code is checked out or executed from `pull_request_target`.
- Repository-wide write permissions, `write-all`, provider secrets, or a long-lived token are added.
- Recognition bypasses the staged draft, maintainer approval, or final proposal review.
- Validation evidence is missing, stale, or tied to a different commit.
- Asset provenance, API or persisted-format compatibility, rollback behavior, or user-visible risk is
  left implicit when the change touches that boundary.
