---
name: bcryptjs vs bcrypt
description: Use bcryptjs (pure JS) to avoid native build approval in Replit
---

Use `bcryptjs` instead of `bcrypt` in Replit.

**Why:** `bcrypt` requires native binary compilation. In Replit, `pnpm approve-builds` is interactive and cannot be scripted. `bcryptjs` is a pure-JS drop-in replacement with identical API.

**How to apply:** Always install `bcryptjs` + `@types/bcryptjs`; never `bcrypt`.
