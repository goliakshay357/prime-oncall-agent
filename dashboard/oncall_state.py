"""On-call agent state — the single JSON file the dashboard renders in real time.

Ownership:
  - workflow.*  -> written by the Prime Agent extension (checkpoint state machine)
  - bug + any other top-level display fields -> written by the IPython kernel via update()

Both writers read-modify-write this file and PRESERVE the other's fields, so they
never clobber each other. Writes are atomic (tmp + rename).

Contract (state.json):
{
  "version": 1,
  "updatedAt": <unix ms>,
  "source": "seed" | "kernel" | "extension",
  "bug": "<one-line bug summary>",
  "workflow": {
    "currentStep": 1..8,
    "awaitingApproval": bool,
    "rootCauseConfidence": 0..100,
    "finished": bool,
    "steps": [ { "id": 1..8, "name": "...", "label": "...", "status": "..." } ]
  }
}
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

STATE_DIR = Path(os.environ.get("ONCALL_STATE_DIR", Path.home() / ".prime" / "agent" / "oncall"))
STATE_PATH = STATE_DIR / "state.json"

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


def default_state() -> dict:
    return {
        "version": 1,
        "updatedAt": int(time.time() * 1000),
        "source": "seed",
        "bug": "",
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
    }


def load() -> dict:
    try:
        return json.loads(STATE_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default_state()


def save(state: dict) -> dict:
    state["version"] = 1
    state["updatedAt"] = int(time.time() * 1000)
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(STATE_PATH)  # atomic swap — readers never see a half-written file
    return state


def update(**kwargs) -> dict:
    """Update display-only fields from the IPython kernel. e.g. update(bug="login 500").

    Workflow fields (step, confidence, awaitingApproval) are owned by the
    extension and are NOT writable here — use the checkpoint tool for those.
    """
    state = load()
    for key, value in kwargs.items():
        if key in ("workflow", "version"):
            continue  # extension-owned / reserved
        state[key] = value
    state["source"] = "kernel"
    return save(state)


def set_bug(text: str) -> dict:
    return update(bug=str(text))
