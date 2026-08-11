import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companySettingsTable, employeesTable } from "@workspace/db";
import {
  DEFAULT_SETTINGS,
  ensureDefaultReferenceData,
  getProvisioningDefaults,
} from "../lib/employee-provisioning.js";

const router: IRouter = Router();

const COMPANY_DEFAULT_SETTINGS: Record<string, string> = {
  companyName: "My Company",
  companyLogo: "",
  currency: "PKR",
  currencySymbol: "Rs.",
  dateFormat: "DD/MM/YYYY",
  salaryVisibility: "admin_hr",       // admin_hr | all_managers | admin_only
  showSalaryToEmployee: "false",
  timezone: "Asia/Karachi",
  ...DEFAULT_SETTINGS,
};

async function getAllSettings(): Promise<Record<string, string>> {
  const refs = await ensureDefaultReferenceData();
  const rows = await db.select().from(companySettingsTable);
  const map: Record<string, string> = {
    ...COMPANY_DEFAULT_SETTINGS,
    defaultShiftId: String(refs.shiftId),
    defaultDepartmentId: String(refs.departmentId),
    defaultBranchId: String(refs.branchId),
  };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

router.get("/company-settings", async (_req, res): Promise<void> => {
  res.json(await getAllSettings());
});

router.patch("/company-settings", async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Body must be a key-value object" });
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value !== "string") continue;
    const existing = await db.select().from(companySettingsTable).where(eq(companySettingsTable.key, key));
    if (existing.length > 0) {
      await db.update(companySettingsTable).set({ value }).where(eq(companySettingsTable.key, key));
    } else {
      await db.insert(companySettingsTable).values({ key, value });
    }
  }

  res.json(await getAllSettings());
});

router.post("/company-settings/apply-defaults", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const defaults = await getProvisioningDefaults();
  const updates = {
    departmentId: body.departmentId !== undefined ? Number(body.departmentId) : defaults.departmentId,
    branchId: body.branchId !== undefined ? Number(body.branchId) : defaults.branchId,
    shiftId: body.shiftId !== undefined ? Number(body.shiftId) : defaults.shiftId,
    designation: typeof body.designation === "string" ? body.designation : defaults.designation,
    basicSalary: body.basicSalary !== undefined ? Number(body.basicSalary) : defaults.salary,
  };
  const employees = await db.select({ id: employeesTable.id }).from(employeesTable);
  for (const employee of employees) {
    await db.update(employeesTable).set(updates).where(eq(employeesTable.id, employee.id));
  }
  res.json({ success: true, updated: employees.length, defaults: updates });
});

export default router;
