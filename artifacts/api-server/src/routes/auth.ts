import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, usersTable, tenantsTable, companySettingsTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const JWT_SECRET: string = process.env.SESSION_SECRET || "";
if (!JWT_SECRET) throw new Error("SESSION_SECRET must be set");
type SessionPayload = { id: number; email: string; role: string; name: string; tenantId: number };

export function signToken(payload: SessionPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<SessionPayload>;
    if (!Number.isInteger(payload.id) || !Number.isInteger(payload.tenantId)) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

async function ensureLegacyTenant(): Promise<void> {
  await db.transaction(async tx => {
    const [legacySettings] = await tx.select().from(companySettingsTable).where(and(
      eq(companySettingsTable.tenantId, 1),
      eq(companySettingsTable.key, "companyName"),
    ));
    const inserted = await tx.insert(tenantsTable).values({
      id: 1,
      name: legacySettings?.value || "Legacy Company",
      slug: "legacy-company",
    }).onConflictDoNothing().returning({ id: tenantsTable.id });
    if (inserted.length) {
      await tx.execute(sql`
        SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT COALESCE(MAX(id), 1) FROM tenants), 1),
          true
        )
      `);
    }
  });
}

function companySlug(name: string) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${base || "company"}-${randomUUID().slice(0, 8)}`;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  await ensureLegacyTenant();
  const [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`);
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId));
  const tenantName = tenant?.name ?? "Company";
  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    tenantId: user.tenantId,
  });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId,
      tenantId: user.tenantId,
      tenantName,
    },
    token,
  });
});

router.post("/auth/signup", async (req, res): Promise<void> => {
  const companyName = typeof req.body?.companyName === "string" ? req.body.companyName.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;

  if (companyName.length < 2 || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || typeof password !== "string" || password.length < 8 || password.length > 200) {
    res.status(400).json({
      error: "Company name, your name, a valid email, and a password of at least 8 characters are required",
    });
    return;
  }

  await ensureLegacyTenant();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await db.transaction(async tx => {
      const [tenant] = await tx.insert(tenantsTable).values({
        name: companyName,
        slug: companySlug(companyName),
      }).returning();
      const [user] = await tx.insert(usersTable).values({
        tenantId: tenant.id,
        email,
        passwordHash,
        name,
        role: "admin",
      }).returning();
      await tx.insert(companySettingsTable).values({
        tenantId: tenant.id,
        key: "companyName",
        value: companyName,
      }).onConflictDoNothing();
      return { tenant, user };
    });

    const token = signToken({
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      name: result.user.name,
      tenantId: result.tenant.id,
    });
    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        employeeId: result.user.employeeId,
        tenantId: result.tenant.id,
        tenantName: result.tenant.name,
      },
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("users_email_unique") || message.includes("duplicate key")) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    throw error;
  }
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  await ensureLegacyTenant();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
  if (!user || !user.isActive || user.tenantId !== payload.tenantId) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId));
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    tenantId: user.tenantId,
    tenantName: tenant?.name ?? "Company",
  });
});

export default router;
