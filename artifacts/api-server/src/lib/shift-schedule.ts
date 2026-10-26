export const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type WeeklyShiftSchedule = Partial<Record<(typeof WEEKDAY_KEYS)[number], number | null>>;

export function parseWeeklyShiftSchedule(value: unknown): WeeklyShiftSchedule {
  if (!value) return {};
  if (typeof value === "object") return value as WeeklyShiftSchedule;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as WeeklyShiftSchedule : {};
  } catch {
    return {};
  }
}

export function serializeWeeklyShiftSchedule(value: unknown): string | null {
  if (!value) return null;
  const schedule = parseWeeklyShiftSchedule(value);
  return Object.keys(schedule).length ? JSON.stringify(schedule) : null;
}

export function shiftIdForDate(
  scheduleValue: unknown,
  date: string,
  fallbackShiftId: number | null | undefined,
): number | null {
  const schedule = parseWeeklyShiftSchedule(scheduleValue);
  const parsedDate = new Date(`${date}T12:00:00Z`);
  const weekday = Number.isNaN(parsedDate.getTime())
    ? undefined
    : WEEKDAY_KEYS[parsedDate.getUTCDay()];
  const scheduled = weekday ? schedule[weekday] : undefined;
  return scheduled === undefined ? (fallbackShiftId ?? null) : scheduled;
}