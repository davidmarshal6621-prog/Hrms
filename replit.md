# Employee Management System (EMS)

A full-stack Employee Management System with ZKTeco biometric attendance integration, role-based access control, leave management, and payroll.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/ems run dev` — run the frontend (port 23782, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing key

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + JWT auth (`jsonwebtoken` + `bcryptjs`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Frontend: React 19 + Vite + wouter + shadcn/ui + @tanstack/react-query
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/` — generated React Query hooks & Zod schemas
- `lib/db/src/schema/` — Drizzle ORM schema files (users, employees, attendance, leaves, payroll, etc.)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — JWT auth middleware
- `artifacts/ems/src/` — React frontend
- `artifacts/ems/src/lib/auth.tsx` — Auth context + token management

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives codegen; all frontend hooks are generated from it
- **JWT in localStorage**: Token stored as `ems_token`, sent as `Authorization: Bearer`; `setAuthTokenGetter` wires it to every API call
- **ZKTeco ADMS webhook**: `POST /api/attendance/zkteco` parses `templateDataList` tab-separated lines from biometric devices; auto-detects late arrivals vs. shift start + grace period
- **Multi-level leave approval**: Leaves track `managerApprovalStatus` + `hrApprovalStatus` independently; status auto-resolves to `approved`/`rejected` when both are set
- **Payroll calculation**: Daily rate = basicSalary / workingDays; 0.5× deduction per late day, 1× per absent day

## Product

- **5 RBAC roles**: super_admin, admin, hr, manager, employee
- **Employee directory** with department/branch/shift assignment
- **Attendance tracking**: biometric punch via ZKTeco ADMS, web punch, manual entry; late/early-out detection
- **Leave management**: multi-level approval workflow (manager → HR), leave balance tracking
- **Payroll generation**: auto-calculates deductions from attendance; per-month reports
- **Dashboard**: real-time stats (present/absent/on-leave counts, pending approvals, monthly payroll)

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@company.com | Admin123! |
| HR | hr@company.com | Hr123! |
| Manager | usman@company.com | Usman123! |
| Employee | sara@company.com | Sara123! |

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm run typecheck:libs` after any `lib/*` schema change before checking leaf packages
- `bcrypt` requires native build approval; use `bcryptjs` instead (pure JS, no build needed)
- Orval-generated hooks: params go as first arg directly (e.g. `useListEmployees({ search })`), not wrapped in `{ query: {} }`; `{ enabled }` in query options requires full `UseQueryOptions` type — call hooks unconditionally and gate display instead

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
