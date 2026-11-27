#!/usr/bin/env python3
"""Supervise the launcher's ``dsh web`` server: record how it ended and restart it
after an unexpected death.

The window starts this process instead of the server, so a crash leaves a record in
``$XDG_RUNTIME_DIR/dsh-web.log`` and the interface recovers without the operator
noticing. A clean exit (code 0) and a stop signal end supervision without a restart;
the budget in ``RESTART_DELAYS_SECONDS`` bounds a crash loop, and a child that lived
``HEALTHY_RUN_SECONDS`` restores the full budget.

The PID file holds this process, not the server: the window stops the supervisor,
which forwards SIGTERM to the server it owns.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
RUN_DIR = Path(os.environ.get("XDG_RUNTIME_DIR") or "/tmp")
LOG_PATH = RUN_DIR / "dsh-web.log"
PID_PATH = RUN_DIR / "dsh-web.pid"

SERVER_ARGV = ("--import", "tsx/esm", "apps/cli/src/bin.ts", "web", "--no-open")
# One delay per allowed restart, in order; the budget resets after a healthy run.
RESTART_DELAYS_SECONDS = (1.0, 2.0, 5.0, 10.0, 20.0)
STOP_TIMEOUT_SECONDS = 10.0
HEALTHY_RUN_SECONDS = 60.0


def node_binary() -> str | None:
    """Return the Node.js executable to run the server with."""
    override = os.environ.get("DSH_NODE")
    if override and Path(override).is_file():
        return override
    found = shutil.which("node")
    if found:
        return found
    for candidate in (Path.home() / ".local/share/node-lts/bin/node", Path("/usr/local/bin/node"), Path("/usr/bin/node")):
        if candidate.is_file():
            return str(candidate)
    nvm = Path.home() / ".nvm/versions/node"
    if nvm.is_dir():
        for version in sorted(nvm.iterdir(), reverse=True):
            candidate = version / "bin/node"
            if candidate.is_file():
                return str(candidate)
    return None


class Supervisor:
    """Run one server child at a time, logging every exit and restarting after a crash."""

    def __init__(
        self,
        node: str,
        log_file,
        pid_path: Path = PID_PATH,
        restart_delays: tuple[float, ...] = RESTART_DELAYS_SECONDS,
        healthy_run_seconds: float = HEALTHY_RUN_SECONDS,
    ) -> None:
        self.node = node
        self.log_file = log_file
        self.pid_path = pid_path
        self.restart_delays = restart_delays
        self.healthy_run_seconds = healthy_run_seconds
        self.child: subprocess.Popen[bytes] | None = None
        self.stopping = False

    def log(self, message: str) -> None:
        """Append one timestamped line and flush, so a crash keeps its last record."""
        stamp = datetime.now().astimezone().isoformat(timespec="seconds")
        self.log_file.write(f"{stamp} dsh web supervisor: {message}\n")
        self.log_file.flush()

    def handle_signal(self, number: int, _frame) -> None:
        """Mark an intentional stop and forward the signal to the server."""
        self.stopping = True
        child = self.child
        if child is not None and child.poll() is None:
            child.send_signal(signal.SIGKILL if number == signal.SIGKILL else signal.SIGTERM)

    def stop_child(self) -> None:
        """Terminate the server and escalate to SIGKILL after the grace period."""
        child = self.child
        if child is None or child.poll() is not None:
            return
        child.terminate()
        deadline = time.time() + STOP_TIMEOUT_SECONDS
        while time.time() < deadline and child.poll() is None:
            time.sleep(0.1)
        if child.poll() is None:
            child.kill()
            child.wait()

    def run(self) -> int:
        """Supervise until a stop signal, a clean exit, or an exhausted restart budget."""
        restarts = 0
        self.pid_path.write_text(f"{os.getpid()}\n")
        self.log(f"supervising server (pid {os.getpid()})")
        try:
            while True:
                self.log("starting server")
                started = time.time()
                self.child = subprocess.Popen(
                    [self.node, *SERVER_ARGV],
                    cwd=REPO,
                    stdin=subprocess.DEVNULL,
                    stdout=self.log_file,
                    stderr=subprocess.STDOUT,
                )
                code = self.child.wait()
                self.child = None
                ran = time.time() - started
                if self.stopping:
                    self.log(f"server stopped (code {code})")
                    return 0
                if code == 0:
                    self.log("server exited cleanly (code 0); supervision ends")
                    return 0
                self.log(f"server died (code {code} after {ran:.0f}s)")
                if ran >= self.healthy_run_seconds:
                    restarts = 0
                if restarts >= len(self.restart_delays):
                    self.log(f"giving up after {restarts} restarts; start the server from the launcher")
                    return 1
                delay = self.restart_delays[restarts]
                restarts += 1
                self.log(f"restarting in {delay:.0f}s (restart {restarts} of {len(self.restart_delays)})")
                deadline = time.time() + delay
                while time.time() < deadline and not self.stopping:
                    time.sleep(0.1)
        finally:
            self.stop_child()
            try:
                self.pid_path.unlink()
            except OSError:
                pass
            self.log("supervisor exited")


def main(argv: list[str]) -> int:
    """Run the supervisor with the Node.js path the launcher resolved."""
    node = argv[1] if len(argv) > 1 else node_binary()
    if not node:
        print("dsh web supervisor: Node.js not found; set DSH_NODE or install Node.js", file=sys.stderr)
        return 1
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as log_file:
        supervisor = Supervisor(node, log_file)
        for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(number, supervisor.handle_signal)
        try:
            return supervisor.run()
        except KeyboardInterrupt:
            return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
