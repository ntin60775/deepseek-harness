# Agent Note: fork Linux x64 validation lanes

Status: implemented

## Problem

The fork targets Linux x64 workstations but inherits upstream's full validation surface: GitHub workflows with macOS/Windows/ARM lanes, and a unit suite whose host-sensitive files are calibrated for the Ubuntu CI image. Development hosts diverge from that image in ways the suite does not tolerate: desktop umask `002` makes recursively created directories group-writable, which the spill sweep trust check (`isTrustedDirectory`) refuses to delete inside; distribution Python newer than the image's (3.13 on Debian 13) exceeds recorded bootstrap budgets and changes repr behavior; systemd scope teardown differs. After the 2026-09-10 merge of upstream 0.1.5-rc.1, `pnpm run test` on a Debian 13 host failed 31 tests across 9 files — every one byte-identical to upstream — and every push ran permanently red non-Linux lanes (`sandbox.yml`'s macOS seatbelt job, `ci-master.yml`'s macOS/ARM python-runtime jobs). Both failure classes invite the same wrong agent reactions on any machine: patching upstream-owned test or workflow files (creating merge divergence and, for workflows, re-enabling a GitHub-side disable), or re-diagnosing the identical host-caused failures at every run.

## Decision

Validation splits into what the fork owns and what only the upstream CI image can decide; nothing upstream-owned is edited, on any machine.

GitHub-side, the fork keeps exactly three workflows disabled as repository state: `e2e.yml` (338747924, real-API nightly — pre-existing policy), `ci-master.yml` (339387441 — no linux-x64 lane: macOS/ARM python-runtime, windows-wine, never-running self-hosted standby), and `sandbox.yml` (338747938 — macOS seatbelt lane fails on every push while its linux lanes test code the fork diff never touches). Any edit to their files re-enables the workflows on GitHub, so the [fork merge ritual](2026-09-08-fork-merge-ritual.md) actions phase re-checks all three ids after every merge and re-disables whichever reports `active`. Push runs then report green on the Release and Node Addon workflows.

Host-side, every Linux machine that develops this fork runs the operator-local wrapper `~/.local/bin/dsh-test` instead of `pnpm run test`, created once from the template below. The wrapper sets `umask 022` (making the spill sweep trust check delete as the tests expect), passes `--retry 2` to absorb load flakes (client/jsdom and script specs that pass in isolation), and judges the verdict against a host-drift allowlist: it passes if and only if every failing file is allowlisted. The initial allowlist is the 7 files proven host-drifted on Debian 13 — `bash-local/tests/executor.spec.ts`, `bash-sandbox/tests/sandbox.spec.ts`, `tool-bash/tests/tools.spec.ts`, `subprocess-local/tests/local.spec.ts`, `scripts/session-query-spill-command.spec.ts` (systemd scope teardown), `code-runtime-python/tests/runtime.spec.ts` (Python 3.13 bootstrap budgets and repr), `webworker-runtime/tests/compile/transform-corpus.spec.ts` (corpus baseline). On hosts closer to the CI image the list shrinks by itself: entries that do not fail there simply never fire. A file joins the list only after being proven host-caused — byte-identical to upstream and failing in a clean systemd user scope. The allowlist lives in the wrapper, not the repository, because the root `vitest.config.ts` defines per-project `exclude` arrays that the vitest CLI `--exclude` does not reach (verified empirically: excluded files still ran) and because shrinking the list must not require a repository change.

## Wrapper template

On a fresh machine, create `~/.local/bin/dsh-test` with the checkout's absolute path substituted for the placeholder, then `chmod +x` it:

```bash
#!/usr/bin/env bash
# Full unit suite for a Linux dev host of the deepseek-harness fork, with
# host drift tolerated. Allowlisted files are byte-identical to upstream —
# never patch them in the fork. Rationale and membership rules: the Agent
# Note "fork Linux x64 validation lanes" (.agents/notes/implemented/process/
# 2026-09-10-fork-linux-x64-validation-lanes.md).
#
# umask 022 — desktop distros default to 002; group-writable directories
#   make the spill sweep trust check refuse deletion and its tests fail.
# --retry 2 — absorbs load flakes (client/jsdom and script specs).
# allowlist — files that fail only where the host diverges from the Ubuntu
#   CI image (distro Python, systemd scope teardown, webworker corpus
#   baseline). Verdict: pass iff every FAIL file is allowlisted; any other
#   failing file is a real regression and exits non-zero.
set -uo pipefail

REPO="<absolute path to the checkout>"
cd "$REPO"
umask 022

ALLOWLIST=(
  packages/experimental/code-runtime-python/tests/runtime.spec.ts
  packages/experimental/webworker-runtime/tests/compile/transform-corpus.spec.ts
  packages/shell/bash-local/tests/executor.spec.ts
  packages/shell/bash-sandbox/tests/sandbox.spec.ts
  packages/shell/tool-bash/tests/tools.spec.ts
  packages/subprocess/subprocess-local/tests/local.spec.ts
  scripts/session-query-spill-command.spec.ts
)

LOG="$(mktemp /tmp/dsh-test.XXXXXX.log)"
pnpm run build:native-system || exit 1
pnpm exec vitest run --retry 2 2>&1 | tee "$LOG"

grep -q "Test Files" "$LOG" || { echo "dsh-test: vitest did not reach a summary — see $LOG" >&2; exit 1; }

FAILED_FILES="$(grep -E '^ FAIL' "$LOG" | sed -E 's/^ FAIL +\|[^|]*\| +//; s/ >.*//' | sort -u)"
UNEXPECTED=""
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  known=0
  for a in "${ALLOWLIST[@]}"; do [[ "$f" == "$a" ]] && { known=1; break; }; done
  (( known )) || UNEXPECTED+="$f"$'\n'
done <<< "$FAILED_FILES"

if [[ -n "$UNEXPECTED" ]]; then
  echo "dsh-test: UNEXPECTED failing files (not on the host-drift allowlist):" >&2
  printf '%s' "$UNEXPECTED" >&2
  echo "log: $LOG" >&2
  exit 1
fi
echo "dsh-test: OK — every failure is a known host-drift allowlist file (${#ALLOWLIST[@]}); log: $LOG"
```

Login shells on hosts whose default umask is `002` additionally set `umask 022` (for example in `~/.bashrc`) so ad-hoc commands — bare `pnpm run test`, spill tooling, file fixtures created by hand — see CI-compatible permissions; the wrapper sets its own umask regardless.

## Alternatives considered

- **Deleting or editing the workflow and test files in the fork.** Rejected: every such edit is merge divergence the ritual must repair forever, and editing a disabled workflow's file re-enables it on GitHub — the exact failure mode the ritual already guards for `e2e.yml`.
- **Excluding host-drift files via the vitest CLI.** Rejected: the per-project exclude arrays override the flag; the suite ran unchanged (observed empirically).
- **Making every host match the CI image.** The umask half was adopted (shell profile); downgrading distribution Python or pinning systemd behavior was rejected — the machine's distribution owns those versions, and breaking a user environment for a test-only concern costs more than the allowlist.
- **Running `pnpm run test` and judging red output by hand each time.** Rejected: that re-diagnosis cost is what this note exists to remove, and hand judgment drifts; the wrapper encodes the verdict once and fails loud on any file outside the allowlist.
- **Committing the wrapper into the repository.** Rejected: the allowlist would then need a repository change (and a merge-clean edit) every time a host proves or disproves an entry, and repo-side test selection is already owned by the vitest config, which is upstream's.

## Consequences

Every Linux machine gets the same signal contract: `dsh-test` exiting 0 means the fork is healthy on that host, and any failing file outside the allowlist is a real regression that stops work. The allowlist is operator-owned, so per-machine drift needs no repository change — when upstream hardens a file, the wrapper simply passes it and the entry can be dropped. A new host-sensitive upstream test appears as an unexpected failure and joins the allowlist only through the proof rule above. The fork gives up `sandbox.yml`'s green linux lanes (landlock/bwrap e2e on ubuntu runners); accepted because the fork diff never touches sandbox code and the ritual's verify phase (typecheck, constraints, doc gates, keyless snapshots) covers everything the fork owns.
