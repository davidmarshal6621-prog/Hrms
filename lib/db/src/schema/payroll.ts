import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const payrollTable = pgTable("payroll", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  basicSalary: real("basic_salary").notNull().default(0),
  allowances: real("allowances").notNull().default(0),
  lateDeductions: real("late_deductions").notNull().default(0),
  leaveDeductions: real("leave_deductions").notNull().default(0),
  otherDeductions: real("other_deductions").notNull().default(0),
  netSalary: real("net_salary").notNull().default(0),
  presentDays: integer("present_days").notNull().default(0),
  absentDays: integer("absent_days").notNull().default(0),
  lateDays: integer("late_days").notNull().default(0),
  status: text("status").notNull().default("draft"), // draft | approved | paid
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPayrollSchema = createInsertSchema(payrollTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payrollTable.$inferSelect;
