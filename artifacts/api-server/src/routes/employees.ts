import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, employeesTable, departmentsTable, branchesTable, shiftsTable } from "@workspace/db";
import { getProvisioningDefaults } from "../lib/employee-provisioning.js";

const router: IRouter = Router();

async function enrichEmployee(emp: typeof employeesTable.$inferSelect) {
  const [dept] = emp.departmentId
    ? await db.select({ name: departmentsTable.name }).from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId))
    : [];
  const [branch] = emp.branchId
    ? await db.select({ name: branchesTable.name }).from(branchesTable).where(eq(branchesTable.id, emp.branchId))
    : [];
  const [shift] = emp.shiftId
    ? await db.select({ name: shiftsTable.name }).from(shiftsTable).where(eq(shiftsTable.id, emp.shiftId))
    : [];

  return {
    id: emp.id, employeeCode: emp.employeeCode,
    firstName: emp.firstName, lastName: emp.lastName,
    email: emp.email, phone: emp.phone, cnic: emp.cnic,
    designation: emp.designation,
    departmentId: emp.departmentId, departmentName: dept?.name ?? null,
    branchId: emp.branchId, branchName: branch?.name ?? null,
    shiftId: emp.shiftId, shiftName: shift?.name ?? null,
    dateOfJoining: emp.dateOfJoining,
    basicSalary: emp.basicSalary, allowances: emp.allowances,
    enrollNumber: emp.enrollNumber, status: emp.status,
    address: emp.address, fatherName: emp.fatherName,
    emergencyContact: emp.emergencyContact, bloodGroup: emp.bloodGroup,
    dateOfBirth: emp.dateOfBirth, gender: emp.gender,
    religion: emp.religion, nationality: emp.nationality,
    cvData: emp.cvData ? (() => { try { return JSON.parse(emp.cvData!); } catch { return null; } })() : null,
    cvStatus: emp.cvStatus,
    profilePhoto: emp.profilePhoto,
    createdAt: emp.createdAt.toISOString(),
  };
}

router.get("/employees/stats", async (_req, res): Promise<void> => {
  const employees = await db.select().from(employeesTable);
  const depts = await db.select().from(departmentsTable);
  const branches = await db.select().from(branchesTable);

  const total = employees.length;
  const active = employees.filter(e => e.status === "active").length;
  const inactive = employees.filter(e => e.status === "inactive").length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const newThisMonth = employees.filter(e => e.dateOfJoining && e.dateOfJoining >= startOfMonth).length;

  const byDepartment = depts.map(d => ({
    name: d.name, count: employees.filter(e => e.departmentId === d.id).length,
  })).filter(d => d.count > 0);

  const byBranch = branches.map(b => ({
    name: b.name, count: employees.filter(e => e.branchId === b.id).length,
  })).filter(b => b.count > 0);

  res.json({ total, active, inactive, newThisMonth, byDepartment, byBranch });
});

router.get("/employees", async (req, res): Promise<void> => {
  const { departmentId, branchId, status, search } = req.query as {
    departmentId?: string; branchId?: string; status?: string; search?: string;
  };

  let employees = await db.select().from(employeesTable).orderBy(employeesTable.firstName);

  if (departmentId) employees = employees.filter(e => e.departmentId === parseInt(departmentId, 10));
  if (branchId) employees = employees.filter(e => e.branchId === parseInt(branchId, 10));
  if (status) employees = employees.filter(e => e.status === status);
  if (search) {
    const s = search.toLowerCase();
    employees = employees.filter(e =>
      e.firstName.toLowerCase().includes(s) ||
      e.lastName.toLowerCase().includes(s) ||
      e.employeeCode.toLowerCase().includes(s) ||
      (e.email?.toLowerCase().includes(s) ?? false) ||
      (e.cnic?.toLowerCase().includes(s) ?? false)
    );
  }

  const depts = await db.select().from(departmentsTable);
  const branchRows = await db.select().from(branchesTable);
  const shiftRows = await db.select().from(shiftsTable);

  const deptMap = new Map(depts.map(d => [d.id, d.name]));
  const branchMap = new Map(branchRows.map(b => [b.id, b.name]));
  const shiftMap = new Map(shiftRows.map(s => [s.id, s.name]));

  const result = employees.map(emp => ({
    id: emp.id, employeeCode: emp.employeeCode,
    firstName: emp.firstName, lastName: emp.lastName,
    email: emp.email, phone: emp.phone, cnic: emp.cnic,
    designation: emp.designation,
    departmentId: emp.departmentId, departmentName: emp.departmentId ? deptMap.get(emp.departmentId) ?? null : null,
    branchId: emp.branchId, branchName: emp.branchId ? branchMap.get(emp.branchId) ?? null : null,
    shiftId: emp.shiftId, shiftName: emp.shiftId ? shiftMap.get(emp.shiftId) ?? null : null,
    dateOfJoining: emp.dateOfJoining,
    basicSalary: emp.basicSalary, allowances: emp.allowances,
    enrollNumber: emp.enrollNumber, status: emp.status,
    address: emp.address, fatherName: emp.fatherName,
    emergencyContact: emp.emergencyContact, bloodGroup: emp.bloodGroup,
    dateOfBirth: emp.dateOfBirth, gender: emp.gender,
    religion: emp.religion, nationality: emp.nationality,
    cvData: emp.cvData ? (() => { try { return JSON.parse(emp.cvData!); } catch { return null; } })() : null,
    cvStatus: emp.cvStatus, profilePhoto: emp.profilePhoto,
    createdAt: emp.createdAt.toISOString(),
  }));

  res.json(result);
});

router.post("/employees", async (req, res): Promise<void> => {
  const {
    firstName, lastName, employeeCode, email, phone, cnic, designation,
    departmentId, branchId, shiftId, dateOfJoining, basicSalary, allowances, enrollNumber,
    address, fatherName, emergencyContact, bloodGroup, dateOfBirth, gender, religion, nationality,
  } = req.body;

  if (!firstName || !lastName || !employeeCode) {
    res.status(400).json({ error: "firstName, lastName, employeeCode required" });
    return;
  }

  const defaults = await getProvisioningDefaults();
  const [emp] = await db.insert(employeesTable).values({
    firstName, lastName, employeeCode, email, phone, cnic, designation,
    departmentId: departmentId ?? defaults.departmentId, branchId: branchId ?? defaults.branchId,
    shiftId: shiftId ?? defaults.shiftId, dateOfJoining: dateOfJoining ?? null,
    basicSalary: basicSalary ?? defaults.salary, allowances: allowances ?? 0,
    enrollNumber: enrollNumber ?? null,
    address: address ?? null, fatherName: fatherName ?? null,
    emergencyContact: emergencyContact ?? null, bloodGroup: bloodGroup ?? null,
    dateOfBirth: dateOfBirth ?? null, gender: gender ?? null,
    religion: religion ?? null, nationality: nationality ?? null,
  }).returning();

  res.status(201).json(await enrichEmployee(emp));
});

router.get("/employees/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(await enrichEmployee(emp));
});

router.patch("/employees/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const fields = [
    "firstName", "lastName", "email", "phone", "cnic", "designation",
    "departmentId", "branchId", "shiftId", "dateOfJoining", "basicSalary", "allowances",
    "enrollNumber", "status",
    "address", "fatherName", "emergencyContact", "bloodGroup",
    "dateOfBirth", "gender", "religion", "nationality", "profilePhoto",
  ];

  const updates: Record<string, unknown> = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  // CV update with approval workflow
  if (req.body.cvData !== undefined) {
    updates.cvData = typeof req.body.cvData === "string"
      ? req.body.cvData
      : JSON.stringify(req.body.cvData);
    // If employee submitting own CV update, set to pending; if HR/admin, set to approved
    if (req.body.cvStatus !== undefined) {
      updates.cvStatus = req.body.cvStatus;
    } else {
      updates.cvStatus = "pending_approval";
    }
  }

  const [emp] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id)).returning();
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(await enrichEmployee(emp));
});

router.delete("/employees/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(employeesTable).where(eq(employeesTable.id, id));
  res.sendStatus(204);
});

export default router;
