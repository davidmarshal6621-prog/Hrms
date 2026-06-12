---
name: pyzk ZKTeco integration
description: How pyzk is installed and called from the Node.js API server
---
## Setup
- pip3 not available in Replit; use `python3 -m pip install pyzk`
- pyzk 0.9 installed system-wide alongside `future` dependency

## Script
- Location: `artifacts/api-server/zk_sync.py` (same dir as built dist/)
- Called from Express via `child_process.execFileAsync("python3", [scriptPath, ip, port])`
- `scriptPath = path.resolve(process.cwd(), "zk_sync.py")` — cwd is `artifacts/api-server/` at runtime

**Why:** esbuild bundles JS only; Python script must live outside the bundle at a known path relative to cwd.

## Duplicate handling
- Check-in: skip if existing check-in within 10 minutes of incoming timestamp
- Check-out: only update if new time is later than existing check-out
- Records with no matching `enrollNumber` in employees table are counted as skipped
