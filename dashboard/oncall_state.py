"""On-call agent state — one JSON file per session, rendered by the dashboard in real time.

Ownership (both writers read-modify-write and preserve the other's fields):
  - workflow.*, history, sessionId, sessionName -> the Prime Agent extension
  - bug, activity, and any other display fields      -> the IPython kernel via update()

Session key: the session id. The extension uses getSessionId(); the kernel
derives it from the basename of RLM_SESSION_DIR (set by Prime Agent per kernel).
Falls back to "default" when run outside a Prime Agent kernel.

File layout: <state-dir>/<sessionId>.json
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

STATE_DIR = Path(os.environ.get("ONCALL_STATE_DIR", Path.home() / ".prime" / "agent" / "oncall"))

STEPS = [
    (1, "understand", "Understand the bug"),
    (2, "explore", "Explore codebase"),
    (3, "confidence", "Reach 95% confidence"),
    (4, "reproduce", "Reproduce — failing test"),
    (5, "propose", "Propose the fix"),
    (6, "implement", "Implement + tests"),
    (7, "self-review", "Self-review"),
    (8, "release", "Release plan"),
]

EXTENSION_OWNED = {"workflow", "history", "sessionId", "sessionName", "version"}


def session_key() -> str:
    rlm = os.environ.get("RLM_SESSION_DIR", "")
    if rlm:
        return os.path.basename(rlm.rstrip("/"))
    return "default"


def state_path() -> Path:
    return STATE_DIR / f"{session_key()}.json"


def default_state() -> dict:
    return {
        "version": 1,
        "updatedAt": int(time.time() * 1000),
        "source": "seed",
        "sessionId": session_key(),
        "sessionName": "",
        "bug": "",
        "activity": "",
        "workflow": {
            "currentStep": 1,
            "awaitingApproval": False,
            "rootCauseConfidence": 0,
            "finished": False,
            "steps": [
                {"id": i, "name": name, "label": label, "status": "in_progress" if i == 1 else "pending"}
                for i, name, label in STEPS
            ],
        },
        "history": [],
    }


def load() -> dict:
    try:
        return json.loads(state_path().read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default_state()


def save(state: dict) -> dict:
    state["version"] = 1
    state["updatedAt"] = int(time.time() * 1000)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = state_path().with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(state_path())  # atomic swap — readers never see a half-written file
    return state


def update(**kwargs) -> dict:
    """Update display-only fields from the IPython kernel. e.g. update(bug="login 500", activity="running the failing test").

    Workflow fields (step, confidence, awaitingApproval) are owned by the
    extension and are NOT writable here — use the checkpoint tool for those.
    """
    state = load()
    for key, value in kwargs.items():
        if key in EXTENSION_OWNED:
            continue
        state[key] = value
    state["source"] = "kernel"
    return save(state)


def set_bug(text: str) -> dict:
    return update(bug=str(text))


def set_activity(text: str) -> dict:
    return update(activity=str(text))


def list_sessions() -> list[dict]:
    """Return all session state files, newest first. Used by the dashboard server."""
    sessions = []
    if not STATE_DIR.exists():
        return sessions
    for path in STATE_DIR.glob("*.json"):
        if path.name in ("state.json", "index.json"):
            continue  # legacy single-file, not a session
        try:
            sessions.append(json.loads(path.read_text()))
        except (json.JSONDecodeError, OSError):
            continue
    sessions.sort(key=lambda s: s.get("updatedAt", 0), reverse=True)
    return sessions
