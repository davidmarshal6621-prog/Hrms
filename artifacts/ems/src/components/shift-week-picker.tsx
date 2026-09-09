import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const WEEKDAYS = [
  { key: "sunday", label: "Sunday" },
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
] as const;

export type ShiftScheduleValue = Record<string, number | null | undefined>;

type ShiftOption = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
};

export function ShiftWeekPicker({
  shifts,
  value,
  onChange,
  disabled = false,
}: {
  shifts: ShiftOption[];
  value: ShiftScheduleValue;
  onChange: (value: ShiftScheduleValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {WEEKDAYS.map(day => {
        const selected = value[day.key];
        const selectValue = selected === null ? "off" : selected ? String(selected) : "default";
        return (
          <div key={day.key} className="space-y-1.5">
            <div className="text-xs font-semibold text-gray-600">{day.label}</div>
            <Select
              value={selectValue}
              disabled={disabled}
              onValueChange={next => onChange({
                ...value,
                [day.key]: next === "default" ? undefined : next === "off" ? null : Number(next),
              })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default shift</SelectItem>
                <SelectItem value="off">Off day</SelectItem>
                {shifts.map(shift => (
                  <SelectItem key={shift.id} value={String(shift.id)}>
                    {shift.name} ({shift.startTime}-{shift.endTime})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}