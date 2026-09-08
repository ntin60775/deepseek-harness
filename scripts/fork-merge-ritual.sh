#!/usr/bin/env bash
# Fork merge ritual: incorporate upstream/master into this fork and restore the
# fork-local surfaces that the merge disturbs. Run after every upstream pull.
#
# Phases:
#   1. preflight   — clean tree (or an in-progress merge to finish), upstream remote
#   2. merge       — git merge upstream/master; auto-resolve generated files
#   3. re-add      — restore fork entries the merge may have dropped
#   4. install     — pnpm install + full build
#   5. docs        — regenerate catalogs, sync the fork's zh doc rows, re-record pairing
#   6. verify      — typecheck, plugin tests, doc gates, workspace constraints, snapshots
#   7. actions     — ensure the real-API E2E workflow stays disabled on GitHub
#
# The script never pushes. An unknown conflict stops the run with the remaining
# file list and the resolution guide.
#
# Rationale and the full conflict inventory:
# .agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md

set -euo pipefail
cd "$(dirname "$0")/.."

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-git@github.com:deepseek-ai/deepseek-harness.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-master}"
E2E_WORKFLOW_ID="${E2E_WORKFLOW_ID:-338747924}"   # .github/workflows/e2e.yml
PLUGIN_DIR="packages/context/agent-rules"
PLUGIN_PKG="@deepseek-ai/dsh-agent-rules"

# Generated documents this fork consumes: take upstream's side on conflict and
# regenerate; the fork's own rows return through the generators, not by hand.
GENERATED_CONFLICTS=(
  docs/config-catalog.md
  docs/event-producer-consumer.md
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
  tsconfig.host.json            — сохрани строку { "path": "./packages/context/agent-rules" }
  packages/bundle/base/cordis.patch.yml
                                — сохрани блок `- id: agent-rules` (включая disabled: !!js DSH_SNAPSHOT)
  pnpm-lock.yaml                — возьми --theirs, затем `pnpm install` перегенерирует
  docs/*.zh.md, docs/*.i18n.yaml — см. фазу docs (скрипт синхронизирует zh-строки форка)
  apps/desktop/src/main.ts      — сохрани блоки с маркером "Fork-local"
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
    git commit --no-edit
    echo "merge-коммит создан"
    MERGED_NOW=1
  fi
fi

# ------------------------------------------------------------------ re-add
log "re-add fork entries"
MISSING=0

# 1. Host project reference for the plugin.
grep -q 'packages/context/agent-rules' tsconfig.host.json \
  || { echo "ВНИМАНИЕ: tsconfig.host.json потерял ссылку на agent-rules — добавь вручную" >&2; MISSING=1; }

# 2. Base-bundle plugin block.
grep -q "name: '$PLUGIN_PKG'" packages/bundle/base/cordis.patch.yml \
  || { echo "ВНИМАНИЕ: packages/bundle/base/cordis.patch.yml потерял блок agent-rules — добавь вручную" >&2; MISSING=1; }

# 3. Plugin version equals the root version (check-workspace-constraints gate).
ROOT_VERSION="$(jq -r '.version' package.json)"
PLUGIN_VERSION="$(jq -r '.version' "$PLUGIN_DIR/package.json")"
if [[ "$ROOT_VERSION" != "$PLUGIN_VERSION" ]]; then
  echo "выравниваю версию плагина: $PLUGIN_VERSION -> $ROOT_VERSION"
  jq --arg v "$ROOT_VERSION" '.version = $v' "$PLUGIN_DIR/package.json" > "$PLUGIN_DIR/package.json.tmp" \
    && mv "$PLUGIN_DIR/package.json.tmp" "$PLUGIN_DIR/package.json"
fi

# 4. Snapshot-harness omp env lines (launcher/harness/sdk snapshot).
for f in packages/test-support/session-snapshot/src/harness.ts \
         packages/test-support/session-snapshot/src/launcher.ts \
         snapshots/sdk/sdk.snapshot.ts; do
  grep -q 'PI_CODING_AGENT_DIR' "$f" \
    || { echo "ВНИМАНИЕ: $f потерял PI_CODING_AGENT_DIR — добавь вручную" >&2; MISSING=1; }
done

if [[ "$MISSING" == 1 ]]; then
  die "часть форк-записей отсутствует — почини по предупреждениям и запусти снова"
fi
echo "все форк-записи на месте"

# ----------------------------------------------------------------- install
log "install + build"
pnpm install
pnpm run build

# -------------------------------------------------------------------- docs
log "docs: regenerate and sync fork rows"
pnpm run gen-tsconfig-paths
pnpm run gen-doc-graphs
pnpm run gen-config-catalog

python3 - <<'PY'
import re
import sys
from pathlib import Path

# zh counterpart of the generated config-catalog section for the plugin:
# copy the English section, translate the two wrapper labels.
en = Path("docs/config-catalog.md").read_text(encoding="utf-8")
zh_path = Path("docs/config-catalog.zh.md")
zh = zh_path.read_text(encoding="utf-8")

anchor = '<a id="deepseek-aidsh-agent-rules"></a>'
m = re.search(re.escape(anchor) + r"\n.*?(?=\n<a id=)", en, re.S)
if m is None:
    sys.exit("config-catalog.md has no agent-rules section — gen-config-catalog did not pick the plugin up")
section = m.group(0).rstrip("\n")
section = section.replace("Requires: ", "需要：").replace("Source: ", "来源：")

if anchor in zh:
    zh = re.sub(re.escape(anchor) + r"\n.*?(?=\n<a id=)", lambda _: section + "\n", zh, count=1, flags=re.S)
    print("config-catalog.zh.md: секция agent-rules обновлена с en")
else:
    insert_before = '<a id="deepseek-aidsh-agent-tool-presentation"></a>'
    if insert_before not in zh:
        sys.exit("config-catalog.zh.md lost the insertion anchor")
    zh = zh.replace(insert_before, section + "\n\n" + insert_before, 1)
    print("config-catalog.zh.md: секция agent-rules вставлена")
zh_path.write_text(zh, encoding="utf-8")

# zh counterpart of the generated event matrix: the fork's consumer row.
ev_path = Path("docs/event-producer-consumer.zh.md")
ev = ev_path.read_text(encoding="utf-8")
if "[`agent-rules`](../packages/context/agent-rules)" not in ev:
    needle = "[`agent-instructions`](../packages/context/agent-instructions), [`compaction-basic`]"
    if needle not in ev:
        sys.exit("event-producer-consumer.zh.md lost the pre-step anchor")
    repl = ("[`agent-instructions`](../packages/context/agent-instructions), "
            "[`agent-rules`](../packages/context/agent-rules), [`compaction-basic`]")
    ev = ev.replace(needle, repl, 1)
    ev_path.write_text(ev, encoding="utf-8")
    print("event-producer-consumer.zh.md: строка agent-rules восстановлена")
else:
    print("event-producer-consumer.zh.md: строка agent-rules уже есть")
PY

# ----------------------------------------------------------------- actions
log "github actions: e2e workflow stays disabled"
if command -v gh >/dev/null 2>&1; then
  # gh's {owner}/{repo} placeholders resolve only with a matching host
  # credential; derive the slug from the origin remote instead.
  ORIGIN_SLUG="$(git remote get-url origin | sed -E 's#^.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#')"
  STATE="$(gh api "repos/$ORIGIN_SLUG/actions/workflows/$E2E_WORKFLOW_ID" \
    --jq .state 2>/dev/null || echo unknown)"
  echo "e2e.yml state ($ORIGIN_SLUG): $STATE"
  if [[ "$STATE" == "active" ]]; then
    echo "апстрим отредактировал e2e.yml и включил воркфлоу — отключаю снова"
    gh api "repos/$ORIGIN_SLUG/actions/workflows/$E2E_WORKFLOW_ID/disable" -X PUT
  fi
else
  echo "gh недоступен — проверь вручную: gh api repos/ntin60775/deepseek-harness/actions/workflows/$E2E_WORKFLOW_ID --jq .state"
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
