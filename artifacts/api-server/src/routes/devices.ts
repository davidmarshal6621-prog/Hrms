import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
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
      timeout: 60000, // 60s timeout for large devices
    });
    rawResult = stdout;
  } catch (err: any) {
    const errMsg = err.stdout || err.message || "Script execution failed";
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

  let synced = 0;
  let skipped = 0;

  for (const rec of records) {
    if (!rec.timestamp) continue;
    const emp = enrollMap.get(rec.enrollNumber);
    if (!emp) { skipped++; continue; } // no matching employee

    const punchTime = new Date(rec.timestamp);
    if (isNaN(punchTime.getTime())) continue;

    const dateStr = punchTime.toISOString().slice(0, 10);
    const punch = rec.punch; // 0=check-in, 1=check-out (some devices use 255 for check-out)
    const isCheckIn = punch === 0 || punch === 4; // 4 = break-in
    const isCheckOut = punch === 1 || punch === 5 || punch === 255; // 5 = break-out

    // Fetch existing record for this employee+date
    const [existing] = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.employeeId, emp.id), eq(attendanceTable.date, dateStr)));

    if (isCheckIn) {
      if (existing) {
        // Already has a record — check if same check-in (within 10 min) to avoid dupe
        if (existing.checkIn) {
          const diff = Math.abs(existing.checkIn.getTime() - punchTime.getTime());
          if (diff < 600000) { skipped++; continue; } // within 10 min, skip
        }
        // Update check-in if it's earlier
        if (!existing.checkIn || punchTime < existing.checkIn) {
          await db.update(attendanceTable).set({ checkIn: punchTime, source: "biometric" })
            .where(and(eq(attendanceTable.employeeId, emp.id), eq(attendanceTable.date, dateStr)));
        }
        synced++;
      } else {
        // New record
        let isLate = false;
        if (emp.shiftId) {
          const shift = shiftMap.get(emp.shiftId);
          if (shift) {
            const [sh, sm] = shift.startTime.split(":").map(Number);
            const shiftStart = new Date(punchTime);
            shiftStart.setHours(sh, sm + shift.gracePeriodMinutes, 0, 0);
            isLate = punchTime > shiftStart;
          }
        }
        await db.insert(attendanceTable).values({
          employeeId: emp.id,
          date: dateStr,
          checkIn: punchTime,
          status: isLate ? "late" : "present",
          isLate,
          source: "biometric",
        });
        synced++;
      }
    } else if (isCheckOut) {
      if (existing && existing.checkIn) {
        // Skip if check-out already set to same time
        if (existing.checkOut) {
          const diff = Math.abs(existing.checkOut.getTime() - punchTime.getTime());
          if (diff < 600000) { skipped++; continue; }
        }
        // Update check-out if it's later
        if (!existing.checkOut || punchTime > existing.checkOut) {
          const workingHours = Math.round((punchTime.getTime() - existing.checkIn.getTime()) / 36000) / 100;
          let isEarlyOut = false;
          if (emp.shiftId) {
            const shift = shiftMap.get(emp.shiftId);
            if (shift) {
              const [eh, em] = shift.endTime.split(":").map(Number);
              const shiftEnd = new Date(punchTime);
              shiftEnd.setHours(eh, em, 0, 0);
              isEarlyOut = punchTime < shiftEnd;
            }
          }
          await db.update(attendanceTable)
            .set({ checkOut: punchTime, workingHours, isEarlyOut, source: "biometric" })
            .where(and(eq(attendanceTable.employeeId, emp.id), eq(attendanceTable.date, dateStr)));
          synced++;
        }
      }
    }
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
