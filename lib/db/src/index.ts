import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const baseDb = drizzle(pool, { schema });

const tenantContext = new AsyncLocalStorage<number>();

export function runWithTenantId<T>(tenantId: number, callback: () => T): T {
  return tenantContext.run(tenantId, callback);
}

type TenantTable = { tenantId?: Parameters<typeof eq>[0] };
type QueryKind = "select" | "insert" | "update" | "delete";
type ScopeState = { pendingWhere?: SQL; installedWhere: boolean };

function getTenantColumn(table: unknown) {
  if (!table || typeof table !== "object") return undefined;
  const column = (table as TenantTable).tenantId;
  return column && typeof column === "object" ? column : undefined;
}

function withTenantValues(values: unknown, tenantId: number): unknown {
  const apply = (row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    return { ...(row as Record<string, unknown>), tenantId };
  };
  return Array.isArray(values) ? values.map(apply) : apply(values);
}

function scopedBuilder(
  builder: any,
  table: unknown,
  kind: QueryKind,
  tenantId: number | undefined,
  state: ScopeState = { installedWhere: false },
): any {
  const tenantColumn = getTenantColumn(table);
  const awaitingSelectTable = kind === "select" && table === undefined;
  if (tenantId === undefined || (!tenantColumn && !awaitingSelectTable)) return builder;

  let proxy: any;

  const withScope = () => {
    if (!tenantColumn || kind === "insert") return builder;
    if (state.installedWhere) return builder;
    const tenantCondition = eq(tenantColumn as never, tenantId);
    const condition = state.pendingWhere ? and(state.pendingWhere, tenantCondition) : tenantCondition;
    state.installedWhere = true;
    return builder.where(condition);
  };

  proxy = new Proxy(builder, {
    get(target, property) {
      if (property === "where" && kind !== "insert") {
        return (condition?: SQL) => {
          if (condition) state.pendingWhere = state.pendingWhere ? and(state.pendingWhere, condition) : condition;
          return proxy;
        };
      }
      if (property === "values" && kind === "insert") {
        return (values: unknown) => {
          const result = target.values(withTenantValues(values, tenantId));
          return scopedBuilder(result, table, kind, tenantId, state);
        };
      }
      if (property === "set" && kind === "update") {
        return (values: Record<string, unknown>) => {
          const result = target.set({ ...values, tenantId });
          return scopedBuilder(result, table, kind, tenantId, state);
        };
      }
      if (property === "then") {
        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(withScope()).then(onFulfilled, onRejected);
      }
      if (property === "execute") {
        return (...args: unknown[]) => withScope().execute(...args);
      }

      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = value.apply(target, args);
        if (kind === "select" && property === "from") {
          return scopedBuilder(result, args[0], kind, tenantId, state);
        }
        if (result === target) return proxy;
        if (result && (typeof result === "object" || typeof result === "function")) {
          return scopedBuilder(result, table, kind, tenantId, state);
        }
        return result;
      };
    },
  });
  return proxy;
}

export const db = new Proxy(baseDb, {
  get(target, property) {
    const tenantId = tenantContext.getStore();
    if (property === "select" || property === "selectDistinct" || property === "selectDistinctOn") {
      const method = Reflect.get(target, property, target);
      if (typeof method !== "function") return method;
      return (...args: unknown[]) => scopedBuilder(method.apply(target, args), undefined, "select", tenantId);
    }
    if (property === "insert" || property === "update" || property === "delete") {
      const method = Reflect.get(target, property, target) as (...args: any[]) => any;
      if (typeof method !== "function") return method;
      return (table: unknown, ...args: unknown[]) =>
        scopedBuilder(method.call(target, table, ...args), table, property as QueryKind, tenantId);
    }

    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as typeof baseDb;

export * from "./schema";
