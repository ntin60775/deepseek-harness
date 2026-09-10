# Agent Note: fork Linux x64 validation lanes

Status: implemented

## Problem

This fork ships to one Debian x64 workstation but inherits upstream's full validation surface: GitHub workflows with macOS/Windows/ARM lanes, and a unit suite whose host-sensitive files are calibrated for the Ubuntu CI image. After the 2026-09-10 merge of upstream 0.1.5-rc.1, `pnpm run test` on this host failed 31 tests across 9 files — every one byte-identical to upstream — and every push ran permanently red non-Linux lanes (`sandbox.yml`'s macOS seatbelt job, `ci-master.yml`'s macOS/ARM python-runtime jobs). Both failure classes invite the same wrong agent reactions: patching upstream-owned test or workflow files (creating merge divergence and, for workflows, re-enabling a GitHub-side disable), or re-diagnosing the identical host-caused failures at every run.

## Decision

Validation splits into what the fork owns and what only the upstream CI image can decide; nothing upstream-owned is edited.

GitHub-side, the fork keeps exactly three workflows disabled: `e2e.yml` (338747924, real-API nightly — pre-existing policy), `ci-master.yml` (339387441 — no linux-x64 lane: macOS/ARM python-runtime, windows-wine, never-running self-hosted standby), and `sandbox.yml` (338747938 — macOS seatbelt lane fails on every push while its linux lanes test code the fork diff never touches). Any edit to their files re-enables the workflows on GitHub, so the [fork merge ritual](2026-09-08-fork-merge-ritual.md) actions phase re-checks all three ids after every merge and re-disables whichever reports `active`. Push runs then report green on the Release and Node Addon workflows.

The machine-local test lane lives outside the repository at `~/.local/bin/dsh-test`, named in AGENTS.md (Fork maintenance) as this host's replacement for `pnpm run test`. It sets `umask 022` — the Debian desktop default `002` makes recursively created directories group-writable, the spill sweep trust check (`isTrustedDirectory`) refuses to delete inside them, and 11 sweep tests fail that pass on the Ubuntu image (umask 022). It passes `--retry 2` to absorb load flakes (client/jsdom and script specs that pass in isolation). It judges the verdict against a 7-file host-drift allowlist — `bash-local/tests/executor.spec.ts`, `bash-sandbox/tests/sandbox.spec.ts`, `tool-bash/tests/tools.spec.ts`, `subprocess-local/tests/local.spec.ts`, `scripts/session-query-spill-command.spec.ts` (systemd scope teardown differs from the CI image), `code-runtime-python/tests/runtime.spec.ts` (host Python 3.13 bootstrap budgets and repr), and `webworker-runtime/tests/compile/transform-corpus.spec.ts` (corpus baseline) — and passes if and only if every failing file is allowlisted. The allowlist lives in the wrapper because the root `vitest.config.ts` defines per-project `exclude` arrays that the vitest CLI `--exclude` does not reach (verified empirically: the excluded files still ran).

## Alternatives considered

- **Deleting or editing the workflow and test files in the fork.** Rejected: every such edit is merge divergence the ritual must repair forever, and editing a disabled workflow's file re-enables it on GitHub — the exact failure mode the ritual already guards for `e2e.yml`.
- **Excluding host-drift files via the vitest CLI.** Rejected: the per-project exclude arrays override the flag; the suite ran unchanged (observed empirically).
- **Making the host match the CI image.** The umask half was adopted (`umask 022` in `~/.bashrc`); downgrading Python or pinning systemd behavior was rejected — the workstation's distribution owns those versions, and breaking the user environment for a test-only concern costs more than the allowlist.
- **Running `pnpm run test` and judging red output by hand each time.** Rejected: that re-diagnosis cost is what this note exists to remove, and hand judgment drifts; the wrapper encodes the verdict once and fails loud on any file outside the allowlist.

## Consequences

The local full-suite signal became trustworthy: `dsh-test` exiting 0 means the fork is healthy, and any failing file outside the allowlist is a real regression that stops work. The allowlist is operator-owned, so shrinking it needs no repository change — when upstream hardens a file, the wrapper simply passes it and the entry can be dropped. A new host-sensitive upstream test appears as an unexpected failure; add it to the allowlist only after proving it host-caused (the file is byte-identical to upstream and fails in a clean systemd user scope). The fork gives up `sandbox.yml`'s green linux lanes (landlock/bwrap e2e on ubuntu runners); accepted because the fork diff never touches sandbox code and the ritual's verify phase (typecheck, constraints, doc gates, keyless snapshots) covers everything the fork owns.
