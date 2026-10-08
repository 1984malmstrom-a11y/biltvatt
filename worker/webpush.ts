// RFC 8291 (ECDH/HKDF), RFC 8188 (aes128gcm records), RFC 8292 (VAPID).
// Runtime dependencies: only Workers Web Crypto, fetch and typed arrays.
export const bytes = (input: Uint8Array) => new Uint8Array(input).buffer;
export function base64url(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decode64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 2048)
    throw new Error("Invalid key");
  const result = Uint8Array.from(
    atob(
      value.replaceAll("-", "+").replaceAll("_", "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
  if (base64url(result) !== value) throw new Error("Non-canonical key");
  return result;
}
export function concat(...arrays: Uint8Array[]) {
  const result = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
const encoded = (s: string) => new TextEncoder().encode(s);
async function hkdf(
  input: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(input),
    "HKDF",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: bytes(salt), info: bytes(info) },
      key,
      length * 8,
    ),
  );
}
export interface PushKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  type: string;
}
export async function validateTarget(target: PushTarget) {
  const url = new URL(target.endpoint);
  // Subscription endpoints are outbound URLs. Never allow arbitrary hosts, credentials,
  // private-network targets or redirects to turn this public API into an SSRF proxy.
  const allowed =
    url.hostname === "fcm.googleapis.com" ||
    url.hostname === "web.push.apple.com" ||
    url.hostname === "updates.push.services.mozilla.com" ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  if (
    !allowed ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname === "/" ||
    target.endpoint.length > 2048
  )
    throw new Error("Invalid endpoint");
  const pub = decode64(target.p256dh),
    auth = decode64(target.auth);
  if (pub.length !== 65 || pub[0] !== 4 || auth.length !== 16)
    throw new Error("Invalid subscription keys");
  await crypto.subtle.importKey(
    "raw",
    bytes(pub),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}
export async function encryptPayload(target: PushTarget, payload: PushPayload) {
  const receiver = decode64(target.p256dh),
    auth = decode64(target.auth);
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const sender = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    bytes(receiver),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverKey },
      pair.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(
    shared,
    auth,
    concat(encoded("WebPush: info\0"), receiver, sender),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    ikm,
    salt,
    encoded("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(ikm, salt, encoded("Content-Encoding: nonce\0"), 12);
  const plain = encoded(JSON.stringify(payload));
  if (plain.length > 3000) throw new Error("Payload too large");
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(cek),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bytes(nonce) },
      key,
      bytes(concat(plain, new Uint8Array([2]))),
    ),
  );
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = sender.length;
  return concat(header, sender, cipher);
}
export async function vapidAuthorization(
  endpoint: string,
  keys: PushKeys,
  now = Date.now(),
) {
  const pub = decode64(keys.publicKey),
    privateBytes = decode64(keys.privateKey);
  if (
    pub.length !== 65 ||
    pub[0] !== 4 ||
    privateBytes.length !== 32 ||
    !/^(https:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/.test(keys.subject)
  )
    throw new Error("Invalid VAPID configuration");
  const signing = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64url(pub.slice(1, 33)),
      y: base64url(pub.slice(33)),
      d: keys.privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64url(
    encoded(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const claims = base64url(
    encoded(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signing,
      bytes(encoded(header + "." + claims)),
    ),
  );
  return `vapid t=${header}.${claims}.${base64url(signature)},k=${keys.publicKey}`;
}
function pushProvider(endpoint: string) {
  try {
    const host = new URL(endpoint).hostname;
    if (host === "web.push.apple.com") return "apple";
    if (host === "fcm.googleapis.com") return "google";
    if (host === "updates.push.services.mozilla.com") return "mozilla";
    if (/^[a-z0-9-]+\.notify\.windows\.com$/.test(host)) return "windows";
  } catch {
    /* Never log malformed URLs either. */
  }
  return "unknown";
}
function safeExceptionName(error: unknown) {
  // Error.name can contain arbitrary data. Only fixed standard names are safe.
  // Never inspect message, stack, cause or constructor names.
  try {
    if (error instanceof Error || error instanceof DOMException) {
      const name = error.name;
      if (
        [
          "Error",
          "TypeError",
          "RangeError",
          "SyntaxError",
          "ReferenceError",
          "URIError",
          "EvalError",
          "AggregateError",
          "AbortError",
          "TimeoutError",
          "OperationError",
          "DataError",
          "InvalidAccessError",
          "NotSupportedError",
          "InvalidStateError",
          "SecurityError",
          "NetworkError",
          "UnknownError",
          "QuotaExceededError",
        ].includes(name)
      )
        return name;
    }
  } catch {
    /* A custom name getter must not affect delivery handling. */
  }
  return "Error";
}
function warnPush(fields: Record<string, string | number>) {
  try {
    console.warn(JSON.stringify(fields));
  } catch {
    /* Diagnostics must not change delivery behavior. */
  }
}
export async function deliverPush(
  target: PushTarget,
  payload: PushPayload,
  keys: PushKeys,
): Promise<number> {
  let response: Response;
  let stage:
    | "validate_target"
    | "encrypt_payload"
    | "vapid_authorization"
    | "fetch_provider" = "validate_target";
  try {
    await validateTarget(target);
    stage = "encrypt_payload";
    const encrypted = await encryptPayload(target, payload);
    stage = "vapid_authorization";
    const authorization = await vapidAuthorization(target.endpoint, keys);
    stage = "fetch_provider";
    response = await fetch(target.endpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "3600",
        Urgency: "normal",
      },
      body: bytes(encrypted),
    });
  } catch (error) {
    warnPush({
      event: "push_delivery_exception",
      provider: pushProvider(target.endpoint),
      stage,
      exception_type: safeExceptionName(error),
    });
    throw error; // Preserve the caller's existing failure handling.
  }
  // Every 3xx is a failure too. Never read or follow Location with VAPID credentials.
  if (response.status < 200 || response.status >= 300)
    warnPush({
      event: "push_delivery_failed",
      provider: pushProvider(target.endpoint),
      status: response.status,
      event_type: [
        "test",
        "manual",
        "daily_goal_close",
        "daily_goal_reached",
      ].includes(payload.type)
        ? payload.type
        : "unknown",
    });
  await response.body?.cancel();
  return response.status;
}
