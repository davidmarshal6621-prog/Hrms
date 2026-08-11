import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db, usersTable, employeesTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { getProvisioningDefaults } from "../lib/employee-provisioning.js";

const router: IRouter = Router();

const EMPLOYEE_FIELDS = [
  "employeeCode", "firstName", "lastName", "email", "phone", "cnic",
  "designation", "departmentId", "branchId", "shiftId", "dateOfJoining",
  "basicSalary", "allowances", "enrollNumber", "status", "address",
  "fatherName", "emergencyContact", "bloodGroup", "dateOfBirth", "gender",
  "religion", "nationality", "profilePhoto",
] as const;

type EmployeeField = typeof EMPLOYEE_FIELDS[number];

function fmtUser(
  u: typeof usersTable.$inferSelect,
  employee?: typeof employeesTable.$inferSelect,
  includeTemp = false,
) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    employeeId: u.employeeId,
    ...(employee ? {
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      phone: employee.phone,
      cnic: employee.cnic,
      designation: employee.designation,
      departmentId: employee.departmentId,
      branchId: employee.branchId,
      shiftId: employee.shiftId,
      dateOfJoining: employee.dateOfJoining,
      basicSalary: employee.basicSalary,
      allowances: employee.allowances,
      enrollNumber: employee.enrollNumber,
      status: employee.status,
      address: employee.address,
      fatherName: employee.fatherName,
      emergencyContact: employee.emergencyContact,
      bloodGroup: employee.bloodGroup,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      religion: employee.religion,
      nationality: employee.nationality,
      profilePhoto: employee.profilePhoto,
    } : {}),
    ...(includeTemp && u.tempPassword ? { tempPassword: u.tempPassword } : {}),
    createdAt: u.createdAt.toISOString(),
  };
}

async function employeeMap() {
  const employees = await db.select().from(employeesTable);
  return new Map(employees.map(employee => [employee.id, employee]));
}

function employeeValues(body: Record<string, any>) {
  const values: Record<string, unknown> = {};
  for (const field of EMPLOYEE_FIELDS) {
    if (body[field] !== undefined) values[field] = body[field] === "" ? null : body[field];
  }
  return values;
}

async function ensureEmployeeForUser(body: Record<string, any>, employeeId?: number | null) {
  if (employeeId) {
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (!employee) return null;
    const updates = employeeValues(body);
    if (Object.keys(updates).length) {
      const [updated] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, employeeId)).returning();
      return updated;
    }
    return employee;
  }

  if (!body.employeeCode) return null;
  const defaults = await getProvisioningDefaults();
  const firstName = body.firstName || body.name?.trim().split(/\s+/)[0] || "Employee";
  const lastName = body.lastName || body.name?.trim().split(/\s+/).slice(1).join(" ") || "User";
  const values = {
    employeeCode: body.employeeCode,
    firstName,
    lastName,
    departmentId: body.departmentId ?? defaults.departmentId,
    branchId: body.branchId ?? defaults.branchId,
    shiftId: body.shiftId ?? defaults.shiftId,
    designation: body.designation || defaults.designation,
    basicSalary: body.basicSalary ?? defaults.salary,
    status: body.status || "active",
    ...employeeValues(body),
  };
  const [employee] = await db.insert(employeesTable).values(values).returning();
  return employee;
}

async function responseForUser(user: typeof usersTable.$inferSelect, includeTemp = true) {
  const employee = user.employeeId
    ? (await db.select().from(employeesTable).where(eq(employeesTable.id, user.employeeId)))[0]
    : undefined;
  return fmtUser(user, employee, includeTemp);
}

router.get("/users", async (req, res): Promise<void> => {
  const { role, search } = req.query as { role?: string; search?: string };
  let users = await db.select().from(usersTable);
  if (role) users = users.filter(u => u.role === role);
  const employees = await employeeMap();
  if (search) {
    const s = search.toLowerCase();
    users = users.filter(u => {
      const employee = u.employeeId ? employees.get(u.employeeId) : undefined;
      return u.name.toLowerCase().includes(s)
        || u.email.toLowerCase().includes(s)
        || (employee?.employeeCode.toLowerCase().includes(s) ?? false)
        || (employee?.designation?.toLowerCase().includes(s) ?? false);
    });
  }
  res.json(users.map(u => fmtUser(u, u.employeeId ? employees.get(u.employeeId) : undefined, true)));
});

router.post("/users", async (req, res): Promise<void> => {
  const body = req.body as Record<string, any>;
  const { email, password, name, role } = body;
  if (!email || !password || !name || !role) {
    res.status(400).json({ error: "email, password, name, role required" });
    return;
  }

  const employee = await ensureEmployeeForUser(body);
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash,
    tempPassword: password,
    name,
    role,
    employeeId: employee?.id ?? body.employeeId ?? null,
  }).returning();

  res.status(201).json(fmtUser(user, employee ?? undefined, true));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(await responseForUser(user));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const body = req.body as Record<string, any>;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  const updates: Record<string, unknown> = {};
  for (const field of ["email", "name", "role", "isActive", "employeeId"] as const) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  if (body.password) {
    updates.passwordHash = await bcrypt.hash(body.password, 10);
    updates.tempPassword = body.password;
  }

  let employeeId = existing.employeeId;
  const employeePayload = employeeValues(body);
  if (Object.keys(employeePayload).length || body.employeeCode) {
    const employee = await ensureEmployeeForUser(body, existing.employeeId);
    if (employee) {
      employeeId = employee.id;
      updates.employeeId = employee.id;
    }
  } else if (body.employeeId !== undefined) {
    employeeId = body.employeeId;
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(await responseForUser(user));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

export default router;