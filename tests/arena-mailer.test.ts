import {afterEach, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {escapeMailHtml, handleArenaMail, MAIL_TIMEOUT_MS, renderArenaMail, RESEND_ENDPOINT, type ArenaMailerEnv, type ArenaMailMessage, type MailPurpose} from '../worker/arena-mailer-core';
const origin = 'https://verified-pilot.example.test';
const token = 'a'.repeat(64);
const apiKey = 're_' + 'synthetic_test_only_'.repeat(2);
const goodEnv = (): ArenaMailerEnv => ({RESEND_API_KEY: apiKey, RESEND_DOMAIN_VERIFIED: '1', ARENA_ALLOWED_ORIGINS: JSON.stringify([origin])});
const message = (purpose: MailPurpose = 'verify'): ArenaMailMessage => ({to: 'synthetic-recipient@example.test', purpose, url: `${origin}/arena/recovery#token=${token}&realm=superadmin&purpose=${purpose}`});
const request = (data: unknown = message(), options: RequestInit = {}) => new Request('https://arena-mailer.internal/send', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), ...options});
const accepted = () => Response.json({id: '12345678-1234-4234-8234-123456789abc'});
const transport = () => vi.fn<typeof fetch>().mockImplementation(async () => accepted());
afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

it.each([
  ['verify', 'Verifiera din e-postadress – ARENAN', 'VERIFIERA E-POST'],
  ['reset', 'Återställ ditt lösenord – ARENAN', 'ÅTERSTÄLL LÖSENORD'],
  ['invite', 'Du är inbjuden till ARENAN', 'ACCEPTERA INBJUDAN'],
] as const)('renders and sends Swedish %s HTML + text through the exact Resend API contract', async (purpose, subject, cta) => {
  const send = transport(), response = await handleArenaMail(request(message(purpose)), goodEnv(), send);
  expect(response.status).toBe(202); expect(await response.json()).toEqual({accepted: true});
  expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(send).toHaveBeenCalledTimes(1);
  const [url, options] = send.mock.calls[0], payload = JSON.parse(options!.body as string);
  expect(url).toBe(RESEND_ENDPOINT); expect(options).toMatchObject({method: 'POST', redirect: 'manual'});
  expect(new Headers(options!.headers).get('Authorization')).toBe('Bearer ' + apiKey);
  expect(payload).toMatchObject({from: 'ARENAN <noreply@arenanplay.se>', to: [message().to], subject});
  expect(payload.html).toContain(cta); expect(payload.html).toContain('SÄLJ MER. TILLSAMMANS.');
  expect(payload.html).toContain('lang="sv"'); expect(payload.html).toContain('&amp;realm=superadmin');
  expect(payload.text).toContain(message(purpose).url); expect(payload.text).toContain(purpose === 'invite' ? '24 timmar' : '30 minuter');
  expect(payload.html).not.toMatch(/<script|<img|<form|<iframe|Preem|javascript:/i);
  expect(Object.keys(payload).sort()).toEqual(['from', 'html', 'subject', 'text', 'to']);
});
it('escapes every HTML metacharacter and treats unsafe markup as inert text', () => {
  expect(escapeMailHtml('<img src="x" onerror=\'x\'>&')).toBe('&lt;img src=&quot;x&quot; onerror=&#39;x&#39;&gt;&amp;');
  const rendered = renderArenaMail({...message(), url: 'https://example.test/"\'><svg onload="bad">&'});
  expect(rendered.html).not.toContain('<svg'); expect(rendered.html).not.toContain('href="https://example.test/"');
  expect(rendered.html).toContain('&lt;svg');
});
it.each(['GET', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'])('refuses method %s without a provider call', async method => {
  const send = transport(), r = await handleArenaMail(new Request('https://arena-mailer.internal/send', {method}), goodEnv(), send);
  expect(r.status).toBe(405); expect(r.headers.get('Allow')).toBe('POST'); expect(send).not.toHaveBeenCalled();
});
it.each(['/', '/health', '/send/other', '/send?target=external'])('refuses unknown endpoint %s', async path => {
  const send = transport(), r = await handleArenaMail(new Request('https://arena-mailer.internal' + path, {method: 'POST'}), goodEnv(), send);
  expect(r.status).toBe(404); expect(send).not.toHaveBeenCalled();
});
it.each([null, [], {}, {...message(), html: '<b>injected</b>'}, {...message(), purpose: 'VERIFY'}, {...message(), purpose: 'marketing'}, {to: message().to, purpose: 'verify'}])('refuses malformed message %#', async data => {
  const send = transport(); expect((await handleArenaMail(request(data), goodEnv(), send)).status).toBe(400); expect(send).not.toHaveBeenCalled();
});
it.each(['bad', 'Name <test@example.test>', 'a\r\nBcc: other@example.test', ' a@example.test', 'a..b@example.test', '.a@example.test', 'a@-example.test', 'a@exam_ple.test', 'a'.repeat(65) + '@example.test', 'a@' + 'b'.repeat(250) + '.test'])('refuses malformed recipient %#', async to => {
  const send = transport(); expect((await handleArenaMail(request({...message(), to}), goodEnv(), send)).status).toBe(400); expect(send).not.toHaveBeenCalled();
});
it.each([
  'http://verified-pilot.example.test/arena/recovery', 'javascript:alert(1)', 'data:text/html,x', '//verified-pilot.example.test/arena/recovery',
  'https://evil.test/arena/recovery', 'https://verified-pilot.example.test.evil.test/arena/recovery', 'https://sub.verified-pilot.example.test/arena/recovery',
  'https://verified-pilot.example.test:8443/arena/recovery', 'https://user:pass@verified-pilot.example.test/arena/recovery',
  origin + '/other', origin + '/arena/recovery?forward=evil', origin + '/arena/recovery#token=invalid&realm=superadmin&purpose=verify',
  message().url.replace('realm=superadmin', 'realm=owner'), message().url.replace('purpose=verify', 'purpose=reset'),
  message().url + '&token=' + token, message().url + '&extra=x', message().url + '%0d%0a', message().url + '\r\n',
  message().url.replace('/arena', '\\arena'), message().url + 'x'.repeat(2048),
])('refuses unsafe or mismatched security URL %#', async url => {
  const send = transport(); expect((await handleArenaMail(request({...message(), url}), goodEnv(), send)).status).toBe(400); expect(send).not.toHaveBeenCalled();
});
it('supports an explicitly verified workers.dev origin without guessing a subdomain', async () => {
  const verified = 'https://arenan-pilot-vd-20261019.synthetic-confirmed-account.workers.dev', send = transport();
  expect((await handleArenaMail(request({...message(), url: message().url.replace(origin, verified)}), {...goodEnv(), ARENA_ALLOWED_ORIGINS: JSON.stringify([verified])}, send)).status).toBe(202);
  expect((await handleArenaMail(request(), {...goodEnv(), ARENA_ALLOWED_ORIGINS: JSON.stringify([verified])}, send)).status).toBe(400);
});
it.each([undefined, '', '[]', '["https://*.example.test"]', '["http://example.test"]', '["https://example.test/"]', '["https://user@exam.test"]', '[42]', '{}'])('fails closed on missing or invalid origin configuration %#', async ARENA_ALLOWED_ORIGINS => {
  const send = transport(); expect((await handleArenaMail(request(), {...goodEnv(), ARENA_ALLOWED_ORIGINS}, send)).status).toBe(503); expect(send).not.toHaveBeenCalled();
});
it.each([{RESEND_API_KEY: undefined}, {RESEND_API_KEY: 'invalid key\r\n'}, {RESEND_DOMAIN_VERIFIED: '0'}, {RESEND_DOMAIN_VERIFIED: undefined}])('requires a secret and explicit verified-domain release gate %#', async edit => {
  const send = transport(); expect((await handleArenaMail(request(), {...goodEnv(), ...edit}, send)).status).toBe(503); expect(send).not.toHaveBeenCalled();
});
it('validates JSON, content type, byte limits and streamed input without trusting Content-Length', async () => {
  const send = transport();
  expect((await handleArenaMail(request(message(), {headers: {'Content-Type': 'text/plain'}}), goodEnv(), send)).status).toBe(415);
  expect((await handleArenaMail(request(message(), {body: '{broken'}), goodEnv(), send)).status).toBe(400);
  expect((await handleArenaMail(request(message(), {body: new Uint8Array([0xff])}), goodEnv(), send)).status).toBe(400);
  expect((await handleArenaMail(request(message(), {body: 'x'.repeat(8193)}), goodEnv(), send)).status).toBe(413);
  expect((await handleArenaMail(request(message(), {headers: {'Content-Type': 'application/json', 'Content-Length': '9000'}}), goodEnv(), send)).status).toBe(413);
  const stream = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(8193)); controller.close();}});
  const streamed = new Request('https://arena-mailer.internal/send', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: stream, duplex: 'half'} as RequestInit);
  expect((await handleArenaMail(streamed, goodEnv(), send)).status).toBe(413); expect(send).not.toHaveBeenCalled();
});
it.each([301, 302, 307, 308, 400, 401, 403, 422, 429, 500, 503])('maps Resend %s to a safe error without retries, key, recipient or token leakage', async status => {
  const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response([apiKey, message().to, message().url].join(' '), {status}));
  const response = await handleArenaMail(request(), goodEnv(), send), body = await response.text();
  expect(response.status).toBe(status === 429 ? 429 : 502); if (status === 429) expect(response.headers.get('Retry-After')).toBe('60');
  for (const privateValue of [apiKey, message().to, token]) expect(body).not.toContain(privateValue);
  expect(send).toHaveBeenCalledTimes(1); for (const log of logs) expect(log).not.toHaveBeenCalled();
});
it.each([{}, {id: ''}, {id: 'not-an-acceptance-id'}, {id: '12345678-1234-4234-8234-123456789abc', error: 'refused'}])('does not treat malformed 2xx provider result as accepted %#', async body => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)); expect((await handleArenaMail(request(), goodEnv(), send)).status).toBe(502);
});
it('handles provider JSON/size/network failures without exposing the original exception', async () => {
  for (const send of [vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>not JSON</html>')), vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(8193))), vi.fn<typeof fetch>().mockRejectedValue(new Error(apiKey + message().url))]) {
    const r = await handleArenaMail(request(), goodEnv(), send); expect(r.status).toBe(502); expect(await r.text()).not.toContain(token); expect(send).toHaveBeenCalledTimes(1);
  }
});
it('aborts the Resend call at its deadline without automatic retries', async () => {
  vi.useFakeTimers(); let began!: () => void; const started = new Promise<void>(resolve => {began = resolve;});
  const send = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {began(); return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('synthetic timeout'))));});
  const result = handleArenaMail(request(), goodEnv(), send); await started; await vi.advanceTimersByTimeAsync(MAIL_TIMEOUT_MS);
  const response = await result; expect(response.status).toBe(504); expect(await response.json()).toEqual({error: 'MAIL_TIMEOUT'}); expect(send).toHaveBeenCalledTimes(1);
});
it('hashes deterministic provider idempotency keys without putting private values in headers', async () => {
  const send = transport(); await handleArenaMail(request(), goodEnv(), send); await handleArenaMail(request(), goodEnv(), send);
  await handleArenaMail(request({...message(), url: message().url.replace(token, 'b'.repeat(64))}), goodEnv(), send);
  const keys = send.mock.calls.map(([, options]) => new Headers(options!.headers).get('Idempotency-Key'));
  expect(keys[0]).toMatch(/^arena-v1-[a-f0-9]{64}$/); expect(keys[0]).toBe(keys[1]); expect(keys[2]).not.toBe(keys[0]); expect(keys[0]).not.toContain(token); expect(keys[0]).not.toContain(message().to);
});
it('keeps the dedicated Wrangler template private, database-free, disabled until configured and free of plaintext keys', () => {
  const c = JSON.parse(readFileSync(new URL('../wrangler.arena-mailer.jsonc', import.meta.url), 'utf8'));
  expect(c.name).toBe('arenan-mailer-pilot'); expect(c.workers_dev).toBe(false); expect(c.preview_urls).toBe(false); expect(c.routes).toEqual([]);
  expect(c.d1_databases).toBeUndefined(); expect(c.vars.RESEND_API_KEY).toBeUndefined(); expect(c.vars.RESEND_DOMAIN_VERIFIED).toBe('0'); expect(c.vars.ARENA_ALLOWED_ORIGINS).toBe('[]'); expect(c.observability.enabled).toBe(false);
});
