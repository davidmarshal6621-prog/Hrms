---
name: EMS Oracle deployment
description: User-provided target environment and safe network exposure guidance for self-hosting EMS.
---

The user has an Oracle Cloud VM running Ubuntu with Docker, VS Code, and Ollama for running the cloned EMS project.

**Why:** This is the user's stated deployment environment and they can manage Oracle Cloud ingress rules.

**How to apply:** For temporary direct dev preview, use EMS 3000 and API 8080 but restrict source IP. For production, recommend only public 80/443 via reverse proxy; keep PostgreSQL 5432 and Ollama 11434 private.
