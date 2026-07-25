import { pgTable, text, serial, timestamp, integer, real, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  checkIn: timestamp("check_in", { withTimezone: true }),
  checkOut: timestamp("check_out", { withTimezone: true }),
  workingHours: real("working_hours"),
  status: text("status").notNull().default("present"), // present|absent|late|on-leave|half-day
  isLate: boolean("is_late").notNull().default(false),
  isEarlyOut: boolean("is_early_out").notNull().default(false),
  source: text("source").notNull().default("manual"), // manual|biometric|web
  notes: text("notes"),
  // Device & verify type tracking
  checkInDeviceId: integer("check_in_device_id"),
  checkInDeviceName: text("check_in_device_name"),
  checkOutDeviceId: integer("check_out_device_id"),
  checkOutDeviceName: text("check_out_device_name"),
  checkInVerifyType: text("check_in_verify_type"),   // fingerprint|card|face|password
  checkOutVerifyType: text("check_out_verify_type"),
  // HR correction tracking
  isManuallyEdited: boolean("is_manually_edited").notNull().default(false),
  correctionNote: text("correction_note"),
  correctedBy: text("corrected_by"), // name of HR/admin who made correction
  correctedAt: timestamp("corrected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;
