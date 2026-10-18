#!/usr/bin/env bash
# Fork merge ritual: incorporate upstream/master into this fork and restore the
# surfaces the merge disturbs — generated catalogs, doc graphs, workflow state.
# Run after every upstream pull.
#
# Phases:
#   1. preflight   — clean tree (or an in-progress merge to finish), upstream remote
#   2. merge       — git merge upstream/master; auto-resolve generated files
#   3. install     — pnpm install + full build
#   4. docs        — regenerate catalogs, re-record pairing
#   5. verify      — typecheck, doc gates, workspace constraints, snapshots
#   6. actions     — ensure the fork-disabled workflows stay disabled on GitHub
#
# The script never pushes. An unknown conflict stops the run with the remaining
# file list and the resolution guide.
#
# Rationale and the full conflict inventory:
# .agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md

set -euo pipefail
cd "$(dirname "$0")/.."

# gen-doc-graphs exceeds the default Node heap on the fork's Linux workstation
# once the merged upstream doc corpus is indexed.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=8192"

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-git@github.com:deepseek-ai/deepseek-harness.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-master}"
E2E_WORKFLOW_ID="${E2E_WORKFLOW_ID:-338747924}"   # .github/workflows/e2e.yml
CI_MASTER_WORKFLOW_ID="${CI_MASTER_WORKFLOW_ID:-339387441}" # .github/workflows/ci-master.yml
SANDBOX_WORKFLOW_ID="${SANDBOX_WORKFLOW_ID:-338747938}"     # .github/workflows/sandbox.yml
# Generated documents this fork consumes: take upstream's side on conflict and
# regenerate; the fork's own rows return through the generators, not by hand.
# The pair (zh + i18n) files of the fork-row catalogs resolve the same way:
# the docs phase re-records the pairing hashes after regeneration.
GENERATED_CONFLICTS=(
  docs/config-catalog.md
  docs/config-catalog.zh.md
  docs/config-catalog.i18n.yaml
  docs/event-producer-consumer.md
  docs/event-producer-consumer.zh.md
  docs/event-producer-consumer.i18n.yaml
  docs/capability-seams.md
  docs/agent-lifecycle.md
  docs/tool-execution-pipeline.md
  docs/graph-atlas.md
  tsconfig.base.json
)

log() { printf '\n== %s ==\n' "$*"; }
die() { printf 'fork-merge-ritual: %s\n' "$*" >&2; exit 1; }

resolution_guide() {
  cat >&2 <<'GUIDE'
Типовые разрешения:
  pnpm-lock.yaml                — возьми --theirs, затем `pnpm install` перегенерирует
  docs/*.zh.md, docs/*.i18n.yaml — см. фазу docs (регенерация + перезапись pairing)
GUIDE
}

# Resolve the generated files among the current conflicts; print what remains.
resolve_generated_conflicts() {
  for f in "${GENERATED_CONFLICTS[@]}"; do
    if git diff --name-only --diff-filter=U | grep -qx "$f"; then
      echo "конфликт в генерируемом $f — беру сторону апстрима (строки форка вернут генераторы)"
      git checkout --theirs -- "$f" && git add -- "$f"
    fi
  done
  git diff --name-only --diff-filter=U || true
}

# ---------------------------------------------------------------- preflight
log "preflight"
git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1 \
  || git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"

MERGE_IN_PROGRESS=0
if [[ -e .git/MERGE_HEAD ]]; then
  MERGE_IN_PROGRESS=1
  echo "обнаружен незавершённый merge — продолжаю с фазы разрешения конфликтов"
elif [[ -n "$(git status --porcelain)" ]]; then
  die "рабочее дерево не чистое — закоммить или спрячь изменения"
fi
echo "upstream: $(git remote get-url "$UPSTREAM_REMOTE")"

# ------------------------------------------------------------------- merge
log "merge $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
if [[ "$MERGE_IN_PROGRESS" == 1 ]]; then
  REMAINING="$(resolve_generated_conflicts)"
  if [[ -n "$REMAINING" ]]; then
    printf '  %s\n' $REMAINING >&2
    resolution_guide
    die "остались конфликты, которые скрипт не разрешает — почини и запусти снова"
  fi
  # The full pre-commit lane regenerates third-party notices from node_modules;
  # a merge that changed manifests fails that hook until the new graph is installed.
  pnpm install
  git commit --no-edit
  echo "merge-коммит создан"
  MERGED_NOW=1
else
  git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"
  if git merge-base --is-ancestor "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" HEAD; then
    echo "апстрим уже влит — фаза мерджа пропущена, идёт проверка форк-поверхностей"
    MERGED_NOW=0
  elif git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --no-edit; then
    echo "мердж чистый"
    MERGED_NOW=1
  else
    REMAINING="$(resolve_generated_conflicts)"
    if [[ -n "$REMAINING" ]]; then
      printf '  %s\n' $REMAINING >&2
      resolution_guide
      die "остались конфликты, которые скрипт не разрешает — почини и запусти снова"
    fi
    pnpm install
    git commit --no-edit
    echo "merge-коммит создан"
    MERGED_NOW=1
  fi
fi

# ----------------------------------------------------------------- install
log "install + build"
pnpm install
pnpm run build

# -------------------------------------------------------------------- docs
log "docs: regenerate catalogs"
pnpm run gen-tsconfig-paths
pnpm run gen-doc-graphs
pnpm run gen-config-catalog

# The regenerated catalogs' recorded pairing hashes are stale until re-recorded.
log "docs: re-record pairing"
pnpm run verify-translation-pairing --write docs/config-catalog.md docs/event-producer-consumer.md
pnpm run verify-translation-pairing docs/config-catalog.md docs/event-producer-consumer.md

# ------------------------------------------------------------------- verify
log "verify: typecheck, constraints, doc gates, snapshots"
pnpm run typecheck
pnpm run constraints
# verify-repository-references can flag a uv.lock size numeral whose 7-hex prefix
# matches a fork-only commit in the local object database; when the file is still
# byte-identical to upstream/master, treat that single finding as noise.
pnpm run test:docs
pnpm run test:snapshot

# ----------------------------------------------------------------- actions
log "github actions: fork-disabled workflows stay disabled"
if command -v gh >/dev/null 2>&1; then
  # gh's {owner}/{repo} placeholders resolve only with a matching host
  # credential; derive the slug from the origin remote instead. POSIX sed
  # has no lazy quantifiers, so strip .git and take the last two fields.
  ORIGIN_SLUG="$(git remote get-url origin | sed 's/\.git$//' | awk -F'[/:]' '{print $(NF-1) "/" $NF}')"
  # The fork targets Linux x64 only: any edit to these workflow files
  # re-enables the workflow on GitHub, so re-disable each one that is active.
  for WORKFLOW_ID in "$E2E_WORKFLOW_ID" "$CI_MASTER_WORKFLOW_ID" "$SANDBOX_WORKFLOW_ID"; do
    STATE="$(gh api "repos/$ORIGIN_SLUG/actions/workflows/$WORKFLOW_ID" \
      --jq .state 2>/dev/null || echo unknown)"
    echo "workflow $WORKFLOW_ID state ($ORIGIN_SLUG): $STATE"
    if [[ "$STATE" == "active" ]]; then
      echo "апстрим отредактировал файл воркфлоу $WORKFLOW_ID и включил его — отключаю снова"
      gh api "repos/$ORIGIN_SLUG/actions/workflows/$WORKFLOW_ID/disable" -X PUT
    fi
  done
else
  echo "gh недоступен — проверь вручную: gh api repos/ntin60775/deepseek-harness/actions/workflows/<id> --jq .state (id: $E2E_WORKFLOW_ID, $CI_MASTER_WORKFLOW_ID, $SANDBOX_WORKFLOW_ID)"
fi

# ------------------------------------------------------------------ commit
log "commit"
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git commit -m "chore(fork): restore fork-local surfaces after upstream merge"
  echo "закоммичено: restore fork-local surfaces"
else
  echo "нечего коммитить — все поверхности были на месте"
fi

log "готово"
if [[ "$MERGED_NOW" == 1 ]]; then
  echo "мердж этого запуска: push не сделан намеренно — проверь и выполни git push origin master"
else
  echo "изменений апстрима не было; push не требуется"
fi
