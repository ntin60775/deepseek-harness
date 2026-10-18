# Agent Note: fork merge ritual

Status: implemented

## Problem

This repository is a fork of `deepseek-ai/deepseek-harness` whose one authored surface is `scripts/fork-merge-ritual.sh`; the fork carries no UI, desktop, or plugin patches. A merge disturbs that script by construction — the 0.2.1-alpha integration dropped it — and it also disturbs the generated documents: the config catalog, the event producer/consumer matrix, the doc graphs, and the tsconfig paths. Each disturbance was repaired by hand, and two silent failures are available: a regenerated catalog that drops a fork row, and an upstream edit to a workflow file that re-enables a workflow GitHub had disabled.

## Decision

`scripts/fork-merge-ritual.sh` runs the incorporation as ordered phases: preflight (clean tree, or resume an in-progress merge), merge with automatic `--theirs` resolution limited to the generated files the docs phase regenerates, install and full build, docs (`gen-tsconfig-paths`, `gen-doc-graphs`, `gen-config-catalog`, then re-record and verify pairing for the regenerated catalogs), verify (`typecheck`, `constraints`, `test:docs`, `test:snapshot`), and a GitHub Actions check that re-disables `e2e.yml`, `ci-master.yml`, and `sandbox.yml` after an upstream edit re-activated one. The script commits the restore pass but never pushes; a conflict it does not own stops the run with the file list and a resolution guide.

The generated-conflict list inside the script is the authoritative set: files on it take the upstream side and return through the generators, never by hand. Fork-local documents are English-only: `scripts/translation-pairing.manifest.json` records their exclusion from bilingual pairing, because Chinese documentation arrives through upstream merges and is not maintained here.

## Alternatives considered

- **An automated upstream-merge GitHub Action.** Rejected: the merge needs conflict judgment the script deliberately stops for, and an automated run would land the fork's restore commit without review.
- **Deleting the fork-disabled workflows instead of disabling them on GitHub.** Rejected: deletion forces a modify/delete conflict on every upstream edit of those files, while one API call re-checks the disable state.
- **A merge driver that resolves generated files automatically.** Rejected: attribute-driven resolution hides the conflict and silently keeps stale rows when upstream changes a generator.
- **Documenting the ritual in prose only.** Rejected: the sequence is long and mechanical, and its silent-failure points are covered by assertions in the script, not by a checklist someone remembers to run.

## Consequences

Every upstream incorporation becomes one command plus, at most, the conflicts the script names. Its checks are assertions where the surface is machine-checkable — generated catalogs, doc gates, workflow state — and a stop-and-ask where the conflict needs judgment. The workflow disable stays repository state, not file state; the final phase is the only guard against an upstream edit silently re-enabling the nightly real-API runs. Adding or retiring a fork-local surface changes the script's conflict list and this note in the same commit, since a surface the ritual does not know about is exactly what the next merge drops.
