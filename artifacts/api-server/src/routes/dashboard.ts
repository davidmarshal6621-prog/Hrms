import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, employeesTable, attendanceTable, leavesTable, payrollTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [employees, todayAtt, pendingLeaves, monthPayroll] = await Promise.all([
    db.select().from(employeesTable),
    db.select().from(attendanceTable).where(eq(attendanceTable.date, today)),
    db.select().from(leavesTable).where(eq(leavesTable.status, "pending")),
    db.select().from(payrollTable).where(eq(payrollTable.month, month)),
  ]);

  const totalEmployees = employees.filter(e => e.status === "active").length;
  const presentToday = todayAtt.filter(a => ["present", "late"].includes(a.status)).length;
  const onLeaveToday = todayAtt.filter(a => a.status === "on-leave").length;
  const absentToday = totalEmployees - presentToday - onLeaveToday;
  const attendanceRate = totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 10000) / 100 : 0;
  const payrollThisMonth = monthPayroll.reduce((sum, p) => sum + p.netSalary, 0);

  // Get recent attendance (last 10 records)
  const allAtt = await db.select().from(attendanceTable).orderBy(attendanceTable.createdAt).limit(10);
  const recentAttendance = allAtt.map(a => ({
    id: a.id, employeeId: a.employeeId, employeeName: null, employeeCode: null,
    date: a.date,
    checkIn: a.checkIn ? a.checkIn.toISOString() : null,
    checkOut: a.checkOut ? a.checkOut.toISOString() : null,
    workingHours: a.workingHours, status: a.status,
    isLate: a.isLate, isEarlyOut: a.isEarlyOut, source: a.source,
    notes: a.notes, createdAt: a.createdAt.toISOString(),
  }));

  // Get pending leave requests
  const pendingLeavesList = await db.select().from(leavesTable).where(eq(leavesTable.status, "pending")).limit(5);
  const pendingLeaveRequests = pendingLeavesList.map(l => ({
    id: l.id, employeeId: l.employeeId, employeeName: null, leaveTypeId: l.leaveTypeId,
    leaveTypeName: null, startDate: l.startDate, endDate: l.endDate,
    totalDays: l.totalDays, reason: l.reason, status: l.status,
    managerApprovalStatus: l.managerApprovalStatus,
    hrApprovalStatus: l.hrApprovalStatus,
    managerNote: l.managerNote, hrNote: l.hrNote,
    createdAt: l.createdAt.toISOString(),
  }));

  res.json({
    totalEmployees, presentToday,
    absentToday: Math.max(0, absentToday),
    onLeaveToday, pendingLeaves: pendingLeaves.length,
    payrollThisMonth: Math.round(payrollThisMonth * 100) / 100,
    attendanceRate,
    recentAttendance,
    pendingLeaveRequests,
  });
});

export default router;
