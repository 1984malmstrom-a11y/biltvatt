import { describe, expect, it } from "vitest";
import { fixture } from "./fixture";
import { addDays, stockholmDay } from "../worker/stats";
import { change, comparisonDay } from "../worker/station";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

describe("Stationsdashboard", () => {
  it("0004 tillför stationstabeller utan att ändra befintliga tvätt- och pushrader", () => {
    const db = new DatabaseSync(":memory:");
    for (const name of [
      "0001_initial.sql",
      "0002_admin_maintenance.sql",
      "0003_push_notifications.sql",
    ])
      db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    db.prepare("INSERT INTO sales(id,staff_id,wash_program_id,price_sek,sold_at,created_at,request_id,undo_token_hash) VALUES(?,?,?,?,?,?,?,?)")
      .run("legacy-sale", "emma", "preemium", 389, "2025-01-01T12:00:00Z", "2025-01-01T12:00:00Z", "legacy-request", "legacy-hash");
    db.prepare("INSERT INTO push_subscriptions(id,endpoint,p256dh,auth,management_token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run("legacy-device", "https://fcm.googleapis.com/fcm/send/legacy", "key", "auth", "hash", "2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z");
    const before = {
      sales: db.prepare("SELECT * FROM sales").all(),
      push: db.prepare("SELECT * FROM push_subscriptions").all(),
    };
    db.exec(readFileSync(new URL("../migrations/0004_station_dashboard.sql", import.meta.url), "utf8"));
    expect(db.prepare("SELECT * FROM sales").all()).toEqual(before.sales);
    expect(db.prepare("SELECT * FROM push_subscriptions").all()).toEqual(before.push);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'station_%'").all()).toHaveLength(4);
    db.close();
  });
  it("jämför exakt 364 kalenderdagar, inklusive skottår och årsskiften", () => {
    expect(comparisonDay("2026-10-07")).toBe("2025-10-08");
    expect(comparisonDay("2026-01-01")).toBe("2025-01-02");
    expect(comparisonDay("2024-03-01")).toBe("2023-03-03");
    expect(comparisonDay("2026-12-31")).toBe("2026-01-01");
    for (const day of ["2026-10-07", "2026-01-01", "2024-03-01", "2026-12-31"])
      expect(new Date(`${comparisonDay(day)}T12:00:00Z`).getUTCDay()).toBe(
        new Date(`${day}T12:00:00Z`).getUTCDay(),
      );
  });
  it("beräknar procent och kronor utan vilseledande division med noll", () => {
    expect(change(12345, 10000)).toEqual({
      difference_ore: 2345,
      percent: 23.45,
    });
    expect(change(0, 10000)).toEqual({ difference_ore: -10000, percent: -100 });
    expect(change(150, 0)).toEqual({ difference_ore: 150, percent: null });
    expect(change(150, null)).toEqual({ difference_ore: null, percent: null });
  });
  it("kräver admin- eller visningssession och låter aldrig visningssessionen skriva", async () => {
    const f = fixture();
    const admin = await f.login();
    expect((await f.call("/station/dashboard")).status).toBe(401);
    expect(
      (await f.call("/station/dashboard", "GET", undefined, admin)).status,
    ).toBe(200);
    const made = await f.call(
      "/admin/station/activation-codes",
      "POST",
      { device_label: "Personal-TV" },
      admin,
    );
    expect(made.status).toBe(200);
    const { code } = (await made.json()) as { code: string };
    expect(
      (await f.call("/station/activate", "POST", { code: "wrong" })).status,
    ).toBe(400);
    const activated = await f.call("/station/activate", "POST", { code });
    expect(activated.status).toBe(200);
    const viewer = activated.headers.get("Set-Cookie")!.split(";")[0];
    expect(activated.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(activated.headers.get("Set-Cookie")).toContain("Path=/api/station");
    expect((await f.call("/station/activate", "POST", { code })).status).toBe(
      401,
    );
    const summary = await f.call(
      "/station/dashboard",
      "GET",
      undefined,
      viewer,
    );
    expect(summary.status).toBe(200);
    expect(summary.headers.get("Cache-Control")).toBe("no-store");
    expect(await summary.json()).toMatchObject({
      net_sales_ore: null,
      comparison_sales_ore: null,
      percent: null,
    });
    expect(
      (await f.call("/admin/station/store-sales", "GET", undefined, viewer))
        .status,
    ).toBe(401);
    expect(
      (
        await f.call(
          "/admin/station/store-sales/2025-10-08",
          "PUT",
          { net_sales_ore: 10000, expected_revision: null },
          viewer,
        )
      ).status,
    ).toBe(401);
    const devices = (await (
      await f.call("/admin/station/view-sessions", "GET", undefined, admin)
    ).json()) as { id: string }[];
    expect(
      (
        await f.call(
          `/admin/station/view-sessions/${devices[0].id}`,
          "DELETE",
          undefined,
          admin,
        )
      ).status,
    ).toBe(200);
    expect(
      (await f.call("/station/dashboard", "GET", undefined, viewer)).status,
    ).toBe(401);
    f.db.close();
  });
  it("registrerar, jämför och rättar atomiskt med versionskontroll och audit", async () => {
    const f = fixture();
    const admin = await f.login();
    const day = addDays(stockholmDay(), -1),
      compareDay = comparisonDay(day);
    const make = (
      d: string,
      value: number,
      revision: number | null,
      reason?: string,
    ) =>
      f.call(
        `/admin/station/store-sales/${d}`,
        "PUT",
        {
          net_sales_ore: value,
          expected_revision: revision,
          ...(reason ? { reason } : {}),
        },
        admin,
      );
    expect((await make(day, 123456, null)).status).toBe(200);
    expect((await make(day, 200000, null)).status).toBe(409);
    expect((await make(compareDay, 100000, null)).status).toBe(200);
    expect((await make(day, 130000, 0)).status).toBe(400);
    expect((await make(day, 130000, 1, "Rätt rapportvärde")).status).toBe(409);
    expect((await make(day, 130000, 0, "Rätt rapportvärde")).status).toBe(200);
    const activation = (await (
      await f.call(
        "/admin/station/activation-codes",
        "POST",
        { device_label: "TV" },
        admin,
      )
    ).json()) as { code: string };
    const viewResponse = await f.call("/station/activate", "POST", {
      code: activation.code,
    });
    const viewer = viewResponse.headers.get("Set-Cookie")!.split(";")[0];
    const dashboard = await (
      await f.call("/station/dashboard", "GET", undefined, viewer)
    ).json();
    expect(dashboard).toMatchObject({
      business_date: day,
      comparison_date: compareDay,
      net_sales_ore: 130000,
      comparison_sales_ore: 100000,
      difference_ore: 30000,
      percent: 30,
    });
    const history = (await (
      await f.call(
        `/admin/station/store-sales/${day}/audit`,
        "GET",
        undefined,
        admin,
      )
    ).json()) as {
      action: string;
      old_net_sales_ore: number | null;
      new_net_sales_ore: number;
      reason: string | null;
    }[];
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      action: "CORRECT",
      old_net_sales_ore: 123456,
      new_net_sales_ore: 130000,
      reason: "Rätt rapportvärde",
    });
    expect(history[1]).toMatchObject({
      action: "CREATE",
      old_net_sales_ore: null,
      new_net_sales_ore: 123456,
    });
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM sales").get()).toEqual({
      n: 0,
    });
    f.db.close();
  });
  it("avvisar felaktigt datum, belopp, framtid och korsande origin", async () => {
    const f = fixture();
    const admin = await f.login();
    const path = "/admin/station/store-sales/2025-02-30";
    expect(
      (
        await f.call(
          path,
          "PUT",
          { net_sales_ore: 100, expected_revision: null },
          admin,
        )
      ).status,
    ).toBe(400);
    const day = addDays(stockholmDay(), -1);
    expect(
      (
        await f.call(
          `/admin/station/store-sales/${day}`,
          "PUT",
          { net_sales_ore: 1.5, expected_revision: null },
          admin,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.call(
          `/admin/station/store-sales/${day}`,
          "PUT",
          { net_sales_ore: -1, expected_revision: null },
          admin,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.call(
          `/admin/station/store-sales/${day}`,
          "PUT",
          { net_sales_ore: 100, expected_revision: null },
          admin,
          { Origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
    f.db.close();
  });
});
