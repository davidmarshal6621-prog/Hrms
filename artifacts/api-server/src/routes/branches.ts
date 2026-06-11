import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, branchesTable } from "@workspace/db";

const router: IRouter = Router();

function fmt(b: typeof branchesTable.$inferSelect) {
  return {
    id: b.id, name: b.name, address: b.address, city: b.city, phone: b.phone,
    isActive: b.isActive, createdAt: b.createdAt.toISOString(),
  };
}

router.get("/branches", async (_req, res): Promise<void> => {
  const branches = await db.select().from(branchesTable).orderBy(branchesTable.name);
  res.json(branches.map(fmt));
});

router.post("/branches", async (req, res): Promise<void> => {
  const { name, address, city, phone } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  const [branch] = await db.insert(branchesTable).values({ name, address, city, phone }).returning();
  res.status(201).json(fmt(branch));
});

router.patch("/branches/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { name, address, city, phone, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (city !== undefined) updates.city = city;
  if (phone !== undefined) updates.phone = phone;
  if (isActive !== undefined) updates.isActive = isActive;

  const [branch] = await db.update(branchesTable).set(updates).where(eq(branchesTable.id, id)).returning();
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(fmt(branch));
});

router.delete("/branches/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(branchesTable).where(eq(branchesTable.id, id));
  res.sendStatus(204);
});

export default router;
