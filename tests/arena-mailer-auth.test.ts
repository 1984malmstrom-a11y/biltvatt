import {afterEach, expect, it, vi} from 'vitest';
import {arenaFixture} from './arena-fixture';
import {passwordHash} from '../shared/arena-crypto';
import {handleArenaMail, type ArenaMailMessage, type ArenaMailerEnv} from '../worker/arena-mailer-core';
const fixtures: ReturnType<typeof arenaFixture>[] = [];
const password = 'Synthetic mailer auth passphrase!';
const deliveryEnv: ArenaMailerEnv = {RESEND_API_KEY: 're_' + 'synthetic_only_'.repeat(3), RESEND_DOMAIN_VERIFIED: '1', ARENA_ALLOWED_ORIGINS: '["https://tvattligan.test"]'};
afterEach(() => {fixtures.splice(0).forEach(f => f.close()); vi.restoreAllMocks();});
async function setup(verified = false) {
  const f = arenaFixture(); fixtures.push(f); f.env.ARENA_AUTH_DEV = undefined; f.env.ARENA_ONLY = '1';
  const h = await passwordHash(password), now = new Date().toISOString();
  f.arena.prepare("INSERT INTO arena_superadmins(id,email_normalized,display_name,role,status,password_hash,password_salt,password_iterations,email_verified_at,created_at,updated_at) VALUES('mail-owner','synthetic-owner@example.test','Synthetic Owner','owner','active',?,?,?,?,?,?)").run(h.hash, h.salt, h.iterations, verified ? now : null, now, now);
  const messages: ArenaMailMessage[] = [], api = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({id: '12345678-1234-4234-8234-123456789abc'}));
  const currentEnv = {...deliveryEnv};
  f.env.ARENA_MAILER = {fetch: async (url: string, init: RequestInit) => {
    expect(url).toBe('https://arena-mailer.internal/send'); expect(init.method).toBe('POST');
    const message = JSON.parse(String(init.body)); expect(Object.keys(message).sort()).toEqual(['purpose', 'to', 'url']); messages.push(message);
    return handleArenaMail(new Request(url, init), currentEnv, api);
  }} as unknown as Fetcher;
  const login = async (email = 'synthetic-owner@example.test', pass = password) => {
    const r = await f.call('/arena/auth/superadmin/login', 'POST', {email, password: pass}); expect(r.status).toBe(200); return f.cookie(r);
  };
  const token = () => new URLSearchParams(new URL(messages.at(-1)!.url).hash.slice(1)).get('token')!;
  return {f, api, messages, currentEnv, login, token};
}
it('transports actual production-mode Owner verify, reset and invite links; original hashed single-use snapshots remain authoritative', async () => {
  const {f, api, messages, login, token} = await setup(); let cookie = await login();
  expect((await f.call('/arena/superadmin/stations', 'GET', undefined, cookie)).status).toBe(403);
  expect((await f.call('/arena/auth/verification/request', 'POST', {realm: 'superadmin'}, cookie)).status).toBe(200);
  const verifyToken = token(); expect(messages.at(-1)!.purpose).toBe('verify');
  expect((await f.call('/arena/auth/verify', 'POST', {token: verifyToken})).status).toBe(200);
  expect((await f.call('/arena/auth/verify', 'POST', {token: verifyToken})).status).toBe(400);
  expect((await f.call('/arena/superadmin/stations', 'GET', undefined, cookie)).status).toBe(200);
  expect((await f.call('/arena/auth/forgot', 'POST', {realm: 'superadmin', email: 'synthetic-owner@example.test'})).status).toBe(200);
  const resetToken = token(); expect(messages.at(-1)!.purpose).toBe('reset');
  expect((await f.call('/arena/auth/reset', 'POST', {token: resetToken, password: password + 'next'})).status).toBe(200);
  expect((await f.call('/arena/auth/reset', 'POST', {token: resetToken, password})).status).toBe(400);
  expect((await f.call('/arena/superadmin/stations', 'GET', undefined, cookie)).status).toBe(401);
  cookie = await login('synthetic-owner@example.test', password + 'next');
  expect((await f.call('/arena/superadmin/accounts', 'POST', {email: 'synthetic-invite@example.test', display_name: 'Synthetic operator', confirm: 'INVITE'}, cookie)).status).toBe(201);
  const inviteToken = token(); expect(messages.at(-1)!.purpose).toBe('invite');
  expect((await f.call('/arena/auth/reset', 'POST', {token: inviteToken, password})).status).toBe(200);
  expect((await f.call('/arena/auth/reset', 'POST', {token: inviteToken, password})).status).toBe(400);
  await login('synthetic-invite@example.test');
  expect(api).toHaveBeenCalledTimes(3);
  for (const secret of [verifyToken, resetToken, inviteToken]) {
    expect(JSON.stringify(f.arena.prepare('SELECT * FROM arena_security_tokens').all())).not.toContain(secret);
    expect(JSON.stringify(f.arena.prepare('SELECT * FROM arena_audit_log').all())).not.toContain(secret);
  }
  expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_dev_outbox').get()!.n).toBe(0);
});
it('preserves production station verify/reset realms with the same mail transport', async () => {
  const {f, api, messages, token} = await setup();
  const signup = await f.call('/arena/auth/signup', 'POST', {name: 'Synthetic mail station', email: 'synthetic-station@example.test', password}); expect(signup.status).toBe(201);
  const cookie = f.cookie(signup);
  expect((await f.call('/arena/auth/verification/request', 'POST', {realm: 'station'}, cookie)).status).toBe(200);
  expect(new URLSearchParams(new URL(messages.at(-1)!.url).hash.slice(1)).get('realm')).toBe('station');
  expect((await f.call('/arena/auth/verify', 'POST', {token: token()})).status).toBe(200);
  expect((await f.call('/arena/auth/forgot', 'POST', {realm: 'station', email: 'synthetic-station@example.test'})).status).toBe(200);
  expect((await f.call('/arena/auth/reset', 'POST', {token: token(), password: password + 'new'})).status).toBe(200); expect(api).toHaveBeenCalledTimes(2);
});
it('preserves safe delivery failures, non-enumerating reset and the existing reinvite recovery path', async () => {
  const {f, api, currentEnv, messages, token, login} = await setup(true), cookie = await login();
  currentEnv.RESEND_API_KEY = undefined;
  const verify = await f.call('/arena/auth/verification/request', 'POST', {realm: 'superadmin'}, cookie); expect(verify.status).toBe(503);
  expect(await verify.text()).not.toContain(token());
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const known = await f.call('/arena/auth/forgot', 'POST', {realm: 'superadmin', email: 'synthetic-owner@example.test'}), unknown = await f.call('/arena/auth/forgot', 'POST', {realm: 'superadmin', email: 'absent@example.test'});
  expect(known.status).toBe(200); expect(await known.json()).toEqual(await unknown.json()); expect(warn).toHaveBeenCalledWith('Arena password reset delivery deferred.');
  expect((await f.call('/arena/superadmin/accounts', 'POST', {email: 'synthetic-reinvite@example.test', display_name: 'Synthetic reinvite', confirm: 'INVITE'}, cookie)).status).toBe(503);
  const failedToken = token(), id = f.arena.prepare("SELECT id FROM arena_superadmins WHERE email_normalized='synthetic-reinvite@example.test'").get()!.id;
  currentEnv.RESEND_API_KEY = deliveryEnv.RESEND_API_KEY;
  expect((await f.call(`/arena/superadmin/accounts/${id}/reinvite`, 'POST', {confirm: 'CONFIRM'}, cookie)).status).toBe(200);
  expect((await f.call('/arena/auth/reset', 'POST', {token: failedToken, password})).status).toBe(400);
  expect((await f.call('/arena/auth/reset', 'POST', {token: token(), password})).status).toBe(200);
  expect(api).toHaveBeenCalledTimes(1); expect(messages.at(-1)!.purpose).toBe('invite');
});
