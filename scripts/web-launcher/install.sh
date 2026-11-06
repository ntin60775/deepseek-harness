#!/usr/bin/env bash
# Install the DeepSeek Harness launcher: the application-menu entry, the icon and
# a `dsh-web` command in ~/.local/bin. Safe to re-run after `git pull`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
LAUNCHER="$HERE/dsh-web-launcher.py"
ICON="$HERE/dsh-icon.svg"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
BIN="$HOME/.local/bin"
DESKTOP="$APPS/deepseek-harness.desktop"

fail() { printf 'Ошибка: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }

command -v python3 >/dev/null 2>&1 || fail "не найден python3"
python3 -c 'import PyQt6.QtWidgets' >/dev/null 2>&1 \
  || fail "нет PyQt6 — установите пакет python3-pyqt6 (Debian/Ubuntu: sudo apt install python3-pyqt6)"

if ! command -v node >/dev/null 2>&1 \
  && [[ ! -x "$HOME/.local/share/node-lts/bin/node" ]] \
  && [[ ! -x /usr/local/bin/node ]] \
  && [[ ! -x /usr/bin/node ]]; then
  note "Предупреждение: Node.js не найден. Установите его или задайте путь в DSH_NODE."
fi

if ! command -v chromium >/dev/null 2>&1 \
  && ! command -v chromium-browser >/dev/null 2>&1 \
  && ! command -v google-chrome >/dev/null 2>&1 \
  && ! command -v xdg-open >/dev/null 2>&1; then
  note "Предупреждение: не найден браузер. Установите Chromium или задайте DSH_BROWSER."
fi

[[ -f "$LAUNCHER" ]] || fail "не найден $LAUNCHER"
chmod +x "$LAUNCHER"
mkdir -p "$APPS" "$BIN"

# The previous shell launcher is replaced by the window; keep it as a backup.
if [[ -e "$BIN/dsh-web" && ! -L "$BIN/dsh-web" ]]; then
  mv "$BIN/dsh-web" "$BIN/dsh-web.bash-backup"
  note "Старый dsh-web сохранён как ~/.local/bin/dsh-web.bash-backup"
fi
ln -sfn "$LAUNCHER" "$BIN/dsh-web"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=DeepSeek Harness
GenericName=Агент DeepSeek Harness
Comment=Запустить или остановить локальный сервер и открыть интерфейс агента
Exec=$LAUNCHER
Icon=$ICON
Terminal=false
Categories=Development;
StartupNotify=false
NoDisplay=false
EOF

# The separate restart shortcut is gone: the window has the restart action.
rm -f "$APPS/deepseek-harness-restart.desktop"

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$DESKTOP" || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPS" >/dev/null 2>&1 || true
fi
if command -v kbuildsycoca6 >/dev/null 2>&1; then
  kbuildsycoca6 --noincremental >/dev/null 2>&1 || true
fi

note "Готово."
note "  меню приложений: DeepSeek Harness"
note "  команда:         dsh-web"
note "  репозиторий:     $REPO"
