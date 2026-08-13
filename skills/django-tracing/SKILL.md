---
name: django-tracing
description: Trace a Django request end-to-end and add targeted logging to find the failure
---

# Django Tracing

Follow the request, not the symptom.

1. URL route → view (`urls.py` → `views.py`).
2. View → service/model logic.
3. State changes: DB (Scylla/MySQL), cache (Redis), queues.
4. Middleware/signals around the request.

Log the actual values (ids, keys, codes) at the suspected boundary — not "got here".

Common gotchas: cache invalidation (stale key), lazy QuerySets, transaction/partial writes, signals firing twice.

## Fill in later
- Project layout: <...>
- Logging setup: <...>
