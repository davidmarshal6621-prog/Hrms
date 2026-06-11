import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, leavesTable, leaveTypesTable, employeesTable } from "@workspace/db";

const router: IRouter = Router();

function fmtLeave(l: typeof leavesTable.$inferSelect, empName?: string | null, typeName?: string | null) {
  return {
    id: l.id, employeeId: l.employeeId,
    employeeName: empName ?? null,
    leaveTypeId: l.leaveTypeId, leaveTypeName: typeName ?? null,
    startDate: l.startDate, endDate: l.endDate, totalDays: l.totalDays,
    reason: l.reason, status: l.status,
    managerApprovalStatus: l.managerApprovalStatus,
    hrApprovalStatus: l.hrApprovalStatus,
    managerNote: l.managerNote, hrNote: l.hrNote,
    createdAt: l.createdAt.toISOString(),
  };
}

function calcDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
}

router.get("/leave-types", async (_req, res): Promise<void> => {
  const types = await db.select().from(leaveTypesTable).orderBy(leaveTypesTable.name);
  res.json(types.map(t => ({
    id: t.id, name: t.name, maxDaysPerYear: t.maxDaysPerYear,
    isPaid: t.isPaid, description: t.description,
    createdAt: t.createdAt.toISOString(),
  })));
});

router.post("/leave-types", async (req, res): Promise<void> => {
  const { name, maxDaysPerYear, isPaid, description } = req.body;
  if (!name || !maxDaysPerYear) {
    res.status(400).json({ error: "name and maxDaysPerYear required" });
    return;
  }

  const [lt] = await db.insert(leaveTypesTable).values({
    name, maxDaysPerYear, isPaid: isPaid ?? true, description,
  }).returning();

  res.status(201).json({
    id: lt.id, name: lt.name, maxDaysPerYear: lt.maxDaysPerYear,
    isPaid: lt.isPaid, description: lt.description,
    createdAt: lt.createdAt.toISOString(),
  });
});

router.patch("/leave-types/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { name, maxDaysPerYear, isPaid, description } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (maxDaysPerYear !== undefined) updates.maxDaysPerYear = maxDaysPerYear;
  if (isPaid !== undefined) updates.isPaid = isPaid;
  if (description !== undefined) updates.description = description;

  const [lt] = await db.update(leaveTypesTable).set(updates).where(eq(leaveTypesTable.id, id)).returning();
  if (!lt) { res.status(404).json({ error: "Leave type not found" }); return; }

  res.json({
    id: lt.id, name: lt.name, maxDaysPerYear: lt.maxDaysPerYear,
    isPaid: lt.isPaid, description: lt.description,
    createdAt: lt.createdAt.toISOString(),
  });
});

router.get("/leaves/balance", async (req, res): Promise<void> => {
  const { employeeId, year } = req.query as { employeeId?: string; year?: string };
  if (!employeeId) {
    res.status(400).json({ error: "employeeId required" });
    return;
  }

  const eid = parseInt(employeeId, 10);
  const y = year ? parseInt(year, 10) : new Date().getFullYear();
  const startDate = `${y}-01-01`;
  const endDate = `${y}-12-31`;

  const types = await db.select().from(leaveTypesTable);
  const leaves = await db.select().from(leavesTable)
    .where(and(
      eq(leavesTable.employeeId, eid),
      eq(leavesTable.status, "approved"),
      gte(leavesTable.startDate, startDate),
      lte(leavesTable.endDate, endDate),
    ));

  const balance = types.map(t => {
    const used = leaves.filter(l => l.leaveTypeId === t.id).reduce((sum, l) => sum + l.totalDays, 0);
    return {
      leaveTypeId: t.id,
      leaveTypeName: t.name,
      totalAllowed: t.maxDaysPerYear,
      used,
      remaining: Math.max(0, t.maxDaysPerYear - used),
    };
  });

  res.json(balance);
});

router.get("/leaves", async (req, res): Promise<void> => {
  const { employeeId, status, leaveTypeId } = req.query as {
    employeeId?: string; status?: string; leaveTypeId?: string;
  };

  let leaves = await db.select().from(leavesTable).orderBy(leavesTable.createdAt);

  if (employeeId) leaves = leaves.filter(l => l.employeeId === parseInt(employeeId, 10));
  if (status) leaves = leaves.filter(l => l.status === status);
  if (leaveTypeId) leaves = leaves.filter(l => l.leaveTypeId === parseInt(leaveTypeId, 10));

  const employees = await db.select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable);
  const empMap = new Map(employees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));

  const types = await db.select().from(leaveTypesTable);
  const typeMap = new Map(types.map(t => [t.id, t.name]));

  res.json(leaves.map(l => fmtLeave(l, empMap.get(l.employeeId) ?? null, typeMap.get(l.leaveTypeId) ?? null)));
});

router.post("/leaves", async (req, res): Promise<void> => {
  const { employeeId, leaveTypeId, startDate, endDate, reason } = req.body;
  if (!leaveTypeId || !startDate || !endDate) {
    res.status(400).json({ error: "leaveTypeId, startDate, endDate required" });
    return;
  }

  const totalDays = calcDays(startDate, endDate);

  const [leave] = await db.insert(leavesTable).values({
    employeeId: employeeId ?? 1,
    leaveTypeId, startDate, endDate, totalDays,
    reason, status: "pending",
    managerApprovalStatus: "pending", hrApprovalStatus: "pending",
  }).returning();

  const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, leaveTypeId));

  res.status(201).json(fmtLeave(leave, null, lt?.name ?? null));
});

router.get("/leaves/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [leave] = await db.select().from(leavesTable).where(eq(leavesTable.id, id));
  if (!leave) { res.status(404).json({ error: "Leave not found" }); return; }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, leave.employeeId));
  const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, leave.leaveTypeId));

  res.json(fmtLeave(leave, emp ? `${emp.firstName} ${emp.lastName}` : null, lt?.name ?? null));
});

router.patch("/leaves/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { status, managerApprovalStatus, hrApprovalStatus, managerNote, hrNote, reason } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (managerApprovalStatus !== undefined) updates.managerApprovalStatus = managerApprovalStatus;
  if (hrApprovalStatus !== undefined) updates.hrApprovalStatus = hrApprovalStatus;
  if (managerNote !== undefined) updates.managerNote = managerNote;
  if (hrNote !== undefined) updates.hrNote = hrNote;
  if (reason !== undefined) updates.reason = reason;

  // Auto-update overall status based on approvals
  if (managerApprovalStatus === "approved" && hrApprovalStatus === "approved") {
    updates.status = "approved";
  } else if (managerApprovalStatus === "rejected" || hrApprovalStatus === "rejected") {
    updates.status = "rejected";
  }

  const [leave] = await db.update(leavesTable).set(updates).where(eq(leavesTable.id, id)).returning();
  if (!leave) { res.status(404).json({ error: "Leave not found" }); return; }
  res.json(fmtLeave(leave));
});

router.delete("/leaves/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(leavesTable).where(eq(leavesTable.id, id));
  res.sendStatus(204);
});

export default router;
