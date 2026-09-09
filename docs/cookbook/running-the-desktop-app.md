# Running the Desktop app

How to deploy the Electron Desktop application (`apps/desktop`) on a Linux workstation from this fork's checkout, and the failure modes observed doing it. The upstream release model (signed macOS/Windows installers, auto-update) does not publish Linux artifacts, so a Linux deployment runs from source through the dev launcher. Design rationale for the shell and host lives in [apps/desktop/README.md](../../apps/desktop/README.md).

## Procedure

1. Build once: `pnpm run build` (Host face) and `pnpm --filter @deepseek-ai/dsh-desktop run build` (Electron shell). The launcher `pnpm run dev:desktop` chains both; `pnpm run start:desktop` skips building and fails when `apps/desktop/lib/main.js`, `apps/desktop-host/lib/index.js`, or `apps/web/dist/index.html` is missing.
2. Choose the Harness home. Unpackaged Electron defaults `DSH_HOME` to `apps/desktop/.desktop-build/development/home`, which isolates sessions, settings, and credentials from the CLI and Web app. Export `DSH_HOME=$HOME/.dsh` before launch to share state with them.
3. Launch: `pnpm run start:desktop`. The Electron main process spawns the private `dsh-desktop-host` child under the invoking Node; there is no listening port — the renderer loads `dsh-app://app/index.html` and API traffic crosses framed byte pipes.
4. For a menu-applications entry, install the fork launcher and desktop file below. The launcher rebuilds when the built artifacts are older than `HEAD` plus working-tree changes.

## Menu launchers

Both launchers live outside the repository. On a fresh machine, create them manually.

### Desktop launcher: `~/.local/bin/dsh-desktop`

```bash
#!/usr/bin/env bash
# Launcher: DeepSeek Harness Desktop (Electron) from this checkout.
# Auto-rebuild: the stamp in .desktop-build stores HEAD + working-tree hash;
# if they changed (or artifacts are missing) — full build first, then launch.
set -euo pipefail

REPO="<absolute path to the checkout>"
export PATH="<node-lts bin dir>:$PATH"
# Shared Harness home with CLI/web: same sessions, settings, and credentials.
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
# Do not open DevTools on start.
export DSH_DESKTOP_OPEN_DEVTOOLS=0

cd "$REPO"

STAMP_DIR="apps/desktop/.desktop-build"
STAMP="$STAMP_DIR/.built-rev"
# HEAD + hash of uncommitted changes: artifacts go stale after pull
# and after editing sources in the working tree.
REV="$(git rev-parse HEAD)/$(git status --porcelain=v1 | sha1sum | cut -c1-12)"

NEEDS_BUILD=0
if [[ ! -f apps/desktop/lib/main.js \
   || ! -f apps/desktop-host/lib/index.js \
   || ! -f apps/web/dist/index.html ]]; then
  NEEDS_BUILD=1
elif [[ ! -f "$STAMP" || "$(cat "$STAMP")" != "$REV" ]]; then
  NEEDS_BUILD=1
fi

if [[ "$NEEDS_BUILD" == 1 ]]; then
  echo "dsh-desktop: artifacts are stale — building (~1–2 min)..." >&2
  pnpm run build
  pnpm --filter @deepseek-ai/dsh-desktop run build
  mkdir -p "$STAMP_DIR"
  printf '%s' "$REV" > "$STAMP"
fi

exec pnpm run start:desktop
```

Replace `<absolute path to the checkout>` and `<node-lts bin dir>` with the actual paths on the target machine. Make it executable: `chmod +x ~/.local/bin/dsh-desktop`.

### Desktop file: `~/.local/share/applications/deepseek-harness-desktop.desktop`

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=DeepSeek Harness Desktop
GenericName=DeepSeek Harness Agent (Desktop)
Comment=Launch the DeepSeek Harness Desktop (Electron)
Exec=/home/<user>/.local/bin/dsh-desktop
Icon=deepseek-harness-desktop
Terminal=false
Categories=Development;
StartupNotify=true
StartupWMClass=deepseek-harness-desktop
```

Run `update-desktop-database ~/.local/share/applications` after creating it.

### Web launcher: `~/.local/bin/dsh-web`

```bash
#!/usr/bin/env bash
# Launcher: DeepSeek Harness Web UI (source checkout) as a standalone web app.
# Starts dsh web (--no-open) and opens the UI in a frameless Chromium window
# (--app=URL): no address bar, no tabs.
set -euo pipefail

REPO="<absolute path to the checkout>"
NODE="<absolute path to node>"
CHROME="/usr/bin/chromium"
# Dedicated profile: the standalone window touches neither the main Chrome
# nor the system Chromium (a separate browser).
USER_DATA_DIR="$HOME/.config/dsh-web"

cd "$REPO"

# First launch creates the web profile from the template; init requires pnpm.
if [[ ! -d "${DSH_HOME:-$HOME/.dsh}/profiles/web" ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "Web profile not yet created and pnpm not found in PATH." >&2
    exit 1
  fi
fi

# The server prints the ready URL with an access token:
# `dsh web: http://host:port/?token=…`. Open exactly that URL.
: >/tmp/dsh-web.log
"$NODE" --import tsx/esm apps/cli/src/bin.ts web --no-open "$@" >/tmp/dsh-web.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

# Wait for the URL line (up to ~30s).
APP_URL=""
for _ in $(seq 1 60); do
  APP_URL=$(sed -n 's/^dsh web: \(http[^ ]*\).*/\1/p' /tmp/dsh-web.log | tail -1)
  [[ -n "$APP_URL" ]] && break
  kill -0 "$SERVER_PID" 2>/dev/null || { cat /tmp/dsh-web.log >&2; exit 1; }
  sleep 0.5
done
if [[ -z "$APP_URL" ]]; then
  echo "Server did not emit a URL in time. Log:" >&2
  cat /tmp/dsh-web.log >&2
  exit 1
fi

# Open the standalone app window with its own isolated profile.
mkdir -p "$USER_DATA_DIR"
"$CHROME" --user-data-dir="$USER_DATA_DIR" --app="$APP_URL" --new-window --start-maximized >/dev/null 2>&1 &
CHROME_PID=$!

# Closing the window (chromium) kills the server; server death kills the window.
wait "$CHROME_PID" 2>/dev/null || true
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
```

Replace `<absolute path to the checkout>` and `<absolute path to node>` with the actual paths. Make it executable: `chmod +x ~/.local/bin/dsh-web`.

### Desktop file: `~/.local/share/applications/deepseek-harness.desktop`

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=DeepSeek Harness
GenericName=DeepSeek Harness Agent
Comment=Launch the DeepSeek Harness Web UI
Exec=/home/<user>/.local/bin/dsh-web
Icon=<absolute path to checkout>/apps/web/public/favicon.svg
Terminal=false
Categories=Development;
StartupNotify=false
```

Run `update-desktop-database ~/.local/share/applications` after creating it.

## Fork-local patches

`apps/desktop/src/main.ts` carries two `Fork-local`-marked dev-only blocks: `app.setName`/`app.setDesktopName('deepseek-harness-desktop')` and the `BrowserWindow` `icon` option. Packaged builds are unaffected (`app.isPackaged` guards). After an upstream merge, keep these blocks (see [the merge ritual](../../scripts/fork-merge-ritual.sh)).

## Failure modes

- **`cannot create effect on inactive context` from every SDK snapshot test.** The desktop host and the snapshot harness boot built `lib/` artifacts. A build interrupted by a compile error leaves stale `lib/` trees that boot with unrelated-looking runtime failures. After any merge or plugin-API fix, run the full `pnpm run build` before trusting `pnpm run test:snapshot`; the same stale-artifact trap applies to the Desktop launcher, which is why it stamps the built revision.
- **Taskbar shows a placeholder icon.** Unpackaged Electron reports the npm package name as its application identity, so the window manager cannot match the desktop file. The fix is the `Fork-local` block: `app.setDesktopName` supplies the Wayland `app_id`, the `icon` option supplies the X11 window icon, and `StartupWMClass` in the desktop file closes the match.
- **DevTools window opens on every launch.** `apps/desktop/src/main.ts` opens it unless `DSH_DESKTOP_OPEN_DEVTOOLS=0`. The fork launcher exports it.
- **`Failed to create bin ... @deepseek-ai/dsh/lib/bin.js` warnings during `pnpm install`.** Harmless before the first build: the `dsh` bin target is a build output. They disappear after `pnpm run build`.
- **Wayland screenshot/capture failures in tooling.** Chromium ozone warnings (`zcr_alpha_compositing`, portal registration) are cosmetic; the app renders. Screenshot capture may need a compositor feature (PipeWire portal) — verify window state through the accessibility tree instead.
- **Nothing listens on a port.** Desktop deliberately has no HTTP server; debugging the backend means attaching to the host child (`DSH_DESKTOP_HOST_INSPECT_PORT`, default 9230), not curling localhost.
- **`EADDRINUSE` on port 3080 when launching web.** A previous web server instance is still running. Kill it with `fuser -k 3080/tcp` or `pkill -f 'bin.ts web'`. The web launcher kills its own server when the window closes, but a manually started server or a crashed wrapper can leave the port occupied.
- **Broken symlinks in `node_modules/.pnpm/node_modules` after a native workspace rename.** `pnpm install` reports "Already up to date" and does not clean stale virtual-store links. The desktop launcher's `mirrorDependencyLinks` calls `realpathSync` on every entry and crashes on a dangling link. Fix: `find node_modules/.pnpm/node_modules -maxdepth 2 -type l ! -exec test -e {} \; -print` to list them, then remove the stale ones.

## Verification

The deployed app is correct when the window title renders, the sidebar lists the same workspaces and sessions as `dsh web` on the shared `DSH_HOME`, and the right sidebar opens from the conversation header's corner button (`data-sidebar-right-expand`; the panel starts collapsed in both Web and Desktop).