import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, punchLogsTable, employeesTable } from "@workspace/db";

const router: IRouter = Router();

function fmt(p: typeof punchLogsTable.$inferSelect, empName?: string | null, empCode?: string | null) {
  return {
    id: p.id,
    employeeId: p.employeeId,
    employeeName: empName ?? null,
    employeeCode: empCode ?? null,
    enrollNumber: p.enrollNumber,
    deviceId: p.deviceId,
    deviceName: p.deviceName,
    punchTime: p.punchTime.toISOString(),
    verifyType: p.verifyType,
    punchDirection: p.punchDirection,
    rawPunch: p.rawPunch,
    rawVerify: p.rawVerify,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/punch-logs", async (req, res): Promise<void> => {
  const { employeeId, date, startDate, endDate, deviceId, enrollNumber, limit } = req.query as {
    employeeId?: string; date?: string; startDate?: string; endDate?: string;
    deviceId?: string; enrollNumber?: string; limit?: string;
  };

  const conditions: ReturnType<typeof eq>[] = [];

  if (employeeId) conditions.push(eq(punchLogsTable.employeeId, parseInt(employeeId, 10)));
  if (deviceId) conditions.push(eq(punchLogsTable.deviceId, parseInt(deviceId, 10)));
  if (enrollNumber) conditions.push(eq(punchLogsTable.enrollNumber, enrollNumber));

  // Date range on punch_time
  let punches;
  if (startDate || endDate || date) {
    const start = date ?? startDate ?? "1970-01-01";
    const end = date ?? endDate ?? "2099-12-31";
    punches = await db.select().from(punchLogsTable)
      .where(and(
        ...(conditions.length ? conditions : []),
        gte(punchLogsTable.punchTime, new Date(start + "T00:00:00Z")),
        lte(punchLogsTable.punchTime, new Date(end + "T23:59:59Z")),
      ))
      .orderBy(desc(punchLogsTable.punchTime))
      .limit(limit ? parseInt(limit, 10) : 500);
  } else {
    punches = await db.select().from(punchLogsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(punchLogsTable.punchTime))
      .limit(limit ? parseInt(limit, 10) : 200);
  }

  // Batch enrich with employee names
  const empIds = [...new Set(punches.map(p => p.employeeId).filter(Boolean) as number[])];
  const emps = empIds.length
    ? await db.select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeCode: employeesTable.employeeCode })
        .from(employeesTable)
    : [];
  const empMap = new Map(emps.map(e => [e.id, { name: `${e.firstName} ${e.lastName}`, code: e.employeeCode }]));

  res.json(punches.map(p => {
    const emp = p.employeeId ? empMap.get(p.employeeId) : undefined;
    return fmt(p, emp?.name, emp?.code);
  }));
});

export default router;
