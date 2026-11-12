---
node_type: reference
title: Fork merge ritual and fork-local policy
service: _platform
status: active
updated: 2026-11-10
tags: [fork, merge, upstream, policy]
links:
  documents:
    - ../../scripts/fork-merge-ritual.sh
    - ../../scripts/product-package-policy.ts
    - ../../scripts/check-workspace-constraints.ts
  part_of: [README.md]
  relates_to:
    - ../AGENTS.md
    - ../i18n/README.md
    - ../../packages/fork/README.md
    - ../../.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md
    - fork-web-search-zai.md
    - fork-build-and-gate-adaptations.md
---

# Fork merge ritual and fork-local policy

[`scripts/fork-merge-ritual.sh`](../../scripts/fork-merge-ritual.sh) incorporates `upstream/master` into this checkout and restores what that merge disturbs: the generated catalogs and doc graphs, the translation-pairing records, and the GitHub Actions workflows this fork keeps disabled. Run it after every upstream pull. The script commits its own restore pass and never pushes. [The merge-ritual Agent Note](../../.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md) owns the decision, the rejected alternatives, and the conflict inventory; this page states the order the script runs and where the fork's local exceptions live.

## Invocation and settings

The script sets `set -euo pipefail` and `cd "$(dirname "$0")/.."`, so it runs from any directory and stops at the first failed command. It exports `NODE_OPTIONS` with `--max-old-space-size=8192` appended, because `pnpm run gen-doc-graphs` exceeds the default Node heap once the merged upstream doc corpus is indexed. Each setting is an environment variable with a default taken from the script: `UPSTREAM_REMOTE` (`upstream`), `UPSTREAM_URL` (the upstream clone URL named in the script), `UPSTREAM_BRANCH` (`master`), and the three workflow identifiers `E2E_WORKFLOW_ID`, `CI_MASTER_WORKFLOW_ID`, and `SANDBOX_WORKFLOW_ID`, whose defaults are the workflows defined by `.github/workflows/e2e.yml`, `.github/workflows/ci-master.yml`, and `.github/workflows/sandbox.yml`.

## Phases, in script order

- **preflight** — registers the upstream remote when `git remote get-url "$UPSTREAM_REMOTE"` fails, adding it from `UPSTREAM_URL`. A present `.git/MERGE_HEAD` sets `MERGE_IN_PROGRESS=1`, and the run resumes at conflict resolution instead of starting a merge; otherwise a non-empty `git status --porcelain` ends the run and asks for a commit or a stash.
- **merge** — the resume path goes straight to conflict resolution. Otherwise the script runs `git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"`, skips the merge when `git merge-base --is-ancestor "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" HEAD` proves the upstream tip is already in history and sets `MERGED_NOW=0`, and otherwise runs `git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --no-edit`. A failed merge calls `resolve_generated_conflicts`, which reads the unmerged paths from `git diff --name-only --diff-filter=U` and, for each path also named in `GENERATED_CONFLICTS`, runs `git checkout --theirs -- <file>` and `git add -- <file>`; the fork's rows in those files return through the generators rather than by hand. If unmerged paths remain, the script prints them, prints `resolution_guide` (take `--theirs` on `pnpm-lock.yaml` and let `pnpm install` regenerate; the `docs/*.zh.md` and `docs/*.i18n.yaml` pairs belong to the docs phase), and stops. Once nothing remains it runs `pnpm install` before `git commit --no-edit`, because the full pre-commit lane regenerates third-party notices from `node_modules` and that hook fails until the new graph is installed.
- **install** — `pnpm install` and then `pnpm run build`.
- **docs** — regenerates `pnpm run gen-tsconfig-paths` (the marked alias region inside `tsconfig.base.json`), `pnpm run gen-doc-graphs` (`docs/graph-atlas.md`, `docs/capability-seams.md`, `docs/event-producer-consumer.md`, `docs/agent-lifecycle.md`, `docs/tool-execution-pipeline.md`, and `apps/cli/composition.md`), and `pnpm run gen-config-catalog` (`docs/config-catalog.md`). A regenerated catalog carries stale pairing hashes, so the phase then runs `pnpm run verify-translation-pairing --write docs/config-catalog.md docs/event-producer-consumer.md` and immediately re-checks the same two pairs without `--write`.
- **verify** — `pnpm run typecheck`, `pnpm run constraints` (which runs `scripts/check-workspace-constraints.ts`), `pnpm run test:docs` (the `doc-quick` aggregate in `scripts/run-gates.ts`: translation pairing, Markdown links, Markdown wrap, repository references, doc budgets, and the other quick documentation gates), and `pnpm run test:snapshot`. The script records one accepted noise case: `verify-repository-references` can flag a `uv.lock` size numeral whose seven-hexadecimal-character prefix matches a fork-only commit in the local object database, and that single finding is noise while the file stays byte-identical to `upstream/master`.
- **actions** — when `gh` is on `PATH`, the script derives `ORIGIN_SLUG` from the `origin` remote with `sed 's/\.git$//'` and `awk -F'[/:]'`, reads `gh api "repos/$ORIGIN_SLUG/actions/workflows/$WORKFLOW_ID" --jq .state` for each of the three identifiers, and issues `gh api "repos/$ORIGIN_SLUG/actions/workflows/$WORKFLOW_ID/disable" -X PUT` whenever the state is `active`. Any upstream edit to one of those workflow files re-enables it on GitHub, and this fork targets Linux x64 only, so the phase is the guard for the nightly real-API runs. Without `gh` the phase prints the manual check with the three identifiers and the run continues.
- **commit** — when `git diff` or `git diff --cached` reports changes, the script runs `git add -A` and commits with the message `chore(fork): restore fork-local surfaces after upstream merge`; otherwise it reports that nothing needed restoring. The closing message asks the operator to review and run `git push origin master` after a merge that changed something, and says no push is needed when `MERGED_NOW` is `0`.

Because the merge phase skips itself when upstream is already an ancestor, running the script again on an unchanged upstream is the way to re-check and restore the fork's own files.

## What each merge restores

`GENERATED_CONFLICTS` in the script is the authoritative list of files that take upstream's side on conflict: the two catalogs this fork consumes and each one's `.zh.md` and `.i18n.yaml` pair, the graph pages the docs phase regenerates, and `tsconfig.base.json`. Nothing on that list is re-applied by hand: the docs phase regenerates the content, and the pairing re-record followed by the `test:docs` re-check proves the regenerated English page and its Chinese counterpart agree. The inventory of fork-local packages and the workstation files that sit beside them is [packages/fork/README.md](../../packages/fork/README.md). The disabled state of the three workflows is GitHub repository state rather than file state, so only the actions phase restores it.

## Fork-local exceptions the scripts carry

Each of these is an edit this fork makes to an upstream file. A merge keeps them because upstream's side is taken only for files listed in `GENERATED_CONFLICTS`, and the checks below re-prove them after every merge.

- [scripts/product-package-policy.ts](../../scripts/product-package-policy.ts) adds the row `'packages/fork/web-search-zai'` with `category: 'optional'` and the reason that the fork-local z.ai MCP search and reader provider needs the `ZAI_API_KEY` credential. `scripts/verify-product-use.ts` reads `PRODUCT_PACKAGE_POLICY` to check each maintained package's declared role, and `scripts/verify-locale-metadata.ts` reads the same map to skip locale-metadata collection for a row whose category is `test`. `pnpm run verify-product-use` runs in the CI shared-static list (`ciSharedStaticGates`) and in `hygieneLeafGates` in `scripts/run-gates.ts`, not in the ritual's verify phase.
- [scripts/check-workspace-constraints.ts](../../scripts/check-workspace-constraints.ts) makes `isReleaseMemberDirectory` return `false` for every directory whose path starts with `packages/fork/`. A fork-local package can then keep `"private": true` and omit `publishConfig.access` and `repository`, which `checkWorkspaceManifest` requires of every release member. `pnpm run constraints` runs this file in the verify phase, so a lost exemption fails the merge run rather than shipping.
- Bilingual pairing is excluded rather than maintained. The `excluded` array of `scripts/translation-pairing.manifest.json` names the fork's own documents, among them the `docs/README.md` index and the folder indexes, `docs/ontology.md`, the `docs/ops/` and `docs/user/` pages, `packages/fork/README.md`, `packages/fork/web-search-zai/README.md`, `scripts/web-launcher/README.md`, and the two fork Agent Notes. [docs/AGENTS.md](../AGENTS.md) states the rule, "Chinese documentation is not maintained in this fork", [docs/i18n/README.md](../i18n/README.md) owns the scope-and-exclusions contract and records that the gate rejects a `.zh.md` or `.i18n.yaml` for an excluded path, and the root [AGENTS.md](../../AGENTS.md) section `Fork maintenance` names this script as the way upstream merges land here.
- [scripts/AGENTS.md](../../scripts/AGENTS.md) records `scripts/web-launcher/` as local tooling with its own README and skill, and `.gitignore` adds `scripts/**/__pycache__/` so the launcher's Python bytecode stays out of `git status`; the KB engine's derived files `.gitmark/`, `*-map.html`, and `.scratch/` are ignored by the lines the OntoShip entry in root `AGENTS.md` requires, so a merge never sees them as fork edits to re-apply.

Adding or retiring a fork-local document, package, or check exception changes `GENERATED_CONFLICTS`, this page, and [the Agent Note](../../.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md) in the same commit: a file the ritual does not name is the file the next merge drops.
