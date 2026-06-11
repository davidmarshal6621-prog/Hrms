import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, payrollTable, employeesTable, attendanceTable, leavesTable, departmentsTable } from "@workspace/db";

const router: IRouter = Router();

function fmtPayroll(p: typeof payrollTable.$inferSelect, empName?: string | null, empCode?: string | null) {
  return {
    id: p.id, employeeId: p.employeeId,
    employeeName: empName ?? null, employeeCode: empCode ?? null,
    month: p.month, year: p.year,
    basicSalary: p.basicSalary, allowances: p.allowances,
    lateDeductions: p.lateDeductions, leaveDeductions: p.leaveDeductions,
    otherDeductions: p.otherDeductions, netSalary: p.netSalary,
    presentDays: p.presentDays, absentDays: p.absentDays, lateDays: p.lateDays,
    status: p.status, createdAt: p.createdAt.toISOString(),
  };
}

router.get("/payroll/summary", async (req, res): Promise<void> => {
  const { month, year } = req.query as { month?: string; year?: string };
  const now = new Date();
  const m = month ? parseInt(month, 10) : now.getMonth() + 1;
  const y = year ? parseInt(year, 10) : now.getFullYear();

  const records = await db.select().from(payrollTable)
    .where(and(eq(payrollTable.month, m), eq(payrollTable.year, y)));

  const employees = await db.select({ id: employeesTable.id, departmentId: employeesTable.departmentId }).from(employeesTable);
  const depts = await db.select().from(departmentsTable);
  const deptMap = new Map(depts.map(d => [d.id, d.name]));

  const deptSalaries = new Map<string, number>();
  for (const r of records) {
    const emp = employees.find(e => e.id === r.employeeId);
    const deptName = emp?.departmentId ? deptMap.get(emp.departmentId) ?? "Unknown" : "Unknown";
    deptSalaries.set(deptName, (deptSalaries.get(deptName) ?? 0) + r.netSalary);
  }

  res.json({
    month: m, year: y,
    totalEmployees: records.length,
    totalGross: records.reduce((sum, r) => sum + r.basicSalary + r.allowances, 0),
    totalDeductions: records.reduce((sum, r) => sum + r.lateDeductions + r.leaveDeductions + r.otherDeductions, 0),
    totalNet: records.reduce((sum, r) => sum + r.netSalary, 0),
    byDepartment: Array.from(deptSalaries.entries()).map(([department, totalNet]) => ({ department, totalNet })),
  });
});

router.get("/payroll", async (req, res): Promise<void> => {
  const { employeeId, month, year, status } = req.query as {
    employeeId?: string; month?: string; year?: string; status?: string;
  };

  let records = await db.select().from(payrollTable).orderBy(payrollTable.year, payrollTable.month);

  if (employeeId) records = records.filter(r => r.employeeId === parseInt(employeeId, 10));
  if (month) records = records.filter(r => r.month === parseInt(month, 10));
  if (year) records = records.filter(r => r.year === parseInt(year, 10));
  if (status) records = records.filter(r => r.status === status);

  const employees = await db.select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeCode: employeesTable.employeeCode }).from(employeesTable);
  const empMap = new Map(employees.map(e => [e.id, { name: `${e.firstName} ${e.lastName}`, code: e.employeeCode }]));

  res.json(records.map(r => {
    const emp = empMap.get(r.employeeId);
    return fmtPayroll(r, emp?.name, emp?.code);
  }));
});

router.post("/payroll", async (req, res): Promise<void> => {
  const { employeeId, month, year, basicSalary, allowances, otherDeductions } = req.body;
  if (!employeeId || !month || !year) {
    res.status(400).json({ error: "employeeId, month, year required" });
    return;
  }

  // Fetch employee data
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

  const base = basicSalary ?? emp.basicSalary ?? 0;
  const allw = allowances ?? emp.allowances ?? 0;
  const other = otherDeductions ?? 0;

  // Calculate attendance stats for the month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const attendance = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, employeeId)));
  const monthAtt = attendance.filter(a => a.date >= startDate && a.date <= endDate);

  const presentDays = monthAtt.filter(a => ["present", "late"].includes(a.status)).length;
  const absentDays = monthAtt.filter(a => a.status === "absent").length;
  const lateDays = monthAtt.filter(a => a.isLate).length;

  // Simple deduction: 1 day salary per absent, 0.5 per late
  const dailyRate = base / endDay;
  const lateDeductions = lateDays * dailyRate * 0.5;
  const leaveDeductions = absentDays * dailyRate;
  const netSalary = base + allw - lateDeductions - leaveDeductions - other;

  const [payroll] = await db.insert(payrollTable).values({
    employeeId, month, year,
    basicSalary: base, allowances: allw,
    lateDeductions: Math.round(lateDeductions * 100) / 100,
    leaveDeductions: Math.round(leaveDeductions * 100) / 100,
    otherDeductions: other,
    netSalary: Math.round(netSalary * 100) / 100,
    presentDays, absentDays, lateDays,
  }).returning();

  res.status(201).json(fmtPayroll(payroll, `${emp.firstName} ${emp.lastName}`, emp.employeeCode));
});

router.get("/payroll/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [record] = await db.select().from(payrollTable).where(eq(payrollTable.id, id));
  if (!record) { res.status(404).json({ error: "Payroll record not found" }); return; }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, record.employeeId));
  res.json(fmtPayroll(record, emp ? `${emp.firstName} ${emp.lastName}` : null, emp?.employeeCode ?? null));
});

router.patch("/payroll/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { allowances, otherDeductions, status } = req.body;
  const updates: Record<string, unknown> = {};
  if (allowances !== undefined) updates.allowances = allowances;
  if (otherDeductions !== undefined) updates.otherDeductions = otherDeductions;
  if (status !== undefined) updates.status = status;

  const [record] = await db.update(payrollTable).set(updates).where(eq(payrollTable.id, id)).returning();
  if (!record) { res.status(404).json({ error: "Payroll record not found" }); return; }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, record.employeeId));
  res.json(fmtPayroll(record, emp ? `${emp.firstName} ${emp.lastName}` : null, emp?.employeeCode ?? null));
});

router.delete("/payroll/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(payrollTable).where(eq(payrollTable.id, id));
  res.sendStatus(204);
});

export default router;
