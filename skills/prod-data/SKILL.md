---
name: prod-data
description: Prod data queries — Scylla/Redis/MySQL templates to hand the user for real incident data
---

# Prod Data (give the human copy-paste queries)

When you need real data to reproduce or verify, hand the user exact queries. Never guess prod state.

## Scylla (CQL)
- `SELECT * FROM <table> WHERE <partition_key> = ? LIMIT 20;`
- `SELECT COUNT(*) FROM <table> WHERE <key> = ? AND <clustering> >= ?;`

## Redis
- `GET <key>` / `TYPE <key>` / `TTL <key>`
- `SCAN 0 MATCH <pattern> COUNT 100`

## MySQL
- `SELECT * FROM <table> WHERE <id> = ? ORDER BY <ts> DESC LIMIT 20;`
- `SELECT ... FROM <table> WHERE <condition>;`

## Fill in later
- Scylla keyspace + tables: <...>
- Redis key patterns: <...>
- MySQL db + tables: <...>
