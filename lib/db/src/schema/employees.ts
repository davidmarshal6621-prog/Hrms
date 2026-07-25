import { pgTable, text, serial, timestamp, integer, real, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: text("employee_code").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  cnic: text("cnic"),
  designation: text("designation"),
  departmentId: integer("department_id"),
  branchId: integer("branch_id"),
  shiftId: integer("shift_id"),
  dateOfJoining: date("date_of_joining", { mode: "string" }),
  basicSalary: real("basic_salary"),
  allowances: real("allowances").default(0),
  enrollNumber: text("enroll_number"),  // ZKTeco device enroll number
  status: text("status").notNull().default("active"), // active | inactive
  // Extended personal details
  address: text("address"),
  fatherName: text("father_name"),
  emergencyContact: text("emergency_contact"),
  bloodGroup: text("blood_group"),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  gender: text("gender"),   // male|female|other
  religion: text("religion"),
  nationality: text("nationality"),
  // CV / Profile info (JSON stringified)
  cvData: text("cv_data"),   // JSON: { education, experience, skills, certifications }
  cvStatus: text("cv_status").default("none"), // none|pending_approval|approved
  profilePhoto: text("profile_photo"), // URL or base64
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
