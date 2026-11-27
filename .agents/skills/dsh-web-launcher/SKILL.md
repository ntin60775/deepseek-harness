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

Then run `dsh-web` and check the window: the status chip reads `запущен` or `остановлен`, and every label and button carries a tooltip. `Запуск` starts the server and closes the window after opening the tab; `Остановка` stops it.

## Runtime contract

- Process layout: the window starts `dsh-web-supervisor.py` with the resolved Node.js path; the supervisor runs `node --import tsx/esm apps/cli/src/bin.ts web --no-open` in the checkout root and keeps it alive. The PID file `$XDG_RUNTIME_DIR/dsh-web.pid` holds the supervisor, not the server.
- Log: `$XDG_RUNTIME_DIR/dsh-web.log`, appended and never truncated; past 5 MiB one generation moves to `dsh-web.log.1`. It carries the access URL, a `=== launcher start …` banner per start, and every `server died (code N after Ns)` record, so the exit of a server that is gone stays readable.
- Server environment: the window asks `$SHELL -lic` for the login `PATH` and gives the server those entries first, then the remaining inherited ones, so `gh`, `pnpm`, `go`, and `cargo` resolve in the server and in every shell it starts. A server started elsewhere keeps that shell's `PATH`.
- State detection: the PID file plus a process-table scan for two shapes, `dsh-web-supervisor.py` under `python3` and `node … apps/cli/src/bin.ts web`; both must have this checkout as their working directory, so a recycled PID or another checkout's process is never signalled.
- Restart: an unexpected death restarts the server after 1, 2, 5, 10 and 20 seconds; a server that stayed up for a minute restores the budget, and the sixth failure ends supervision with `giving up after 5 restarts`. Exit code 0 and stop signals end supervision without a restart.
- The access URL with its token is read from the log line `dsh web: http://…`.
- Stop sends SIGTERM to every supervisor (which forwards to its server) and to servers started outside the window, then SIGKILL after ten seconds, and reports success only when every process of the checkout is gone.
- "Running work" (which makes `Остановка` ask for confirmation) means a server child process that is not idle infrastructure: children below one CPU second after five minutes of life are ignored.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Ошибка: нет PyQt6` | Install the distro package from the table above, rerun `install.sh`. |
| Window opens, `Запуск` fails with "Не найден Node.js" | Set `DSH_NODE=/path/to/node` in the environment the window inherits, or install Node.js. |
| Start fails with a log tail | Read `$XDG_RUNTIME_DIR/dsh-web.log`; a port already in use means a foreign server holds it. |
| Server keeps restarting | The log records `server died (code N …)` once per attempt; fix the reported cause, then press `Запуск` after the supervisor gives up. |
| A server vanished and the cause is unknown | The log keeps the exit record and the previous generation as `dsh-web.log.1`; a start no longer truncates either. |
| `Остановка` refuses or behaves oddly | Another checkout's server may own the port; the window only stops processes of its own checkout. |
| Menu entry missing after install | `kbuildsycoca6 --noincremental`, or log out and back in. |
| Browser does not open | Set `DSH_BROWSER=chromium` (or any command that accepts a URL). |
| A tool reports `spawn gh ENOENT` (or another missing user binary) | The server was started from a shell without the login `PATH`; start it from this window, or restart the window's server after `git pull` so it resolves the login `PATH` |

## Uninstall

```sh
rm ~/.local/share/applications/deepseek-harness.desktop ~/.local/bin/dsh-web
mv ~/.local/bin/dsh-web.bash-backup ~/.local/bin/dsh-web   # if a backup exists
```

The checkout itself keeps working without the launcher: `pnpm run start:web` or `node --import tsx/esm apps/cli/src/bin.ts web` start the same server.
