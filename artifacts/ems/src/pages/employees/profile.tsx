import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetEmployee, useListAttendance, useListPayroll } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, MapPin, Building, Clock, Phone, Mail, FileText,
  Download, FileSpreadsheet, Save, User, Briefcase, Heart,
  CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

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

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("ems_token");
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

type EmpData = {
  id: number; employeeCode: string; firstName: string; lastName: string;
  email?: string | null; phone?: string | null; cnic?: string | null; designation?: string | null;
  departmentId?: number | null; departmentName?: string | null;
  branchId?: number | null; branchName?: string | null;
  shiftId?: number | null; shiftName?: string | null;
  dateOfJoining?: string | null; basicSalary?: number | null; allowances?: number | null;
  enrollNumber?: string | null; status: string;
  address?: string | null; fatherName?: string | null; emergencyContact?: string | null;
  bloodGroup?: string | null; dateOfBirth?: string | null; gender?: string | null;
  religion?: string | null; nationality?: string | null;
  cvData?: any; cvStatus?: string | null; profilePhoto?: string | null;
  createdAt: string;
};

export default function EmployeeProfile() {
  const { id } = useParams();
  const empId = id ? parseInt(id) : 0;
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const isAdminOrHr = isAdmin || user?.role === "hr";

  const now = new Date();
  const [attMonth, setAttMonth] = useState(now.getMonth() + 1);
  const [attYear, setAttYear] = useState(now.getFullYear());
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1);
  const [payYear, setPayYear] = useState(now.getFullYear());
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: employee, isLoading: empLoading } = useGetEmployee(empId);

  const { data: attendance, isLoading: attLoading } = useListAttendance({ employeeId: empId });
  const { data: payrollList } = useListPayroll({ employeeId: empId });

  // Personal info edit state
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState<Partial<EmpData>>({});

  // CV state
  const [editingCv, setEditingCv] = useState(false);
  const [cvText, setCvText] = useState("");

  const updateMut = useMutation({
    mutationFn: (data: any) => apiFetch(`/employees/${empId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["getEmployee", empId] });
      toast({ title: "Employee updated" });
      setEditingPersonal(false);
      setEditingCv(false);
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  function startEditPersonal() {
    if (!employee) return;
    const e = employee as unknown as EmpData;
    setPersonalForm({
      firstName: e.firstName, lastName: e.lastName,
      email: e.email ?? "", phone: e.phone ?? "", cnic: e.cnic ?? "",
      fatherName: e.fatherName ?? "", address: e.address ?? "",
      emergencyContact: e.emergencyContact ?? "", bloodGroup: e.bloodGroup ?? "",
      dateOfBirth: e.dateOfBirth ?? "", gender: e.gender ?? "",
      religion: e.religion ?? "", nationality: e.nationality ?? "",
      profilePhoto: e.profilePhoto ?? "",
    });
    setEditingPersonal(true);
  }

  function startEditCv() {
    if (!employee) return;
    const e = employee as unknown as EmpData;
    const cv = e.cvData;
    setCvText(cv ? (typeof cv === "string" ? cv : JSON.stringify(cv, null, 2)) : "");
    setEditingCv(true);
  }

  async function handleAttendanceCsv() {
    const e = employee as unknown as EmpData;
    setDownloading("att-csv");
    try {
      await downloadFile(
        `/api/reports/attendance-csv?employeeId=${empId}&month=${attMonth}&year=${attYear}`,
        `attendance_${e?.employeeCode}_${MONTHS[attMonth - 1].label}_${attYear}.csv`
      );
      toast({ title: "Download started" });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally { setDownloading(null); }
  }

  async function handlePayslipPdf(month = payMonth, year = payYear) {
    const e = employee as unknown as EmpData;
    setDownloading("payslip");
    try {
      await downloadFile(
        `/api/reports/payslip-pdf?employeeId=${empId}&month=${month}&year=${year}`,
        `payslip_${e?.employeeCode}_${MONTHS[month - 1].label}_${year}.pdf`
      );
      toast({ title: "Payslip downloaded" });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally { setDownloading(null); }
  }

  if (empLoading) {
    return <div className="p-8 space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!employee) return <div className="p-8 text-gray-500">Employee not found</div>;

  const emp = employee as unknown as EmpData;

  const filteredAttendance = (attendance ?? []).filter(r => {
    const [y, m] = r.date.split("-").map(Number);
    return y === attYear && m === attMonth;
  });

  function CvStatusBadge({ status }: { status?: string | null }) {
    if (!status) return null;
    const styles: Record<string, string> = {
      pending_approval: "bg-amber-100 text-amber-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    const icons: Record<string, any> = {
      pending_approval: AlertCircle, approved: CheckCircle, rejected: XCircle,
    };
    const Icon = icons[status] ?? AlertCircle;
    return (
      <Badge variant="outline" className={`border-0 gap-1 ${styles[status] ?? "bg-gray-100"}`}>
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
      </Badge>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link href="/employees">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex items-center gap-3">
            {emp.profilePhoto ? (
              <img src={emp.profilePhoto} alt="Profile" className="h-12 w-12 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                {emp.firstName?.charAt(0)}{emp.lastName?.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{emp.firstName} {emp.lastName}</h1>
              <p className="text-sm text-gray-500">{emp.employeeCode} • {emp.designation || "No Designation"}</p>
            </div>
          </div>
        </div>
        <Badge variant={emp.status === "active" ? "default" : "secondary"}
          className={emp.status === "active" ? "bg-green-100 text-green-800 border-green-200" : ""}>
          {emp.status}
        </Badge>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="mb-4 grid grid-cols-4 w-full">
          <TabsTrigger value="personal" className="gap-1.5"><User className="h-3.5 w-3.5" />Personal</TabsTrigger>
          <TabsTrigger value="work" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />Work</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        {/* ── Personal Info ─────────────────────────────────── */}
        <TabsContent value="personal" className="space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-semibold text-gray-900">Personal Information</h3>
              {isAdminOrHr && !editingPersonal && (
                <Button size="sm" variant="outline" onClick={startEditPersonal}>Edit</Button>
              )}
              {editingPersonal && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingPersonal(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => updateMut.mutate(personalForm)} disabled={updateMut.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {updateMut.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>

            {editingPersonal ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: "firstName", label: "First Name" },
                  { key: "lastName", label: "Last Name" },
                  { key: "cnic", label: "CNIC / NIC" },
                  { key: "dateOfBirth", label: "Date of Birth", type: "date" },
                  { key: "gender", label: "Gender" },
                  { key: "bloodGroup", label: "Blood Group" },
                  { key: "religion", label: "Religion" },
                  { key: "nationality", label: "Nationality" },
                  { key: "fatherName", label: "Father's Name" },
                  { key: "phone", label: "Phone" },
                  { key: "email", label: "Email" },
                  { key: "emergencyContact", label: "Emergency Contact" },
                ].map(f => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      type={f.type || "text"}
                      value={(personalForm as any)[f.key] ?? ""}
                      onChange={e => setPersonalForm(p => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </Field>
                ))}
                <div className="md:col-span-2">
                  <Field label="Address">
                    <Textarea value={personalForm.address ?? ""} rows={2}
                      onChange={e => setPersonalForm(p => ({ ...p, address: e.target.value }))} />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Profile Photo URL">
                    <Input value={personalForm.profilePhoto ?? ""}
                      onChange={e => setPersonalForm(p => ({ ...p, profilePhoto: e.target.value }))}
                      placeholder="https://example.com/photo.jpg" />
                  </Field>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                {[
                  { label: "CNIC", value: emp.cnic },
                  { label: "Date of Birth", value: emp.dateOfBirth },
                  { label: "Gender", value: emp.gender },
                  { label: "Blood Group", value: emp.bloodGroup },
                  { label: "Religion", value: emp.religion },
                  { label: "Nationality", value: emp.nationality },
                  { label: "Father's Name", value: emp.fatherName },
                  { label: "Phone", value: emp.phone },
                  { label: "Email", value: emp.email },
                  { label: "Emergency Contact", value: emp.emergencyContact },
                ].map(item => (
                  <div key={item.label}>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{item.label}</div>
                    <div className="mt-0.5 text-gray-700">{item.value || <span className="text-gray-400 italic">Not set</span>}</div>
                  </div>
                ))}
                <div className="sm:col-span-2 md:col-span-3">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Address</div>
                  <div className="mt-0.5 text-gray-700">{emp.address || <span className="text-gray-400 italic">Not set</span>}</div>
                </div>
              </div>
            )}
          </div>

          {/* CV / Documents */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-900">CV / Documents</h3>
                <CvStatusBadge status={emp.cvStatus} />
              </div>
              <div className="flex gap-2">
                {isAdminOrHr && emp.cvStatus === "pending_approval" && (
                  <>
                    <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => updateMut.mutate({ cvStatus: "approved" })}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => updateMut.mutate({ cvStatus: "rejected" })}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </>
                )}
                {!editingCv && (
                  <Button size="sm" variant="outline" onClick={startEditCv}>
                    {emp.cvData ? "Update CV" : "Add CV"}
                  </Button>
                )}
                {editingCv && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingCv(false)}>Cancel</Button>
                    <Button size="sm" onClick={() => {
                      let parsed: any = cvText;
                      try { parsed = JSON.parse(cvText); } catch { /* save as string */ }
                      updateMut.mutate({ cvData: parsed, cvStatus: isAdminOrHr ? "approved" : "pending_approval" });
                    }} disabled={updateMut.isPending}>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {updateMut.isPending ? "Saving..." : "Save CV"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {editingCv ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Enter CV as JSON (with education, experience, skills, certifications) or plain text.</p>
                <Textarea value={cvText} onChange={e => setCvText(e.target.value)} rows={12}
                  className="font-mono text-xs" placeholder='{"education": [], "experience": [], "skills": [], "certifications": []}' />
              </div>
            ) : emp.cvData ? (
              <div className="space-y-4 text-sm">
                {typeof emp.cvData === "object" ? (
                  <>
                    {emp.cvData.experience?.length > 0 && (
                      <div>
                        <div className="font-semibold text-gray-700 mb-2">Experience</div>
                        {emp.cvData.experience.map((x: any, i: number) => (
                          <div key={i} className="pl-3 border-l-2 border-blue-200 mb-2">
                            <div className="font-medium">{x.title || x.position} — {x.company}</div>
                            <div className="text-gray-500 text-xs">{x.duration || x.from}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {emp.cvData.education?.length > 0 && (
                      <div>
                        <div className="font-semibold text-gray-700 mb-2">Education</div>
                        {emp.cvData.education.map((e: any, i: number) => (
                          <div key={i} className="pl-3 border-l-2 border-green-200 mb-2">
                            <div className="font-medium">{e.degree} — {e.institution}</div>
                            <div className="text-gray-500 text-xs">{e.year}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {emp.cvData.skills?.length > 0 && (
                      <div>
                        <div className="font-semibold text-gray-700 mb-2">Skills</div>
                        <div className="flex flex-wrap gap-1.5">
                          {emp.cvData.skills.map((s: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {emp.cvData.certifications?.length > 0 && (
                      <div>
                        <div className="font-semibold text-gray-700 mb-2">Certifications</div>
                        {emp.cvData.certifications.map((c: any, i: number) => (
                          <div key={i} className="text-gray-600 text-xs">• {typeof c === "string" ? c : c.name}</div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap">{String(emp.cvData)}</pre>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No CV data on file.</p>
            )}
          </div>
        </TabsContent>

        {/* ── Work Info ──────────────────────────────────────── */}
        <TabsContent value="work">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-sm border-b pb-2">Employment Details</h3>
              <div className="space-y-3 text-sm">
                {[
                  { icon: Mail, label: emp.email || "N/A" },
                  { icon: Phone, label: emp.phone || "N/A" },
                  { icon: Building, label: emp.departmentName || "No Department" },
                  { icon: MapPin, label: emp.branchName || "No Branch" },
                  { icon: Clock, label: emp.shiftName || "No Shift" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-gray-600">
                    <item.icon className="h-4 w-4 shrink-0 text-gray-400" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-sm border-b pb-2">Other Details</h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Employee Code", value: emp.employeeCode },
                  { label: "Designation", value: emp.designation || "N/A" },
                  { label: "Date of Joining", value: emp.dateOfJoining || "N/A" },
                  { label: "ZK Enroll #", value: emp.enrollNumber || "Not linked" },
                  { label: "Status", value: emp.status },
                ].map(item => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="font-medium text-gray-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {isAdminOrHr && (
              <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 md:col-span-2">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Heart className="h-4 w-4 text-indigo-500" />
                  <h3 className="font-semibold text-sm">Compensation</h3>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs mb-1">Basic Salary</div>
                    <div className="font-bold text-gray-900">PKR {emp.basicSalary?.toLocaleString() ?? "0"}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs mb-1">Allowances</div>
                    <div className="font-bold text-gray-900">PKR {emp.allowances?.toLocaleString() ?? "0"}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs mb-1">Gross Total</div>
                    <div className="font-bold text-blue-700">
                      PKR {((emp.basicSalary ?? 0) + (emp.allowances ?? 0)).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Attendance Tab ────────────────────────────────── */}
        <TabsContent value="attendance" className="space-y-4">
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
                  <TableHead>Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attLoading ? (
                  <TableRow><TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                ) : filteredAttendance.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-8">
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
                      <TableCell className="text-sm">{record.workingHours ? `${record.workingHours.toFixed(1)}h` : "-"}</TableCell>
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
                      <TableCell className="text-xs text-gray-500">
                        {(record as any).checkInDeviceName || (record.source === "manual" ? "Manual" : "-")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Payroll Tab ───────────────────────────────────── */}
        <TabsContent value="payroll" className="space-y-4">
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
            <Button onClick={() => handlePayslipPdf()} disabled={downloading === "payslip"}
              className="flex items-center gap-1.5">
              <Download className="h-4 w-4" />
              {downloading === "payslip" ? "Generating PDF..." : "Download Payslip PDF"}
            </Button>
          </div>

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
                    No payroll records found.
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
                          <Button variant="ghost" size="sm" className="text-blue-600"
                            onClick={() => handlePayslipPdf(p.month ?? payMonth, p.year ?? payYear)}
                            disabled={!!downloading}>
                            <Download className="h-3.5 w-3.5 mr-1" /> PDF
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
  );
}
