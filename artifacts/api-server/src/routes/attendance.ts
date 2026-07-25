import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, attendanceTable, employeesTable, shiftsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

function fmtAtt(a: typeof attendanceTable.$inferSelect, empName?: string | null, empCode?: string | null) {
  return {
    id: a.id, employeeId: a.employeeId,
    employeeName: empName ?? null, employeeCode: empCode ?? null,
    date: a.date,
    checkIn: a.checkIn ? a.checkIn.toISOString() : null,
    checkOut: a.checkOut ? a.checkOut.toISOString() : null,
    workingHours: a.workingHours, status: a.status,
    isLate: a.isLate, isEarlyOut: a.isEarlyOut, source: a.source,
    notes: a.notes,
    checkInDeviceId: a.checkInDeviceId, checkInDeviceName: a.checkInDeviceName,
    checkOutDeviceId: a.checkOutDeviceId, checkOutDeviceName: a.checkOutDeviceName,
    checkInVerifyType: a.checkInVerifyType, checkOutVerifyType: a.checkOutVerifyType,
    isManuallyEdited: a.isManuallyEdited, correctionNote: a.correctionNote,
    correctedBy: a.correctedBy, correctedAt: a.correctedAt ? a.correctedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  };
}

function calcWorkingHours(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 3600000 * 100) / 100;
}

router.get("/attendance/summary", async (req, res): Promise<void> => {
  const { month, year, employeeId } = req.query as { month?: string; year?: string; employeeId?: string };
  const now = new Date();
  const m = month ? parseInt(month, 10) : now.getMonth() + 1;
  const y = year ? parseInt(year, 10) : now.getFullYear();

  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  let records = await db.select().from(attendanceTable)
    .where(and(gte(attendanceTable.date, startDate), lte(attendanceTable.date, endDate)));

  const filtered = employeeId ? records.filter(r => r.employeeId === parseInt(employeeId, 10)) : records;

  const totalDays = endDay;
  const presentDays = filtered.filter(r => ["present", "late"].includes(r.status)).length;
  const absentDays = filtered.filter(r => r.status === "absent").length;
  const lateDays = filtered.filter(r => r.isLate).length;
  const leaveDays = filtered.filter(r => r.status === "on-leave").length;
  const withHours = filtered.filter(r => r.workingHours);
  const avgHours = withHours.length > 0
    ? withHours.reduce((sum, r) => sum + (r.workingHours ?? 0), 0) / withHours.length
    : 0;

  res.json({
    totalDays, presentDays, absentDays, lateDays, leaveDays,
    averageWorkingHours: Math.round(avgHours * 100) / 100,
    attendanceRate: totalDays > 0 ? Math.round((presentDays / totalDays) * 10000) / 100 : 0,
  });
});

router.get("/attendance/today", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const records = await db.select().from(attendanceTable).where(eq(attendanceTable.date, today));

  const employees = await db.select({
    id: employeesTable.id, firstName: employeesTable.firstName,
    lastName: employeesTable.lastName, employeeCode: employeesTable.employeeCode,
  }).from(employeesTable);
  const empMap = new Map(employees.map(e => [e.id, { name: `${e.firstName} ${e.lastName}`, code: e.employeeCode }]));

  res.json(records.map(r => {
    const emp = empMap.get(r.employeeId);
    return fmtAtt(r, emp?.name, emp?.code);
  }));
});

router.post("/attendance/web-punch", async (req, res): Promise<void> => {
  const { punchType, employeeId } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const empId = employeeId || 1;

  const [existing] = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, empId), eq(attendanceTable.date, today)));

  let record;
  if (!existing) {
    [record] = await db.insert(attendanceTable).values({
      employeeId: empId, date: today,
      checkIn: punchType === "in" ? now : undefined,
      status: "present", source: "web",
      checkInVerifyType: "web",
    }).returning();
  } else {
    [record] = await db.update(attendanceTable)
      .set({
        checkOut: punchType === "out" ? now : undefined,
        checkOutVerifyType: punchType === "out" ? "web" : undefined,
      })
      .where(eq(attendanceTable.id, existing.id))
      .returning();
  }

  res.status(201).json(fmtAtt(record!));
});

router.post("/attendance/zkteco", async (req, res): Promise<void> => {
  const { sn, table: tableName, templateDataList } = req.body;

  if (tableName === "ATTLOG" && templateDataList) {
    const lines = templateDataList.split("\n").filter(Boolean);
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 2) continue;

      const enrollNumber = parts[0];
      const dateTimeStr = parts[1];
      const verifyCode = parts[2] ? parseInt(parts[2], 10) : 1;
      const inOutCode = parts[3] ? parseInt(parts[3], 10) : 0;
      const punchTime = new Date(dateTimeStr);
      if (isNaN(punchTime.getTime())) continue;

      const verifyType = getVerifyTypeName(verifyCode);
      const dateStr = punchTime.toISOString().slice(0, 10);

      const [emp] = await db.select().from(employeesTable)
        .where(eq(employeesTable.enrollNumber, enrollNumber));
      if (!emp) continue;

      const [existing] = await db.select().from(attendanceTable)
        .where(and(eq(attendanceTable.employeeId, emp.id), eq(attendanceTable.date, dateStr)));

      if (!existing) {
        let isLate = false;
        if (emp.shiftId) {
          const [shift] = await db.select().from(shiftsTable).where(eq(shiftsTable.id, emp.shiftId));
          if (shift) {
            const [sh, sm] = shift.startTime.split(":").map(Number);
            const cutoff = new Date(punchTime);
            cutoff.setHours(sh, sm + shift.gracePeriodMinutes, 0, 0);
            isLate = punchTime > cutoff;
          }
        }
        await db.insert(attendanceTable).values({
          employeeId: emp.id, date: dateStr, checkIn: punchTime,
          status: isLate ? "late" : "present", isLate, source: "biometric",
          checkInVerifyType: verifyType,
        });
      } else if (existing.checkIn && !existing.checkOut) {
        const workingHours = calcWorkingHours(existing.checkIn, punchTime);
        let isEarlyOut = false;
        if (emp.shiftId) {
          const [shift] = await db.select().from(shiftsTable).where(eq(shiftsTable.id, emp.shiftId));
          if (shift) {
            const [eh, em] = shift.endTime.split(":").map(Number);
            const shiftEnd = new Date(punchTime);
            shiftEnd.setHours(eh, em, 0, 0);
            isEarlyOut = punchTime < shiftEnd;
          }
        }
        await db.update(attendanceTable)
          .set({ checkOut: punchTime, workingHours, isEarlyOut, checkOutVerifyType: verifyType })
          .where(eq(attendanceTable.id, existing.id));
      }
    }
  }
  res.json({ success: true });
});

router.get("/attendance", async (req, res): Promise<void> => {
  const { employeeId, date, startDate, endDate, status } = req.query as {
    employeeId?: string; date?: string; startDate?: string; endDate?: string; status?: string;
  };

  let records = await db.select().from(attendanceTable).orderBy(attendanceTable.date);

  if (employeeId) records = records.filter(r => r.employeeId === parseInt(employeeId, 10));
  if (date) records = records.filter(r => r.date === date);
  if (startDate) records = records.filter(r => r.date >= startDate);
  if (endDate) records = records.filter(r => r.date <= endDate);
  if (status) records = records.filter(r => r.status === status);

  const employees = await db.select({
    id: employeesTable.id, firstName: employeesTable.firstName,
    lastName: employeesTable.lastName, employeeCode: employeesTable.employeeCode,
  }).from(employeesTable);
  const empMap = new Map(employees.map(e => [e.id, { name: `${e.firstName} ${e.lastName}`, code: e.employeeCode }]));

  res.json(records.map(r => {
    const emp = empMap.get(r.employeeId);
    return fmtAtt(r, emp?.name, emp?.code);
  }));
});

router.post("/attendance", async (req, res): Promise<void> => {
  const { employeeId, date, checkIn, checkOut, status, notes } = req.body;
  if (!employeeId || !date) {
    res.status(400).json({ error: "employeeId and date required" });
    return;
  }

  const checkInDate = checkIn ? new Date(checkIn) : undefined;
  const checkOutDate = checkOut ? new Date(checkOut) : undefined;
  const workingHours = checkInDate && checkOutDate ? calcWorkingHours(checkInDate, checkOutDate) : undefined;

  const [record] = await db.insert(attendanceTable).values({
    employeeId, date, checkIn: checkInDate, checkOut: checkOutDate,
    workingHours, status: status ?? "present", source: "manual", notes,
    isManuallyEdited: true,
    correctionNote: notes ?? "Manually created",
  }).returning();

  res.status(201).json(fmtAtt(record));
});

router.patch("/attendance/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { checkIn, checkOut, status, notes, correctionNote, correctedBy } = req.body;
  const updates: Record<string, unknown> = {};
  if (checkIn !== undefined) updates.checkIn = new Date(checkIn);
  if (checkOut !== undefined) updates.checkOut = new Date(checkOut);
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  if (updates.checkIn && updates.checkOut) {
    updates.workingHours = calcWorkingHours(updates.checkIn as Date, updates.checkOut as Date);
  }

  // Mark as manually edited
  updates.isManuallyEdited = true;
  updates.correctionNote = correctionNote ?? notes ?? "Manually corrected";
  updates.correctedBy = correctedBy ?? "Admin/HR";
  updates.correctedAt = new Date();

  const [record] = await db.update(attendanceTable).set(updates).where(eq(attendanceTable.id, id)).returning();
  if (!record) { res.status(404).json({ error: "Attendance record not found" }); return; }
  res.json(fmtAtt(record));
});

router.delete("/attendance/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(attendanceTable).where(eq(attendanceTable.id, id));
  res.sendStatus(204);
});

export function getVerifyTypeName(v: number): string {
  const map: Record<number, string> = { 0: "password", 1: "fingerprint", 2: "card", 4: "face", 15: "other" };
  return map[v] ?? "unknown";
}

export function getPunchDirection(p: number): string {
  const map: Record<number, string> = { 0: "in", 1: "out", 4: "break-out", 5: "break-in", 255: "out" };
  return map[p] ?? "other";
}

export default router;
