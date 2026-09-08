# Agent Note: fork merge ritual

Status: implemented

English | [中文](2026-09-08-fork-merge-ritual.zh.md)

## Problem

This repository is a fork of `deepseek-ai/deepseek-harness` that carries fork-local surfaces: the `packages/context/agent-rules` plugin, its bundle/tsconfig/lockfile/snapshot wiring, generated-catalog rows (English and Chinese), a dev-only icon patch in `apps/desktop/src/main.ts`, and a GitHub-side disable of the real-API E2E workflow. Incorporating upstream (the 2026-09-08 merge brought 1199 commits) disturbed every one of these in known ways, and each disturbance was repaired by hand. Without a recorded procedure, the next merge repeats the same discovery cost, and two silent failures are available: a regenerated catalog that drops the plugin's rows, and an upstream edit to `e2e.yml` that re-enables the nightly workflow GitHub had disabled.

## Decision

`scripts/fork-merge-ritual.sh` runs the whole incorporation as ordered phases: preflight (clean tree, or resume an in-progress merge), merge with automatic `--theirs` resolution limited to the generated files the fork regenerates, re-add (verify the plugin's `tsconfig.host.json` reference, base-bundle block, and snapshot-harness `PI_CODING_AGENT_DIR` lines survived; align the plugin version to the root version, which `check-workspace-constraints` requires), install + build, docs (run `gen-tsconfig-paths`, `gen-doc-graphs`, `gen-config-catalog`, sync the plugin's Chinese catalog section and event-matrix row from the English generated text, re-record pairing hashes), verify (`typecheck`, plugin tests, `constraints`, `test:docs`, `test:snapshot`), and a final GitHub Actions check that re-disables `e2e.yml` if an upstream edit re-activated it. The script commits the restore pass but never pushes. Conflicts it does not own stop the run with the file list and an inline resolution guide.

The fork-local surfaces carry markers so the script and a human can find them: `Fork-local` comments in `apps/desktop/src/main.ts`, the `DSH_SNAPSHOT` disable comment in `packages/bundle/base/cordis.patch.yml`, and the plugin name in every checked file.

## Alternatives considered

- **A GitHub Action that merges upstream automatically.** Rejected: the merge needs conflict judgment the script deliberately stops for, the fork's CI secrets situation is exactly what the disabled E2E workflow protects, and an automated merge would re-enable it through the same file-edit path the ritual guards against.
- **Deleting `e2e.yml` in the fork instead of disabling it on GitHub.** Rejected: deletion guarantees a modify/delete conflict on every upstream edit of that file, while the disable is one API call the ritual re-checks.
- **A git pre-merge hook or `git config merge.ours.driver` trick for generated files.** Rejected: attribute-driven resolution hides the conflict from the operator and silently keeps stale fork rows when upstream changes the generator, which is the failure the docs phase exists to prevent.
- **Documenting the ritual in prose only.** Rejected: the sequence is long, mechanical, and has two silent-failure points; the script is the documentation, and this note is its rationale.

## Consequences

Every upstream incorporation becomes one command plus, at most, the conflicts the script names. The ritual's checks are assertions, not repairs, for hand-owned surfaces (`tsconfig.host.json`, the bundle block, the desktop icon patch): it fails loud with instructions instead of guessing. The plugin version alignment runs on every ritual, so the fork tracks release trains without a release process. The E2E workflow stays disabled as repository state, not file state; the ritual's last phase is the only guard against an upstream edit silently re-enabling the nightly real-API runs.
