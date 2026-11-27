"""The supervisor logs how the server died, restarts it within the budget, and stops on a signal."""
from __future__ import annotations

import importlib.util
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "dsh-web-supervisor.py"
_spec = importlib.util.spec_from_file_location("dsh_web_supervisor", SCRIPT)
assert _spec is not None and _spec.loader is not None
supervisor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(supervisor)


class SupervisorLifecycle(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="dsh-supervisor-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.log_path = self.root / "dsh-web.log"
        self.pid_path = self.root / "dsh-web.pid"

    def fake_node(self, body: str) -> Path:
        path = self.root / f"node-{time.monotonic_ns()}"
        path.write_text("#!/bin/sh\n" + body)
        path.chmod(0o755)
        return path

    def supervise(self, node: Path, restarts: int = 2) -> int:
        with open(self.log_path, "a", encoding="utf-8") as log:
            return supervisor.Supervisor(
                node=str(node),
                log_file=log,
                pid_path=self.pid_path,
                restart_delays=(0.05,) * restarts,
                healthy_run_seconds=60.0,
            ).run()

    def test_crash_restarts_then_gives_up(self) -> None:
        code = self.supervise(self.fake_node("exit 3\n"))
        text = self.log_path.read_text()
        self.assertEqual(code, 1)
        self.assertEqual(text.count("starting server"), 3)
        self.assertIn("died (code 3", text)
        self.assertIn("giving up after 2 restarts", text)
        self.assertFalse(self.pid_path.exists())

    def test_clean_exit_ends_supervision(self) -> None:
        code = self.supervise(self.fake_node("exit 0\n"))
        text = self.log_path.read_text()
        self.assertEqual(code, 0)
        self.assertEqual(text.count("starting server"), 1)
        self.assertIn("exited cleanly", text)
        self.assertIn("supervisor exited", text)
        self.assertFalse(self.pid_path.exists())

    def test_sigterm_stops_the_server_without_restart(self) -> None:
        node = self.fake_node("trap 'exit 0' TERM\nwhile :; do sleep 0.1; done\n")
        env = dict(os.environ, XDG_RUNTIME_DIR=str(self.root))
        process = subprocess.Popen(
            [sys.executable, str(SCRIPT), str(node)],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(lambda: process.kill() if process.poll() is None else None)
        deadline = time.time() + 15.0
        while time.time() < deadline and not self.pid_path.exists():
            time.sleep(0.05)
        self.assertTrue(self.pid_path.exists(), "supervisor never claimed its PID file")
        process.send_signal(signal.SIGTERM)
        self.assertEqual(process.wait(timeout=15.0), 0)
        text = self.log_path.read_text()
        self.assertEqual(text.count("starting server"), 1)
        self.assertNotIn("died (code", text)
        self.assertFalse(self.pid_path.exists())


if __name__ == "__main__":
    unittest.main()
