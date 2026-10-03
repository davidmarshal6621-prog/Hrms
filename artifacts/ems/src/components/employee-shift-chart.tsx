import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-path";

type ShiftOption = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
};

type ChartAssignment = {
  date: string;
  dayOfWeek: string;
  hasCustomAssignment: boolean;
  customShiftId?: number | null;
  customStartTime?: string | null;
  customEndTime?: string | null;
  shiftId: number | null;
  shiftName: string | null;
  source: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchSchedule(employeeId: number, startDate: string) {
  const token = localStorage.getItem("ems_token");
  const response = await fetch(
    apiUrl(`/employees/${employeeId}/shift-schedule?startDate=${startDate}&days=30`),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{
    startDate: string;
    endDate: string;
    assignments: ChartAssignment[];
  }>;
}

export function EmployeeShiftChart({
  employeeId,
  shifts,
  canEdit,
}: {
  employeeId: number;
  shifts: ShiftOption[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(today);
  const [appliedStartDate, setAppliedStartDate] = useState(startDate);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const queryKey = ["employeeShiftSchedule", employeeId, appliedStartDate];
  const scheduleQuery = useQuery({
    queryKey,
    queryFn: () => fetchSchedule(employeeId, appliedStartDate),
  });

  useEffect(() => {
    if (!scheduleQuery.data) return;
    const next: Record<string, string> = {};
    for (const assignment of scheduleQuery.data.assignments) {
      next[assignment.date] = assignment.customStartTime && assignment.customEndTime
        ? "custom"
        : assignment.hasCustomAssignment
          ? assignment.customShiftId === null ? "off" : String(assignment.customShiftId)
          : "default";
    }
    setSelections(next);
  }, [scheduleQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const assignments = Object.entries(selections)
        .filter(([, value]) => value !== "default")
        .map(([date, value]) => {
          const existing = scheduleQuery.data?.assignments.find(assignment => assignment.date === date);
          if (value === "custom") {
            return {
              date,
              shiftId: null,
              customStartTime: existing?.customStartTime,
              customEndTime: existing?.customEndTime,
            };
          }
          return { date, shiftId: value === "off" ? null : Number(value) };
        });
      const token = localStorage.getItem("ems_token");
      const response = await fetch(apiUrl(`/employees/${employeeId}/shift-schedule`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ startDate: appliedStartDate, days: 30, assignments }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "30-day shift chart saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not save shift chart", description: error.message, variant: "destructive" });
    },
  });

  const assignments = scheduleQuery.data?.assignments ?? [];
  const hasChanges = useMemo(() => {
    if (!scheduleQuery.data) return false;
    return scheduleQuery.data.assignments.some(assignment => {
      const current = selections[assignment.date] ?? "default";
      const original = assignment.customStartTime && assignment.customEndTime
        ? "custom"
        : assignment.hasCustomAssignment
          ? assignment.customShiftId === null ? "off" : String(assignment.customShiftId)
          : "default";
      return current !== original;
    });
  }, [scheduleQuery.data, selections]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-start gap-2">
          <CalendarDays className="h-4 w-4 text-indigo-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm">30-Day Customized Shift Chart</h3>
            <p className="text-xs text-gray-500 mt-1">
              Default uses the employee’s weekly schedule. Set a shift or Off for a specific date.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={event => setStartDate(event.target.value)}
            className="w-40 bg-white"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAppliedStartDate(startDate)}
            disabled={startDate === appliedStartDate || scheduleQuery.isFetching}
          >
            Load 30 Days
          </Button>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending || scheduleQuery.isLoading}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save Chart"}
            </Button>
          )}
        </div>
      </div>

      {scheduleQuery.isLoading ? (
        <p className="text-sm text-gray-500 py-4">Loading shift chart...</p>
      ) : scheduleQuery.isError ? (
        <p className="text-sm text-red-600 py-4">Unable to load the shift chart.</p>
      ) : (
        <div className="max-h-[560px] overflow-y-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b z-10">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Date</th>
                <th className="text-left px-3 py-2 font-semibold">Day</th>
                <th className="text-left px-3 py-2 font-semibold">Current</th>
                <th className="text-left px-3 py-2 font-semibold">Set shift</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(assignment => (
                <tr key={assignment.date} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{assignment.date}</td>
                  <td className="px-3 py-2 capitalize text-gray-600">{assignment.dayOfWeek}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {assignment.shiftName ?? (assignment.source === "custom-off" ? "Off" : "No shift")}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={selections[assignment.date] ?? "default"}
                      disabled={!canEdit}
                      onValueChange={value => setSelections(current => ({ ...current, [assignment.date]: value }))}
                    >
                      <SelectTrigger className="bg-white max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default / weekly shift</SelectItem>
                        <SelectItem value="off">Off day</SelectItem>
                        {assignment.customStartTime && assignment.customEndTime && (
                          <SelectItem value="custom">
                            Custom hours ({assignment.customStartTime}-{assignment.customEndTime})
                          </SelectItem>
                        )}
                        {shifts.map(shift => (
                          <SelectItem key={shift.id} value={String(shift.id)}>
                            {shift.name} ({shift.startTime}-{shift.endTime})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}