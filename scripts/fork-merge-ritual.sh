#!/usr/bin/env bash
# Fork merge ritual: incorporate upstream/master into this fork and restore the
# surfaces the merge disturbs — generated catalogs, doc graphs, workflow state.
# Run after every upstream pull.
#
# Phases:
#   1. preflight   — clean tree (or an in-progress merge to finish), upstream remote
#   2. merge       — git merge upstream/master; auto-resolve generated files
#   3. install     — pnpm install
#   4. audit       — fork surfaces vs the merged upstream tree (strict)
#   5. build+docs  — full build, regenerate catalogs, re-record pairing
#   6. verify      — typecheck, doc gates, constraints, GUI units, snapshots
#   7. record      — write the merged upstream base
#   8. actions     — ensure the fork-disabled workflows stay disabled on GitHub
#   9. commit      — commit the restored fork surfaces
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

# The host PATH carries Node 22, whose vm.Module has no import `phase`: the PTC
# snapshot scenarios then fail with "supports evaluation-phase imports only".
# The harness needs Node 24, so the ritual prepends the workstation's Node 24 bin.
NODE_BIN_DIR="${NODE_BIN_DIR:-/home/prog7/.local/share/node-lts/bin}"
[ -x "$NODE_BIN_DIR/node" ] && export PATH="$NODE_BIN_DIR:$PATH"

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
  docs/persistence-catalog.md
  docs/persistence-catalog.zh.md
  docs/persistence-catalog.i18n.yaml
  docs/persistence-schema.json
  docs/capability-seams.md
  docs/agent-lifecycle.md
  docs/tool-execution-pipeline.md
  docs/graph-atlas.md
  tsconfig.base.json
  packages/extensions/cordis-client-runner/src/client/slot-catalog.ts
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

GIT_DIR="$(git rev-parse --git-dir)"
# The merge base captured before the merge, keyed by the target tip it belongs
# to: a conflict resolution or a failed verification continues in a later run,
# and after the merge commit `git merge-base HEAD target` is the target itself.
BASE_STATE="$GIT_DIR/FORK_MERGE_BASE"

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

# Re-record the README pairs the merge touched, before the merge commit exists.
# The pre-commit and pre-merge-commit jobs "translation pairing (staged records)"
# check each staged *.i18n.yaml against the staged README.md bytes; a resolved
# conflict, and equally a clean merge that combined sections of one pair, leaves
# the record stale and the hook refuses the commit. The staged records are the
# authoritative list, so both paths repair the same way.
record_touched_pairs() {
  local metas=() anchors=() path anchor
  while IFS= read -r path; do
    case "${path##*/}" in
      README.i18n.yaml) metas+=("$path") ;;
    esac
  done < <(git diff --cached --name-only --diff-filter=AM | grep '/README\.i18n\.yaml$' || true)
  [ "${#metas[@]}" -eq 0 ] && return 0
  if pnpm run verify-translation-pairing --cached "${metas[@]}"; then return 0; fi
  for path in "${metas[@]}"; do anchors+=("${path%.i18n.yaml}.md"); done
  echo "перезаписываю pairing для ${anchors[*]}"
  pnpm run verify-translation-pairing --write "${anchors[@]}"
  for anchor in "${anchors[@]}"; do
    git add -- "$anchor"
    [ -f "${anchor%.md}.zh.md" ] && git add -- "${anchor%.md}.zh.md"
    [ -f "${anchor%.md}.i18n.yaml" ] && git add -- "${anchor%.md}.i18n.yaml"
  done
}

# Commit the resolved merge. pnpm install comes first because the pre-commit
# "pi-ai provider metadata" job compares the staged pnpm-lock.yaml with the
# installed provider graph; a merge that changed manifests fails it until the
# graph is installed.
finish_merge_commit() {
  record_touched_pairs
  pnpm install
  git commit --no-edit
  echo "merge-коммит создан"
}

# ---------------------------------------------------------------- preflight
log "preflight"
git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1 \
  || git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"

MERGE_IN_PROGRESS=0
if [[ -e "$GIT_DIR/MERGE_HEAD" ]]; then
  MERGE_IN_PROGRESS=1
  echo "обнаружен незавершённый merge — продолжаю с фазы разрешения конфликтов"
elif [[ -n "$(git status --porcelain)" ]]; then
  die "рабочее дерево не чистое — закоммить или спрячь изменения"
fi
echo "upstream: $(git remote get-url "$UPSTREAM_REMOTE")"

# ------------------------------------------------------------------- merge
log "merge $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"
# The base is taken before the merge and kept for later runs: after the merge,
# merge-base(HEAD, target) is the target itself and the post-merge audit would
# lose the range it exists to show. A target whose tip moved starts a new range.
TARGET_TIP="$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
MERGE_BASE=""
if [ -f "$BASE_STATE" ]; then
  STORED_BASE="$(sed -n '1p' "$BASE_STATE")"
  STORED_TIP="$(sed -n '2p' "$BASE_STATE")"
  if [ "$STORED_TIP" = "$TARGET_TIP" ]; then MERGE_BASE="$STORED_BASE"; fi
fi
if [ -z "$MERGE_BASE" ]; then
  MERGE_BASE="$(git merge-base HEAD "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")" \
    || die "нет общей истории с $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  printf '%s\n%s\n' "$MERGE_BASE" "$TARGET_TIP" > "$BASE_STATE"
fi
echo "база мерджа: $MERGE_BASE"

if [[ "$MERGE_IN_PROGRESS" == 1 ]]; then
  REMAINING="$(resolve_generated_conflicts)"
  if [[ -n "$REMAINING" ]]; then
    printf '%s\n' "$REMAINING" | sed 's/^/  /' >&2
    resolution_guide
    die "остались конфликты, которые скрипт не разрешает — почини и запусти снова"
  fi
  finish_merge_commit
  MERGED_NOW=1
elif git merge-base --is-ancestor "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" HEAD; then
  echo "апстрим уже влит — фаза мерджа пропущена, идёт проверка форк-поверхностей"
  MERGED_NOW=0
elif git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --no-edit; then
  echo "мердж чистый"
  MERGED_NOW=1
else
  REMAINING="$(resolve_generated_conflicts)"
  if [[ -n "$REMAINING" ]]; then
    printf '%s\n' "$REMAINING" | sed 's/^/  /' >&2
    resolution_guide
    die "остались конфликты, которые скрипт не разрешает — почини и запусти снова"
  fi
  finish_merge_commit
  MERGED_NOW=1
fi

# ----------------------------------------------------------------- install
log "install"
pnpm install

# ------------------------------------------------------------------- audit
# Upstream moves the surfaces the fork attaches to. The audit names the new
# upgrade guides and the files both sides touched, and fails before the build
# when a fork plugin slot or a profile row no longer fits the merged tree.
log "audit: fork surfaces vs upstream"
pnpm run fork:upgrade-audit --strict --target "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --base "$MERGE_BASE"

# The OMP theme classifies DSH UI elements; a moved or removed surface makes its
# stylesheet silently dead. The classifier fails on MISSING carriers and, with
# --strict, on unclassified NEW ones, so every merge forces a classification pass.
THEME_AUDIT_DIR="${DSH_THEME_AUDIT_DIR:-$HOME/home/dev/dsh-plugins/theme-omp}"
if [ -f "$THEME_AUDIT_DIR/verify/classify.mjs" ]; then
  log "audit: theme UI classifier"
  node "$THEME_AUDIT_DIR/verify/classify.mjs" --checkout "$PWD" --strict
else
  echo "классификатор темы не найден ($THEME_AUDIT_DIR) — пропускаю, задай DSH_THEME_AUDIT_DIR"
fi

# The fork's design invariants are plain unit specs, so they run in seconds and
# fail before the build. A merge resolution that accepts an upstream value over
# a fork rule stops here instead of shipping.
log "invariants: fork design gates"
pnpm run fork:invariants

# ------------------------------------------------------------------- build
log "build"
pnpm run build

# -------------------------------------------------------------------- docs
log "docs: regenerate catalogs"
pnpm run gen-tsconfig-paths
pnpm run gen-doc-graphs
pnpm run gen-config-catalog
pnpm run gen-persistence-catalog
pnpm run gen-client-catalog

# The regenerated catalogs' recorded pairing hashes are stale until re-recorded.
log "docs: re-record pairing"
pnpm run verify-translation-pairing --write docs/config-catalog.md docs/event-producer-consumer.md
pnpm run verify-translation-pairing docs/config-catalog.md docs/event-producer-consumer.md

# ------------------------------------------------------------------- verify
log "verify: typecheck, constraints, doc gates, GUI units, snapshots"
pnpm run typecheck
pnpm run constraints

# Profiles live outside this repository, so a merge can invalidate a row the
# repository never sees: an upstream Config schema may gain a required field
# while a profile patch keeps replacing that entry's whole config. The schema
# dump composes every layer and validates each literal config against its
# plugin schema without mounting anything; only config failures fail the run.
log "verify: profile configs against plugin schemas"
PROFILES_DIR="${DSH_HOME:-$HOME/.dsh}/profiles"
if [[ -d "$PROFILES_DIR" ]]; then
  for dir in "$PROFILES_DIR"/*/; do
    profile="$(basename "$dir")"
    [[ -f "$dir/package.json" ]] || continue
    status=0
    output="$(pnpm dsh --profile "$profile" --dump-config-schema 2>&1 >/dev/null)" || status=$?
    invalid="$(printf '%s\n' "$output" | grep -F 'invalid config:' || true)"
    if [[ -n "$invalid" ]]; then
      printf '%s\n' "$invalid" >&2
      die "профиль $profile: конфиг не проходит схему плагина — почини строку в $dir/cordis.patch.yml"
    fi
    if [[ "$status" -ne 0 ]]; then
      echo "  $profile: конфиги проходят схемы; dump сообщает о других находках"
    else
      echo "  $profile: конфиги проходят схемы"
    fi
  done
else
  echo "  каталог профилей не найден: $PROFILES_DIR — проверка пропущена"
fi
# verify-repository-references can flag a uv.lock size numeral whose 7-hex prefix
# matches a fork-only commit in the local object database; when the file is still
# byte-identical to upstream/master, treat that single finding as noise.
pnpm run test:docs
# Client and host units catch a merged UI surface that snapshots do not cover.
# The cap keeps the workstation responsive while the ritual runs beside a session.
if [[ "${FORK_SKIP_FULL_GUI:-0}" == 1 ]]; then
  echo "FORK_SKIP_FULL_GUI=1 — полный pnpm run test:gui пропущен; GUI-доказательство несут focused-прогоны и живая проба, пробел назван в отчёте"
else
  pnpm run test:gui -- --maxWorkers "${FORK_TEST_MAX_WORKERS:-4}"
fi
pnpm run test:snapshot

# ------------------------------------------------------------------ record
# The base records the shipped upstream commit; a failed run leaves it alone so
# the next run audits the same range again.
log "record upstream base"
pnpm run fork:upgrade-audit --record-base --target "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

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
