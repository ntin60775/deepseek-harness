#!/usr/bin/env bash
# Rebuild the DeepSeek Harness Web artifacts (package lib/, client bundles, apps/web/dist)
# from this checkout, report what was stale, and optionally restart the local `dsh web`
# server the way scripts/web-launcher/dsh-web-launcher.py starts it.
#
# Run it after editing any source under packages/**/src or apps/web, before judging the
# GUI: the launcher starts the server from `apps/cli/src/bin.ts web`, so host plugins load
# from source while the browser keeps receiving `apps/web/dist` bundles.
#
# Usage: rebuild-web.sh [--check] [--native] [--restart] [--dry-run]
#   --check    also run the aggregate `build:check` (pnpm run build) — the artifact tree is
#              verified against the current sources before anything is served.
#   --native   rebuild the Node system addon (pnpm run build:native-system) first.
#   --restart  stop the running server and start it again after the build succeeds.
#              This closes every browser tab on the URL, including the current session.
#   --dry-run  print the steps and the staleness report without building.
#
# Environment: DSH_NODE overrides the Node binary; otherwise the script resolves Node
# itself, because non-interactive shells here do not source ~/.zshrc.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
RUN_DIR="${XDG_RUNTIME_DIR:-/tmp}"
LOG_PATH="$RUN_DIR/dsh-web.log"
PID_PATH="$RUN_DIR/dsh-web.pid"
DIST_INDEX="$REPO/apps/web/dist/index.html"
STOP_TIMEOUT_SECONDS=10
START_TIMEOUT_SECONDS=90

fail() { printf 'Ошибка: %s\n' "$*" >&2; exit 1; }
run() { printf '+ %s\n' "$*"; if [ "$DRY_RUN" != "1" ]; then "$@"; fi; }

usage() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

CHECK=0 NATIVE=0 RESTART=0 DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    --native) NATIVE=1 ;;
    --restart) RESTART=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "неизвестный флаг: $1 (справка: --help)" ;;
  esac
  shift
done

# --- toolchain ----------------------------------------------------------------

resolve_node() {
  if [ -n "${DSH_NODE:-}" ] && [ -x "$DSH_NODE" ]; then printf '%s' "$DSH_NODE"; return; fi
  local candidate
  for candidate in "$HOME/.local/share/node-lts/bin/node" "$(command -v node 2>/dev/null || true)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && { printf '%s' "$candidate"; return; }
  done
  fail "Node.js не найден. Установите его или задайте DSH_NODE=/path/to/node."
}

NODE="$(resolve_node)"
# pnpm and tsx resolve workspace binaries through PATH; non-interactive shells lack the
# ~/.zshrc export, so the Node directory is prepended here.
export PATH="$(dirname "$NODE"):$PATH"
PNPM="$(command -v pnpm 2>/dev/null || true)"
[ -n "$PNPM" ] || fail "pnpm не найден в PATH после добавления $(dirname "$NODE")."

printf 'Репозиторий: %s\n' "$REPO"
printf 'Node:        %s\n' "$($NODE -v)"
printf 'pnpm:        %s\n\n' "$PNPM"

# --- preflight ----------------------------------------------------------------

# dev-web.ts watchers and build:artifacts write the same lib/ and apps/web/dist trees.
if pgrep -f 'scripts/dev-web\.ts' >/dev/null 2>&1; then
  fail "идёт pnpm run dev:web — его вотчеры пишут те же lib/ и apps/web/dist. Остановите dev:web или работайте через него."
fi

# `dsh web` serves two artifact planes: the client plugin bundles
# packages/<group>/<package>/lib/{client,index}.js and the Web shell in apps/web/dist.
# apps/web/dist carries no plugin code, so staleness must be measured per plane.
stale_bundles() {
  local entry pkg source
  for entry in "$REPO"/packages/*/*/lib/client.js; do
    [ -e "$entry" ] || continue
    pkg="$(dirname "$(dirname "$entry")")"
    [ -d "$pkg/src" ] || continue
    source="$(find "$pkg/src" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -newer "$entry" -print -quit 2>/dev/null || true)"
    [ -n "$source" ] && printf '  %s: src новее lib/client.js — %s\n' "${pkg#"$REPO"/}" "${source#"$REPO"/}"
  done
  if [ -e "$DIST_INDEX" ]; then
    source="$( { [ -d "$REPO/apps/web/src" ] && find "$REPO/apps/web/src" -type f -newer "$DIST_INDEX" -print -quit;
                 find "$REPO"/packages/*/*/lib/client.js -newer "$DIST_INDEX" -print -quit; } 2>/dev/null | head -1 )"
    [ -n "$source" ] && printf '  apps/web/dist: оболочка старше %s\n' "${source#"$REPO"/}"
  else
    printf '  apps/web/dist отсутствует — сборка ещё не выполнялась\n'
  fi
}

report() {
  local label="$1" newest stale
  newest="$(stat -c '%y' "$DIST_INDEX" 2>/dev/null | cut -d. -f1 || true)"
  printf '%s: apps/web/dist от %s · lib/client.js плагинов: %s\n' "$label" "${newest:-—}" \
    "$(ls "$REPO"/packages/*/*/lib/client.js 2>/dev/null | wc -l)"
  stale="$(stale_bundles || true)"
  if [ -n "$stale" ]; then printf '%s\n' "$stale"; else printf '  все артефакты новее своих исходников\n'; fi
}

report 'до'

# --- build --------------------------------------------------------------------

if [ "$NATIVE" = "1" ]; then
  printf '\n== нативный хелпер ==\n'
  run "$PNPM" run build:native-system
fi

printf '\n== сборка артефактов ==\n'
if [ "$CHECK" = "1" ]; then
  # build = build:artifacts + build:check concurrently; the aggregate programs are typed
  # against the artifacts this invocation just emitted.
  run "$PNPM" run build
else
  run "$PNPM" run build:artifacts
fi

# --- verification -------------------------------------------------------------

printf '\n== проверка ==\n'
[ -e "$DIST_INDEX" ] || fail "pnpm отработал, но $DIST_INDEX не появился"
report 'после'

MCP_LIB="$REPO/packages/mcp/mcp-client/lib/index.js"
if [ -e "$MCP_LIB" ]; then
  if grep -q 'projectModelContent' "$MCP_LIB"; then
    printf '  mcp-client/lib: проекция structuredContent на месте\n'
  else
    printf '  ВНИМАНИЕ: mcp-client/lib не содержит projectModelContent — built-плоскость старше фикса\n'
  fi
fi

# --- restart ------------------------------------------------------------------

# Same state detection as dsh-web-launcher.py: a recycled PID must never be signalled, so
# the candidate must run `apps/cli/src/bin.ts web`, live in this checkout, and be a node binary.
server_pid() {
  local pid cwd cmdline
  [ -e "$PID_PATH" ] || return 1
  pid="$(tr -dc '0-9' < "$PID_PATH" || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 1
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  [ "$cwd" = "$REPO" ] || return 1
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  case "$cmdline" in
    *"apps/cli/src/bin.ts web"*) case "$(basename "${cmdline%% *}")" in node|node.*) return 0 ;; *) return 1 ;; esac ;;
    *) return 1 ;;
  esac
}

if [ "$RESTART" = "1" ]; then
  printf '\n== перезапуск сервера ==\n'
  if server_pid; then
    PID="$(tr -dc '0-9' < "$PID_PATH")"
    printf '  stop pid=%s\n' "$PID"
    if [ "$DRY_RUN" != "1" ]; then
      kill -TERM "$PID"
      deadline=$(( $(date +%s) + STOP_TIMEOUT_SECONDS ))
      while kill -0 "$PID" 2>/dev/null && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.5; done
      kill -0 "$PID" 2>/dev/null && fail "pid $PID не завершился за ${STOP_TIMEOUT_SECONDS}s — снимите вручную или остановите через окно dsh-web"
    fi
  else
    printf '  запущенного сервера этого checkout нет (pid-файл пуст, устарел или принадлежит другому процессу)\n'
  fi

  if [ "$DRY_RUN" != "1" ]; then
    : > "$LOG_PATH"
    # Same argv, cwd, detached session and log/pid contract as dsh-web-launcher.py.
    setsid "$NODE" --import tsx/esm apps/cli/src/bin.ts web --no-open \
      > "$LOG_PATH" 2>&1 < /dev/null &
    NEW_PID=$!
    printf '%s\n' "$NEW_PID" > "$PID_PATH"
    deadline=$(( $(date +%s) + START_TIMEOUT_SECONDS ))
    URL=""
    while [ "$(date +%s)" -lt "$deadline" ]; do
      URL="$(sed -n 's/^dsh web: \(http[^[:space:]]*\).*/\1/p' "$LOG_PATH" | tail -1 || true)"
      [ -n "$URL" ] && break
      kill -0 "$NEW_PID" 2>/dev/null || fail "сервер завершился, лог: $LOG_PATH"
      sleep 1
    done
    [ -n "$URL" ] || fail "URL не появился в $LOG_PATH за ${START_TIMEOUT_SECONDS}s"
    printf '  pid=%s URL=%s\n' "$NEW_PID" "$URL"
    printf '  откройте %s в браузере (вкладки предыдущего процесса закрылись)\n' "$URL"
  else
    printf '  (dry-run: сервер бы перезапущен через %s)\n' "$NODE"
  fi
else
  printf '\nСервер не перезапускался. Хост-плагины грузятся из src — для них нужен рестарт;\n'
  printf 'browser-бандлы обновляются refresh-ом страницы после этой сборки.\n'
fi
