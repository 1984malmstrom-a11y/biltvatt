export type ScheduleRow = {
  work_date: string;
  first_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

export type ScheduleConflict = {
  row: number;
  kind: "duplicate" | "overlap";
  existing: boolean;
  otherRow?: number;
};

const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const firstName = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase("sv-SE");
const interval = (row: ScheduleRow) => {
  const day = Date.parse(`${row.work_date}T00:00:00Z`) / 60_000;
  const start = day + minute(row.starts_at);
  const end = day + minute(row.ends_at) + (row.ends_at < row.starts_at ? 1440 : 0);
  return { start, end };
};

// Civil minutes preserve the intended local timetable, including overnight
// shifts. Clock changes still require a manual check of ambiguous local times.
export function findScheduleConflicts(
  rows: ScheduleRow[],
  existing: ScheduleRow[] = [],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  for (let i = 0; i < rows.length; i++) {
    const current = rows[i];
    const currentTime = interval(current);
    for (let j = 0; j < i + existing.length; j++) {
      const inFile = j < i;
      const other = inFile ? rows[j] : existing[j - i];
      if (firstName(current.first_name) !== firstName(other.first_name)) continue;
      if (current.work_date === other.work_date &&
        current.starts_at === other.starts_at && current.ends_at === other.ends_at) {
        conflicts.push({ row: i + 1, kind: "duplicate", existing: !inFile,
          ...inFile ? { otherRow: j + 1 } : {} });
        continue;
      }
      if (current.status !== "active" || other.status !== "active") continue;
      const otherTime = interval(other);
      if (currentTime.start < otherTime.end && otherTime.start < currentTime.end)
        conflicts.push({ row: i + 1, kind: "overlap", existing: !inFile,
          ...inFile ? { otherRow: j + 1 } : {} });
    }
  }
  return conflicts;
}
