import { Router, type IRouter, type Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  devicesTable,
  employeesTable,
  attendanceTable,
  shiftsTable,
  punchLogsTable,
  usersTable,
  employeeShiftAssignmentsTable,
} from "@workspace/db";
import { execFile, spawn } from "node:child_process";
import { isIP } from "node:net";
import { promisify } from "node:util";
import path from "node:path";
import multer from "multer";
import { getVerifyTypeName, getPunchDirection } from "./attendance.js";
import { provisionEmployeeAccount } from "../lib/employee-provisioning.js";
import { shiftIdForDate } from "../lib/shift-schedule.js";
import type { AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function isPublicDeviceAddress(ip: string): boolean {
  if (typeof ip !== "string" || isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0)
  );
}

function validPort(port: unknown): port is number {
  return Number.isInteger(port) && (port as number) >= 1 && (port as number) <= 65535;
}

function isValidLocalDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day
    && hour >= 0 && hour <= 23
    && minute >= 0 && minute <= 59;
}

function requireMachineAdmin(req: AuthRequest, res: Response): boolean {
  if (req.user?.role !== "super_admin" && req.user?.role !== "admin") {
    res.status(403).json({ error: "Only company admins can change machine settings" });
    return false;
  }
  return true;
}

function runZkCommand(
  ip: string,
  port: number,
  mode: "--set-time" | "--add-user",
  data: Record<string, string>,
): Promise<Record<string, any>> {
  const scriptPath = path.resolve(process.cwd(), "zk_sync.py");
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath, ip, String(port), mode], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 30000);

    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error("ZKTeco command timed out"));
        return;
      }
      let result: Record<string, any>;
      try {
        result = JSON.parse(stdout);
      } catch {
        reject(new Error(stderr.trim() || "Invalid response from ZKTeco script"));
        return;
      }
      if (code !== 0 || result.error) {
        reject(new Error(result.error || stderr.trim() || "ZKTeco command failed"));
        return;
      }
      resolve(result);
    });
    child.stdin.end(JSON.stringify(data));
  });
}

function fmtDevice(d: typeof devicesTable.$inferSelect) {
  return {
    id: d.id, name: d.name, ip: d.ip, port: d.port,
    location: d.location, isActive: d.isActive,
    lastSyncAt: d.lastSyncAt ? d.lastSyncAt.toISOString() : null,
    lastSyncCount: d.lastSyncCount, lastSyncError: d.lastSyncError,
    createdAt: d.createdAt.toISOString(),
  };
}

// ─── Device CRUD ─────────────────────────────────────────────────────────────

router.get("/devices", async (_req, res): Promise<void> => {
  const devices = await db.select().from(devicesTable).orderBy(devicesTable.name);
  res.json(devices.map(fmtDevice));
});

router.post("/devices", async (req, res): Promise<void> => {
  const { name, ip, port, location } = req.body;
  if (!name || !ip) { res.status(400).json({ error: "name and ip required" }); return; }
  const devicePort = port ?? 4370;
  if (!isPublicDeviceAddress(ip) || !validPort(devicePort)) {
    res.status(400).json({ error: "Use a public IPv4 address and a valid device port reachable from the API server" });
    return;
  }
  const [device] = await db.insert(devicesTable).values({ name, ip, port: devicePort, location }).returning();
  res.status(201).json(fmtDevice(device));
});

router.patch("/devices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, ip, port, location, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (ip !== undefined) updates.ip = ip;
  if (port !== undefined) updates.port = port;
  if (location !== undefined) updates.location = location;
  if (isActive !== undefined) updates.isActive = isActive;
  if (ip !== undefined && !isPublicDeviceAddress(ip)) {
    res.status(400).json({ error: "Use a public IPv4 address reachable from the API server" });
    return;
  }
  if (port !== undefined && !validPort(port)) {
    res.status(400).json({ error: "Port must be between 1 and 65535" });
    return;
  }
  const [device] = await db.update(devicesTable).set(updates).where(eq(devicesTable.id, id)).returning();
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(fmtDevice(device));
});

router.delete("/devices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(devicesTable).where(eq(devicesTable.id, id));
  res.sendStatus(204);
});

// ─── ZKTeco Direct Sync ───────────────────────────────────────────────────────

router.post("/devices/:id/sync", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  if (!isPublicDeviceAddress(device.ip) || !validPort(device.port)) {
    res.status(400).json({ error: "Device must use a public IPv4 address reachable from the API server" });
    return;
  }

  const scriptPath = path.resolve(process.cwd(), "zk_sync.py");

  let rawResult = "";
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, device.ip, String(device.port)], {
      timeout: 300000,
      maxBuffer: 50 * 1024 * 1024,
    });
    rawResult = stdout;
  } catch (err: any) {
    const errMsg = err.stdout || err.stderr || err.message || "Script execution failed";
    await db.update(devicesTable).set({ lastSyncAt: new Date(), lastSyncError: errMsg.slice(0, 500) })
      .where(eq(devicesTable.id, id));
    res.status(500).json({ error: "ZK connection failed", detail: errMsg.slice(0, 500) });
    return;
  }

  let parsed: any;
  try { parsed = JSON.parse(rawResult); } catch {
    await db.update(devicesTable).set({ lastSyncAt: new Date(), lastSyncError: "Invalid JSON from script" })
      .where(eq(devicesTable.id, id));
    res.status(500).json({ error: "Script returned invalid JSON", raw: rawResult.slice(0, 200) });
    return;
  }
  if (parsed.error) {
    await db.update(devicesTable).set({ lastSyncAt: new Date(), lastSyncError: parsed.error })
      .where(eq(devicesTable.id, id));
    res.status(500).json({ error: parsed.error });
    return;
  }

  const records: Array<{ enrollNumber: string; timestamp: string; punch: number; status: number }> = parsed.records ?? [];

  // Load employees
  const employees = await db.select({
    id: employeesTable.id,
    enrollNumber: employeesTable.enrollNumber,
    shiftId: employeesTable.shiftId,
    weeklyShiftSchedule: employeesTable.weeklyShiftSchedule,
  })
    .from(employeesTable);
  const enrollMap = new Map<string, {
    id: number;
    shiftId: number | null;
    weeklyShiftSchedule: string | null;
  }>();
  for (const emp of employees) {
    if (emp.enrollNumber) {
      enrollMap.set(emp.enrollNumber, {
        id: emp.id,
        shiftId: emp.shiftId,
        weeklyShiftSchedule: emp.weeklyShiftSchedule,
      });
    }
  }

  // Attendance may contain a new ZK enroll number before an explicit user
  // import. Provision it now so its first attendance record is not skipped.
  const newEnrollNumbers = [...new Set(records.map(record => record.enrollNumber).filter(Boolean))]
    .filter(enrollNumber => !enrollMap.has(enrollNumber));
  for (const enrollNumber of newEnrollNumbers) {
    const provisioned = await provisionEmployeeAccount({ enrollNumber });
    enrollMap.set(enrollNumber, {
      id: provisioned.employee.id,
      shiftId: provisioned.employee.shiftId,
      weeklyShiftSchedule: provisioned.employee.weeklyShiftSchedule,
    });
  }

  const shifts = await db.select().from(shiftsTable);
  const shiftMap = new Map(shifts.map(s => [s.id, s]));
  const employeeIds = [...new Set([...enrollMap.values()].map(employee => employee.id))];
  const customAssignments = employeeIds.length
    ? await db.select().from(employeeShiftAssignmentsTable)
      .where(inArray(employeeShiftAssignmentsTable.employeeId, employeeIds))
    : [];
  const customShiftMap = new Map(
    customAssignments.map(assignment => [`${assignment.employeeId}:${assignment.assignmentDate}`, assignment]),
  );
  function scheduledShift(employee: { id: number; shiftId: number | null; weeklyShiftSchedule: string | null }, date: string) {
    const custom = customShiftMap.get(`${employee.id}:${date}`);
    if (custom) {
      if (custom.customStartTime && custom.customEndTime) {
        return {
          shiftId: null,
          startTime: custom.customStartTime,
          endTime: custom.customEndTime,
          gracePeriodMinutes: 15,
        };
      }
      if (custom.shiftId === null) return undefined;
      return shiftMap.get(custom.shiftId);
    }
    const shiftId = shiftIdForDate(employee.weeklyShiftSchedule, date, employee.shiftId);
    return shiftId ? shiftMap.get(shiftId) : undefined;
  }

  // ── Store all raw punches in punch_logs ──────────────────────────────────
  const punchLogsToInsert: any[] = [];
  for (const rec of records) {
    if (!rec.timestamp) continue;
    const punchTime = new Date(rec.timestamp);
    if (isNaN(punchTime.getTime())) continue;
    const emp = enrollMap.get(rec.enrollNumber);
    punchLogsToInsert.push({
      employeeId: emp?.id ?? null,
      enrollNumber: rec.enrollNumber,
      deviceId: device.id,
      deviceName: device.name,
      punchTime,
      verifyType: getVerifyTypeName(rec.status),  // status field = verify type from device
      punchDirection: getPunchDirection(rec.punch),
      rawPunch: rec.punch,
      rawVerify: rec.status,
    });
  }

  // Batch insert punch logs (ignore duplicates via upsert-style chunks)
  const CHUNK = 500;
  let punchLogsInserted = 0;
  for (let i = 0; i < punchLogsToInsert.length; i += CHUNK) {
    try {
      await db.insert(punchLogsTable).values(punchLogsToInsert.slice(i, i + CHUNK))
        .onConflictDoNothing();
      punchLogsInserted += Math.min(CHUNK, punchLogsToInsert.length - i);
    } catch { /* ignore dup errors */ }
  }

  // ── Group records by employee+date, keep earliest check-in & latest check-out ──
  type DayKey = string;
  type DayAccum = {
    empId: number; date: string;
    shiftStartTime?: string; shiftEndTime?: string; shiftGracePeriodMinutes?: number;
    checkIn?: Date; checkOut?: Date;
    checkInDeviceId?: number; checkInDeviceName?: string; checkInVerifyType?: string;
    checkOutDeviceId?: number; checkOutDeviceName?: string; checkOutVerifyType?: string;
  };
  const dayMap = new Map<DayKey, DayAccum>();
  let skipped = 0;

  for (const rec of records) {
    if (!rec.timestamp) continue;
    const emp = enrollMap.get(rec.enrollNumber);
    if (!emp) { skipped++; continue; }

    const punchTime = new Date(rec.timestamp);
    if (isNaN(punchTime.getTime())) continue;

    const punchHour = punchTime.getHours();
    let workDate = new Date(punchTime);
    if (punchHour < 12) {
      const initialDate = punchTime.toISOString().slice(0, 10);
      const shift = scheduledShift(emp, initialDate);
      if (shift) {
        const [sh] = shift.startTime.split(":").map(Number);
        if (sh >= 12) workDate.setDate(workDate.getDate() - 1);
      }
    }
    const dateStr = workDate.toISOString().slice(0, 10);
    const shift = scheduledShift(emp, dateStr);

    const isCheckIn = rec.punch === 0 || rec.punch === 4;
    const isCheckOut = rec.punch === 1 || rec.punch === 5 || rec.punch === 255;
    if (!isCheckIn && !isCheckOut) continue;

    const key: DayKey = `${emp.id}:${dateStr}`;
    const existing: DayAccum = dayMap.get(key) ?? {
      empId: emp.id,
      date: dateStr,
      shiftStartTime: shift?.startTime,
      shiftEndTime: shift?.endTime,
      shiftGracePeriodMinutes: shift?.gracePeriodMinutes,
    };
    const verifyType = getVerifyTypeName(rec.status);

    if (isCheckIn) {
      if (!existing.checkIn || punchTime < existing.checkIn) {
        existing.checkIn = punchTime;
        existing.checkInDeviceId = device.id;
        existing.checkInDeviceName = device.name;
        existing.checkInVerifyType = verifyType;
      }
    } else {
      if (!existing.checkOut || punchTime > existing.checkOut) {
        existing.checkOut = punchTime;
        existing.checkOutDeviceId = device.id;
        existing.checkOutDeviceName = device.name;
        existing.checkOutVerifyType = verifyType;
      }
    }
    dayMap.set(key, existing);
  }

  // Bulk load existing attendance
  const allEmpIds = [...new Set([...dayMap.values()].map(d => d.empId))];
  const allDates  = [...new Set([...dayMap.values()].map(d => d.date))];

  const existingRows = allEmpIds.length && allDates.length
    ? await db.select().from(attendanceTable)
        .where(and(inArray(attendanceTable.employeeId, allEmpIds), inArray(attendanceTable.date, allDates)))
    : [];
  const existingMap = new Map(existingRows.map(r => [`${r.employeeId}:${r.date}`, r]));

  let synced = 0;
  const toInsert: any[] = [];

  for (const [, day] of dayMap) {
    const existing = existingMap.get(`${day.empId}:${day.date}`);

    function calcLate(checkIn: Date): boolean {
      if (!day.shiftStartTime) return false;
      const [sh, sm] = day.shiftStartTime.split(":").map(Number);
      const cutoff = new Date(checkIn);
      cutoff.setUTCHours(sh, sm + (day.shiftGracePeriodMinutes ?? 15), 0, 0);
      return checkIn > cutoff;
    }
    function calcEarlyOut(checkOut: Date): boolean {
      if (!day.shiftEndTime) return false;
      const [eh, em] = day.shiftEndTime.split(":").map(Number);
      const cutoff = new Date(checkOut);
      cutoff.setUTCHours(eh, em, 0, 0);
      return checkOut < cutoff;
    }

    if (!existing) {
      if (!day.checkIn) continue;
      const isLate = calcLate(day.checkIn);
      let workingHours: number | undefined;
      let isEarlyOut = false;
      if (day.checkOut) {
        workingHours = Math.round((day.checkOut.getTime() - day.checkIn.getTime()) / 36000) / 100;
        isEarlyOut = calcEarlyOut(day.checkOut);
      }
      toInsert.push({
        employeeId: day.empId, date: day.date,
        checkIn: day.checkIn, checkOut: day.checkOut ?? null,
        workingHours: workingHours ?? null,
        status: isLate ? "late" : "present", isLate, isEarlyOut,
        source: "biometric",
        checkInDeviceId: day.checkInDeviceId, checkInDeviceName: day.checkInDeviceName,
        checkInVerifyType: day.checkInVerifyType,
        checkOutDeviceId: day.checkOutDeviceId, checkOutDeviceName: day.checkOutDeviceName,
        checkOutVerifyType: day.checkOutVerifyType,
      });
      synced++;
    } else {
      const updates: Record<string, unknown> = {};
      if (day.checkIn && (!existing.checkIn || day.checkIn < existing.checkIn)) {
        updates.checkIn = day.checkIn;
        updates.isLate = calcLate(day.checkIn);
        updates.status = updates.isLate ? "late" : "present";
        updates.checkInDeviceId = day.checkInDeviceId;
        updates.checkInDeviceName = day.checkInDeviceName;
        updates.checkInVerifyType = day.checkInVerifyType;
      }
      if (day.checkOut && (!existing.checkOut || day.checkOut > existing.checkOut)) {
        const ci = (updates.checkIn as Date | undefined) ?? existing.checkIn;
        if (ci) {
          updates.checkOut = day.checkOut;
          updates.workingHours = Math.round((day.checkOut.getTime() - ci.getTime()) / 36000) / 100;
          updates.isEarlyOut = calcEarlyOut(day.checkOut);
          updates.checkOutDeviceId = day.checkOutDeviceId;
          updates.checkOutDeviceName = day.checkOutDeviceName;
          updates.checkOutVerifyType = day.checkOutVerifyType;
        }
      }
      if (Object.keys(updates).length) {
        updates.source = "biometric";
        await db.update(attendanceTable).set(updates)
          .where(and(eq(attendanceTable.employeeId, day.empId), eq(attendanceTable.date, day.date)));
        synced++;
      }
    }
  }

  const CHUNK2 = 200;
  for (let i = 0; i < toInsert.length; i += CHUNK2) {
    await db.insert(attendanceTable).values(toInsert.slice(i, i + CHUNK2));
  }

  await db.update(devicesTable).set({
    lastSyncAt: new Date(), lastSyncCount: synced, lastSyncError: null,
  }).where(eq(devicesTable.id, id));

  res.json({
    success: true,
    total: records.length,
    punchLogsStored: punchLogsInserted,
    synced, skipped,
    message: `Synced ${synced} records, stored ${punchLogsInserted} punch logs`,
  });
});

// ─── Import Users from ZKTeco Device + Auto-create User Accounts ─────────────

router.post("/devices/:id/import-users", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  if (!isPublicDeviceAddress(device.ip) || !validPort(device.port)) {
    res.status(400).json({ error: "Device must use a public IPv4 address reachable from the API server" });
    return;
  }

  const scriptPath = path.resolve(process.cwd(), "zk_sync.py");
  let rawResult = "";
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, device.ip, String(device.port), "--users"], {
      timeout: 30000, maxBuffer: 10 * 1024 * 1024,
    });
    rawResult = stdout;
  } catch (err: any) {
    res.status(500).json({ error: "ZK connection failed", detail: (err.stdout || err.message || "").slice(0, 500) });
    return;
  }

  let parsed: any;
  try { parsed = JSON.parse(rawResult); } catch {
    res.status(500).json({ error: "Invalid JSON from script" });
    return;
  }
  if (parsed.error) { res.status(500).json({ error: parsed.error }); return; }

  const users: Array<{ userId: string; name: string; privilege: number }> = parsed.users ?? [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let usersCreated = 0;
  const createdUsers: Array<{ employeeCode: string; email: string; password: string }> = [];

  for (const user of users) {
    const enrollNum = user.userId;
    const empCode = `ZK${enrollNum.padStart(4, "0")}`;
    const result = await provisionEmployeeAccount({
      enrollNumber: enrollNum,
      name: user.name,
      employeeCode: empCode,
    });
    if (result.employeeCreated) {
      created++;
    } else {
      updated++;
    }
    if (result.userCreated) {
      usersCreated++;
      createdUsers.push({
        employeeCode: empCode,
        email: result.user.email,
        password: result.user.tempPassword ?? "",
      });
    } else {
      skipped++;
    }
  }

  res.json({
    success: true, total: users.length, created, updated, skipped, usersCreated,
    message: `Created ${created} employees, ${usersCreated} user accounts`,
    // Return first 10 so admin can see them
    sampleCredentials: createdUsers.slice(0, 10),
  });
});

router.post("/devices/:id/set-time", async (req: AuthRequest, res): Promise<void> => {
  if (!requireMachineAdmin(req, res)) return;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { dateTime } = req.body as { dateTime?: string };
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid device ID" }); return; }
  if (!isValidLocalDateTime(dateTime)) {
    res.status(400).json({ error: "dateTime must be a valid local date and time" });
    return;
  }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  if (!isPublicDeviceAddress(device.ip) || !validPort(device.port)) {
    res.status(400).json({ error: "Device must use a public IPv4 address reachable from the API server" });
    return;
  }

  try {
    const result = await runZkCommand(device.ip, device.port, "--set-time", { dateTime });
    res.json({ success: true, deviceDateTime: result.deviceDateTime });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not set machine time" });
  }
});

router.post("/devices/:id/users", async (req: AuthRequest, res): Promise<void> => {
  if (!requireMachineAdmin(req, res)) return;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const employeeId = Number(req.body?.employeeId);
  const userId = String(req.body?.userId ?? "").trim();
  const name = String(req.body?.name ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid device ID" }); return; }
  if (!Number.isInteger(employeeId) || employeeId <= 0) { res.status(400).json({ error: "Select an employee" }); return; }
  if (!/^\d{1,9}$/.test(userId)) { res.status(400).json({ error: "Machine user ID must contain 1 to 9 digits" }); return; }
  if (!name || name.length > 24) {
    res.status(400).json({ error: "Machine display name must contain 1 to 24 characters" });
    return;
  }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  if (!isPublicDeviceAddress(device.ip) || !validPort(device.port)) {
    res.status(400).json({ error: "Device must use a public IPv4 address reachable from the API server" });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  if (employee.enrollNumber && employee.enrollNumber !== userId) {
    res.status(409).json({ error: `This employee is already mapped to machine ID ${employee.enrollNumber}` });
    return;
  }
  const [existingMapping] = await db.select({ id: employeesTable.id }).from(employeesTable)
    .where(eq(employeesTable.enrollNumber, userId));
  if (existingMapping && existingMapping.id !== employee.id) {
    res.status(409).json({ error: "This machine user ID is already mapped to another employee" });
    return;
  }

  try {
    const result = await runZkCommand(device.ip, device.port, "--add-user", { userId, name });
    if (!employee.enrollNumber) {
      await db.update(employeesTable).set({ enrollNumber: userId }).where(eq(employeesTable.id, employee.id));
    }
    res.json({ success: true, userId, name: result.name, updated: false });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not add machine user" });
  }
});

// ─── Test Device Connection ───────────────────────────────────────────────────

router.post("/devices/test-connection", async (req, res): Promise<void> => {
  const { ip, port } = req.body;
  if (!ip) { res.status(400).json({ error: "ip required" }); return; }
  const devicePort = port ?? 4370;
  if (!isPublicDeviceAddress(ip) || !validPort(devicePort)) {
    res.status(400).json({ connected: false, error: "Use a public IPv4 address and a valid device port reachable from the API server" });
    return;
  }
  const scriptPath = path.resolve(process.cwd(), "zk_sync.py");
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, ip, String(devicePort), "--test"], {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    const p = JSON.parse(stdout);
    if (p.error) { res.status(400).json({ connected: false, error: p.error }); }
    else {
      res.json({
        connected: true,
        deviceName: p.deviceName || null,
        serialNumber: p.serialNumber || null,
        firmwareVersion: p.firmwareVersion || null,
      });
    }
  } catch (err: any) {
    let detail = err.stdout || err.message;
    try { detail = JSON.parse(detail).error || detail; } catch { /* retain script's error text */ }
    res.status(400).json({ connected: false, error: String(detail).slice(0, 500) });
  }
});

// ─── CSV Enroll Number Bulk Import ───────────────────────────────────────────

router.post("/employees/import-enroll", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "CSV file required" }); return; }

  const content = req.file.buffer.toString("utf-8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) { res.status(400).json({ error: "CSV must have header + at least one row" }); return; }

  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const codeIdx = header.findIndex(h => h.includes("code") || h === "employeecode");
  const enrollIdx = header.findIndex(h => h.includes("enroll") || h.includes("userid") || h.includes("user_id"));

  if (codeIdx === -1 || enrollIdx === -1) {
    res.status(400).json({ error: "CSV must have columns: employeeCode, enrollNumber" });
    return;
  }

  let updated = 0; let notFound = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const code = cols[codeIdx];
    const enroll = cols[enrollIdx];
    if (!code || !enroll) continue;
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.employeeCode, code));
    if (!emp) { notFound++; errors.push(`Row ${i + 1}: Employee '${code}' not found`); continue; }
    await db.update(employeesTable).set({ enrollNumber: enroll }).where(eq(employeesTable.id, emp.id));
    updated++;
  }

  res.json({ updated, notFound, errors: errors.slice(0, 20) });
});

export default router;
