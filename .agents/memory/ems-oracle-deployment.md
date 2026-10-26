---
name: EMS Oracle deployment
description: User-provided target environment and safe network exposure guidance for self-hosting EMS.
---

The user has an Oracle Cloud VM running Ubuntu with Docker, VS Code, and Ollama for running the cloned EMS project.

**Why:** This is the user's stated deployment environment and they can manage Oracle Cloud ingress rules.

**How to apply:** The user's current host dev listeners are Vite on 3000 and the API on 3001; code-server uses 8080. Restrict these to the user's IP. The Docker Compose deployment publishes only web port 3000 and keeps the API/database internal; keep Ollama 11434 private. For production, use public 80/443 through a reverse proxy.

The VM reports `aarch64` (ARM64). The workspace excludes many optional native binaries, so keep the Linux ARM64 binaries required by the Vite build available in the lockfile and verify deployment on the VM before claiming its image build works.

**Why:** Docker builds default to the VM's architecture, and native esbuild, Rollup, Lightning CSS, or Tailwind binaries missing from the lockfile can break the frontend build.

**How to apply:** Check the target architecture before editing deployment configuration; do not assume the Replit x86_64 build proves the Oracle ARM64 image works.

On 2026-10-26, the user ran commands that flushed iptables filter/NAT/mangle chains, set INPUT/FORWARD/OUTPUT to ACCEPT, and saved those rules with netfilter-persistent.

**Why:** This removes host firewall restrictions, may remove Docker-managed NAT rules, and persists an allow-all policy; Oracle Cloud ingress is a separate layer.

**How to apply:** Before recommending firewall restarts or reboots, verify current UFW/iptables state and secure the Oracle ingress rules. Do not assume the host firewall protects the VM.
