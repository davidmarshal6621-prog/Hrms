import { eq, ilike, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  branchesTable,
  companySettingsTable,
  departmentsTable,
  employeesTable,
  shiftsTable,
  usersTable,
} from "@workspace/db";

export const DEFAULT_SETTINGS: Record<string, string> = {
  defaultShiftName: "Shift D",
  defaultDesignation: "Employee",
  defaultSalary: "0",
  defaultRole: "employee",
  defaultPasswordPrefix: "ZK",
  defaultDepartmentName: "General",
  defaultBranchName: "Main",
};

type DefaultReferenceIds = {
  shiftId: number;
  departmentId: number;
  branchId: number;
};

export async function ensureDefaultReferenceData(): Promise<DefaultReferenceIds> {
  let [shift] = await db.select().from(shiftsTable).where(ilike(shiftsTable.name, "Shift D"));
  if (!shift) {
    [shift] = await db.insert(shiftsTable).values({
      name: "Shift D",
      startTime: "09:00",
      endTime: "18:00",
      gracePeriodMinutes: 15,
      workingHours: 9,
    }).returning();
  }

  let [department] = await db.select().from(departmentsTable).where(ilike(departmentsTable.name, "General"));
  if (!department) {
    [department] = await db.insert(departmentsTable).values({ name: "General" }).returning();
  }

  let [branch] = await db.select().from(branchesTable).where(ilike(branchesTable.name, "Main"));
  if (!branch) {
    [branch] = await db.insert(branchesTable).values({
      name: "Main",
      address: "Company default branch",
      city: "Karachi",
    }).returning();
  }

  return { shiftId: shift.id, departmentId: department.id, branchId: branch.id };
}

export async function getProvisioningDefaults() {
  const refs = await ensureDefaultReferenceData();
  const rows = await db.select().from(companySettingsTable);
  const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) settings[row.key] = row.value;

  const configuredShiftId = Number(settings.defaultShiftId);
  const configuredDepartmentId = Number(settings.defaultDepartmentId);
  const configuredBranchId = Number(settings.defaultBranchId);

  return {
    shiftId: Number.isFinite(configuredShiftId) && configuredShiftId > 0 ? configuredShiftId : refs.shiftId,
    departmentId: Number.isFinite(configuredDepartmentId) && configuredDepartmentId > 0
      ? configuredDepartmentId : refs.departmentId,
    branchId: Number.isFinite(configuredBranchId) && configuredBranchId > 0 ? configuredBranchId : refs.branchId,
    designation: settings.defaultDesignation,
    salary: Number(settings.defaultSalary) || 0,
    role: settings.defaultRole || "employee",
    passwordPrefix: settings.defaultPasswordPrefix || "ZK",
  };
}

function splitName(name: string, enrollNumber: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || `User${enrollNumber}`,
    lastName: parts.slice(1).join(" ") || "Unknown",
  };
}

export async function provisionEmployeeAccount(input: {
  enrollNumber: string;
  name?: string;
  employeeCode?: string;
}) {
  const defaults = await getProvisioningDefaults();
  const enrollNumber = String(input.enrollNumber).trim();
  const employeeCode = input.employeeCode || `ZK${enrollNumber.padStart(4, "0")}`;
  const { firstName, lastName } = splitName(input.name || "", enrollNumber);

  let employeeCreated = false;
  let [employee] = await db.select().from(employeesTable).where(
    or(eq(employeesTable.enrollNumber, enrollNumber), eq(employeesTable.employeeCode, employeeCode)),
  );

  if (!employee) {
    [employee] = await db.insert(employeesTable).values({
      employeeCode,
      firstName,
      lastName,
      enrollNumber,
      status: "active",
      departmentId: defaults.departmentId,
      branchId: defaults.branchId,
      shiftId: defaults.shiftId,
      designation: defaults.designation,
      basicSalary: defaults.salary,
      allowances: 0,
    }).returning();
    employeeCreated = true;
  } else {
    const missingUpdates: Record<string, unknown> = {};
    if (!employee.enrollNumber) missingUpdates.enrollNumber = enrollNumber;
    if (!employee.departmentId) missingUpdates.departmentId = defaults.departmentId;
    if (!employee.branchId) missingUpdates.branchId = defaults.branchId;
    if (!employee.shiftId) missingUpdates.shiftId = defaults.shiftId;
    if (!employee.designation) missingUpdates.designation = defaults.designation;
    if (employee.basicSalary === null || employee.basicSalary === undefined) {
      missingUpdates.basicSalary = defaults.salary;
    }
    if (Object.keys(missingUpdates).length) {
      [employee] = await db.update(employeesTable)
        .set(missingUpdates)
        .where(eq(employeesTable.id, employee.id))
        .returning();
    }
  }

  const email = `${employeeCode.toLowerCase()}@company.local`;
  const password = `${defaults.passwordPrefix}${enrollNumber}!Pass`;
  let [account] = await db.select().from(usersTable).where(
    or(eq(usersTable.employeeId, employee.id), eq(usersTable.email, email)),
  );
  let userCreated = false;

  if (!account) {
    [account] = await db.insert(usersTable).values({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      tempPassword: password,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      role: defaults.role,
      employeeId: employee.id,
    }).returning();
    userCreated = true;
  } else if (!account.employeeId) {
    [account] = await db.update(usersTable).set({ employeeId: employee.id }).where(eq(usersTable.id, account.id)).returning();
  }

  return { employee, user: account, userCreated, employeeCreated };
}