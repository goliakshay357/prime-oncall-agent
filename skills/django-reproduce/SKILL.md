---
name: django-reproduce
description: Test-first reproduction — turn a bug into one minimal failing test in Django
---

# Reproduce First (Test-First)

A root cause is only real when a failing test proves it.

1. Find the entry point (URL → view → service).
2. Write ONE minimal failing test (pytest or Django test client), one assertion path.
3. Run it — it must fail for the exact reason you diagnosed.
4. Reuse existing fixtures/mocks; don't invent new ones.

Use: Django test client (`client.get/post`), pytest + `conftest.py` fixtures, `unittest.mock`/`pytest-mock` to isolate DB/cache.

## Fill in later
- Test command: <...>
- Test directory: <...>
