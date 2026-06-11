---
name: Orval hook call signatures
description: How to correctly call Orval-generated React Query hooks in this project
---

Orval-generated hooks take params as the FIRST argument directly (not wrapped in `{ query: {} }`):

```ts
// CORRECT
useListEmployees({ search, departmentId })
useListAttendance({ date, employeeId })
useGetPayrollSummary({ month, year })

// WRONG - the design subagent made this mistake
useListEmployees({ query: { search } })
```

For hooks with only options (no params): `useGetDashboardStats(options?)`

For conditional fetching (`enabled`): DO NOT pass `{ query: { enabled } }` — the `UseQueryOptions` type requires `queryKey` too, causing TS errors. Instead, call hooks unconditionally and gate display logic:

```ts
const { data } = useGetDashboardStats(); // always call
if (isAdmin && data) { /* show data */ }
```

**Why:** TanStack Query v5 makes `queryKey` required in `UseQueryOptions`. Orval generates hooks where the queryKey is computed internally — passing `enabled` alone fails the type check.
