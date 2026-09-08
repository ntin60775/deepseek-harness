# Running the Desktop app

English | [中文](running-the-desktop-app.zh.md)

How to deploy the Electron Desktop application (`apps/desktop`) on a Linux workstation from this fork's checkout, and the failure modes observed doing it. The upstream release model (signed macOS/Windows installers, auto-update) does not publish Linux artifacts, so a Linux deployment runs from source through the dev launcher. Design rationale for the shell and host lives in [apps/desktop/README.md](../../apps/desktop/README.md).

## Procedure

1. Build once: `pnpm run build` (Host face) and `pnpm --filter @deepseek-ai/dsh-desktop run build` (Electron shell). The launcher `pnpm run dev:desktop` chains both; `pnpm run start:desktop` skips building and fails when `apps/desktop/lib/main.js`, `apps/desktop-host/lib/index.js`, or `apps/web/dist/index.html` is missing.
2. Choose the Harness home. Unpackaged Electron defaults `DSH_HOME` to `apps/desktop/.desktop-build/development/home`, which isolates sessions, settings, and credentials from the CLI and Web app. Export `DSH_HOME=$HOME/.dsh` before launch to share state with them.
3. Launch: `pnpm run start:desktop`. The Electron main process spawns the private `dsh-desktop-host` child under the invoking Node; there is no listening port — the renderer loads `dsh-app://app/index.html` and API traffic crosses framed byte pipes.
4. For a menu-applications entry, use the fork launcher `~/.local/bin/dsh-desktop` with the desktop file `~/.local/share/applications/deepseek-harness-desktop.desktop` (`Icon=deepseek-harness-desktop`, `StartupWMClass=deepseek-harness-desktop`). The launcher rebuilds when the built artifacts are older than `HEAD` plus working-tree changes.

## Fork-local patches

`apps/desktop/src/main.ts` carries two `Fork-local`-marked dev-only blocks: `app.setName`/`app.setDesktopName('deepseek-harness-desktop')` and the `BrowserWindow` `icon` option. Packaged builds are unaffected (`app.isPackaged` guards). After an upstream merge, keep these blocks (see [the merge ritual](../../scripts/fork-merge-ritual.sh)).

## Failure modes

- **`cannot create effect on inactive context` from every SDK snapshot test.** The desktop host and the snapshot harness boot built `lib/` artifacts. A build interrupted by a compile error leaves stale `lib/` trees that boot with unrelated-looking runtime failures. After any merge or plugin-API fix, run the full `pnpm run build` before trusting `pnpm run test:snapshot`; the same stale-artifact trap applies to the Desktop launcher, which is why it stamps the built revision.
- **Taskbar shows a placeholder icon.** Unpackaged Electron reports the npm package name as its application identity, so the window manager cannot match the desktop file. The fix is the `Fork-local` block: `app.setDesktopName` supplies the Wayland `app_id`, the `icon` option supplies the X11 window icon, and `StartupWMClass` in the desktop file closes the match.
- **DevTools window opens on every launch.** `apps/desktop/src/main.ts` opens it unless `DSH_DESKTOP_OPEN_DEVTOOLS=0`. The fork launcher exports it.
- **`Failed to create bin ... @deepseek-ai/dsh/lib/bin.js` warnings during `pnpm install`.** Harmless before the first build: the `dsh` bin target is a build output. They disappear after `pnpm run build`.
- **Wayland screenshot/capture failures in tooling.** Chromium ozone warnings (`zcr_alpha_compositing`, portal registration) are cosmetic; the app renders. Screenshot capture may need a compositor feature (PipeWire portal) — verify window state through the accessibility tree instead.
- **Nothing listens on a port.** Desktop deliberately has no HTTP server; debugging the backend means attaching to the host child (`DSH_DESKTOP_HOST_INSPECT_PORT`, default 9230), not curling localhost.

## Verification

The deployed app is correct when the window title renders, the sidebar lists the same workspaces and sessions as `dsh web` on the shared `DSH_HOME`, and the right sidebar opens from the conversation header's corner button (`data-sidebar-right-expand`; the panel starts collapsed in both Web and Desktop).
