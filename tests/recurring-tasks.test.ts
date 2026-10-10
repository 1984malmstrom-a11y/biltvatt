import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./fixture";
import { isRecurringTaskId, recurringTaskForDay } from "../shared/recurring-tasks";

async function viewerSession(f: ReturnType<typeof fixture>) {
  const admin = await f.login();
  const made = await f.call("/admin/station/activation-codes", "POST", { device_label: "Test-TV" }, admin);
  const { code } = await made.json() as { code: string };
  const active = await f.call("/station/activate", "POST", { code });
  return active.headers.get("Set-Cookie")!.split(";")[0];
}

type Task = { id: string; text: string; done: number; revision: number; recurring?: boolean };

describe("återkommande stationsuppgifter", () => {
  afterEach(() => vi.useRealTimers());

  it("väljer svensk veckodag även efter sommar- och vintertidsbyte", () => {
    expect(recurringTaskForDay("2026-10-14")).toMatchObject({
      text: "Hallmiba beställning senast 22.00", recurring_key: "hallmiba",
    });
    expect(recurringTaskForDay("2026-10-15")).toMatchObject({
      text: "Tobaksbeställning senast 12.00", recurring_key: "tobacco",
    });
    expect(recurringTaskForDay("2026-10-13")).toBeNull();
    expect(recurringTaskForDay("2026-10-16")).toBeNull();
    expect(recurringTaskForDay("2026-10-21")?.recurring_key).toBe("hallmiba");
    expect(recurringTaskForDay("2026-10-28")?.recurring_key).toBe("hallmiba");
    expect(recurringTaskForDay("2027-03-31")?.recurring_key).toBe("hallmiba");
    expect(recurringTaskForDay("2026-10-14")?.id).not.toBe(recurringTaskForDay("2026-10-21")?.id);
    expect(isRecurringTaskId(recurringTaskForDay("2026-10-14")!.id)).toBe(true);
  });

  it("visar onsdagsuppgiften först utan skrivning vid läsning; sparar avbockning gemensamt utan dubbletter", async () => {
    const f = fixture();
    const viewer = await viewerSession(f);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T08:00:00Z"));
    try {
      const overview = async () => (await (await f.call("/station/v2", "GET", undefined, viewer)).json()) as { today: string; tasks: Task[] };
      const first = await overview();
      expect(first.today).toBe("2026-10-14");
      expect(first.tasks).toHaveLength(1);
      expect(first.tasks[0]).toMatchObject({
        id: recurringTaskForDay(first.today)!.id,
        text: "Hallmiba beställning senast 22.00", done: 0, revision: 0, recurring: true,
      });
      await overview();
      expect((f.db.prepare("SELECT COUNT(*) AS n FROM station_tasks").get() as { n: number }).n).toBe(0);

      expect((await f.call("/station/v2/tasks", "POST", { text: "Kontrollera lagret" }, viewer)).status).toBe(201);
      expect((await f.call("/station/v2/tasks", "POST", { text: first.tasks[0].text }, viewer)).status).toBe(409);
      const manual = (await overview()).tasks[1];
      expect((await f.call(`/station/v2/tasks/${manual.id}`, "PUT", {
        text: first.tasks[0].text, done: false, expected_revision: manual.revision,
      }, viewer)).status).toBe(409);
      expect((await overview()).tasks.map((task) => task.text)).toEqual([
        "Hallmiba beställning senast 22.00", "Kontrollera lagret",
      ]);

      const id = first.tasks[0].id;
      const mark = () => f.call(`/station/v2/tasks/${id}`, "PUT", {
        text: first.tasks[0].text, done: true, expected_revision: 0,
      }, viewer);
      expect((await Promise.all([mark(), mark()])).map((response) => response.status).sort()).toEqual([200, 409]);
      expect((f.db.prepare("SELECT COUNT(*) AS n FROM station_tasks WHERE id=?").get(id) as { n: number }).n).toBe(1);
      expect((await overview()).tasks[0]).toMatchObject({ id, done: 1, revision: 1, recurring: true });
      expect((await f.call(`/station/v2/tasks/${id}`, "DELETE", { expected_revision: 1 }, viewer)).status).toBe(403);
      expect((await f.call(`/station/v2/tasks/${id}`, "PUT", {
        text: "Bytt namn", done: false, expected_revision: 1,
      }, viewer)).status).toBe(403);
      expect((await f.call(`/station/v2/tasks/${id}`, "PUT", {
        text: first.tasks[0].text, done: false, expected_revision: 1,
      }, viewer)).status).toBe(200);
      expect((await overview()).tasks[0]).toMatchObject({ id, done: 0, revision: 2 });

      vi.setSystemTime(new Date("2026-10-14T20:01:00Z")); // 22:01 in Stockholm
      expect((await overview()).tasks[0].id).toBe(id);
      vi.setSystemTime(new Date("2026-10-21T08:00:00Z"));
      const nextWeek = await overview();
      expect(nextWeek.tasks[0]).toMatchObject({ done: 0, revision: 0, recurring: true });
      expect(nextWeek.tasks[0].id).not.toBe(id);
      expect((await f.call(`/station/v2/tasks/${id}`, "PUT", {
        text: first.tasks[0].text, done: true, expected_revision: 2,
      }, viewer)).status).toBe(409);
    } finally {
      f.db.close();
    }
  });

  it("visar torsdagsuppgiften hela dagen och tar bort den ur nästa dags vy", async () => {
    const f = fixture();
    const viewer = await viewerSession(f);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-15T09:59:00Z")); // 11:59 in Stockholm
      const before = await (await f.call("/station/v2", "GET", undefined, viewer)).json() as { tasks: Task[] };
      expect(before.tasks[0].text).toBe("Tobaksbeställning senast 12.00");
      vi.setSystemTime(new Date("2026-10-15T10:01:00Z"));
      const afterDeadline = await (await f.call("/station/v2", "GET", undefined, viewer)).json() as { tasks: Task[] };
      expect(afterDeadline.tasks[0].id).toBe(before.tasks[0].id);
      vi.setSystemTime(new Date("2026-10-15T22:00:00Z")); // Swedish midnight
      const friday = await (await f.call("/station/v2", "GET", undefined, viewer)).json() as { today: string; tasks: Task[] };
      expect(friday.today).toBe("2026-10-16");
      expect(friday.tasks).toEqual([]);
      vi.setSystemTime(new Date("2026-10-22T08:00:00Z"));
      const nextThursday = await (await f.call("/station/v2", "GET", undefined, viewer)).json() as { tasks: Task[] };
      expect(nextThursday.tasks[0]).toMatchObject({ text: before.tasks[0].text, done: 0, recurring: true });
      expect(nextThursday.tasks[0].id).not.toBe(before.tasks[0].id);
    } finally {
      f.db.close();
    }
  });
});
