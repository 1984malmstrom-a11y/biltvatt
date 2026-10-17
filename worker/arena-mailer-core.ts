// Standalone transport only. No database, account/token creation, logging or retries.
export type MailPurpose = 'verify' | 'reset' | 'invite';
export type ArenaMailMessage = {to: string; purpose: MailPurpose; url: string};
export interface ArenaMailerEnv {
  RESEND_API_KEY?: string;
  RESEND_DOMAIN_VERIFIED?: string;
  ARENA_ALLOWED_ORIGINS?: string;
}
export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export const MAIL_TIMEOUT_MS = 8000;
const MAX_BODY = 8192;
const FROM = 'ARENAN <noreply@arenanplay.se>';
const definitions = {
  verify: {subject: 'Verifiera din e-postadress – ARENAN', heading: 'Ett tryggt första steg.', cta: 'VERIFIERA E-POST', copy: 'Bekräfta din e-postadress för att säkra ditt konto och din återställning i ARENAN.', expiry: 'Länken gäller i 30 minuter och kan bara användas en gång.'},
  reset: {subject: 'Återställ ditt lösenord – ARENAN', heading: 'Tillbaka i matchen.', cta: 'ÅTERSTÄLL LÖSENORD', copy: 'Vi har fått en begäran om att återställa ditt lösenord. Välj ett nytt lösenord via den säkra länken.', expiry: 'Länken gäller i 30 minuter och kan bara användas en gång.'},
  invite: {subject: 'Du är inbjuden till ARENAN', heading: 'Starkare tillsammans.', cta: 'ACCEPTERA INBJUDAN', copy: 'Du har blivit inbjuden som administratör i ARENAN. Acceptera inbjudan och välj ditt eget lösenord.', expiry: 'Inbjudan gäller i 24 timmar och kan bara användas en gång.'},
} as const;
export const escapeMailHtml = (value: string) => value.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]!));

export function renderArenaMail(message: ArenaMailMessage) {
  const d = definitions[message.purpose], link = escapeMailHtml(message.url);
  const text = `ARENAN\nSÄLJ MER. TILLSAMMANS.\n\n${d.subject}\n\n${d.copy}\n\n${d.cta}\n${message.url}\n\n${d.expiry}\nDela inte denna personliga länk.\n\nOm du inte väntade dig detta mejl kan du bortse från det. Kontakta din administratör om du är osäker.\n`;
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${d.subject}</title></head>
<body style="margin:0;padding:0;background-color:#041b13;color:#f5f1e5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#041b13;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#08291e;border:1px solid #6e6040;border-radius:16px;">
<tr><td style="padding:36px 28px 28px;border-bottom:1px solid #304739;"><p style="margin:0;color:#e9d18f;font-size:26px;font-weight:bold;letter-spacing:5px;">ARENAN</p><p style="margin:12px 0 0;color:#c4c9bd;font-size:10px;letter-spacing:2px;">SÄLJ MER. TILLSAMMANS.</p></td></tr>
<tr><td style="padding:36px 28px;"><p style="margin:0 0 14px;color:#e9d18f;font-size:11px;letter-spacing:2px;">${d.cta}</p><h1 style="margin:0 0 22px;color:#faf5e7;font-size:29px;line-height:1.25;">${d.heading}</h1><p style="margin:0 0 30px;color:#d5dfd5;font-size:16px;line-height:1.7;">${d.copy}</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" bgcolor="#e9d18f" style="border-radius:8px;"><a href="${link}" style="display:block;padding:18px 12px;color:#082319;font-size:13px;font-weight:bold;letter-spacing:1px;text-align:center;text-decoration:none;">${d.cta}</a></td></tr></table>
<p style="margin:24px 0 0;color:#c2cdbf;font-size:13px;line-height:1.65;">${d.expiry}<br>Dela inte denna personliga länk.</p>
<p style="margin:20px 0 0;color:#c2cdbf;font-size:12px;line-height:1.65;">Om knappen inte fungerar, kopiera länken till din webbläsare:<br><a href="${link}" style="color:#e9d18f;word-break:break-all;overflow-wrap:anywhere;">${link}</a></p></td></tr>
<tr><td style="padding:24px 28px;border-top:1px solid #304739;"><p style="margin:0;color:#b7c7b9;font-size:12px;line-height:1.7;">Om du inte väntade dig detta mejl kan du bortse från det. Kontakta din administratör om du är osäker.</p><p style="margin:20px 0 0;color:#e9d18f;font-size:10px;letter-spacing:2px;">ARENAN · SÄLJ MER. TILLSAMMANS.</p></td></tr>
</table></td></tr></table></body></html>`;
  return {from: FROM, to: [message.to], subject: d.subject, html, text};
}

class MailFailure extends Error {
  constructor(readonly status: number, readonly code: string) {super(code);}
}
const reject = (status: number, code: string): never => {throw new MailFailure(status, code);};
const reply = (status: number, data: object, headers: HeadersInit = {}) => Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers}});

async function boundedJson(stream: ReadableStream<Uint8Array> | null, max: number) {
  if (!stream) return reject(400, 'INVALID_JSON');
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {await reader.cancel(); return reject(413, 'BODY_TOO_LARGE');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const data = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) {data.set(chunk, offset); offset += chunk.byteLength;}
  try {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(data)) as unknown;}
  catch {return reject(400, 'INVALID_JSON');}
}

function allowedOrigins(raw: string | undefined): Set<string> {
  try {
    const list: unknown = JSON.parse(raw ?? '');
    if (!Array.isArray(list) || !list.length || list.length > 4) return reject(503, 'MAIL_NOT_CONFIGURED');
    const result = new Set<string>();
    for (const item of list) {
      if (typeof item !== 'string' || item.length > 253) return reject(503, 'MAIL_NOT_CONFIGURED');
      const u = new URL(item);
      if (u.protocol !== 'https:' || u.origin !== item || u.username || u.password || u.hostname.includes('*')) return reject(503, 'MAIL_NOT_CONFIGURED');
      result.add(item);
    }
    return result;
  } catch {return reject(503, 'MAIL_NOT_CONFIGURED');}
}

function messageBody(data: unknown, origins: Set<string>): ArenaMailMessage {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return reject(400, 'INVALID_MESSAGE');
  const object = data as Record<string, unknown>, {to, purpose, url} = object;
  if (Object.keys(object).length !== 3 || Object.keys(object).some(k => !['to', 'purpose', 'url'].includes(k))) return reject(400, 'INVALID_MESSAGE');
  if (typeof to !== 'string' || to.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(to) || to.split('@')[0].length > 64 || to.split('@')[0].startsWith('.') || to.split('@')[0].endsWith('.') || to.includes('..')) return reject(400, 'INVALID_RECIPIENT');
  if (purpose !== 'verify' && purpose !== 'reset' && purpose !== 'invite') return reject(400, 'INVALID_PURPOSE');
  if (typeof url !== 'string' || url.length > 2048 || /[\x00-\x20\x7f\\]/.test(url) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url)) return reject(400, 'INVALID_URL');
  let u: URL;
  try {u = new URL(url);} catch {return reject(400, 'INVALID_URL');}
  if (u.protocol !== 'https:' || !origins.has(u.origin) || u.username || u.password || u.pathname !== '/arena/recovery' || u.search) return reject(400, 'INVALID_URL');
  const params = new URLSearchParams(u.hash.slice(1)), realm = params.get('realm');
  if ([...params].length !== 3 || !/^[a-f0-9]{64}$/.test(params.get('token') ?? '') || (realm !== 'station' && realm !== 'superadmin') || params.get('purpose') !== purpose) return reject(400, 'INVALID_URL');
  // Preserve the existing opaque token/fragment; the mailer does not authenticate it.
  return {to, purpose, url};
}

export async function handleArenaMail(request: Request, env: ArenaMailerEnv, transport: typeof fetch = fetch): Promise<Response> {
  try {
    const endpoint = new URL(request.url);
    if (endpoint.pathname !== '/send' || endpoint.search) return reply(404, {error: 'NOT_FOUND'});
    if (request.method !== 'POST') return reply(405, {error: 'METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, {error: 'JSON_REQUIRED'});
    const length = request.headers.get('Content-Length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) return reply(413, {error: 'BODY_TOO_LARGE'});
    const origins = allowedOrigins(env.ARENA_ALLOWED_ORIGINS);
    const message = messageBody(await boundedJson(request.body, MAX_BODY), origins);
    if (env.RESEND_DOMAIN_VERIFIED !== '1' || !env.RESEND_API_KEY || !/^re_[A-Za-z0-9_-]{8,200}$/.test(env.RESEND_API_KEY)) return reply(503, {error: 'MAIL_NOT_CONFIGURED'});
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(message)));
    const idempotencyKey = 'arena-v1-' + [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), MAIL_TIMEOUT_MS);
    try {
      // workerd supports manual/follow, not redirect:error. Never follow a redirect
      // with the provider credential: every 3xx is handled as a provider failure.
      const response = await transport(RESEND_ENDPOINT, {method: 'POST', redirect: 'manual', signal: controller.signal, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Idempotency-Key': idempotencyKey}, body: JSON.stringify(renderArenaMail(message))});
      if (!response.ok) {
        await response.body?.cancel();
        return response.status === 429 ? reply(429, {error: 'MAIL_RATE_LIMITED'}, {'Retry-After': '60'}) : reply(502, {error: 'MAIL_PROVIDER_REJECTED'});
      }
      const accepted = await boundedJson(response.body, MAX_BODY) as {id?: unknown; error?: unknown} | null;
      if (!accepted || typeof accepted.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(accepted.id) || accepted.error !== undefined) return reply(502, {error: 'MAIL_PROVIDER_REJECTED'});
      // Acceptance is not inbox delivery. No provider body, address or link is echoed.
      return reply(202, {accepted: true});
    } catch {
      return controller.signal.aborted ? reply(504, {error: 'MAIL_TIMEOUT'}) : reply(502, {error: 'MAIL_PROVIDER_UNAVAILABLE'});
    } finally {clearTimeout(timer);}
  } catch (error) {
    return error instanceof MailFailure ? reply(error.status, {error: error.code}) : reply(400, {error: 'INVALID_MESSAGE'});
  }
}
