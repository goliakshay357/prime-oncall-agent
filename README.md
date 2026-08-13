# prime-oncall-agent

On-call bug-fix agent for Prime Agent. Human-in-the-loop checkpoints, confidence scoring, a per-incident trial journal, and a live dashboard — for fixing production bugs in Django + Scylla + Redis + MySQL codebases.

## Install (on any machine with Prime Agent)

```
prime-agent package install git:github.com/goliakshay357/prime-oncall-agent
```

(On older Prime Agent builds the command is `pi install git:github.com/goliakshay357/prime-oncall-agent`.)

Then restart Prime Agent, or run `/reload` in an open session, so it picks up the extension and skills. No `npm install` needed — the extension resolves its imports through Prime Agent itself.

## Enable it (opt-in)

The package is **inert by default** — it stays out of the way of every other package and session until you opt in:

```
ONCALL_ENABLED=1 prime-agent ...
```

Accepted values: `1`, `true`, `yes`, `on`. Anything else (or unset) leaves it off.

For a one-word launcher, add an alias:

```
alias oncall="ONCALL_ENABLED=1 prime-agent"
```

Then just run `oncall` to start an on-call session.

To disable the package entirely on a machine (including its skills), use `prime-agent config` and turn the package off there.

## Live dashboard (optional)

Zero-dependency Python server inside the package:

```
python3 <package>/dashboard/server.py
```

Open http://127.0.0.1:8787 — it shows every active bug session with live step status, confidence, trial journal, and pending data requests.

## Use it

1. Start an on-call session (`ONCALL_ENABLED=1 prime-agent`) and describe a bug.
2. The agent runs the 8-step workflow: understand → explore → reach 95% confidence → reproduce (failing test) → propose → implement → self-review → release plan.
3. It pauses for your approval at every step. Reply "approved" / "looks good", or use `/oncall approve | reject | reset`.

## Structure

- `extensions/` — the workflow state machine + checkpoint enforcement (TypeScript)
- `skills/` — Django/SRE knowledge: test-first reproduce, prod-data queries, request tracing
- `dashboard/` — the live status website (Python stdlib, no dependencies)

## Fill in your stack (one time)

The skills have `<...>` placeholders for your test command, table names, and project layout. Fill those in and commit.
