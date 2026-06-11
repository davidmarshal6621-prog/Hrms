import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, shiftsTable } from "@workspace/db";

const router: IRouter = Router();

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
