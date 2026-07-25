import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companySettingsTable } from "@workspace/db";

const router: IRouter = Router();

const DEFAULT_SETTINGS: Record<string, string> = {
  companyName: "My Company",
  companyLogo: "",
  currency: "PKR",
  currencySymbol: "Rs.",
  dateFormat: "DD/MM/YYYY",
  salaryVisibility: "admin_hr",       // admin_hr | all_managers | admin_only
  showSalaryToEmployee: "false",
  timezone: "Asia/Karachi",
};

async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(companySettingsTable);
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
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

export default router;
