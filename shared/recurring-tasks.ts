const WEEKLY_TASKS = {
  3: { key: "hallmiba", text: "Hallmiba beställning senast 22.00", suffix: "0001" },
  4: { key: "tobacco", text: "Tobaksbeställning senast 12.00", suffix: "0002" },
} as const;

// The date is already the calendar day in Europe/Stockholm. UTC noon keeps
// weekday calculations independent of daylight saving time transitions.
export function recurringTaskForDay(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const task = WEEKLY_TASKS[weekday as keyof typeof WEEKLY_TASKS];
  if (!task) return null;
  return {
    id: `00000000-0000-4000-8000-${day.replaceAll("-", "")}${task.suffix}`,
    text: task.text,
    recurring_key: task.key,
  };
}

export const isRecurringTaskId = (id: string) =>
  /^00000000-0000-4000-8000-\d{8}000[12]$/.test(id);
