---
node_type: reference
title: Web launcher window (fork-local)
service: _platform
status: active
updated: 2026-11-10
tags: [fork, launcher, desktop, linux]
links:
  documents:
    - ../../scripts/web-launcher/dsh-web-launcher.py
    - ../../scripts/web-launcher/install.sh
    - ../../scripts/web-launcher/dsh-icon.svg
    - ../../scripts/web-launcher/dsh-icon-256.png
  part_of: [README.md]
  relates_to:
    - ../../scripts/AGENTS.md
    - ../development.md
    - ../../scripts/web-launcher/README.md
    - ../../.agents/skills/dsh-web-launcher/SKILL.md
---

# Web launcher window (fork-local)

`scripts/web-launcher/` is an addition of this fork, absent from upstream: a small PyQt6 window that starts and stops the local `dsh web` server of this same checkout and opens the interface in a browser tab. It replaces the hand-written shell launcher some machines carry as `~/.local/bin/dsh-web`. This page records what the tool is and which files carry it; the [package README](../../scripts/web-launcher/README.md) owns the user-facing description and the [dsh-web-launcher skill](../../.agents/skills/dsh-web-launcher/SKILL.md) owns the setup procedure, verification commands, and troubleshooting, so their steps are linked here, not repeated.

## What the window does

- One start action (`Запуск`, the default button pressed by `Enter`) and one stop action (`Остановка`), with a status chip reading `запущен` or `остановлен` that refreshes once per second.
- When the server is down, `Запуск` starts it and opens the interface; when the server is already up, `Запуск` only opens the interface. Either way the window closes after the browser opens.
- `Остановка` shows an inline confirmation first when the window sees running work, because stopping interrupts it. Closing the window with `Esc` or the frame close button leaves the server running.

## What it consists of

- [dsh-web-launcher.py](../../scripts/web-launcher/dsh-web-launcher.py) is the window itself; it starts the server as `node --import tsx/esm apps/cli/src/bin.ts web --no-open` in the checkout root, reads and writes the runtime files `$XDG_RUNTIME_DIR/dsh-web.log` and `$XDG_RUNTIME_DIR/dsh-web.pid` (`/tmp` when `XDG_RUNTIME_DIR` is unset) and opens the access URL the server prints to the log. The full runtime contract is in the [skill](../../.agents/skills/dsh-web-launcher/SKILL.md).
- [install.sh](../../scripts/web-launcher/install.sh) installs the tool for the current user: it writes the application-menu entry `~/.local/share/applications/deepseek-harness.desktop` pointing at this checkout, links `~/.local/bin/dsh-web` to the window script, and is safe to re-run after `git pull`.
- The icons: `dsh-icon.svg` is the menu entry's icon, and `dsh-icon-16.png` through `dsh-icon-256.png` form the window icon, with [dsh-icon-256.png](../../scripts/web-launcher/dsh-icon-256.png) also drawing the header logo.
- [scripts/AGENTS.md](../../scripts/AGENTS.md) lists `web-launcher/` under local tooling and points at the README and the skill.

## What the launcher does not do

- It never builds. It does not run `build:artifacts` and does not rebuild the client bundles on edits; that loop remains the job of `pnpm run dev:web`, covered in [development.md](../development.md). The launcher starts and stops the same server `dsh web` starts from source.
- It does not stop the server when the window closes, and it does not touch a server another checkout started: the state-detection rules that keep it to this checkout's processes are in the [skill](../../.agents/skills/dsh-web-launcher/SKILL.md).

## How the installation is checked and where the procedure lives

- The installer fails when `python3` or PyQt6 is missing, warns without failing when Node.js or a browser cannot be resolved, and runs `desktop-file-validate` on the entry it writes when that tool is present.
- The environment overrides the window reads are `DSH_NODE` and `DSH_BROWSER`; the [package README](../../scripts/web-launcher/README.md) table and the [skill](../../.agents/skills/dsh-web-launcher/SKILL.md) own their search order and the remaining variables.
- Per-distro packages, post-install verification commands, the uninstall, and a troubleshooting table belong to the [dsh-web-launcher skill](../../.agents/skills/dsh-web-launcher/SKILL.md); `./scripts/web-launcher/install.sh` stays the one-command install.
