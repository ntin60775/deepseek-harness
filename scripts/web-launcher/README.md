# Web launcher window

Small Qt window that starts and stops the local DeepSeek Harness Web server and opens the interface in a browser tab. It replaces the hand-written shell launcher that used to live in `~/.local/bin`: same runtime files, same behaviour, plus a visible server state, a stop action, a crash record and an automatic restart.

## Install

```sh
./scripts/web-launcher/install.sh
```

The script checks `python3` with PyQt6, warns when Node.js or a browser cannot be found, installs the application-menu entry (`~/.local/share/applications/deepseek-harness.desktop`), links `~/.local/bin/dsh-web` to the window script and refreshes the desktop menu. Running it again after `git pull` updates the entry. An existing regular `~/.local/bin/dsh-web` is kept as `dsh-web.bash-backup`.

## Setup by an agent

The procedure below is packaged as the `dsh-web-launcher` skill (`.agents/skills/dsh-web-launcher/SKILL.md`): per-distro packages, exact verification commands, the runtime contract and a troubleshooting table. On a fresh machine an agent can run `./scripts/web-launcher/install.sh`, then the checks from that skill, without reading the window code.

## Using the window

- **Запуск** — starts the server when it is down and opens the interface; when the server is already up it only opens the interface. `Enter` presses it.
- **Остановка** — stops the supervisor and the server it owns. When the server still runs work (tool calls, subagents), the window asks first, because those runs are interrupted.
- **Пересборка** — runs `scripts/web-launcher/rebuild-web.sh` in the background: package `lib/`, client bundles and `apps/web/dist`. The server is not restarted and stays enabled state-wise; it polls the bundles it serves, so open tabs reload on their own. Closing the window while a build runs is refused, because killing a build leaves partially written artifacts. The window reports the script's exit code and output tail when it fails.
- **×** on the window frame or `Esc` closes the window; the server keeps running, as before.

## Crash record and restart

The window starts `dsh-web-supervisor.py`, not the server directly, and the supervisor keeps the server alive. Every exit lands in `$XDG_RUNTIME_DIR/dsh-web.log` as `dsh web supervisor: server died (code N after Ns)`; a clean exit (code 0) ends supervision, and a stop signal ends it without a restart.

An unexpected death restarts the server after 1, 2, 5, 10 and 20 seconds, in that order; a server that stayed up for a minute restores the full budget. After the fifth restart the supervisor gives up, prints `giving up after 5 restarts; start the server from the launcher` and exits, so a crash loop does not run forever. Open tabs reconnect on their own once the server answers again.

The log is appended to, never truncated, and one oversized generation is kept as `dsh-web.log.1`; the record of the server that died stays readable after the next start.

## Environment

| Variable | Meaning |
|---|---|
| `DSH_NODE` | Node.js executable used to start the server |
| `DSH_BROWSER` | Browser command used to open the interface |
| `DSH_HOME` | Data directory with sessions, default `~/.dsh` |
| `XDG_RUNTIME_DIR` | Where `dsh-web.log` and `dsh-web.pid` live |

The desktop entry starts the window from a session whose `PATH` holds only the system directories, while user tools such as `gh`, `pnpm`, `go`, or `cargo` live in directories the login shell adds. The window therefore asks `$SHELL -lic` for the login `PATH` and gives the server the login entries first, followed by the remaining inherited entries, so the tools resolve both inside the server and in the shells it starts. A shell that does not answer (no `$SHELL`, or five seconds without output) leaves `PATH` as inherited.

## How the state is detected

The PID file holds the supervisor, and the window accepts it only when the process runs this checkout's `dsh-web-supervisor.py` from this checkout's directory. Servers are found in the process table as `node … apps/cli/src/bin.ts web` processes whose working directory is this checkout, so a supervisor started elsewhere, a recycled PID and a stale PID file cannot point the window at an unrelated process. The access URL (with its token) comes from the newest `dsh web: http://…` line in `dsh-web.log`. A stop counts as finished only after every supervisor and server of this checkout is gone; SIGTERM is followed by SIGKILL after ten seconds.

"Running work" means a child process of a server rather than idle long-lived helpers (the tsx/esbuild service, MCP servers and similar): children below one CPU second after five minutes of life are treated as infrastructure, everything else as active work.