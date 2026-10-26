import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, employeesTable, attendanceTable, payrollTable, departmentsTable, branchesTable } from "@workspace/db";
import PDFDocument from "pdfkit";

const router: IRouter = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmtTime(d: Date | null | undefined): string {
  if (!d) return "--:--";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function fmtHours(h: number | null | undefined): string {
  if (h == null) return "-";
  return `${h.toFixed(1)} hrs`;
}
function currency(n: number | null | undefined): string {
  if (n == null) return "PKR 0";
  return `PKR ${n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Attendance CSV ──────────────────────────────────────────────────────────

router.get("/reports/attendance-csv", async (req, res): Promise<void> => {
  const { employeeId, month, year, date, startDate: requestedStart, endDate: requestedEnd } =
    req.query as {
      employeeId?: string;
      month?: string;
      year?: string;
      date?: string;
      startDate?: string;
      endDate?: string;
    };
  const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const eid = employeeId === undefined ? undefined : Number(employeeId);
  if (eid !== undefined && (!Number.isInteger(eid) || eid <= 0)) {
    res.status(400).json({ error: "employeeId must be a positive integer" });
    return;
  }

  let startDate: string;
  let endDate: string;
  if (date !== undefined) {
    if (!isIsoDate(date)) { res.status(400).json({ error: "Use a valid date in YYYY-MM-DD format" }); return; }
    startDate = date;
    endDate = date;
  } else if (requestedStart !== undefined || requestedEnd !== undefined) {
    if (
      !requestedStart || !requestedEnd
      || !isIsoDate(requestedStart) || !isIsoDate(requestedEnd)
      || requestedStart > requestedEnd
    ) {
      res.status(400).json({ error: "Provide a valid startDate and endDate with startDate on or before endDate" });
      return;
    }
    startDate = requestedStart;
    endDate = requestedEnd;
  } else {
    const now = new Date();
    const m = month === undefined ? now.getMonth() + 1 : Number(month);
    const y = year === undefined ? now.getFullYear() : Number(year);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1900 || y > 9999) {
      res.status(400).json({ error: "Provide a valid month and year" });
      return;
    }
    startDate = `${y}-${pad(m)}-01`;
    endDate = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  }

  const [employee] = eid === undefined
    ? []
    : await db.select().from(employeesTable).where(eq(employeesTable.id, eid));
  if (eid !== undefined && !employee) { res.status(404).json({ error: "Employee not found" }); return; }

  const conditions = [
    gte(attendanceTable.date, startDate),
    lte(attendanceTable.date, endDate),
  ];
  if (eid !== undefined) conditions.push(eq(attendanceTable.employeeId, eid));
  const records = await db.select().from(attendanceTable)
    .where(and(...conditions))
    .orderBy(attendanceTable.date, attendanceTable.employeeId);
  const employees = eid === undefined
    ? await db.select().from(employeesTable)
    : employee ? [employee] : [];
  const employeeMap = new Map(employees.map(item => [item.id, item]));

  const csvCell = (value: string | number) => {
    const text = String(value);
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const filename = employee
    ? `attendance_${employee.employeeCode}_${startDate}_to_${endDate}.csv`
    : `attendance_${startDate}_to_${endDate}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const csvLines = [
    `Attendance Report`,
    `Period: ${startDate} to ${endDate}`,
    ``,
    `Date,Employee Code,Employee,Check In,Check Out,Working Hours,Status,Late,Early Out`,
  ];
  for (const record of records) {
    const rowEmployee = employeeMap.get(record.employeeId);
    csvLines.push([
      record.date,
      rowEmployee?.employeeCode ?? "-",
      rowEmployee ? `${rowEmployee.firstName} ${rowEmployee.lastName}` : "-",
      record.checkIn ? fmtTime(record.checkIn) : "-",
      record.checkOut ? fmtTime(record.checkOut) : "-",
      fmtHours(record.workingHours),
      record.status ?? "-",
      record.isLate ? "Yes" : "No",
      record.isEarlyOut ? "Yes" : "No",
    ].map(csvCell).join(","));
  }
  const present = records.filter(record => ["present", "late"].includes(record.status)).length;
  const absent = records.filter(record => record.status === "absent").length;
  const late = records.filter(record => record.isLate).length;
  const totalHours = records.reduce((sum, record) => sum + (record.workingHours ?? 0), 0);
  csvLines.push("", "Summary", csvCell("Total Records") + "," + records.length,
    csvCell("Present Days") + "," + present,
    csvCell("Absent Days") + "," + absent,
    csvCell("Late Days") + "," + late,
    csvCell("Total Working Hours") + "," + csvCell(`${totalHours.toFixed(1)} hrs`));
  res.end(csvLines.join("\r\n"));
});

// ─── Payslip PDF ─────────────────────────────────────────────────────────────

router.get("/reports/payslip-pdf", async (req, res): Promise<void> => {
  const { employeeId, month, year } = req.query as { employeeId?: string; month?: string; year?: string };
  if (!employeeId) { res.status(400).json({ error: "employeeId required" }); return; }

  const eid = parseInt(employeeId, 10);
  const now = new Date();
  const m = month ? parseInt(month, 10) : now.getMonth() + 1;
  const y = year ? parseInt(year, 10) : now.getFullYear();

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, eid));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

  const [payroll] = await db.select().from(payrollTable)
    .where(and(
      eq(payrollTable.employeeId, eid),
      eq(payrollTable.month, m),
      eq(payrollTable.year, y),
    ));

  const [dept] = emp.departmentId
    ? await db.select({ name: departmentsTable.name }).from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId))
    : [];
  const [branch] = emp.branchId
    ? await db.select({ name: branchesTable.name }).from(branchesTable).where(eq(branchesTable.id, emp.branchId))
    : [];

  const monthName = new Date(y, m - 1, 1).toLocaleString("en", { month: "long" });
  const filename = `payslip_${emp.employeeCode}_${monthName}_${y}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // ── Colors & Layout ──────────────────────────────────────────────────────
  const PRIMARY = "#1e3a5f";
  const ACCENT = "#3b82f6";
  const LIGHT = "#f0f4f8";
  const DARK = "#1f2937";
  const MUTED = "#6b7280";

  const pageWidth = doc.page.width - 100; // margins
  const col1 = 50;
  const col2 = 300;

  // ── Header Band ───────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 110).fill(PRIMARY);

  // Company name
  doc.fillColor("white").fontSize(22).font("Helvetica-Bold")
    .text("PAYSLIP", col1, 25);
  doc.fontSize(11).font("Helvetica")
    .text(`${monthName} ${y}`, col1, 52);
  doc.fontSize(9).fillColor("#93c5fd")
    .text("Employee Management System", col1, 70);

  // Net salary bubble
  const netSalary = payroll?.netSalary ?? 0;
  doc.roundedRect(doc.page.width - 200, 20, 160, 70, 8).fill(ACCENT);
  doc.fillColor("white").fontSize(9).font("Helvetica")
    .text("NET SALARY", doc.page.width - 200, 28, { width: 160, align: "center" });
  doc.fontSize(18).font("Helvetica-Bold")
    .text(currency(netSalary), doc.page.width - 200, 45, { width: 160, align: "center" });

  // ── Employee Info ─────────────────────────────────────────────────────────
  const infoY = 130;
  doc.rect(col1, infoY, pageWidth, 90).fill(LIGHT);

  doc.fillColor(DARK).fontSize(13).font("Helvetica-Bold")
    .text(`${emp.firstName} ${emp.lastName}`, col1 + 15, infoY + 12);
  doc.fontSize(10).font("Helvetica").fillColor(MUTED)
    .text(emp.designation ?? "Employee", col1 + 15, infoY + 30);

  // Two-column info grid
  const infoItems = [
    ["Employee Code", emp.employeeCode],
    ["Department", dept?.name ?? "-"],
    ["Branch", branch?.name ?? "-"],
    ["Date of Joining", emp.dateOfJoining ?? "-"],
  ];

  let infoX = col1 + 15;
  let infoRow = infoY + 50;
  infoItems.forEach((item, idx) => {
    const x = idx < 2 ? infoX : col2 + 15;
    const y2 = idx % 2 === 0 ? infoRow : infoRow;
    if (idx === 2) infoRow = infoY + 50;
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(item[0], x, y2);
    doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold").text(item[1], x, y2 + 10);
  });

  // ── Earnings Table ────────────────────────────────────────────────────────
  const tableStartY = infoY + 105;

  function drawTableHeader(x: number, y: number, w: number, title: string) {
    doc.rect(x, y, w, 24).fill(PRIMARY);
    doc.fillColor("white").fontSize(9).font("Helvetica-Bold").text(title, x + 10, y + 7);
    doc.text("Amount", x + w - 100, y + 7, { width: 90, align: "right" });
  }

  function drawTableRow(x: number, y: number, w: number, label: string, value: string, shade: boolean) {
    if (shade) doc.rect(x, y, w, 22).fill("#f9fafb");
    doc.fillColor(DARK).fontSize(9).font("Helvetica").text(label, x + 10, y + 6);
    doc.text(value, x + w - 100, y + 6, { width: 90, align: "right" });
  }

  function drawTableFooter(x: number, y: number, w: number, label: string, value: string) {
    doc.rect(x, y, w, 26).fill("#e0f2fe");
    doc.fillColor(PRIMARY).fontSize(10).font("Helvetica-Bold").text(label, x + 10, y + 7);
    doc.text(value, x + w - 100, y + 7, { width: 90, align: "right" });
  }

  const basicSalary = emp.basicSalary ?? 0;
  const allowances = emp.allowances ?? 0;
  const grossSalary = basicSalary + allowances;

  const halfW = (pageWidth - 15) / 2;

  // Earnings
  drawTableHeader(col1, tableStartY, halfW, "EARNINGS");
  drawTableRow(col1, tableStartY + 24, halfW, "Basic Salary", currency(basicSalary), false);
  drawTableRow(col1, tableStartY + 46, halfW, "Allowances", currency(allowances), true);
  drawTableFooter(col1, tableStartY + 68, halfW, "Gross Salary", currency(grossSalary));

  // Deductions
  const lateDeduct = payroll?.lateDeductions ?? 0;
  const leaveDeduct = payroll?.leaveDeductions ?? 0;
  const otherDeduct = payroll?.otherDeductions ?? 0;
  const totalDeductions = lateDeduct + leaveDeduct + otherDeduct;

  drawTableHeader(col2 + 5, tableStartY, halfW, "DEDUCTIONS");
  drawTableRow(col2 + 5, tableStartY + 24, halfW, "Late Arrival Deduction", currency(lateDeduct), false);
  drawTableRow(col2 + 5, tableStartY + 46, halfW, "Leave Deduction", currency(leaveDeduct), true);
  drawTableRow(col2 + 5, tableStartY + 68, halfW, "Other Deductions", currency(otherDeduct), false);
  drawTableFooter(col2 + 5, tableStartY + 90, halfW, "Total Deductions", currency(totalDeductions));

  // ── Attendance Summary ────────────────────────────────────────────────────
  const attY = tableStartY + 135;
  doc.rect(col1, attY, pageWidth, 24).fill(PRIMARY);
  doc.fillColor("white").fontSize(9).font("Helvetica-Bold").text("ATTENDANCE SUMMARY", col1 + 10, attY + 7);

  const attStats = [
    ["Present Days", String(payroll?.presentDays ?? "-")],
    ["Absent Days", String(payroll?.absentDays ?? "-")],
    ["Late Days", String(payroll?.lateDays ?? "-")],
  ];

  const attColW = pageWidth / attStats.length;
  attStats.forEach((item, idx) => {
    const ax = col1 + idx * attColW;
    const ay = attY + 24;
    if (idx > 0) doc.moveTo(ax, ay).lineTo(ax, ay + 40).strokeColor("#e5e7eb").stroke();
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(item[0], ax + 10, ay + 8);
    doc.fillColor(DARK).fontSize(14).font("Helvetica-Bold").text(item[1], ax + 10, ay + 20);
  });

  doc.rect(col1, attY + 24, pageWidth, 44).strokeColor("#e5e7eb").stroke();

  // ── Net Pay Banner ────────────────────────────────────────────────────────
  const netY = attY + 85;
  doc.rect(col1, netY, pageWidth, 50).fill(ACCENT);
  doc.fillColor("white").fontSize(12).font("Helvetica").text("NET PAY FOR THE MONTH", col1 + 20, netY + 10);
  doc.fontSize(20).font("Helvetica-Bold").text(currency(netSalary), col1 + 20, netY + 25);
  doc.fontSize(10).text(`${monthName} ${y}`, doc.page.width - 200, netY + 18, { align: "right", width: 150 });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = netY + 70;
  doc.moveTo(col1, footerY).lineTo(col1 + pageWidth, footerY).strokeColor("#e5e7eb").lineWidth(1).stroke();

  doc.fillColor(MUTED).fontSize(8).font("Helvetica")
    .text("This is a computer-generated payslip and does not require a physical signature.", col1, footerY + 10, {
      width: pageWidth, align: "center",
    });
  doc.text(`Generated on ${new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })}`,
    col1, footerY + 22, { width: pageWidth, align: "center" });

  doc.end();
});

// ─── Payslip availability check ──────────────────────────────────────────────

router.get("/reports/payslip-check", async (req, res): Promise<void> => {
  const { employeeId, month, year } = req.query as { employeeId?: string; month?: string; year?: string };
  if (!employeeId) { res.status(400).json({ error: "employeeId required" }); return; }

  const eid = parseInt(employeeId, 10);
  const now = new Date();
  const m = month ? parseInt(month, 10) : now.getMonth() + 1;
  const y = year ? parseInt(year, 10) : now.getFullYear();

  const [payroll] = await db.select().from(payrollTable)
    .where(and(eq(payrollTable.employeeId, eid), eq(payrollTable.month, m), eq(payrollTable.year, y)));

  res.json({ available: !!payroll, payrollId: payroll?.id ?? null, month: m, year: y });
});

export default router;
