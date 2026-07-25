import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Stores every raw punch event from ZKTeco devices (multiple punches per day per employee)
export const punchLogsTable = pgTable("punch_logs", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),           // null if enroll number not matched yet
  enrollNumber: text("enroll_number").notNull(), // device user ID
  deviceId: integer("device_id"),
  deviceName: text("device_name"),
  punchTime: timestamp("punch_time", { withTimezone: true }).notNull(),
  verifyType: text("verify_type").notNull().default("unknown"), // fingerprint|card|face|password|unknown
  punchDirection: text("punch_direction").notNull().default("in"), // in|out|break-in|break-out|other
  rawPunch: integer("raw_punch"),    // original punch code from device
  rawVerify: integer("raw_verify"),  // original verify code from device
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPunchLogSchema = createInsertSchema(punchLogsTable).omit({ id: true, createdAt: true });
export type InsertPunchLog = z.infer<typeof insertPunchLogSchema>;
export type PunchLog = typeof punchLogsTable.$inferSelect;
