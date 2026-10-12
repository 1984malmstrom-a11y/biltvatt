import { expect, test } from "vitest";
import { prioritizeTasks } from "../shared/task-priority";

test("ofärdiga uppgifter går före färdiga med återkommande först inom varje status", () => {
  const input = [
    { id: "manual-done-a", done: 1 },
    { id: "manual-open-a", done: 0 },
    { id: "recurring-done", done: 1, recurring: true },
    { id: "manual-open-b", done: 0 },
    { id: "recurring-open", done: 0, recurring: true },
    { id: "manual-done-b", done: 1 },
  ];
  expect(prioritizeTasks(input).map((task) => task.id)).toEqual([
    "recurring-open", "manual-open-a", "manual-open-b",
    "recurring-done", "manual-done-a", "manual-done-b",
  ]);
  expect(input[0].id).toBe("manual-done-a");
});

test("enda ofärdiga uppgiften visas först även när tre tidigare uppgifter är klara", () => {
  const input = [
    { id: "done-a", done: 1 },
    { id: "done-b", done: 1 },
    { id: "done-c", done: 1, recurring: true },
    { id: "open", done: 0 },
  ];
  expect(prioritizeTasks(input).map((task) => task.id)).toEqual([
    "open", "done-c", "done-a", "done-b",
  ]);
  const checked = input.map((task) => task.id === "open" ? { ...task, done: 1 } : task);
  expect(prioritizeTasks(checked)[0].id).toBe("done-c");
  expect(prioritizeTasks(input)[0].id).toBe("open");
});
