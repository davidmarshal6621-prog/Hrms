import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, departmentsTable, branchesTable, employeesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/departments", async (req, res): Promise<void> => {
  const { branchId } = req.query as { branchId?: string };

  const depts = await db.select().from(departmentsTable).orderBy(departmentsTable.name);

  const branches = await db.select().from(branchesTable);
  const branchMap = new Map(branches.map(b => [b.id, b.name]));

  const employees = await db.select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable);
  const empMap = new Map(employees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));

  let result = depts.map(d => ({
    id: d.id, name: d.name,
    branchId: d.branchId, branchName: d.branchId ? branchMap.get(d.branchId) ?? null : null,
    managerId: d.managerId, managerName: d.managerId ? empMap.get(d.managerId) ?? null : null,
    isActive: d.isActive, createdAt: d.createdAt.toISOString(),
  }));

  if (branchId) {
    const bid = parseInt(branchId, 10);
    result = result.filter(d => d.branchId === bid);
  }

  res.json(result);
});

router.post("/departments", async (req, res): Promise<void> => {
  const { name, branchId, managerId } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  const [dept] = await db.insert(departmentsTable).values({ name, branchId: branchId ?? null, managerId: managerId ?? null }).returning();
  res.status(201).json({
    id: dept.id, name: dept.name, branchId: dept.branchId, branchName: null,
    managerId: dept.managerId, managerName: null, isActive: dept.isActive,
    createdAt: dept.createdAt.toISOString(),
  });
});

router.patch("/departments/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { name, branchId, managerId, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (branchId !== undefined) updates.branchId = branchId;
  if (managerId !== undefined) updates.managerId = managerId;
  if (isActive !== undefined) updates.isActive = isActive;

  const [dept] = await db.update(departmentsTable).set(updates).where(eq(departmentsTable.id, id)).returning();
  if (!dept) { res.status(404).json({ error: "Department not found" }); return; }

  res.json({
    id: dept.id, name: dept.name, branchId: dept.branchId, branchName: null,
    managerId: dept.managerId, managerName: null, isActive: dept.isActive,
    createdAt: dept.createdAt.toISOString(),
  });
});

router.delete("/departments/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(departmentsTable).where(eq(departmentsTable.id, id));
  res.sendStatus(204);
});

export default router;
