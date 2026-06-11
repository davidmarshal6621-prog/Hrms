import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

router.get("/users", async (req, res): Promise<void> => {
  const { role, search } = req.query as { role?: string; search?: string };

  let query = db.select().from(usersTable);
  const conditions = [];

  if (role) conditions.push(eq(usersTable.role, role));
  if (search) {
    conditions.push(
      or(
        ilike(usersTable.name, `%${search}%`),
        ilike(usersTable.email, `%${search}%`)
      )
    );
  }

  const users = conditions.length > 0
    ? await query.where(conditions.length === 1 ? conditions[0] : conditions[0])
    : await query;

  res.json(users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    employeeId: u.employeeId,
    createdAt: u.createdAt.toISOString(),
  })));
});

router.post("/users", async (req, res): Promise<void> => {
  const { email, password, name, role, employeeId } = req.body;
  if (!email || !password || !name || !role) {
    res.status(400).json({ error: "email, password, name, role required" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email, passwordHash, name, role,
    employeeId: employeeId ?? null,
  }).returning();

  res.status(201).json({
    id: user.id, email: user.email, name: user.name, role: user.role,
    isActive: user.isActive, employeeId: user.employeeId,
    createdAt: user.createdAt.toISOString(),
  });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id, email: user.email, name: user.name, role: user.role,
    isActive: user.isActive, employeeId: user.employeeId,
    createdAt: user.createdAt.toISOString(),
  });
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { email, name, role, isActive, password, employeeId } = req.body;
  const updates: Record<string, unknown> = {};
  if (email !== undefined) updates.email = email;
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (isActive !== undefined) updates.isActive = isActive;
  if (employeeId !== undefined) updates.employeeId = employeeId;
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id, email: user.email, name: user.name, role: user.role,
    isActive: user.isActive, employeeId: user.employeeId,
    createdAt: user.createdAt.toISOString(),
  });
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

export default router;
