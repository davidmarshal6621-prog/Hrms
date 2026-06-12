import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetEmployee, useListAttendance, useListPayroll } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MapPin, Building, Clock, Phone, Mail, FileText, Download, FileSpreadsheet } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: format(new Date(2000, i, 1), "MMMM"),
}));

async function downloadFile(url: string, filename: string) {
  const token = localStorage.getItem("ems_token");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const empId = id ? parseInt(id) : 0;
  const { toast } = useToast();

  const now = new Date();
  const [attMonth, setAttMonth] = useState(now.getMonth() + 1);
  const [attYear, setAttYear] = useState(now.getFullYear());
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1);
  const [payYear, setPayYear] = useState(now.getFullYear());
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: employee, isLoading: empLoading } = useGetEmployee(empId);

  const { data: attendance, isLoading: attLoading } = useListAttendance({ employeeId: empId });

  const { data: payrollList } = useListPayroll({ employeeId: String(empId) });

  async function handleAttendanceCsv() {
    setDownloading("att-csv");
    try {
      await downloadFile(
        `/api/reports/attendance-csv?employeeId=${empId}&month=${attMonth}&year=${attYear}`,
        `attendance_${employee?.employeeCode}_${MONTHS[attMonth - 1].label}_${attYear}.csv`
      );
      toast({ title: "Download started" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  async function handlePayslipPdf() {
    setDownloading("payslip");
    try {
      await downloadFile(
        `/api/reports/payslip-pdf?employeeId=${empId}&month=${payMonth}&year=${payYear}`,
        `payslip_${employee?.employeeCode}_${MONTHS[payMonth - 1].label}_${payYear}.pdf`
      );
      toast({ title: "Payslip downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  if (empLoading) {
    return <div className="p-8 space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!employee) return <div>Employee not found</div>;

  // Filter attendance to selected month
  const filteredAttendance = attendance?.filter(r => {
    const [y, m] = r.date.split("-").map(Number);
    return y === attYear && m === attMonth;
  }) ?? [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link href="/employees">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{employee.firstName} {employee.lastName}</h1>
            <p className="text-sm text-gray-500">{employee.employeeCode} • {employee.designation || "No Designation"}</p>
          </div>
        </div>
        <Badge variant={employee.status === "active" ? "default" : "secondary"}
          className={employee.status === "active" ? "bg-green-100 text-green-800 border-green-200" : ""}>
          {employee.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left panel */}
        <div className="md:col-span-1 space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-sm border-b pb-2">Contact Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-gray-600">
                <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="truncate">{employee.email || "N/A"}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{employee.phone || "N/A"}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                <span>CNIC: {employee.cnic || "N/A"}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-sm border-b pb-2">Employment</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-gray-600">
                <Building className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{employee.departmentName || "No Department"}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{employee.branchName || "No Branch"}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{employee.shiftName || "No Shift"}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
            <h3 className="font-semibold text-sm border-b pb-2">Compensation</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Basic Salary</span>
                <span className="font-semibold">PKR {employee.basicSalary?.toLocaleString() || "0"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Allowances</span>
                <span className="font-semibold">PKR {employee.allowances?.toLocaleString() || "0"}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-700 font-medium">Gross</span>
                <span className="font-bold text-green-700">
                  PKR {((employee.basicSalary ?? 0) + (employee.allowances ?? 0)).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right tabs */}
        <div className="md:col-span-2">
          <Tabs defaultValue="attendance" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="attendance" className="flex-1">Attendance</TabsTrigger>
              <TabsTrigger value="payroll" className="flex-1">Payroll / Payslip</TabsTrigger>
            </TabsList>

            {/* ── Attendance Tab ─────────────────────────────── */}
            <TabsContent value="attendance" className="space-y-4">
              {/* Month/year filter + download */}
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={String(attMonth)} onValueChange={v => setAttMonth(Number(v))}>
                  <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(attYear)} onValueChange={v => setAttYear(Number(v))}>
                  <SelectTrigger className="w-24 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleAttendanceCsv}
                  disabled={downloading === "att-csv"} className="flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4" />
                  {downloading === "att-csv" ? "Downloading..." : "Download CSV"}
                </Button>
              </div>

              {/* Summary chips */}
              {filteredAttendance.length > 0 && (
                <div className="flex gap-2 flex-wrap text-xs">
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    Present: {filteredAttendance.filter(r => ["present", "late"].includes(r.status ?? "")).length}
                  </span>
                  <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                    Late: {filteredAttendance.filter(r => r.isLate).length}
                  </span>
                  <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full">
                    Absent: {filteredAttendance.filter(r => r.status === "absent").length}
                  </span>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    Total Hours: {filteredAttendance.reduce((s, r) => s + (r.workingHours ?? 0), 0).toFixed(1)}h
                  </span>
                </div>
              )}

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attLoading ? (
                      <TableRow><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                    ) : filteredAttendance.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-8">
                        No attendance records for {MONTHS[attMonth - 1].label} {attYear}.
                      </TableCell></TableRow>
                    ) : (
                      filteredAttendance.map(record => (
                        <TableRow key={record.id}>
                          <TableCell className="text-sm font-mono">{record.date}</TableCell>
                          <TableCell className={`text-sm ${record.isLate ? "text-amber-600 font-medium" : ""}`}>
                            {record.checkIn ? record.checkIn.slice(11, 16) : "-"}
                            {record.isLate && <span className="text-xs ml-1 text-amber-500">(late)</span>}
                          </TableCell>
                          <TableCell className={`text-sm ${record.isEarlyOut ? "text-orange-600" : ""}`}>
                            {record.checkOut ? record.checkOut.slice(11, 16) : "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {record.workingHours ? `${record.workingHours.toFixed(1)}h` : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              record.status === "present" ? "bg-green-50 text-green-700 border-green-200" :
                              record.status === "late" ? "bg-amber-50 text-amber-700 border-amber-200" :
                              record.status === "absent" ? "bg-red-50 text-red-700 border-red-200" :
                              "bg-gray-50 text-gray-600"
                            }>
                              {record.status?.toUpperCase()}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── Payroll / Payslip Tab ──────────────────────── */}
            <TabsContent value="payroll" className="space-y-4">
              {/* Month picker + download */}
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={String(payMonth)} onValueChange={v => setPayMonth(Number(v))}>
                  <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(payYear)} onValueChange={v => setPayYear(Number(v))}>
                  <SelectTrigger className="w-24 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={handlePayslipPdf} disabled={downloading === "payslip"}
                  className="flex items-center gap-1.5">
                  <Download className="h-4 w-4" />
                  {downloading === "payslip" ? "Generating PDF..." : "Download Payslip PDF"}
                </Button>
              </div>

              {/* Payroll records list */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right font-semibold">Net Pay</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Payslip</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!payrollList || payrollList.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-8">
                        No payroll records found for this employee.
                      </TableCell></TableRow>
                    ) : (
                      payrollList.map(p => {
                        const gross = (p.basicSalary ?? 0) + (p.allowances ?? 0);
                        const deduct = (p.lateDeductions ?? 0) + (p.leaveDeductions ?? 0) + (p.otherDeductions ?? 0);
                        const monthLabel = MONTHS[(p.month ?? 1) - 1]?.label;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{monthLabel} {p.year}</TableCell>
                            <TableCell className="text-right text-sm">PKR {gross.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-sm text-red-600">
                              -{deduct > 0 ? `PKR ${deduct.toLocaleString()}` : "0"}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-700">
                              PKR {(p.netSalary ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={p.status === "paid" ? "bg-green-50 text-green-700" : ""}>
                                {(p.status ?? "pending").toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="flex items-center gap-1 text-blue-600"
                                onClick={async () => {
                                  setDownloading(`payslip-${p.id}`);
                                  try {
                                    await downloadFile(
                                      `/api/reports/payslip-pdf?employeeId=${empId}&month=${p.month}&year=${p.year}`,
                                      `payslip_${employee.employeeCode}_${monthLabel}_${p.year}.pdf`
                                    );
                                    toast({ title: "Payslip downloaded" });
                                  } catch (e: any) {
                                    toast({ title: "Error", description: e.message, variant: "destructive" });
                                  } finally {
                                    setDownloading(null);
                                  }
                                }}
                                disabled={downloading === `payslip-${p.id}`}
                              >
                                <Download className="h-3.5 w-3.5" />
                                PDF
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
