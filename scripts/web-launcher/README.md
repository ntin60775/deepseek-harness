# Web launcher window

Small Qt window that starts and stops the local DeepSeek Harness Web server and opens the interface in a browser tab. It replaces the hand-written shell launcher that used to live in `~/.local/bin`: same runtime files, same behaviour, plus a visible server state and a stop action.

## Install

```sh
./scripts/web-launcher/install.sh
```

The script checks `python3` with PyQt6, warns when Node.js or a browser cannot be found, installs the application-menu entry (`~/.local/share/applications/deepseek-harness.desktop`), links `~/.local/bin/dsh-web` to the window script and refreshes the desktop menu. Running it again after `git pull` updates the entry. An existing regular `~/.local/bin/dsh-web` is kept as `dsh-web.bash-backup`.

## Setup by an agent

The procedure below is packaged as the `dsh-web-launcher` skill (`.agents/skills/dsh-web-launcher/SKILL.md`): per-distro packages, exact verification commands, the runtime contract and a troubleshooting table. On a fresh machine an agent can run `./scripts/web-launcher/install.sh`, then the checks from that skill, without reading the window code.

## Using the window

- **Запуск** — starts the server when it is down and opens the interface; when the server is already up it only opens the interface. `Enter` presses it.
- **Остановка** — stops the server. When the server still runs work (tool calls, subagents), the window asks first, because those runs are interrupted.
- **×** on the window frame or `Esc` closes the window; the server keeps running, as before.

## Environment

| Variable | Meaning |
|---|---|
| `DSH_NODE` | Node.js executable used to start the server |
| `DSH_BROWSER` | Browser command used to open the interface |
| `DSH_HOME` | Data directory with sessions, default `~/.dsh` |
| `XDG_RUNTIME_DIR` | Where `dsh-web.log` and `dsh-web.pid` live |

## How the state is detected

The window looks for `node … apps/cli/src/bin.ts web` processes whose working directory is this checkout, using both the PID file and the process table, so a stale PID file cannot point it at an unrelated process. The access URL (with its token) comes from `dsh-web.log`, where the server prints it. A stop counts as finished only after the process is gone; SIGTERM is followed by SIGKILL after ten seconds.

"Running work" means a child process of the server other than idle long-lived helpers (the tsx/esbuild service, MCP servers and similar): children below one CPU second after five minutes of life are treated as infrastructure, everything else as active work.
