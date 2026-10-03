import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useListShifts } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock } from "lucide-react";
import { useListEmployees } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-path";

type EmployeeOption = {
  id: number;
  firstName: string;
  lastName: string;
  employeeCode: string;
};

function today() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function ShiftsList() {
  const { data: shifts, isLoading } = useListShifts();
  const { data: employeeData = [] } = useListEmployees({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const employees = employeeData as EmployeeOption[];
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);

  const overrideMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("ems_token");
      const response = await fetch(apiUrl("/shifts/day-overrides"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date, employeeIds: selectedEmployeeIds, startTime, endTime }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ employeeCount: number; date: string }>;
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ["employeeShiftSchedule"] });
      queryClient.invalidateQueries({ queryKey: ["listAttendance"] });
      setSelectedEmployeeIds([]);
      toast({
        title: "Custom hours assigned",
        description: `${result.employeeCount} employee(s) updated for ${result.date}.`,
      });
    },
    onError: (error: Error) => toast({
      title: "Could not assign custom hours",
      description: error.message,
      variant: "destructive",
    }),
  });

  const filteredEmployees = employees.filter(employee =>
    `${employee.firstName} ${employee.lastName} ${employee.employeeCode}`
      .toLowerCase().includes(employeeSearch.toLowerCase()),
  );
  const canSubmit = date && startTime && endTime && startTime !== endTime
    && selectedEmployeeIds.length > 0 && selectedEmployeeIds.length <= 200;
  const toggleEmployee = (employeeId: number) => {
    setSelectedEmployeeIds(current => current.includes(employeeId)
      ? current.filter(id => id !== employeeId)
      : current.length < 200 ? [...current, employeeId] : current);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Working Shifts</h1>
          <p className="text-sm text-gray-500">Configure employee working hours and grace periods.</p>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-start gap-3">
          <CalendarDays className="h-5 w-5 mt-0.5 text-indigo-600" />
          <div>
            <h2 className="font-semibold text-gray-900">Assign custom hours for one date</h2>
            <p className="text-sm text-gray-500">
              Select employees and enter the start and end times. These hours override their usual shift for this date only.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1.5 text-sm font-medium">
            Date
            <Input type="date" value={date} onChange={event => setDate(event.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Shift starts
            <Input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Shift ends
            <Input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} />
          </label>
        </div>
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">Employees ({selectedEmployeeIds.length}/200 selected)</div>
            <Input
              aria-label="Search employees"
              placeholder="Search by name or employee code"
              value={employeeSearch}
              onChange={event => setEmployeeSearch(event.target.value)}
              className="sm:max-w-xs"
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
            {filteredEmployees.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No employees found.</p>
            ) : filteredEmployees.map(employee => (
              <label key={employee.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedEmployeeIds.includes(employee.id)}
                  onChange={() => toggleEmployee(employee.id)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="text-sm text-gray-800">{employee.firstName} {employee.lastName}</span>
                <span className="ml-auto text-xs text-gray-500">{employee.employeeCode}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">Late arrival checks keep the system’s 15-minute grace period.</p>
          <Button
            onClick={() => overrideMutation.mutate()}
            disabled={!canSubmit || overrideMutation.isPending}
          >
            {overrideMutation.isPending ? "Assigning..." : "Assign custom hours"}
          </Button>
        </div>
      </section>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-gray-900/50">
            <TableRow>
              <TableHead>Shift Name</TableHead>
              <TableHead>Start Time</TableHead>
              <TableHead>End Time</TableHead>
              <TableHead>Working Hours</TableHead>
              <TableHead>Grace Period</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : shifts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center">
                    <Clock className="h-8 w-8 text-gray-400 mb-2" />
                    <p>No shifts found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              shifts?.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell className="font-medium">{shift.name}</TableCell>
                  <TableCell>{shift.startTime}</TableCell>
                  <TableCell>{shift.endTime}</TableCell>
                  <TableCell>{shift.workingHours} hrs</TableCell>
                  <TableCell>{shift.gracePeriodMinutes} mins</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">Edit</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
