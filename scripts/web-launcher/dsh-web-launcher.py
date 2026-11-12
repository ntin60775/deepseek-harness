#!/usr/bin/env python3
"""DeepSeek Harness launcher: a small Qt window that starts or stops the local
Web server and opens the interface in a browser tab.

The window reads and writes the runtime files the shell launcher used before it:
``$XDG_RUNTIME_DIR/dsh-web.log`` (the server prints its access URL there) and
``$XDG_RUNTIME_DIR/dsh-web.pid``.

Requirements: Python 3 with PyQt6, Node.js, and a browser. ``install.sh`` in this
directory installs the application-menu entry and checks those requirements.
"""

from __future__ import annotations

import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PyQt6.QtCore import QPointF, QRectF, QSize, Qt, QThread, QTimer, pyqtSignal
from PyQt6.QtGui import QColor, QFont, QIcon, QKeySequence, QPainter, QPen, QPixmap, QPolygonF, QShortcut
from PyQt6.QtWidgets import (
    QApplication,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
RUN_DIR = Path(os.environ.get("XDG_RUNTIME_DIR") or "/tmp")
LOG_PATH = RUN_DIR / "dsh-web.log"
PID_PATH = RUN_DIR / "dsh-web.pid"
DSH_HOME = Path(os.environ.get("DSH_HOME") or (Path.home() / ".dsh"))

DEFAULT_URL = "http://127.0.0.1:3080"
URL_PATTERN = re.compile(r"^dsh web: (http\S+)", re.MULTILINE)
SERVER_COMMAND = ("apps/cli/src/bin.ts", "web")

# Rebuild runs the checkout's own script so the window and a terminal issue one and the
# same build; the script resolves Node itself and refuses to run beside `pnpm run dev:web`.
REBUILD_SCRIPT = HERE / "rebuild-web.sh"
REBUILD_TIMEOUT_SECONDS = 900.0

# A child of the server counts as running work unless it is idle infrastructure:
# below one CPU second after five minutes of life is a language server, an MCP
# server or another long-lived helper, not a tool call in flight.
WORK_CPU_SECONDS = 1.0
WORK_MAX_IDLE_SECONDS = 300.0
START_TIMEOUT_SECONDS = 90.0
STOP_TIMEOUT_SECONDS = 10.0


# --- environment ------------------------------------------------------------


def node_binary() -> str | None:
    """Return the Node.js executable to launch the server with."""
    override = os.environ.get("DSH_NODE")
    if override and Path(override).is_file():
        return override
    found = shutil.which("node")
    if found:
        return found
    candidates = [
        Path.home() / ".local/share/node-lts/bin/node",
        Path("/usr/local/bin/node"),
        Path("/usr/bin/node"),
    ]
    nvm = Path.home() / ".nvm/versions/node"
    if nvm.is_dir():
        candidates.extend(version / "bin/node" for version in sorted(nvm.iterdir(), reverse=True))
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def browser_command() -> list[str] | None:
    """Return the command that opens a URL, as a single-element prefix."""
    override = os.environ.get("DSH_BROWSER")
    if override:
        return [override]
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        found = shutil.which(name)
        if found:
            return [found]
    if shutil.which("xdg-open"):
        return ["xdg-open"]
    return None


def url_from_log() -> str | None:
    """Return the last access URL the server printed, token included."""
    try:
        text = LOG_PATH.read_text(errors="replace")
    except OSError:
        return None
    found = URL_PATTERN.findall(text)
    return found[-1] if found else None


def display_url(url: str | None) -> str:
    """Return the address without its access token, for display."""
    if not url:
        return DEFAULT_URL
    return url.split("?", 1)[0]


# --- process discovery ------------------------------------------------------


def _read(path: str) -> str:
    try:
        return Path(path).read_text(errors="replace")
    except OSError:
        return ""


def _cmdline(pid: int) -> str:
    try:
        return Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
    except OSError:
        return ""


def _stat_fields(pid: int) -> list[str]:
    raw = _read(f"/proc/{pid}/stat")
    if not raw:
        return []
    return raw.rsplit(")", 1)[-1].split()


def _exe_name(pid: int) -> str:
    try:
        return Path(os.readlink(f"/proc/{pid}/exe")).name
    except OSError:
        return ""


def _cwd(pid: int) -> str:
    try:
        return os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        return ""


def process_alive(pid: int) -> bool:
    """Return True while ``pid`` runs; a zombie under a dead parent does not count."""
    fields = _stat_fields(pid)
    return bool(fields) and fields[0] != "Z"


def is_server_pid(pid: int) -> bool:
    """Return True when ``pid`` is a ``dsh web`` server started from this checkout."""
    if pid <= 0:
        return False
    cmd = _cmdline(pid)
    if not cmd or "apps/cli/src/bin.ts web" not in cmd:
        return False
    cwd = _cwd(pid)
    if not cwd:
        return False
    try:
        if Path(cwd).resolve() != REPO:
            return False
    except OSError:
        return False
    return _exe_name(pid) == "node"


def server_pids() -> list[int]:
    """Return this checkout's server processes, from the PID file and the process table."""
    pids: list[int] = []

    def add(pid: int) -> None:
        if pid not in pids and is_server_pid(pid):
            pids.append(pid)

    try:
        add(int(PID_PATH.read_text().strip()))
    except (OSError, ValueError):
        pass
    try:
        listing = subprocess.run(
            ["pgrep", "-f", r"apps/cli/src/bin\.ts web"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        for entry in listing.stdout.split():
            add(int(entry))
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return sorted(pids)


def process_started_at(pid: int) -> float | None:
    """Return the process start time as a Unix timestamp."""
    fields = _stat_fields(pid)
    if len(fields) < 20:
        return None
    boot_time = None
    for line in _read("/proc/stat").splitlines():
        if line.startswith("btime "):
            boot_time = int(line.split()[1])
            break
    if boot_time is None:
        return None
    return boot_time + int(fields[19]) / os.sysconf("SC_CLK_TCK")


def process_cpu_seconds(pid: int) -> float:
    """Return the CPU time the process consumed so far."""
    fields = _stat_fields(pid)
    if len(fields) < 13:
        return 0.0
    return (int(fields[11]) + int(fields[12])) / os.sysconf("SC_CLK_TCK")


def child_pids(pid: int) -> list[int]:
    """Return the direct children of ``pid``."""
    raw = _read(f"/proc/{pid}/task/{pid}/children")
    if raw.strip():
        return [int(entry) for entry in raw.split() if entry.isdigit()]
    children: list[int] = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        fields = _stat_fields(int(entry.name))
        if len(fields) > 1 and fields[1] == str(pid):
            children.append(int(entry.name))
    return children


def active_work(pid: int) -> bool:
    """Return True when the server runs child processes that look like live work."""
    now = time.time()
    for child in child_pids(pid):
        if "esbuild" in _cmdline(child):
            continue
        started = process_started_at(child)
        if started and now - started > WORK_MAX_IDLE_SECONDS and process_cpu_seconds(child) < WORK_CPU_SECONDS:
            continue
        return True
    return False


def port_answers(url: str | None) -> bool:
    """Return True when the logged URL answers any HTTP response."""
    if not url:
        return False
    try:
        with urllib.request.urlopen(url, timeout=1.0):
            return True
    except urllib.error.HTTPError:
        return True
    except (urllib.error.URLError, OSError, ValueError):
        return False


# --- formatting -------------------------------------------------------------


def format_uptime(seconds: float) -> str:
    """Format a duration as a short Russian human string."""
    total = max(0, int(seconds))
    days, rest = divmod(total, 86400)
    hours, rest = divmod(rest, 3600)
    minutes, seconds = divmod(rest, 60)
    if days:
        return f"{days} д {hours} ч"
    if hours:
        return f"{hours} ч {minutes} мин"
    if minutes:
        return f"{minutes} мин"
    return f"{seconds} с"


def log_tail(limit: int = 3000) -> str:
    """Return the tail of the server log for error reports."""
    try:
        text = LOG_PATH.read_text(errors="replace")
    except OSError:
        return ""
    return text[-limit:].strip()


# --- background operations --------------------------------------------------


class StartWorker(QThread):
    """Boot the server and wait for the access URL to appear in the log."""

    started = pyqtSignal(str)
    failed = pyqtSignal(str)

    def __init__(self) -> None:
        super().__init__()
        self._cancelled = False
        self._process: subprocess.Popen[bytes] | None = None

    def cancel(self) -> None:
        self._cancelled = True
        process = self._process
        if process and process.poll() is None:
            process.terminate()

    def run(self) -> None:
        node = node_binary()
        if not node:
            self.failed.emit("Не найден Node.js. Установите его или задайте путь в DSH_NODE.")
            return
        try:
            LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            LOG_PATH.write_text("")
            log = open(LOG_PATH, "a", encoding="utf-8")
        except OSError as error:
            self.failed.emit(f"Не удалось подготовить файл лога: {error}")
            return
        try:
            self._process = subprocess.Popen(
                [node, "--import", "tsx/esm", "apps/cli/src/bin.ts", "web", "--no-open"],
                cwd=REPO,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except OSError as error:
            log.close()
            self.failed.emit(f"Не удалось запустить сервер: {error}")
            return
        try:
            PID_PATH.write_text(f"{self._process.pid}\n")
        except OSError:
            pass
        deadline = time.time() + START_TIMEOUT_SECONDS
        while time.time() < deadline and not self._cancelled:
            url = url_from_log()
            if url:
                self._process = None
                self.started.emit(url)
                return
            if self._process.poll() is not None:
                self.failed.emit("Сервер завершился при запуске:\n" + (log_tail() or "лог пуст"))
                return
            time.sleep(0.25)
        if self._cancelled:
            return
        self.failed.emit(
            f"Сервер не выдал адрес за {int(START_TIMEOUT_SECONDS)} секунд. Подробности: {LOG_PATH}"
        )


class StopWorker(QThread):
    """Stop every server process of this checkout."""

    finished_ok = pyqtSignal()
    failed = pyqtSignal(str)

    def run(self) -> None:
        pids = server_pids()
        if not pids:
            self.finished_ok.emit()
            return
        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        deadline = time.time() + STOP_TIMEOUT_SECONDS
        while time.time() < deadline and any(process_alive(pid) for pid in pids):
            time.sleep(0.2)
        for pid in pids:
            if process_alive(pid):
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        deadline = time.time() + 5.0
        while time.time() < deadline and any(process_alive(pid) for pid in pids):
            time.sleep(0.2)
        if any(process_alive(pid) for pid in pids):
            self.failed.emit("Сервер не завершился. Перезагрузите компьютер или завершите процесс вручную.")
            return
        try:
            PID_PATH.unlink()
        except OSError:
            pass
        self.finished_ok.emit()


class RebuildWorker(QThread):
    """Rebuild this checkout's artifacts through scripts/web-launcher/rebuild-web.sh."""

    finished_ok = pyqtSignal()
    failed = pyqtSignal(str)

    def run(self) -> None:
        if not REBUILD_SCRIPT.is_file():
            self.failed.emit(f"Скрипт пересборки не найден: {REBUILD_SCRIPT}")
            return
        env = dict(os.environ)
        node = node_binary()
        if node:
            env["DSH_NODE"] = node
        try:
            completed = subprocess.run(
                [str(REBUILD_SCRIPT)],
                cwd=REPO,
                env=env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=REBUILD_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            self.failed.emit(
                f"Пересборка не завершилась за {int(REBUILD_TIMEOUT_SECONDS)} секунд; "
                f"артефакты могут быть неполными — повторите сборку в терминале."
            )
            return
        except OSError as error:
            self.failed.emit(f"Не удалось запустить пересборку: {error}")
            return
        if completed.returncode == 0:
            self.finished_ok.emit()
            return
        output = ((completed.stdout or "") + (completed.stderr or ""))[-3000:].strip()
        self.failed.emit(
            f"Пересборка завершилась с кодом {completed.returncode}.\n{output or 'вывод пуст'}"
        )


# --- window -----------------------------------------------------------------


class Launcher(QWidget):
    """The launcher window: server state, stop, rebuild and start actions."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("DeepSeek Harness")
        self.setWindowIcon(self._window_icon())
        self.setFixedWidth(430)
        self._busy = False
        self._confirming = False
        self._start_worker: StartWorker | None = None
        self._server_started = False
        self._stop_worker: StopWorker | None = None
        self._rebuild_worker: RebuildWorker | None = None

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 16)
        root.setSpacing(12)

        root.addLayout(self._build_header())
        root.addWidget(self._separator())
        root.addLayout(self._build_facts())
        root.addWidget(self._separator())

        self._message = QLabel()
        self._message.setObjectName("message")
        self._message.setWordWrap(True)
        self._message.hide()
        root.addWidget(self._message)

        root.addLayout(self._build_actions())

        shortcut = QShortcut(QKeySequence("Escape"), self)
        shortcut.activated.connect(self.close)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._refresh)
        self._timer.start(1000)
        self._refresh()

        screen = QApplication.primaryScreen()
        if screen is not None:
            geometry = screen.availableGeometry()
            self.move(
                geometry.center().x() - self.width() // 2,
                geometry.center().y() - self.height() // 2,
            )

    # -- construction --------------------------------------------------------

    def _window_icon(self) -> QIcon:
        icon = QIcon()
        for size in (16, 24, 32, 48, 64, 128, 256):
            path = HERE / f"dsh-icon-{size}.png"
            if path.is_file():
                icon.addFile(str(path), QSize(size, size))
        return icon

    def _build_header(self) -> QHBoxLayout:
        header = QHBoxLayout()
        header.setSpacing(10)

        logo = QLabel()
        pixmap = QPixmap(str(HERE / "dsh-icon-256.png"))
        if not pixmap.isNull():
            logo.setPixmap(
                pixmap.scaled(
                    38,
                    38,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
            )
        logo.setToolTip("DeepSeek Harness — локальный сервер и веб-интерфейс агента")
        header.addWidget(logo)

        title = QLabel("DeepSeek Harness")
        font = QFont()
        font.setPointSize(13)
        font.setBold(True)
        title.setFont(font)
        title.setToolTip("DeepSeek Harness — локальный сервер и веб-интерфейс агента")
        header.addWidget(title)
        header.addStretch(1)

        self._chip = QLabel("остановлен")
        self._chip.setObjectName("chipOff")
        header.addWidget(self._chip)
        return header

    def _build_facts(self) -> QGridLayout:
        grid = QGridLayout()
        grid.setHorizontalSpacing(14)
        grid.setVerticalSpacing(6)
        self._pid_value = QLabel("—")
        self._url_value = QLabel(DEFAULT_URL)
        self._uptime_value = QLabel("—")
        rows = [
            ("Процесс", self._pid_value, "Номер процесса сервера в системе"),
            ("Адрес", self._url_value, "Адрес, по которому открывается интерфейс"),
            ("Работает", self._uptime_value, "Время с момента запуска сервера"),
        ]
        for row, (name, value, tip) in enumerate(rows):
            key = QLabel(name)
            key.setObjectName("key")
            key.setToolTip(tip)
            value.setObjectName("value")
            value.setToolTip(tip)
            grid.addWidget(key, row, 0)
            grid.addWidget(value, row, 1)
        grid.setColumnStretch(1, 1)
        return grid

    def _build_actions(self) -> QVBoxLayout:
        actions = QVBoxLayout()
        actions.setSpacing(10)

        self._stop_button = QPushButton(" Остановка")
        self._stop_button.setObjectName("stop")
        self._stop_button.setMinimumHeight(40)
        self._stop_button.setIcon(self._square_icon())
        self._stop_button.setIconSize(QSize(14, 14))
        self._stop_button.setToolTip(
            "Остановить сервер. Открытые вкладки отключатся, незавершённые ходы прервутся."
        )
        self._stop_button.clicked.connect(self._on_stop)

        self._rebuild_button = QPushButton(" Пересборка")
        self._rebuild_button.setObjectName("side")
        self._rebuild_button.setMinimumHeight(40)
        self._rebuild_button.setIcon(self._rebuild_icon())
        self._rebuild_button.setIconSize(QSize(15, 15))
        self._rebuild_button.setToolTip(
            "Пересобрать артефакты этого checkout: lib/ пакетов, клиентские бандлы и apps/web/dist.\n"
            f"Сервер не перезапускается: он сам следит за бандлами и перезагружает вкладки.\n"
            f"Скрипт: {REBUILD_SCRIPT}"
        )
        self._rebuild_button.clicked.connect(self._on_rebuild)

        self._run_button = QPushButton(" Запуск")
        self._run_button.setObjectName("run")
        # Two rows tall: it spans Остановка and Пересборка in the grid below (40 + 10 + 40).
        self._run_button.setMinimumHeight(90)
        self._run_button.setIcon(self._play_icon())
        self._run_button.setIconSize(QSize(15, 15))
        self._run_button.setDefault(True)
        self._run_button.setAutoDefault(True)
        self._run_button.setToolTip(
            "Запустить сервер, если он не работает, и открыть интерфейс в браузере (Enter)."
        )
        self._run_button.clicked.connect(self._on_run)

        grid = QGridLayout()
        grid.setHorizontalSpacing(10)
        grid.setVerticalSpacing(10)
        grid.setColumnStretch(0, 1)
        grid.setColumnStretch(1, 2)
        grid.addWidget(self._stop_button, 0, 0)
        grid.addWidget(self._rebuild_button, 1, 0)
        grid.addWidget(self._run_button, 0, 1, 2, 1)
        actions.addLayout(grid)

        self._confirm = QWidget()
        confirm_layout = QVBoxLayout(self._confirm)
        confirm_layout.setContentsMargins(0, 0, 0, 0)
        confirm_layout.setSpacing(10)
        question = QLabel("Есть незавершённые ходы — они прервутся. Остановить сервер?")
        question.setObjectName("question")
        question.setWordWrap(True)
        confirm_layout.addWidget(question)
        confirm_row = QHBoxLayout()
        confirm_row.setSpacing(10)
        self._cancel_button = QPushButton("Отмена")
        self._cancel_button.setObjectName("side")
        self._cancel_button.setMinimumHeight(40)
        self._cancel_button.setToolTip("Ничего не делать и вернуться к серверу")
        self._cancel_button.clicked.connect(self._hide_confirm)
        self._confirm_stop_button = QPushButton(" Да, остановить")
        self._confirm_stop_button.setObjectName("stop")
        self._confirm_stop_button.setMinimumHeight(40)
        self._confirm_stop_button.setIcon(self._square_icon())
        self._confirm_stop_button.setIconSize(QSize(14, 14))
        self._confirm_stop_button.setToolTip("Остановить сервер и прервать незавершённые ходы")
        self._confirm_stop_button.clicked.connect(self._stop_now)
        confirm_row.addWidget(self._cancel_button, 1)
        confirm_row.addWidget(self._confirm_stop_button, 2)
        confirm_layout.addLayout(confirm_row)
        self._confirm.hide()
        actions.addWidget(self._confirm)
        return actions

    def _separator(self) -> QFrame:
        line = QFrame()
        line.setFrameShape(QFrame.Shape.HLine)
        line.setObjectName("line")
        return line

    @staticmethod
    def _square_icon() -> QIcon:
        size = 14
        pixmap = QPixmap(size, size)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor("#ffe8e4"))
        painter.drawRoundedRect(2, 2, size - 4, size - 4, 1.5, 1.5)
        painter.end()
        return QIcon(pixmap)

    @staticmethod
    def _rebuild_icon() -> QIcon:
        """Circular arrow: rebuild the artifacts without touching the running server."""
        size = 15
        pixmap = QPixmap(size, size)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        pen = QPen(QColor("#e6e6e6"))
        pen.setWidthF(1.6)
        painter.setPen(pen)
        painter.drawArc(QRectF(2.5, 2.5, size - 5.0, size - 5.0), 45 * 16, 250 * 16)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor("#e6e6e6"))
        painter.drawPolygon(
            QPolygonF([QPointF(size - 3.0, 1.5), QPointF(size - 0.5, 5.5), QPointF(size - 6.0, 5.0)])
        )
        painter.end()
        return QIcon(pixmap)

    @staticmethod
    def _play_icon() -> QIcon:
        size = 15
        pixmap = QPixmap(size, size)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor("#ffffff"))
        painter.drawPolygon(
            QPolygonF(
                [
                    QPointF(3.0, 1.5),
                    QPointF(size - 2.0, size / 2.0),
                    QPointF(3.0, size - 1.5),
                ]
            )
        )
        painter.end()
        return QIcon(pixmap)

    # -- state ---------------------------------------------------------------

    def _refresh(self) -> None:
        if self._busy:
            return
        pids = server_pids()
        running = bool(pids)
        pid = pids[0] if running else 0
        url = url_from_log()
        if running:
            self._chip.setText("запущен")
            self._chip.setObjectName("chip")
            self._chip.setToolTip(f"Сервер работает, PID {pid}")
            self._pid_value.setText(f"PID {pid}")
            self._uptime_value.setText(
                format_uptime(time.time() - (process_started_at(pid) or time.time()))
            )
            self._url_value.setText(display_url(url))
            self._run_button.setToolTip(
                "Открыть интерфейс в браузере (Enter). Сервер уже работает."
            )
        else:
            self._chip.setText("остановлен")
            self._chip.setObjectName("chipOff")
            self._chip.setToolTip("Сервер не запущен — нажмите «Запуск»")
            self._pid_value.setText("—")
            self._uptime_value.setText("—")
            self._url_value.setText(display_url(url))
            self._run_button.setToolTip(
                "Запустить сервер и открыть интерфейс в браузере (Enter)."
            )
        self._stop_button.setEnabled(running)
        self._stop_button.setToolTip(
            "Остановить сервер. Открытые вкладки отключатся, незавершённые ходы прервутся."
            if running
            else "Сервер не запущен"
        )
        self._style_chip()
        self._run_button.setEnabled(True)
        if REBUILD_SCRIPT.is_file():
            self._rebuild_button.setEnabled(True)
        else:
            self._rebuild_button.setEnabled(False)
            self._rebuild_button.setToolTip(f"Скрипт пересборки не найден: {REBUILD_SCRIPT}")

    def _style_chip(self) -> None:
        self._chip.style().unpolish(self._chip)
        self._chip.style().polish(self._chip)

    def _set_busy(self, text: str) -> None:
        self._busy = True
        self._chip.setText(text)
        self._chip.setObjectName("chipOff")
        self._style_chip()
        self._stop_button.setEnabled(False)
        self._run_button.setEnabled(False)
        self._rebuild_button.setEnabled(False)

    def _end_busy(self) -> None:
        self._busy = False
        self._refresh()

    def _show_error(self, text: str) -> None:
        self._show_status(text, "message")

    def _show_success(self, text: str) -> None:
        self._show_status(text, "ok")

    def _show_status(self, text: str, object_name: str) -> None:
        self._message.setObjectName(object_name)
        self._message.style().unpolish(self._message)
        self._message.style().polish(self._message)
        self._message.setText(text)
        self._message.show()

    def _hide_error(self) -> None:
        self._message.hide()
        self._message.setText("")
        self._message.setObjectName("message")

    # -- actions -------------------------------------------------------------

    def _on_run(self) -> None:
        if self._busy:
            return
        self._hide_error()
        self._hide_confirm()
        url = url_from_log()
        running = bool(server_pids())
        if running:
            if not url or not port_answers(url):
                self._show_error(
                    "Сервер работает, но адрес с токеном потерялся. Остановите сервер и запустите снова."
                )
                return
            self._open_browser(url)
            self.close()
            return
        self._start_worker = StartWorker()
        self._start_worker.started.connect(self._on_started)
        self._start_worker.failed.connect(self._on_failed)
        self._set_busy("запускается…")
        self._start_worker.start()

    def _on_started(self, url: str) -> None:
        self._server_started = True
        self._open_browser(url)
        self._end_busy()
        self.close()

    def _on_failed(self, message: str) -> None:
        self._end_busy()
        self._show_error(message)

    def _on_stop(self) -> None:
        if self._busy:
            return
        self._hide_error()
        pids = server_pids()
        if not pids:
            self._refresh()
            return
        if active_work(pids[0]):
            self._show_confirm()
            return
        self._stop_now()

    def _show_confirm(self) -> None:
        self._confirming = True
        self._stop_button.setVisible(False)
        self._rebuild_button.setVisible(False)
        self._run_button.setVisible(False)
        self._confirm.show()

    def _hide_confirm(self) -> None:
        self._confirming = False
        self._confirm.hide()
        self._stop_button.setVisible(True)
        self._rebuild_button.setVisible(True)
        self._run_button.setVisible(True)

    def _stop_now(self) -> None:
        self._hide_confirm()
        self._stop_worker = StopWorker()
        self._stop_worker.finished_ok.connect(self._on_stopped)
        self._stop_worker.failed.connect(self._on_failed)
        self._set_busy("останавливается…")
        self._stop_worker.start()

    def _on_stopped(self) -> None:
        self._end_busy()

    def _on_rebuild(self) -> None:
        if self._busy:
            return
        self._hide_error()
        self._hide_confirm()
        self._rebuild_worker = RebuildWorker()
        self._rebuild_worker.finished_ok.connect(self._on_rebuilt)
        self._rebuild_worker.failed.connect(self._on_failed)
        self._set_busy("пересборка…")
        self._rebuild_worker.start()

    def _on_rebuilt(self) -> None:
        self._end_busy()
        self._show_success("Артефакты пересобраны. Открытые вкладки перезагрузятся сами.")

    def _open_browser(self, url: str) -> None:
        command = browser_command()
        if not command:
            self._show_error("Не найден браузер. Установите Chromium или задайте DSH_BROWSER.")
            return
        try:
            subprocess.Popen(
                [*command, url],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as error:
            self._show_error(f"Не удалось открыть браузер: {error}")

    def closeEvent(self, event) -> None:
        # Killing a build mid-run leaves partially written lib/ and apps/web/dist trees,
        # so the window stays open until the rebuild settles on its own.
        if self._rebuild_worker is not None and self._rebuild_worker.isRunning():
            self._show_error("Идёт пересборка артефактов — закройте окно после её завершения.")
            event.ignore()
            return
        if (
            self._start_worker is not None
            and self._start_worker.isRunning()
            and not self._server_started
        ):
            self._start_worker.cancel()
            self._start_worker.wait(2000)
        if self._stop_worker is not None and self._stop_worker.isRunning():
            self._stop_worker.wait(2000)
        super().closeEvent(event)


STYLE = """
QWidget { background: #1d2023; color: #e6e6e6; }
QToolTip { background: #2a2e33; color: #e6e6e6; border: 1px solid #3a3f45;
           padding: 4px 6px; border-radius: 4px; }
QLabel#chip { background: #1f3a2b; color: #7fe08a; border-radius: 9px;
              padding: 1px 8px; font-weight: 600; font-size: 9pt; }
QLabel#chipOff { background: #3a2c2c; color: #e8a0a0; border-radius: 9px;
                 padding: 1px 8px; font-weight: 600; font-size: 9pt; }
QLabel#key { color: #9aa0a6; }
QLabel#value { color: #e6e6e6; }
QLabel#question { color: #e8c07a; }
QLabel#message { color: #f2a4a4; }
QLabel#ok { color: #7fe08a; }
QFrame#line { background: #2f3439; border: none; max-height: 1px; }
QPushButton { border-radius: 6px; font-weight: 600; }
QPushButton#stop { background: #8f3327; border: 1px solid #8f3327; color: #ffe8e4; }
QPushButton#stop:hover { background: #a83c2e; border-color: #a83c2e; }
QPushButton#stop:pressed { background: #7a2a20; }
QPushButton#stop:disabled { background: #2a2e33; border-color: #2d3135; color: #6b7075; }
QPushButton#run { background: #2f9e44; border: 1px solid #62d683; color: white; padding: 0 18px; }
QPushButton#run:hover { background: #36af4c; }
QPushButton#run:focus { border: 2px solid #b9f6c9; }
QPushButton#run:disabled { background: #2a4a33; border-color: #2a4a33; color: #9fb3a5; }
QPushButton#side { background: #2a2e33; border: 1px solid #3a3f45; }
QPushButton#side:hover { background: #33383e; }
"""


def main() -> int:
    """Show the launcher window."""
    app = QApplication(sys.argv)
    app.setApplicationName("DeepSeek Harness")
    app.setApplicationDisplayName("DeepSeek Harness")
    app.setDesktopFileName("deepseek-harness")
    app.setStyleSheet(STYLE)
    window = Launcher()
    window.show()
    window.raise_()
    window.activateWindow()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
