import { describe, expect, it } from 'vitest';
import { fixture } from './fixture';
import { readFileSync } from 'node:fs';

const backupHash = 'a'.repeat(64);
const approval = { confirmation: 'NOLLSTÄLL TVÄTTLIGAN', backup_sha256: backupHash, expected_sales_count: 2 };
const sql = (name: string) => readFileSync(new URL(`../scripts/station-v2-${name}.sql`, import.meta.url), 'utf8');

describe('one-time V2 Tvättligan reset', () => {
  it('requires admin, lock and matching private backup count', async () => {
    const f = fixture();
    await f.sale();
    const cookie = await f.login();
    expect((await f.call('/admin/launch/reset-wash', 'POST', approval)).status).toBe(401);
    expect((await f.call('/admin/launch/reset-wash', 'POST', approval, cookie)).status).toBe(409);
    expect(f.db.prepare('SELECT COUNT(*) n FROM sales').get()).toMatchObject({ n: 1 });
    f.db.exec(sql('lock'));
    expect((await f.call('/admin/launch/reset-wash', 'POST', approval, cookie)).status).toBe(409);
    expect((await f.sale()).status).toBe(503);
    f.db.close();
  });

  it('erases old wash sales and dependent records while preserving other data', async () => {
    const f = fixture();
    const cookie = await f.login();
    const first = await (await f.sale()).json() as { id: string };
    const second = await (await f.sale('peter', 'fin')).json() as { id: string };
    const stamp = '2026-10-08T12:00:00.000Z';
    f.db.prepare("UPDATE sales SET voided_at=?,void_reason='ADMIN_VOID',updated_by='ADMIN',updated_at=?,revision=revision+1 WHERE id=?").run(stamp, stamp, first.id);
    expect(f.db.prepare('SELECT COUNT(*) n FROM sales_audit').get()).toMatchObject({ n: 1 });
    f.db.prepare("INSERT INTO push_subscriptions(id,endpoint,p256dh,auth,management_token_hash,created_at,updated_at) VALUES('sub','https://example.test/push','key','auth','hash',?,?)").run(stamp, stamp);
    f.db.prepare("INSERT INTO notification_events(id,event_key,event_type,event_date,title,body,url,created_at) VALUES('event','event','daily_goal_reached','2026-10-08','title','body','/',?)").run(stamp);
    f.db.prepare("INSERT INTO notification_events(id,event_key,event_type,event_date,title,body,url,created_at) VALUES('manual','manual','manual','2026-10-08','title','body','/',?)").run(stamp);
    f.db.prepare("INSERT INTO station_store_daily_sales(station_id,business_date,net_sales_ore,source,created_at,updated_at,actor) VALUES('tingsryd','2026-10-07',100000,'manual',?,?,'test')").run(stamp, stamp);
    f.db.prepare("INSERT INTO station_schedule_periods(id,station_id,label,starts_on,ends_on,created_at,updated_at) VALUES('period','tingsryd','Test','2026-10-01','2026-10-31',?,?)").run(stamp, stamp);
    f.db.prepare("INSERT INTO station_shifts(id,period_id,work_date,first_name,starts_at,ends_at,updated_at) VALUES('shift','period','2026-10-08','Demo','09:00','17:00',?)").run(stamp);
    const kept = Object.fromEntries(['staff','wash_programs','push_subscriptions','station_store_daily_sales','station_store_sales_audit','station_schedule_periods','station_shifts','settings'].map(table => [table, f.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
    f.db.exec(sql('lock'));
    const res = await f.call('/admin/launch/reset-wash', 'POST', approval, cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted_sales: 2 });
    for (const table of ['sales','sales_audit','maintenance_preview_sales','reset_batches','maintenance_previews']) {
      expect(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).toMatchObject({ n: 0 });
    }
    expect(f.db.prepare('SELECT id FROM notification_events').all()).toEqual([{ id: 'manual' }]);
    expect(f.db.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' });
    expect(f.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(f.db.prepare('SELECT * FROM staff ORDER BY 1').all()).toEqual(kept.staff);
    expect(f.db.prepare('SELECT * FROM push_subscriptions ORDER BY 1').all()).toEqual(kept.push_subscriptions);
    expect(f.db.prepare('SELECT * FROM station_store_daily_sales ORDER BY 1').all()).toEqual(kept.station_store_daily_sales);
    expect(f.db.prepare('SELECT * FROM station_store_sales_audit ORDER BY 1').all()).toEqual(kept.station_store_sales_audit);
    expect(f.db.prepare('SELECT * FROM station_schedule_periods ORDER BY 1').all()).toEqual(kept.station_schedule_periods);
    expect(f.db.prepare('SELECT * FROM station_shifts ORDER BY 1').all()).toEqual(kept.station_shifts);
    for (const row of kept.settings as { key: string; value: string }[]) {
      expect(f.db.prepare('SELECT value FROM settings WHERE key=?').get(row.key)).toEqual({ value: row.value });
    }
    expect(f.db.prepare('SELECT id,name,price_sek,sort_order FROM wash_programs ORDER BY 1').all()).toEqual(
      (kept.wash_programs as Record<string, unknown>[]).map(({ id,name,price_sek,sort_order }) => ({ id,name,price_sek,sort_order }))
    );
    expect((await f.call('/admin/launch/reset-wash','POST',approval,cookie)).status).toBe(409);
    f.db.exec(sql('unlock'));
    expect(f.db.prepare("SELECT value FROM settings WHERE key='station_v2_launch_lock'").get()).toMatchObject({ value: '0' });
    expect(f.db.prepare('SELECT * FROM wash_programs ORDER BY 1').all()).toEqual(kept.wash_programs);
    expect(await (await f.call('/admin/sales', 'GET', undefined, cookie)).json()).toMatchObject({ total: 0, rows: [] });
    expect(await (await f.call('/stats')).json()).toMatchObject({ goals: { monthlyCount: 0 } });
    const emptyCsv = await (await f.call('/admin/export', 'GET', undefined, cookie)).text();
    expect(emptyCsv.trim().split(/\r?\n/)).toHaveLength(1);
    expect((await f.sale()).status).toBe(201);
    const exportResponse = await f.call('/admin/export', 'GET', undefined, cookie);
    expect(exportResponse.status).toBe(200);
    expect(await exportResponse.text()).not.toContain(second.id);
    f.db.close();
  });
});
