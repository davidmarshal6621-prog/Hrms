import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, RefreshCw, Wifi, WifiOff, Upload, Trash2, Settings, Users, Clock, UserPlus } from "lucide-react";
import { apiUrl } from "@/lib/api-path";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Device {
  id: number; name: string; ip: string; port: number;
  location: string | null; isActive: boolean;
  lastSyncAt: string | null; lastSyncCount: number | null; lastSyncError: string | null;
  createdAt: string;
}

interface EmployeeOption {
  id: number;
  firstName: string;
  lastName: string;
  employeeCode: string;
  enrollNumber?: string | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("ems_token");
  const res = await fetch(apiUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

export default function DevicesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testingForm, setTestingForm] = useState(false);
  const [syncLog, setSyncLog] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", ip: "", port: "4370", location: "" });
  const [timeDevice, setTimeDevice] = useState<Device | null>(null);
  const [machineDateTime, setMachineDateTime] = useState("");
  const [userDevice, setUserDevice] = useState<Device | null>(null);
  const [userForm, setUserForm] = useState({ employeeId: "", userId: "", name: "" });

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices"),
  });
  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["employees"],
    queryFn: () => apiFetch("/employees"),
  });

  const setTimeMut = useMutation({
    mutationFn: ({ deviceId, dateTime }: { deviceId: number; dateTime: string }) =>
      apiFetch(`/devices/${deviceId}/set-time`, {
        method: "POST",
        body: JSON.stringify({ dateTime }),
      }),
    onSuccess: (_data, variables) => {
      setTimeDevice(null);
      setMachineDateTime("");
      toast({ title: "Machine time updated", description: `${variables.dateTime.replace("T", " ")}` });
    },
    onError: (error: Error) => toast({ title: "Could not set machine time", description: error.message, variant: "destructive" }),
  });

  const addUserMut = useMutation({
    mutationFn: ({ deviceId, data }: { deviceId: number; data: typeof userForm }) =>
      apiFetch(`/devices/${deviceId}/users`, {
        method: "POST",
        body: JSON.stringify({
          employeeId: Number(data.employeeId),
          userId: data.userId,
          name: data.name,
        }),
      }),
    onSuccess: (_data, variables) => {
      setUserDevice(null);
      setUserForm({ employeeId: "", userId: "", name: "" });
      setSyncLog(
        `✅ Machine user ${variables.data.userId} added for ${variables.data.name}.\n` +
        "Enroll the employee's fingerprint or face directly on the machine.",
      );
      toast({ title: "Machine user added", description: "Enroll biometrics directly on the device." });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error: Error) => toast({ title: "Could not add machine user", description: error.message, variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/devices", {
      method: "POST",
      body: JSON.stringify({ ...data, port: parseInt(data.port) }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      setShowAdd(false);
      setForm({ name: "", ip: "", port: "4370", location: "" });
      toast({ title: "Device added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["devices"] }); toast({ title: "Device removed" }); },
  });

  async function handleConnectionTest(ip: string, port: number, deviceId?: number) {
    if (deviceId === undefined) setTestingForm(true);
    else setTestingId(deviceId);
    setSyncLog(null);
    try {
      const result = await apiFetch("/devices/test-connection", {
        method: "POST",
        body: JSON.stringify({ ip, port }),
      });
      const details = [
        result.deviceName && `Device: ${result.deviceName}`,
        result.serialNumber && `Serial: ${result.serialNumber}`,
        result.firmwareVersion && `Firmware: ${result.firmwareVersion}`,
      ].filter(Boolean).join("\n");
      setSyncLog(`✅ ZKTeco connection successful${details ? `\n${details}` : ""}`);
      toast({ title: "Device connected", description: result.deviceName || `${ip}:${port}` });
    } catch (error) {
      let message = error instanceof Error ? error.message : "Connection test failed";
      try {
        const payload = JSON.parse(message);
        message = payload.error || payload.detail || message;
      } catch { /* show the original response text */ }
      setSyncLog(`❌ Connection test failed: ${message}`);
      toast({ title: "Connection failed", description: message, variant: "destructive" });
    } finally {
      setTestingForm(false);
      setTestingId(null);
    }
  }

  async function handleImportUsers(device: Device) {
    setImportingId(device.id);
    setSyncLog(null);
    try {
      const token = localStorage.getItem("ems_token");
      const res = await fetch(apiUrl(`/devices/${device.id}/import-users`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncLog(`❌ Import Failed: ${data.error || "Unknown error"}`);
        toast({ title: "Import failed", description: data.error, variant: "destructive" });
      } else {
        setSyncLog(
          `✅ ${data.message}\n` +
          `👥 Total users in device: ${data.total}\n` +
          `🆕 Created: ${data.created} new employees\n` +
          `🔄 Updated: ${data.updated} existing employees\n` +
          `⏭️  Skipped: ${data.skipped} already mapped\n\n` +
          `⚡ Now click "Sync Now" to pull all attendance records.`
        );
        toast({ title: "Users imported", description: data.message });
        qc.invalidateQueries({ queryKey: ["devices"] });
      }
    } catch (e: any) {
      setSyncLog(`❌ Network error: ${e.message}`);
      toast({ title: "Import error", description: e.message, variant: "destructive" });
    } finally {
      setImportingId(null);
    }
  }

  async function handleSync(device: Device) {
    setSyncingId(device.id);
    setSyncLog(null);
    try {
      const token = localStorage.getItem("ems_token");
      const res = await fetch(apiUrl(`/devices/${device.id}/sync`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncLog(`❌ Error: ${data.error || "Unknown error"}\n${data.detail || ""}`);
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      } else {
        setSyncLog(
          `✅ ${data.message}\n` +
          `📊 Total records from device: ${data.total}\n` +
          `🔄 Synced: ${data.synced}\n` +
          `⏭️  Skipped (duplicates): ${data.skipped}`
        );
        toast({ title: "Sync complete", description: data.message });
        qc.invalidateQueries({ queryKey: ["devices"] });
      }
    } catch (e: any) {
      setSyncLog(`❌ Network error: ${e.message}`);
      toast({ title: "Sync error", description: e.message, variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("ems_token");
    try {
      const res = await fetch(apiUrl("/employees/import-enroll"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Import failed", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Import complete", description: `Updated ${data.updated} employees, ${data.notFound} not found` });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Device Management</h1>
          <p className="text-sm text-gray-500">Connect ZKTeco biometric machines and sync attendance data.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Enroll CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button onClick={() => setShowAdd(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Device
          </Button>
        </div>
      </div>

      {/* Step-by-step guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <strong>📋 Quick Setup Guide:</strong>
        <ol className="list-decimal list-inside mt-2 space-y-1">
          <li><strong>Step 1:</strong> Add your machine's public IPv4 address and test the connection.</li>
          <li><strong>Step 2:</strong> Use <strong>"Import Users"</strong> if you want to import enrolled employees from the device.</li>
          <li><strong>Step 3:</strong> Click <strong>"Sync Now"</strong> to import attendance punches into this company workspace.</li>
        </ol>
        <p className="mt-2">The machine must be reachable from the EMS server; a private office-network address is not reachable over the public internet.</p>
      </div>

      {/* Devices table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Device Name</TableHead>
              <TableHead>IP / Port</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">Loading...</TableCell></TableRow>
            ) : devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                  <Settings className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No devices configured. Add your first ZKTeco device above.
                </TableCell>
              </TableRow>
            ) : (
              devices.map(device => (
                <TableRow key={device.id}>
                  <TableCell className="font-medium">{device.name}</TableCell>
                  <TableCell className="font-mono text-sm">{device.ip}:{device.port}</TableCell>
                  <TableCell className="text-gray-500">{device.location || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={device.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500"}>
                      {device.isActive
                        ? <><Wifi className="h-3 w-3 mr-1 inline" />Active</>
                        : <><WifiOff className="h-3 w-3 mr-1 inline" />Inactive</>}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {device.lastSyncAt ? (
                      <div>
                        <div className="text-gray-700">{new Date(device.lastSyncAt).toLocaleString()}</div>
                        {device.lastSyncCount != null && <div className="text-xs text-green-600">{device.lastSyncCount} records synced</div>}
                        {device.lastSyncError && (
                          <div className="text-xs text-red-500 truncate max-w-xs" title={device.lastSyncError}>{device.lastSyncError}</div>
                        )}
                      </div>
                    ) : <span className="text-gray-400">Never synced</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setTimeDevice(device); setMachineDateTime(""); }}
                        className="flex items-center gap-1"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Set Time
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setUserDevice(device);
                          setUserForm({ employeeId: "", userId: "", name: "" });
                        }}
                        className="flex items-center gap-1"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add User
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnectionTest(device.ip, device.port, device.id)}
                        disabled={testingId === device.id}
                        className="flex items-center gap-1"
                      >
                        <Wifi className={`h-3.5 w-3.5 ${testingId === device.id ? "animate-pulse" : ""}`} />
                        {testingId === device.id ? "Testing..." : "Test"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleImportUsers(device)}
                        disabled={importingId === device.id}
                        className="flex items-center gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        <Users className={`h-3.5 w-3.5 ${importingId === device.id ? "animate-pulse" : ""}`} />
                        {importingId === device.id ? "Importing..." : "Import Users"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSync(device)}
                        disabled={syncingId === device.id}
                        className="flex items-center gap-1"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncingId === device.id ? "animate-spin" : ""}`} />
                        {syncingId === device.id ? "Syncing..." : "Sync Now"}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600"
                        onClick={() => deleteMut.mutate(device.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Sync/Import log */}
      {syncLog && (
        <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg whitespace-pre-line">
          <div className="text-gray-400 text-xs mb-2">Operation Result</div>
          {syncLog}
        </div>
      )}

      <Dialog open={!!timeDevice} onOpenChange={open => { if (!open) setTimeDevice(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set {timeDevice?.name} date and time</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="machine-date-time">Machine date and time</Label>
            <Input
              id="machine-date-time"
              type="datetime-local"
              value={machineDateTime}
              onChange={event => setMachineDateTime(event.target.value)}
            />
            <p className="text-xs text-gray-500">
              Enter the exact local date and time the device should use. The server time will not be substituted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimeDevice(null)}>Cancel</Button>
            <Button
              onClick={() => timeDevice && setTimeMut.mutate({ deviceId: timeDevice.id, dateTime: machineDateTime })}
              disabled={!machineDateTime || setTimeMut.isPending}
            >
              {setTimeMut.isPending ? "Setting..." : "Set Machine Time"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!userDevice} onOpenChange={open => { if (!open) setUserDevice(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add employee to {userDevice?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>EMS employee</Label>
              <Select
                value={userForm.employeeId}
                onValueChange={employeeId => {
                  const employee = employees.find(item => item.id === Number(employeeId));
                  const fullName = employee ? `${employee.firstName} ${employee.lastName}`.trim().slice(0, 24) : "";
                  setUserForm(current => ({
                    ...current,
                    employeeId,
                    userId: current.userId || employee?.enrollNumber || "",
                    name: current.name || fullName,
                  }));
                }}
              >
                <SelectTrigger className="bg-white"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {employees.map(employee => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.firstName} {employee.lastName} ({employee.employeeCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="machine-user-id">Machine user ID</Label>
                <Input
                  id="machine-user-id"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="1 to 9 digits"
                  value={userForm.userId}
                  onChange={event => setUserForm(current => ({ ...current, userId: event.target.value.replace(/\D/g, "").slice(0, 9) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="machine-user-name">Machine display name</Label>
                <Input
                  id="machine-user-name"
                  maxLength={24}
                  value={userForm.name}
                  onChange={event => setUserForm(current => ({ ...current, name: event.target.value.slice(0, 24) }))}
                />
              </div>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This adds the user record and links its ID to the selected employee. Fingerprint or face enrollment must be completed directly on the machine.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDevice(null)}>Cancel</Button>
            <Button
              onClick={() => userDevice && addUserMut.mutate({ deviceId: userDevice.id, data: userForm })}
              disabled={
                !userForm.employeeId || !userForm.userId || !userForm.name.trim()
                || addUserMut.isPending
              }
            >
              {addUserMut.isPending ? "Adding..." : "Add Machine User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Device Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add ZKTeco Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Device Name</Label>
              <Input placeholder="e.g. Main Entrance" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>IP Address</Label>
                  <Input placeholder="Public IPv4 address" value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input type="number" placeholder="4370" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Enter the machine's public IPv4 address and port. Private LAN addresses cannot be reached by the hosted EMS server.
            </p>
            <div className="space-y-1.5">
              <Label>Location <span className="text-gray-400">(optional)</span></Label>
              <Input placeholder="e.g. Ground Floor, Office A" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              variant="outline"
              onClick={() => handleConnectionTest(form.ip, Number(form.port) || 4370)}
              disabled={!form.ip || testingForm}
            >
              {testingForm ? "Testing..." : "Test Connection"}
            </Button>
            <Button onClick={() => createMut.mutate(form)} disabled={!form.name || !form.ip || createMut.isPending}>
              {createMut.isPending ? "Adding..." : "Add Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
