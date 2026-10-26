import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

// Key-value store for company configuration
export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1),
  key: text("key").notNull(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => ({
  tenantKeyUnique: uniqueIndex("company_settings_tenant_key_unique").on(table.tenantId, table.key),
}));

export type CompanySetting = typeof companySettingsTable.$inferSelect;
