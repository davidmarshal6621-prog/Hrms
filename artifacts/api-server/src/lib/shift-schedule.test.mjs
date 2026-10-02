import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWeeklyShiftSchedule,
  serializeWeeklyShiftSchedule,
  shiftIdForDate,
} from "./shift-schedule.ts";

test("weekly assignment takes precedence over the employee default", () => {
  assert.equal(
    shiftIdForDate({ monday: 8 }, "2026-10-05", 3),
    8,
  );
});

test("an unassigned weekday falls back to the employee default", () => {
  assert.equal(
    shiftIdForDate({ monday: 8 }, "2026-10-06", 3),
    3,
  );
});

test("an explicit null weekday assignment means off, not default shift", () => {
  assert.equal(
    shiftIdForDate({ monday: null }, "2026-10-05", 3),
    null,
  );
});

test("missing defaults remain null and malformed dates use the default", () => {
  assert.equal(shiftIdForDate({}, "2026-10-05", undefined), null);
  assert.equal(shiftIdForDate({ monday: 8 }, "not-a-date", 3), 3);
});

test("invalid JSON schedules parse as empty and serialize to null", () => {
  assert.deepEqual(parseWeeklyShiftSchedule("{not-json"), {});
  assert.equal(serializeWeeklyShiftSchedule("{not-json"), null);
});