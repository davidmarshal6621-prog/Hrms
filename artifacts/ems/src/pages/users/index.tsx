import { useState } from "react";
import {
  useListUsers,
  useListDepartments,
  useListBranches,
  useListShifts,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Eye, EyeOff, Copy, Users } from "lucide-react";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("ems_token");
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  if (res.status === 204) return null;
  return res.json();
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  hr: "bg-indigo-100 text-indigo-800",
  manager: "bg-cyan-100 text-cyan-800",
  employee: "bg-gray-100 text-gray-700",
};

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive?: boolean | null;
  employeeId?: number | null;
  tempPassword?: string | null;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  cnic?: string | null;
  departmentId?: number | null;
  branchId?: number | null;
  shiftId?: number | null;
  designation?: string | null;
  basicSalary?: number | null;
  allowances?: number | null;
  enrollNumber?: string | null;
  status?: string | null;
  address?: string | null;
  fatherName?: string | null;
  emergencyContact?: string | null;
  bloodGroup?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  religion?: string | null;
  nationality?: string | null;
  createdAt: string;
};

type UserForm = {
  email: string;
  password: string;
  name: string;
  role: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  cnic: string;
  departmentId: string;
  branchId: string;
  shiftId: string;
  designation: string;
  basicSalary: string;
  allowances: string;
  dateOfJoining: string;
  enrollNumber: string;
  status: string;
  address: string;
  fatherName: string;
  emergencyContact: string;
  bloodGroup: string;
  dateOfBirth: string;
  gender: string;
  religion: string;
  nationality: string;
};

const emptyForm: UserForm = {
  email: "",
  password: "",
  name: "",
  role: "employee",
  employeeCode: "",
  firstName: "",
  lastName: "",
  phone: "",
  cnic: "",
  departmentId: "",
  branchId: "",
  shiftId: "",
  designation: "",
  basicSalary: "",
  allowances: "0",
  dateOfJoining: "",
  enrollNumber: "",
  status: "active",
  address: "",
  fatherName: "",
  emergencyContact: "",
  bloodGroup: "",
  dateOfBirth: "",
  gender: "",
  religion: "",
  nationality: "",
};

function TempPasswordCell({ password }: { password?: string | null }) {
  const [show, setShow] = useState(false);
  const { toast } = useToast();
  if (!password) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono text-xs ${show ? "text-gray-900" : "text-transparent bg-gray-200 rounded select-none"}`}>
        {show ? password : "••••••••"}
      </span>
      <button type="button" onClick={() => setShow(!show)} className="text-gray-400 hover:text-gray-600 p-0.5 rounded">
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      {show && (
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(password); toast({ title: "Password copied" }); }}
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <Input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </Field>
  );
}

function formFromUser(user: UserRow): UserForm {
  const value = (key: keyof UserForm) => {
    const raw = user[key as keyof UserRow];
    return raw === null || raw === undefined ? "" : String(raw);
  };
  return {
    ...emptyForm,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeCode: value("employeeCode"),
    firstName: value("firstName") || user.name.split(/\s+/)[0] || "",
    lastName: value("lastName") || user.name.split(/\s+/).slice(1).join(" "),
    phone: value("phone"),
    cnic: value("cnic"),
    departmentId: value("departmentId"),
    branchId: value("branchId"),
    shiftId: value("shiftId"),
    designation: value("designation"),
    basicSalary: value("basicSalary"),
    allowances: value("allowances") || "0",
    dateOfJoining: value("dateOfJoining"),
    enrollNumber: value("enrollNumber"),
    status: value("status") || "active",
    address: value("address"),
    fatherName: value("fatherName"),
    emergencyContact: value("emergencyContact"),
    bloodGroup: value("bloodGroup"),
    dateOfBirth: value("dateOfBirth"),
    gender: value("gender"),
    religion: value("religion"),
    nationality: value("nationality"),
  };
}

function toPayload(form: UserForm) {
  const payload: Record<string, unknown> = {
    email: form.email,
    password: form.password || undefined,
    name: form.name,
    role: form.role,
    employeeCode: form.employeeCode || undefined,
    firstName: form.firstName || undefined,
    lastName: form.lastName || undefined,
    phone: form.phone,
    cnic: form.cnic,
    departmentId: form.departmentId ? Number(form.departmentId) : null,
    branchId: form.branchId ? Number(form.branchId) : null,
    shiftId: form.shiftId ? Number(form.shiftId) : null,
    designation: form.designation,
    basicSalary: form.basicSalary === "" ? null : Number(form.basicSalary),
    allowances: form.allowances === "" ? null : Number(form.allowances),
    dateOfJoining: form.dateOfJoining || null,
    enrollNumber: form.enrollNumber,
    status: form.status,
    address: form.address,
    fatherName: form.fatherName,
    emergencyContact: form.emergencyContact,
    bloodGroup: form.bloodGroup,
    dateOfBirth: form.dateOfBirth,
    gender: form.gender,
    religion: form.religion,
    nationality: form.nationality,
  };
  if (!payload.password) delete payload.password;
  return payload;
}

export default function UsersList() {
  const { data: users = [], isLoading } = useListUsers();
  const { data: departments = [] } = useListDepartments();
  const { data: branches = [] } = useListBranches();
  const { data: shifts = [] } = useListShifts();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [isActive, setIsActive] = useState(true);

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listUsers"] });
      qc.invalidateQueries({ queryKey: ["listEmployees"] });
      setShowAdd(false);
      setForm(emptyForm);
      toast({ title: "User created", description: "Employee profile and login account are ready." });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listUsers"] });
      qc.invalidateQueries({ queryKey: ["listEmployees"] });
      setEditUser(null);
      toast({ title: "User updated", description: "Login and complete employee profile saved." });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["listUsers"] }); toast({ title: "User deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const usersRows = users as UserRow[];
  function openCreate() {
    setForm(emptyForm);
    setShowAdd(true);
  }
  function openEdit(user: UserRow) {
    setEditUser(user);
    setForm(formFromUser(user));
    setIsActive(user.isActive !== false);
  }
  function updateField(field: keyof UserForm, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">Manage login accounts and the complete linked employee profile from one place.</p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2"><Plus className="h-4 w-4" />Add User</Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Code / Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Temp Password</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : usersRows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-gray-500"><Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />No users found.</TableCell></TableRow>
              ) : usersRows.map(user => {
                const department = departments.find(d => d.id === user.departmentId);
                const shift = shifts.find(s => s.id === user.shiftId);
                return (
                  <TableRow key={user.id} className="hover:bg-gray-50/50">
                    <TableCell>
                      <div className="font-medium text-gray-900">{user.employeeCode || "—"}</div>
                      <div className="text-sm text-gray-700">{user.name}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </TableCell>
                    <TableCell>{department?.name || "—"}</TableCell>
                    <TableCell>{user.designation || "—"}{user.basicSalary !== null && user.basicSalary !== undefined && <div className="text-xs text-gray-500">Rs. {user.basicSalary}</div>}</TableCell>
                    <TableCell>{shift?.name || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={`border-0 capitalize ${ROLE_COLORS[user.role] ?? "bg-gray-100"}`}>{user.role.replace("_", " ")}</Badge></TableCell>
                    <TableCell><TempPasswordCell password={user.tempPassword} /></TableCell>
                    <TableCell><Badge variant="outline" className={user.isActive !== false ? "bg-green-100 text-green-800 border-0" : "bg-gray-100 text-gray-500 border-0"}>{user.isActive !== false ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>Edit all</Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("Delete this user?")) deleteMut.mutate(user.id); }}>Delete</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={showAdd || !!editUser} onOpenChange={open => { if (!open) { setShowAdd(false); setEditUser(null); } }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editUser ? `Edit all data — ${editUser.name}` : "Create User & Employee"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <section className="space-y-3">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Login Account</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextField label="Login Email *" value={form.email} onChange={v => updateField("email", v)} type="email" placeholder="employee@company.com" />
                <TextField label="Display Name *" value={form.name} onChange={v => updateField("name", v)} placeholder="Full name" />
                <TextField label={editUser ? "New Password (optional)" : "Password *"} value={form.password} onChange={v => updateField("password", v)} placeholder={editUser ? "Leave blank to keep current" : "Temporary password"} />
                <Field label="Role">
                  <Select value={form.role} onValueChange={v => updateField("role", v)}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Work Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextField label="Employee Code" value={form.employeeCode} onChange={v => updateField("employeeCode", v)} placeholder="ZK0001" />
                <TextField label="First Name" value={form.firstName} onChange={v => updateField("firstName", v)} />
                <TextField label="Last Name" value={form.lastName} onChange={v => updateField("lastName", v)} />
                <Field label="Department">
                  <Select value={form.departmentId || "none"} onValueChange={v => updateField("departmentId", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">No department</SelectItem>{departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Branch">
                  <Select value={form.branchId || "none"} onValueChange={v => updateField("branchId", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Select branch" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">No branch</SelectItem>{branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Shift">
                  <Select value={form.shiftId || "none"} onValueChange={v => updateField("shiftId", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Select shift" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">No shift</SelectItem>{shifts.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.startTime}-{s.endTime})</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <TextField label="Designation" value={form.designation} onChange={v => updateField("designation", v)} />
                <TextField label="Basic Salary" value={form.basicSalary} onChange={v => updateField("basicSalary", v)} type="number" />
                <TextField label="Allowances" value={form.allowances} onChange={v => updateField("allowances", v)} type="number" />
                <TextField label="Date of Joining" value={form.dateOfJoining} onChange={v => updateField("dateOfJoining", v)} type="date" />
                <TextField label="ZK Enroll Number" value={form.enrollNumber} onChange={v => updateField("enrollNumber", v)} />
                <Field label="Status">
                  <Select value={form.status} onValueChange={v => updateField("status", v)}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Personal & Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextField label="Phone" value={form.phone} onChange={v => updateField("phone", v)} />
                <TextField label="CNIC" value={form.cnic} onChange={v => updateField("cnic", v)} />
                <TextField label="Father Name" value={form.fatherName} onChange={v => updateField("fatherName", v)} />
                <TextField label="Emergency Contact" value={form.emergencyContact} onChange={v => updateField("emergencyContact", v)} />
                <TextField label="Blood Group" value={form.bloodGroup} onChange={v => updateField("bloodGroup", v)} />
                <TextField label="Date of Birth" value={form.dateOfBirth} onChange={v => updateField("dateOfBirth", v)} type="date" />
                <TextField label="Gender" value={form.gender} onChange={v => updateField("gender", v)} />
                <TextField label="Religion" value={form.religion} onChange={v => updateField("religion", v)} />
                <TextField label="Nationality" value={form.nationality} onChange={v => updateField("nationality", v)} />
                <Field label="Address" className="md:col-span-3"><Textarea value={form.address} onChange={e => updateField("address", e.target.value)} /></Field>
              </div>
            </section>

            {editUser && (
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded border-gray-300" />
                Active login account
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditUser(null); }}>Cancel</Button>
            <Button
              disabled={createMut.isPending || updateMut.isPending || !form.email || !form.name || (!editUser && !form.password)}
              onClick={() => {
                const data = toPayload(form);
                if (editUser) {
                  data.isActive = isActive;
                  updateMut.mutate({ id: editUser.id, data });
                } else {
                  createMut.mutate(data);
                }
              }}
            >
              {createMut.isPending || updateMut.isPending ? "Saving..." : editUser ? "Save All Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}