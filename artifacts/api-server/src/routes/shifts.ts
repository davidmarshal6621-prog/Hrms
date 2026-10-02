import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, attendanceTable, employeeShiftAssignmentsTable, employeesTable, shiftsTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();
const ADMIN_HR_ROLES = new Set(["super_admin", "admin", "hr"]);

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function requireAdminOrHr(req: AuthRequest, res: Parameters<Parameters<typeof router.post>[1]>[1]): boolean {
  if (!ADMIN_HR_ROLES.has(req.user?.role ?? "")) {
    res.status(403).json({ error: "Only Admin or HR can manage one-day shift overrides" });
    return false;
  }
  return true;
}

function fmt(s: typeof shiftsTable.$inferSelect) {
  return {
    id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime,
    gracePeriodMinutes: s.gracePeriodMinutes, workingHours: s.workingHours,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/shifts", async (_req, res): Promise<void> => {
  const shifts = await db.select().from(shiftsTable).orderBy(shiftsTable.name);
  res.json(shifts.map(fmt));
});

router.post("/shifts/day-overrides", async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdminOrHr(req, res)) return;
  const { date, employeeIds, startTime, endTime } = req.body as {
    date?: string;
    employeeIds?: number[];
    startTime?: string;
    endTime?: string;
  };
  const selectedIds = Array.isArray(employeeIds)
    ? [...new Set(employeeIds.filter(id => Number.isInteger(id) && id > 0))]
    : [];
  if (!isIsoDate(date)) { res.status(400).json({ error: "A valid date is required" }); return; }
  if (selectedIds.length === 0 || selectedIds.length > 200) {
    res.status(400).json({ error: "Select between 1 and 200 employees" });
    return;
  }
  if (!isTime(startTime) || !isTime(endTime) || startTime === endTime) {
    res.status(400).json({ error: "Enter different, valid start and end times" });
    return;
  }

  const employees = await db.select({ id: employeesTable.id }).from(employeesTable)
    .where(inArray(employeesTable.id, selectedIds));
  if (employees.length !== selectedIds.length) {
    res.status(404).json({ error: "One or more selected employees were not found in this company" });
    return;
  }

  const employeeIdList = employees.map(employee => employee.id);
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  await db.transaction(async tx => {
    await tx.insert(employeeShiftAssignmentsTable).values(employeeIdList.map(employeeId => ({
      employeeId,
      assignmentDate: date,
      shiftId: null,
      customStartTime: startTime,
      customEndTime: endTime,
    }))).onConflictDoUpdate({
      target: [
        employeeShiftAssignmentsTable.tenantId,
        employeeShiftAssignmentsTable.employeeId,
        employeeShiftAssignmentsTable.assignmentDate,
      ],
      set: {
        shiftId: null,
        customStartTime: startTime,
        customEndTime: endTime,
        updatedAt: new Date(),
      },
    });

    const existingAttendance = await tx.select().from(attendanceTable).where(and(
      inArray(attendanceTable.employeeId, employeeIdList),
      eq(attendanceTable.date, date),
    ));
    for (const record of existingAttendance) {
      if (record.isManuallyEdited) continue;
      let isLate = false;
      let isEarlyOut = false;
      if (record.checkIn) {
        const cutoff = new Date(record.checkIn);
        cutoff.setHours(startHour, startMinute + 15, 0, 0);
        isLate = record.checkIn > cutoff;
      }
      if (record.checkOut) {
        const cutoff = new Date(record.checkOut);
        cutoff.setHours(endHour, endMinute, 0, 0);
        isEarlyOut = record.checkOut < cutoff;
      }
      const status = ["present", "late"].includes(record.status)
        ? isLate ? "late" : "present"
        : record.status;
      await tx.update(attendanceTable)
        .set({ isLate, isEarlyOut, status })
        .where(eq(attendanceTable.id, record.id));
    }
  });

  res.json({
    success: true,
    date,
    employeeCount: employeeIdList.length,
    startTime,
    endTime,
  });
});

router.post("/shifts", async (req, res): Promise<void> => {
  const { name, startTime, endTime, gracePeriodMinutes } = req.body;
  if (!name || !startTime || !endTime) {
    res.status(400).json({ error: "name, startTime, endTime required" });
    return;
  }

  // Calculate working hours
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let workingHours = (eh * 60 + em - sh * 60 - sm) / 60;
  if (workingHours < 0) workingHours += 24;

  const [shift] = await db.insert(shiftsTable).values({
    name, startTime, endTime,
    gracePeriodMinutes: gracePeriodMinutes ?? 15,
    workingHours,
  }).returning();
  res.status(201).json(fmt(shift));
});

router.patch("/shifts/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { name, startTime, endTime, gracePeriodMinutes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime !== undefined) updates.endTime = endTime;
  if (gracePeriodMinutes !== undefined) updates.gracePeriodMinutes = gracePeriodMinutes;

  if (startTime && endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    let wh = (eh * 60 + em - sh * 60 - sm) / 60;
    if (wh < 0) wh += 24;
    updates.workingHours = wh;
  }

  const [shift] = await db.update(shiftsTable).set(updates).where(eq(shiftsTable.id, id)).returning();
  if (!shift) { res.status(404).json({ error: "Shift not found" }); return; }
  res.json(fmt(shift));
});

router.delete("/shifts/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(shiftsTable).where(eq(shiftsTable.id, id));
  res.sendStatus(204);
});

export default router;
