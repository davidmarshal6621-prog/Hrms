---
name: EMS company isolation
description: Product rule for how company signup, data access, and biometric devices are separated in EMS.
---

Every new signup creates an admin account for a separate company workspace. A company must only see and manage its own employee, attendance, payroll, settings, and ZKTeco device data; enforce this on the server and in database access, not only in the interface.

**Why:** The user explicitly requires separate dashboards and says company data must never be mixed.

**How to apply:** Preserve tenant scoping on every protected read and write, including imports, device operations, and reports. Keep existing records grouped in the legacy company workspace when changing tenant behavior.