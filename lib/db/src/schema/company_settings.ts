import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

// Key-value store for company configuration
export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CompanySetting = typeof companySettingsTable.$inferSelect;
