import { pgTable, text, serial, timestamp, integer, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leaveTypesTable = pgTable("leave_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  maxDaysPerYear: integer("max_days_per_year").notNull().default(10),
  isPaid: boolean("is_paid").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const leavesTable = pgTable("leaves", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  leaveTypeId: integer("leave_type_id").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  totalDays: integer("total_days").notNull().default(1),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | cancelled
  managerApprovalStatus: text("manager_approval_status").default("pending"), // pending | approved | rejected
  hrApprovalStatus: text("hr_approval_status").default("pending"),
  managerNote: text("manager_note"),
  hrNote: text("hr_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeaveTypeSchema = createInsertSchema(leaveTypesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeaveType = z.infer<typeof insertLeaveTypeSchema>;
export type LeaveType = typeof leaveTypesTable.$inferSelect;

export const insertLeaveSchema = createInsertSchema(leavesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeave = z.infer<typeof insertLeaveSchema>;
export type Leave = typeof leavesTable.$inferSelect;
