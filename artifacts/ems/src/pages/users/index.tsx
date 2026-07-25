import { useState } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
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

function TempPasswordCell({ password }: { password?: string | null }) {
  const [show, setShow] = useState(false);
  const { toast } = useToast();

  if (!password) return <span className="text-gray-400 text-xs">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono text-xs ${show ? "text-gray-900" : "text-transparent bg-gray-200 rounded select-none"}`}
        style={show ? {} : { userSelect: "none" }}>
        {show ? password : "••••••••"}
      </span>
      <button onClick={() => setShow(!show)} className="text-gray-400 hover:text-gray-600 p-0.5 rounded">
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      {show && (
        <button
          onClick={() => { navigator.clipboard.writeText(password); toast({ title: "Copied!" }); }}
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

type UserRow = {
  id: number; email: string; name: string; role: string;
  isActive?: boolean | null; employeeId?: number | null;
  tempPassword?: string | null; createdAt: string;
};

export default function UsersList() {
  const { data: users = [], isLoading } = useListUsers();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "employee" });

  const createMut = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listUsers"] });
      setShowAdd(false);
      setForm({ email: "", password: "", name: "", role: "employee" });
      toast({ title: "User created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listUsers"] });
      setEditUser(null);
      toast({ title: "User updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["listUsers"] }); toast({ title: "User deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [editForm, setEditForm] = useState({ name: "", role: "employee", isActive: true, password: "" });

  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditForm({ name: u.name, role: u.role, isActive: u.isActive ?? true, password: "" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">Manage system users, roles, and login credentials.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Name / Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Temp Password</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (users as UserRow[]).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <Users className="h-8 w-8 text-gray-400 mb-2" />
                      No users found.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (users as UserRow[]).map((user) => (
                  <TableRow key={user.id} className="hover:bg-gray-50/50">
                    <TableCell>
                      <div className="font-medium text-gray-900">{user.name}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-0 capitalize ${ROLE_COLORS[user.role] ?? "bg-gray-100"}`}>
                        {user.role.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell><TempPasswordCell password={user.tempPassword} /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={user.isActive !== false ? "bg-green-100 text-green-800 border-0" : "bg-gray-100 text-gray-500 border-0"}>
                        {user.isActive !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600"
                          onClick={() => { if (confirm("Delete this user?")) deleteMut.mutate(user.id); }}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Temp password" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate(form)} disabled={!form.name || !form.email || !form.password || createMut.isPending}>
              {createMut.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User — {editUser?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New Password <span className="text-gray-400">(leave blank to keep current)</span></Label>
              <Input type="text" placeholder="New password..." value={editForm.password}
                onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="isActive" checked={editForm.isActive}
                onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))}
                className="rounded border-gray-300" />
              <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!editUser) return;
              const data: any = { name: editForm.name, role: editForm.role, isActive: editForm.isActive };
              if (editForm.password) data.password = editForm.password;
              updateMut.mutate({ id: editUser.id, data });
            }} disabled={updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
