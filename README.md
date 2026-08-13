# prime-oncall-agent

On-call bug-fix agent for Prime Agent. Human-in-the-loop checkpoints, confidence scoring, and blast-radius analysis for fixing production bugs in Django codebases.

## Status

Phase 1: package skeleton. The workflow engine, skills, and prompts land in later phases.

## Structure

- `extensions/` — TypeScript extension code (the agent's behavior and state machine)
- `skills/` — Django/SRE knowledge (reproduction, mocking, Scylla/Redis/MySQL, tests)
- `prompts/` — reusable prompt templates (reproduce, propose fix, release plan)

## Install

```
pi package install /path/to/prime-oncall-agent
```

Or load a single extension file directly for development:

```
pi -e extensions/oncall-agent.ts
```
