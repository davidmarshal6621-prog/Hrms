---
name: EMS device and shift operations
description: Product rules for ZKTeco clock/user management, attendance date ranges, and one-day custom shift assignments.
---

- Admins explicitly enter the date and time to set on a ZKTeco machine; never silently substitute the API server time.
- Adding a machine user links its machine ID to one selected EMS employee. Never overwrite an existing machine ID or employee mapping silently. Fingerprint/face enrollment is performed on the terminal, not by this API.
- Attendance should be browsable across an inclusive start/end date range.
- HR/Admin can assign selected employees custom start and end times for one chosen date; this does not replace their regular schedule.

**Why:** The user specified these workflows and confirmed that shift overrides apply to selected employees with custom start and end times.

**How to apply:** Keep device operations explicit and tenant-scoped. Preserve employee mappings and make one-day overrides independent of weekly schedules.