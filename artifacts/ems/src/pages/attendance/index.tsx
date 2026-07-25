import { useState } from "react";
import { useListAttendance, useListEmployees } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Calendar as CalendarIcon, Plus, Pencil, AlertCircle, Download } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("ems_token");
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  if (res.status === 204) return null;
  return res.json();
}

function formatTime(iso?: string | null) {
  if (!iso) return "--:--";
  try { return iso.slice(11, 16); } catch { return iso; }
}

function getStatusColor(status?: string | null, isManuallyEdited?: boolean | null) {
  if (isManuallyEdited) return "bg-yellow-50 border-yellow-200";
  switch (status) {
    case "present": return "hover:bg-gray-50/50";
    case "absent": return "bg-red-50/40 hover:bg-red-50/60";
    case "late": return "bg-amber-50/40 hover:bg-amber-50/60";
    case "on-leave": return "bg-blue-50/30 hover:bg-blue-50/50";
    default: return "hover:bg-gray-50/50";
  }
}

function getStatusBadge(status?: string | null) {
  switch (status) {
    case "present": return "bg-green-100 text-green-800";
    case "absent": return "bg-red-100 text-red-800";
    case "late": return "bg-amber-100 text-amber-800";
    case "half-day": return "bg-orange-100 text-orange-800";
    case "on-leave": return "bg-blue-100 text-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

type AttRecord = {
  id: number; employeeId: number; employeeName?: string | null; employeeCode?: string | null;
  date: string; checkIn?: string | null; checkOut?: string | null; workingHours?: number | null;
  status: string; isLate?: boolean | null; isEarlyOut?: boolean | null; source?: string | null;
  notes?: string | null; checkInDeviceName?: string | null; checkOutDeviceName?: string | null;
  checkInVerifyType?: string | null; checkOutVerifyType?: string | null;
  isManuallyEdited?: boolean | null; correctionNote?: string | null;
  correctedBy?: string | null; correctedAt?: string | null;
  createdAt: string;
};

type Employee = { id: number; firstName: string; lastName: string; employeeCode: string };

export default function AttendanceList() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: attendanceData = [], isLoading } = useListAttendance({ date });
  const { data: employees = [] } = useListEmployees({});

  // Correct modal
  const [correctRec, setCorrectRec] = useState<AttRecord | null>(null);
  const [correctForm, setCorrectForm] = useState({ checkIn: "", checkOut: "", correctionNote: "" });

  // Add manual modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    employeeId: "", date: format(new Date(), "yyyy-MM-dd"),
    checkIn: "", checkOut: "", status: "present", notes: "",
  });

  const filteredData = (attendanceData as AttRecord[]).filter(r => {
    const matchSearch = !searchTerm || (
      r.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const correctMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/attendance/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listAttendance"] });
      setCorrectRec(null);
      toast({ title: "Attendance corrected", description: "Record updated and marked as manually edited." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addMut = useMutation({
    mutationFn: (data: any) => apiFetch("/attendance", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listAttendance"] });
      setShowAddModal(false);
      setAddForm({ employeeId: "", date: format(new Date(), "yyyy-MM-dd"), checkIn: "", checkOut: "", status: "present", notes: "" });
      toast({ title: "Record added", description: "Manual attendance record created." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCorrect(rec: AttRecord) {
    setCorrectRec(rec);
    setCorrectForm({
      checkIn: rec.checkIn ? rec.checkIn.slice(0, 16) : "",
      checkOut: rec.checkOut ? rec.checkOut.slice(0, 16) : "",
      correctionNote: "",
    });
  }

  function submitCorrection() {
    if (!correctRec) return;
    correctMut.mutate({
      id: correctRec.id,
      data: {
        checkIn: correctForm.checkIn || undefined,
        checkOut: correctForm.checkOut || undefined,
        correctionNote: correctForm.correctionNote || "Manually corrected",
        correctedBy: "HR/Admin",
      },
    });
  }

  function submitAdd() {
    if (!addForm.employeeId) { toast({ title: "Select an employee", variant: "destructive" }); return; }
    addMut.mutate({
      employeeId: parseInt(addForm.employeeId),
      date: addForm.date,
      checkIn: addForm.checkIn || undefined,
      checkOut: addForm.checkOut || undefined,
      status: addForm.status,
      notes: addForm.notes,
    });
  }

  async function exportCsv() {
    const token = localStorage.getItem("ems_token");
    const res = await fetch(`/api/reports/attendance-csv?date=${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { toast({ title: "Export failed", variant: "destructive" }); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${date}.csv`;
    a.click();
  }

  const stats = {
    present: filteredData.filter(r => ["present", "late"].includes(r.status)).length,
    absent: filteredData.filter(r => r.status === "absent").length,
    late: filteredData.filter(r => r.isLate).length,
    edited: filteredData.filter(r => r.isManuallyEdited).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500">Track and manage daily employee attendance records.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => setShowAddModal(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Manual Record
          </Button>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && filteredData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.present}</div>
            <div className="text-xs text-gray-500 mt-0.5">Present</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
            <div className="text-xs text-gray-500 mt-0.5">Absent</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.late}</div>
            <div className="text-xs text-gray-500 mt-0.5">Late</div>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.edited}</div>
            <div className="text-xs text-gray-500 mt-0.5">Manually Edited</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 bg-gray-50/50">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search employee..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-white" />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="pl-9 bg-white w-full sm:w-44" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="on-leave">On Leave</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-gray-500">
                    No attendance records found for this date.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((record) => (
                  <TableRow key={record.id} className={getStatusColor(record.status, record.isManuallyEdited)}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{record.employeeName}</div>
                      <div className="text-xs text-gray-500">{record.employeeCode}</div>
                    </TableCell>
                    <TableCell className="text-gray-600 text-sm">{record.date}</TableCell>
                    <TableCell className={record.isLate ? "text-amber-600 font-medium" : ""}>
                      <div>{formatTime(record.checkIn)}</div>
                      {record.checkInVerifyType && (
                        <div className="text-xs text-gray-400 capitalize">{record.checkInVerifyType}</div>
                      )}
                    </TableCell>
                    <TableCell className={record.isEarlyOut ? "text-orange-600" : ""}>
                      <div>{formatTime(record.checkOut)}</div>
                      {record.checkOutVerifyType && (
                        <div className="text-xs text-gray-400 capitalize">{record.checkOutVerifyType}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {record.workingHours ? `${record.workingHours.toFixed(1)} hrs` : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={`border-0 text-xs ${getStatusBadge(record.status)}`}>
                          {record.status?.replace("-", " ").toUpperCase()}
                        </Badge>
                        {record.isManuallyEdited && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Edited
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <div className="space-y-1 text-xs">
                                <div><strong>Note:</strong> {record.correctionNote || "No note"}</div>
                                {record.correctedBy && <div><strong>By:</strong> {record.correctedBy}</div>}
                                {record.correctedAt && <div><strong>At:</strong> {record.correctedAt.slice(0, 16)}</div>}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {record.checkInDeviceName || (record.source === "manual" ? "Manual" : "-")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openCorrect(record)}
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Correction Modal */}
      <Dialog open={!!correctRec} onOpenChange={() => setCorrectRec(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct Attendance Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="bg-gray-50 rounded p-3 text-sm text-gray-600">
              <strong>{correctRec?.employeeName}</strong> — {correctRec?.date}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Check In</Label>
                <Input type="datetime-local" value={correctForm.checkIn}
                  onChange={e => setCorrectForm(f => ({ ...f, checkIn: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Check Out</Label>
                <Input type="datetime-local" value={correctForm.checkOut}
                  onChange={e => setCorrectForm(f => ({ ...f, checkOut: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Correction Note <span className="text-gray-400">(required)</span></Label>
              <Textarea
                placeholder="Reason for correction..."
                value={correctForm.correctionNote}
                onChange={e => setCorrectForm(f => ({ ...f, correctionNote: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectRec(null)}>Cancel</Button>
            <Button onClick={submitCorrection} disabled={correctMut.isPending || !correctForm.correctionNote}>
              {correctMut.isPending ? "Saving..." : "Save Correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Manual Record Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Attendance Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select value={addForm.employeeId} onValueChange={v => setAddForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {(employees as Employee[]).map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.firstName} {e.lastName} ({e.employeeCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={addForm.date}
                onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Check In</Label>
                <Input type="datetime-local" value={addForm.checkIn}
                  onChange={e => setAddForm(f => ({ ...f, checkIn: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Check Out</Label>
                <Input type="datetime-local" value={addForm.checkOut}
                  onChange={e => setAddForm(f => ({ ...f, checkOut: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={addForm.status} onValueChange={v => setAddForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="half-day">Half Day</SelectItem>
                  <SelectItem value="on-leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={addForm.notes}
                onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={addMut.isPending}>
              {addMut.isPending ? "Adding..." : "Add Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
