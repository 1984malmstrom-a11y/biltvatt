import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./fixture";

type Task = { id: string; text: string; done: number; revision: number; recurring?: boolean };
type Completion = { today: string; total: number; remaining: number; all_done: boolean };
type Update = { ok: boolean; done: boolean; revision: number; completion: Completion; tasks: Task[] };

async function stationViewer(f: ReturnType<typeof fixture>) {
  const admin = await f.login();
  const made = await f.call("/admin/station/activation-codes", "POST", { device_label: "Firandetest" }, admin);
  const { code } = await made.json() as { code: string };
  const active = await f.call("/station/activate", "POST", { code });
  return active.headers.get("Set-Cookie")!.split(";")[0];
}

async function tasks(f: ReturnType<typeof fixture>, viewer: string) {
  const response = await f.call("/station/v2", "GET", undefined, viewer);
  expect(response.status).toBe(200);
  return (await response.json() as { today: string; tasks: Task[] }).tasks;
}

async function toggle(f: ReturnType<typeof fixture>, viewer: string, task: Task, done: boolean) {
  const response = await f.call(`/station/v2/tasks/${task.id}`, "PUT", {
    text: task.text, done, expected_revision: task.revision,
  }, viewer);
  return { status: response.status, body: await response.json() as Update };
}

describe("serverbekräftat To-do-firande", () => {
  afterEach(() => vi.useRealTimers());

  it("bekräftar sista av fyra och enda uppgiften; undo och nytt slutförande ger ny bekräftelse", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z")); // Söndag, ingen återkommande uppgift.
    const f = fixture();
    try {
      const viewer = await stationViewer(f);
      for (const text of ["Ett", "Två", "Tre", "Fyra"])
        expect((await f.call("/station/v2/tasks", "POST", { text }, viewer)).status).toBe(201);
      let rows = await tasks(f, viewer);
      for (const row of rows.slice(0, 3)) {
        const result = await toggle(f, viewer, row, true);
        expect(result).toMatchObject({ status: 200, body: { completion: { total: 4, all_done: false } } });
      }
      rows = await tasks(f, viewer);
      const last = await toggle(f, viewer, rows[3], true);
      expect(last).toMatchObject({ status: 200, body: {
        done: true, revision: 1, completion: { today: "2026-10-11", total: 4, remaining: 0, all_done: true },
      } });
      const undone = await toggle(f, viewer, { ...rows[3], revision: 1 }, false);
      expect(undone.body.completion).toMatchObject({ total: 4, remaining: 1, all_done: false });
      const again = await toggle(f, viewer, { ...rows[3], revision: 2, done: 0 }, true);
      expect(again.body.completion).toMatchObject({ total: 4, remaining: 0, all_done: true });

      for (const row of (await tasks(f, viewer)).slice(0, 3))
        expect((await toggle(f, viewer, row, false)).status).toBe(200);
      for (const row of (await tasks(f, viewer)).slice(0, 3))
        expect((await f.call(`/station/v2/tasks/${row.id}`, "DELETE", { expected_revision: row.revision }, viewer)).status).toBe(200);
      const only = (await tasks(f, viewer))[0];
      expect((await toggle(f, viewer, only, false)).body.completion).toMatchObject({ total: 1, remaining: 1, all_done: false });
      expect((await toggle(f, viewer, { ...only, revision: only.revision + 1, done: 0 }, true)).body.completion)
        .toMatchObject({ total: 1, remaining: 0, all_done: true });
    } finally { f.db.close(); }
  });

  it("räknar även en ännu osparad onsdagsuppgift och bekräftar den när den är sist", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    const f = fixture();
    try {
      const viewer = await stationViewer(f);
      expect((await f.call("/station/v2/tasks", "POST", { text: "Kontrollera kylen" }, viewer)).status).toBe(201);
      const rows = await tasks(f, viewer);
      expect(rows[0].recurring).toBe(true);
      expect((await toggle(f, viewer, rows[1], true)).body.completion)
        .toMatchObject({ total: 2, remaining: 1, all_done: false });
      expect((await toggle(f, viewer, rows[0], true)).body.completion)
        .toMatchObject({ today: "2026-10-14", total: 2, remaining: 0, all_done: true });
    } finally { f.db.close(); }
  });

  it("avvisar revisionskonflikt och räknar uppgift från en annan enhet", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const f = fixture();
    try {
      const viewerA = await stationViewer(f);
      const viewerB = await stationViewer(f);
      expect((await f.call("/station/v2/tasks", "POST", { text: "Första" }, viewerA)).status).toBe(201);
      const stale = (await tasks(f, viewerA))[0];
      expect((await f.call("/station/v2/tasks", "POST", { text: "Tillagd på annan enhet" }, viewerB)).status).toBe(201);
      const first = await toggle(f, viewerA, stale, true);
      expect(first.body.completion)
        .toMatchObject({ total: 2, remaining: 1, all_done: false });
      expect(first.body.tasks.map((row) => row.text)).toContain("Tillagd på annan enhet");
      expect((await toggle(f, viewerB, stale, true)).status).toBe(409);
      expect((await f.call(`/station/v2/tasks/${stale.id}`, "PUT", {
        text: stale.text, done: false, expected_revision: 1,
      })).status).toBe(401);
      expect((await tasks(f, viewerA)).find((row) => row.id === stale.id)?.done).toBe(1);
    } finally { f.db.close(); }
  });
});
