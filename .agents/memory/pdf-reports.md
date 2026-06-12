---
name: PDF and CSV report generation
description: How payslip PDF and attendance CSV are generated server-side
---
## Stack
- `pdfkit` npm package for payslip PDF (programmatic layout, no HTML)
- Plain string CSV for attendance (no extra package needed)
- Both streamed via `res.pipe()` / `res.end()` with appropriate Content-Disposition headers

## Endpoints
- `GET /api/reports/payslip-pdf?employeeId=&month=&year=` → PDF download
- `GET /api/reports/attendance-csv?employeeId=&month=&year=` → CSV download
- `GET /api/reports/payslip-check?employeeId=&month=&year=` → JSON availability check

**Why:** Server-side generation keeps salary data from being exposed in client-side bundle logic.
