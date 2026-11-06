---
name: dsh-web-launcher
description: Use when a Linux checkout needs the DeepSeek Harness desktop launcher window — installing the application-menu entry and the `dsh-web` command, or diagnosing why the launcher window cannot start or stop the local `dsh web` server.
---

# DSH web launcher

`scripts/web-launcher/` holds a small PyQt6 window that starts and stops the local `dsh web` server of *this checkout* and opens the interface in a browser tab. The window replaces the hand-written shell launcher some machines carry in `~/.local/bin/dsh-web`; both use the same runtime files.

## Install in one command

```sh
./scripts/web-launcher/install.sh
```

The installer is idempotent, non-interactive, and safe to re-run after `git pull`. It:

1. Fails with a ready-to-run fix when `python3` or PyQt6 is missing.
2. Warns (without failing) when Node.js or a browser cannot be resolved.
3. Backs up an existing regular `~/.local/bin/dsh-web` to `dsh-web.bash-backup`, then links `dsh-web` to the window script.
4. Writes `~/.local/share/applications/deepseek-harness.desktop` with absolute paths to this checkout.
5. Removes the superseded `deepseek-harness-restart.desktop` entry and refreshes the desktop database and the KDE service cache when present.

## Prerequisites

| Dependency | Debian/Ubuntu | Fedora | Arch |
|---|---|---|---|
| PyQt6 | `python3-pyqt6` | `python3-pyqt6` | `python-pyqt6` |
| Python 3 | `python3` | `python3` | `python3` |

Node.js must be resolvable; the window searches, in order: `DSH_NODE`, `node` on `PATH`, `~/.local/share/node-lts/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`, `~/.nvm/versions/node/*/bin/node`. Browsers are searched the same way: `DSH_BROWSER`, `chromium`, `chromium-browser`, `google-chrome`, `xdg-open`.

## Verify the installation

```sh
desktop-file-validate ~/.local/share/applications/deepseek-harness.desktop
python3 -c 'import PyQt6.QtWidgets'
ls -l ~/.local/bin/dsh-web
```

Then run `dsh-web` and check the window: the status chip must read `запущен` or `остановлен`, and у каждой подписи и кнопки есть подсказка. `Запуск` starts the server and closes the window after opening the tab; `Остановка` stops it.

## Runtime contract

- Server command: `node --import tsx/esm apps/cli/src/bin.ts web --no-open`, working directory is the checkout root; the window prints nothing to a terminal, the server log is `$XDG_RUNTIME_DIR/dsh-web.log` and the PID file is `$XDG_RUNTIME_DIR/dsh-web.pid`.
- State detection: the PID file plus a process-table scan; a candidate must run `apps/cli/src/bin.ts web`, have this checkout as its working directory and be a `node` binary, so a recycled PID is never signalled.
- The access URL with its token is read from the log line `dsh web: http://…`.
- Stop sends SIGTERM to every matching process of the checkout, then SIGKILL after ten seconds, and reports success only when the processes are gone.
- "Running work" (which makes `Остановка` ask for confirmation) means a server child process that is not idle infrastructure: children below one CPU second after five minutes of life are ignored.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Ошибка: нет PyQt6` | Install the distro package from the table above, rerun `install.sh`. |
| Window opens, `Запуск` fails with "Не найден Node.js" | Set `DSH_NODE=/path/to/node` in the environment the window inherits, or install Node.js. |
| Start fails with a log tail | Read `$XDG_RUNTIME_DIR/dsh-web.log`; a port already in use means a foreign server holds it. |
| `Остановка` refuses or behaves oddly | Another checkout's server may own the port; the window only stops processes of its own checkout. |
| Menu entry missing after install | `kbuildsycoca6 --noincremental`, or log out and back in. |
| Browser does not open | Set `DSH_BROWSER=chromium` (or any command that accepts a URL). |

## Uninstall

```sh
rm ~/.local/share/applications/deepseek-harness.desktop ~/.local/bin/dsh-web
mv ~/.local/bin/dsh-web.bash-backup ~/.local/bin/dsh-web   # if a backup exists
```

The checkout itself keeps working without the launcher: `pnpm run start:web` or `node --import tsx/esm apps/cli/src/bin.ts web` start the same server.
