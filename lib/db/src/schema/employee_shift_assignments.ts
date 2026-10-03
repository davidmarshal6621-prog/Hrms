import { pgTable, serial, integer, date, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core";

export const employeeShiftAssignmentsTable = pgTable(
  "employee_shift_assignments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    employeeId: integer("employee_id").notNull(),
    assignmentDate: date("assignment_date", { mode: "string" }).notNull(),
    // null means off unless custom hours are present.
    shiftId: integer("shift_id"),
    customStartTime: text("custom_start_time"),
    customEndTime: text("custom_end_time"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  table => ({
    employeeDateUnique: uniqueIndex("employee_shift_assignments_employee_date_idx")
      .on(table.tenantId, table.employeeId, table.assignmentDate),
  }),
);

export type EmployeeShiftAssignment = typeof employeeShiftAssignmentsTable.$inferSelect;