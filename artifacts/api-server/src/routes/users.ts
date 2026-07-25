import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

function fmtUser(u: typeof usersTable.$inferSelect, includeTemp = false) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    isActive: u.isActive, employeeId: u.employeeId,
    // Only include tempPassword for admin/super_admin (caller decides via includeTemp)
    ...(includeTemp && u.tempPassword ? { tempPassword: u.tempPassword } : {}),
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/users", async (req, res): Promise<void> => {
  const { role, search } = req.query as { role?: string; search?: string };

  let query = db.select().from(usersTable);
  let users = await query;

  if (role) users = users.filter(u => u.role === role);
  if (search) {
    const s = search.toLowerCase();
    users = users.filter(u =>
      u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
    );
  }

  res.json(users.map(u => fmtUser(u, true)));
});

router.post("/users", async (req, res): Promise<void> => {
  const { email, password, name, role, employeeId } = req.body;
  if (!email || !password || !name || !role) {
    res.status(400).json({ error: "email, password, name, role required" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email, passwordHash,
    tempPassword: password, // store plain text for admin view
    name, role,
    employeeId: employeeId ?? null,
  }).returning();

  res.status(201).json(fmtUser(user, true));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(fmtUser(user, true));
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
  if (password) {
    updates.passwordHash = await bcrypt.hash(password, 10);
    updates.tempPassword = password; // update temp password too
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(fmtUser(user, true));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

export default router;
