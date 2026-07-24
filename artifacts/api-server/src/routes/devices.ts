import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, devicesTable, employeesTable, attendanceTable, shiftsTable } from "@workspace/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import multer from "multer";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function fmtDevice(d: typeof devicesTable.$inferSelect) {
  return {
    id: d.id, name: d.name, ip: d.ip, port: d.port,
    location: d.location, isActive: d.isActive,
    lastSyncAt: d.lastSyncAt ? d.lastSyncAt.toISOString() : null,
    lastSyncCount: d.lastSyncCount, lastSyncError: d.lastSyncError,
    createdAt: d.createdAt.toISOString(),
  };
}

// ─── Device CRUD ────────────────────────────────────────────────────────────

router.get("/devices", async (_req, res): Promise<void> => {
  const devices = await db.select().from(devicesTable).orderBy(devicesTable.name);
  res.json(devices.map(fmtDevice));
});

router.post("/devices", async (req, res): Promise<void> => {
  const { name, ip, port, location } = req.body;
  if (!name || !ip) { res.status(400).json({ error: "name and ip required" }); return; }
  const [device] = await db.insert(devicesTable).values({
    name, ip, port: port ?? 4370, location,
  }).returning();
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
  const [device] = await db.update(devicesTable).set(updates).where(eq(devicesTable.id, id)).returning();
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(fmtDevice(device));
});

router.delete("/devices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(devicesTable).where(eq(devicesTable.id, id));
  res.sendStatus(204);
});

// ─── ZKTeco Direct Sync ─────────────────────────────────────────────────────

router.post("/devices/:id/sync", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  // Path to the Python script (relative to where Node process runs: artifacts/api-server/)
  const scriptPath = path.resolve(process.cwd(), "zk_sync.py");

  let rawResult = "";
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, device.ip, String(device.port)], {
      timeout: 300000, // 5 min timeout for large devices
      maxBuffer: 50 * 1024 * 1024, // 50 MB
    });
    rawResult = stdout;
  } catch (err: any) {
    const errMsg = err.stdout || err.stderr || err.message || "Script execution failed";
    await db.update(devicesTable).set({
      lastSyncAt: new Date(),
      lastSyncError: errMsg.slice(0, 500),
    }).where(eq(devicesTable.id, id));
    res.status(500).json({ error: "ZK connection failed", detail: errMsg.slice(0, 500) });
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    await db.update(devicesTable).set({ lastSyncAt: new Date(), lastSyncError: "Invalid JSON from script" }).where(eq(devicesTable.id, id));
    res.status(500).json({ error: "Script returned invalid JSON", raw: rawResult.slice(0, 200) });
    return;
  }

  if (parsed.error) {
    await db.update(devicesTable).set({ lastSyncAt: new Date(), lastSyncError: parsed.error }).where(eq(devicesTable.id, id));
    res.status(500).json({ error: parsed.error });
    return;
  }

  // Process records
  const records: Array<{ enrollNumber: string; timestamp: string; punch: number; status: number }> = parsed.records ?? [];

  // Load all employees with enroll numbers
  const employees = await db.select({
    id: employeesTable.id,
    enrollNumber: employeesTable.enrollNumber,
    shiftId: employeesTable.shiftId,
  }).from(employeesTable);
  const enrollMap = new Map<string, { id: number; shiftId: number | null }>();
  for (const emp of employees) {
    if (emp.enrollNumber) enrollMap.set(emp.enrollNumber, { id: emp.id, shiftId: emp.shiftId });
  }

  // Load shifts
  const shifts = await db.select().from(shiftsTable);
  const shiftMap = new Map(shifts.map(s => [s.id, s]));

  // ── Group records by employee+date, keep earliest check-in & latest check-out ──
  type DayKey = string; // `${employeeId}:${dateStr}`
  type DayAccum = { empId: number; shiftId: number | null; date: string; checkIn?: Date; checkOut?: Date };
  const dayMap = new Map<DayKey, DayAccum>();

  let skipped = 0;
  for (const rec of records) {
    if (!rec.timestamp) continue;
    const emp = enrollMap.get(rec.enrollNumber);
    if (!emp) { skipped++; continue; }

    const punchTime = new Date(rec.timestamp);
    if (isNaN(punchTime.getTime())) continue;

    // For overnight shifts: if punch hour < 12 (morning side of a night shift),
    // the "work date" is the previous calendar day
    const punchHour = punchTime.getHours();
    let workDate = new Date(punchTime);
    if (punchHour < 12 && emp.shiftId) {
      const shift = shiftMap.get(emp.shiftId);
      // If shift starts in afternoon (>=12) and punch is before noon → previous day
      if (shift) {
        const [sh] = shift.startTime.split(":").map(Number);
        if (sh >= 12) workDate.setDate(workDate.getDate() - 1);
      }
    }
    const dateStr = workDate.toISOString().slice(0, 10);

    const isCheckIn = rec.punch === 0 || rec.punch === 4;
    const isCheckOut = rec.punch === 1 || rec.punch === 5 || rec.punch === 255;
    if (!isCheckIn && !isCheckOut) continue;

    const key: DayKey = `${emp.id}:${dateStr}`;
    const existing = dayMap.get(key) ?? { empId: emp.id, shiftId: emp.shiftId, date: dateStr };

    if (isCheckIn) {
      if (!existing.checkIn || punchTime < existing.checkIn) existing.checkIn = punchTime;
    } else {
      if (!existing.checkOut || punchTime > existing.checkOut) existing.checkOut = punchTime;
    }
    dayMap.set(key, existing);
  }

  // ── Load existing attendance records in bulk ──
  const allEmpIds = [...new Set([...dayMap.values()].map(d => d.empId))];
  const allDates  = [...new Set([...dayMap.values()].map(d => d.date))];

  const existingRows = allEmpIds.length && allDates.length
    ? await db.select().from(attendanceTable)
        .where(and(
          inArray(attendanceTable.employeeId, allEmpIds),
          inArray(attendanceTable.date, allDates),
        ))
    : [];

  // key → existing row
  const existingMap = new Map(existingRows.map(r => [`${r.employeeId}:${r.date}`, r]));

  // ── Upsert in batches of 100 ──
  let synced = 0;
  const toInsert: Parameters<typeof db.insert>[0] extends infer T ? any[] : any[] = [];

  for (const [key, day] of dayMap) {
    const existing = existingMap.get(key);
    const shift = day.shiftId ? shiftMap.get(day.shiftId) : undefined;

    function calcLate(checkIn: Date): boolean {
      if (!shift) return false;
      const [sh, sm] = shift.startTime.split(":").map(Number);
      const cutoff = new Date(checkIn);
      cutoff.setHours(sh, sm + shift.gracePeriodMinutes, 0, 0);
      return checkIn > cutoff;
    }
    function calcEarlyOut(checkOut: Date): boolean {
      if (!shift) return false;
      const [eh, em] = shift.endTime.split(":").map(Number);
      const cutoff = new Date(checkOut);
      cutoff.setHours(eh, em, 0, 0);
      return checkOut < cutoff;
    }

    if (!existing) {
      if (!day.checkIn) continue; // no check-in at all, skip
      const isLate = calcLate(day.checkIn);
      let workingHours: number | undefined;
      let isEarlyOut = false;
      if (day.checkOut) {
        workingHours = Math.round((day.checkOut.getTime() - day.checkIn.getTime()) / 36000) / 100;
        isEarlyOut = calcEarlyOut(day.checkOut);
      }
      toInsert.push({
        employeeId: day.empId,
        date: day.date,
        checkIn: day.checkIn,
        checkOut: day.checkOut ?? null,
        workingHours: workingHours ?? null,
        status: isLate ? "late" : "present",
        isLate,
        isEarlyOut,
        source: "biometric",
      });
      synced++;
    } else {
      // Update only if we have a better (earlier check-in / later check-out)
      const updates: Record<string, unknown> = {};
      if (day.checkIn && (!existing.checkIn || day.checkIn < existing.checkIn)) {
        updates.checkIn = day.checkIn;
        const isLate = calcLate(day.checkIn);
        updates.isLate = isLate;
        updates.status = isLate ? "late" : "present";
      }
      if (day.checkOut && (!existing.checkOut || day.checkOut > existing.checkOut)) {
        const ci = (updates.checkIn as Date | undefined) ?? existing.checkIn;
        if (ci) {
          const workingHours = Math.round((day.checkOut.getTime() - ci.getTime()) / 36000) / 100;
          updates.checkOut = day.checkOut;
          updates.workingHours = workingHours;
          updates.isEarlyOut = calcEarlyOut(day.checkOut);
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

  // Batch-insert new rows in chunks of 200
  const CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    await db.insert(attendanceTable).values(toInsert.slice(i, i + CHUNK));
  }

  // Update device sync metadata
  await db.update(devicesTable).set({
    lastSyncAt: new Date(),
    lastSyncCount: synced,
    lastSyncError: null,
  }).where(eq(devicesTable.id, id));

  res.json({
    success: true,
    total: records.length,
    synced,
    skipped,
    message: `Synced ${synced} records, skipped ${skipped} duplicates`,
  });
});

// ─── Import Users from ZKTeco Device ────────────────────────────────────────
// Fetches all users from the device and imports them as employees (enrollNumber mapped automatically)

router.post("/devices/:id/import-users", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  const scriptPath = path.resolve(process.cwd(), "zk_sync.py");
  let rawResult = "";
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, device.ip, String(device.port), "--users"], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    rawResult = stdout;
  } catch (err: any) {
    res.status(500).json({ error: "ZK connection failed", detail: (err.stdout || err.message || "").slice(0, 500) });
    return;
  }

  let parsed: any;
  try { parsed = JSON.parse(rawResult); } catch {
    res.status(500).json({ error: "Invalid JSON from script", raw: rawResult.slice(0, 200) });
    return;
  }
  if (parsed.error) { res.status(500).json({ error: parsed.error }); return; }

  const users: Array<{ userId: string; name: string; privilege: number; password: string }> = parsed.users ?? [];

  // Load existing employees to check enroll numbers already assigned
  const existingEmps = await db.select({ id: employeesTable.id, enrollNumber: employeesTable.enrollNumber, employeeCode: employeesTable.employeeCode })
    .from(employeesTable);
  const byEnroll = new Map(existingEmps.filter(e => e.enrollNumber).map(e => [e.enrollNumber!, e]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const skippedList: string[] = [];

  for (const user of users) {
    const enrollNum = user.userId;
    if (byEnroll.has(enrollNum)) {
      skipped++;
      skippedList.push(`${enrollNum}: ${user.name || "(no name)"} — already mapped`);
      continue;
    }

    // Parse name into first/last
    const nameParts = (user.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || `User${enrollNum}`;
    const lastName = nameParts.slice(1).join(" ") || "Unknown";

    // Generate unique employee code
    const empCode = `ZK${enrollNum.padStart(4, "0")}`;

    // Check if employee code already exists (update enroll number if so)
    const [existByCode] = await db.select().from(employeesTable).where(eq(employeesTable.employeeCode, empCode));
    if (existByCode) {
      await db.update(employeesTable).set({ enrollNumber: enrollNum }).where(eq(employeesTable.id, existByCode.id));
      updated++;
    } else {
      await db.insert(employeesTable).values({
        employeeCode: empCode,
        firstName,
        lastName,
        enrollNumber: enrollNum,
        status: "active",
      });
      created++;
    }
  }

  res.json({
    success: true,
    total: users.length,
    created,
    updated,
    skipped,
    message: `Created ${created} new employees, updated ${updated}, skipped ${skipped} already mapped`,
    skippedList: skippedList.slice(0, 20),
  });
});

// ─── Test Device Connection ──────────────────────────────────────────────────

router.post("/devices/test-connection", async (req, res): Promise<void> => {
  const { ip, port } = req.body;
  if (!ip) { res.status(400).json({ error: "ip required" }); return; }

  const scriptPath = path.resolve(process.cwd(), "zk_sync.py");
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, ip, String(port ?? 4370)], {
      timeout: 15000,
    });
    const parsed = JSON.parse(stdout);
    if (parsed.error) {
      res.status(400).json({ connected: false, error: parsed.error });
    } else {
      res.json({ connected: true, recordCount: parsed.count });
    }
  } catch (err: any) {
    res.status(400).json({ connected: false, error: err.message });
  }
});

// ─── CSV Enroll Number Bulk Import ──────────────────────────────────────────

router.post("/employees/import-enroll", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "CSV file required" }); return; }

  const content = req.file.buffer.toString("utf-8");
  const lines = content.split(/\r?\n/).filter(Boolean);

  if (lines.length < 2) { res.status(400).json({ error: "CSV must have header + at least one row" }); return; }

  // Detect header — expect: employeeCode, enrollNumber
  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const codeIdx = header.findIndex(h => h.includes("code") || h === "employeecode");
  const enrollIdx = header.findIndex(h => h.includes("enroll") || h.includes("userid") || h.includes("user_id"));

  if (codeIdx === -1 || enrollIdx === -1) {
    res.status(400).json({ error: "CSV must have columns: employeeCode, enrollNumber" });
    return;
  }

  let updated = 0;
  let notFound = 0;
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
