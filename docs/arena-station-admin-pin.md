# Station admin PIN and elevation

Arena-only stations remain authenticated on the display while a separate station-scoped admin session protects `/api/admin/arena/*`.

- Exactly six ASCII digits. No default PIN. Owner/Superadmin sets the initial PIN using the station's reset action; ordinary station authentication cannot set its own initial admin secret.
- Uses the existing PBKDF2-SHA256 implementation: 600,000 iterations, random 256-bit salt, constant-time comparison. No plaintext PIN storage or audit payload; only hash/salt/iteration count persist.
- A fixed five-minute station bucket atomically reserves each verification attempt before the KDF. At most five verifications per bucket, including concurrent requests; later attempts return Swedish lockout feedback. Success clears only the unchanged reservation count, never a newer concurrent bucket. Invalid format is rejected before the expensive KDF. Owner/Superadmin reset clears the lockout for controlled recovery. A six-digit shared secret inherently requires this online limiter and protection of DB backups.
- Session tokens have 256 bits of entropy and are hashed in storage. Cookies are HttpOnly, SameSite=Lax, Secure on HTTPS and scoped to `/api`. Mutations retain the shared same-origin/cross-site checks.
- Elevation is bound to station ID, the exact display session ID and PIN version. Revoking/expiring/suspending the display session or rotating the PIN invalidates elevation. It never grants Superadmin access.
- Twenty-minute server-enforced idle timeout; eight-hour absolute maximum. Only explicit human interaction in Admin sends a keepalive, at most once per minute. Background report/poll requests do not extend elevation. The UI also locks after twenty idle minutes; the server remains authority (up to one-minute stricter expiry due to keepalive granularity).
- “Till Arenan” explicitly revokes elevation. `pagehide` sends a best-effort revoke for other navigation; the idle/absolute server timeout protects abrupt browser loss. Revoking elevation does not log the station out. Expired elevation rows are pruned on successful unlock; audit history remains.
- Changing PIN requires current/new/confirmation, checks the verified credential version again after hashing, and revokes all admin sessions. A concurrent reset/change cannot issue access for an obsolete credential. Reset never returns the old PIN and requires a valid recently reauthenticated Owner/Superadmin session (five minutes); the UI requests password confirmation when necessary.
- Audited events: rejected PIN, lockout, elevation creation/revocation, PIN change/reset. Credential/PIN-shaped audit keys are filtered defensively. No email delivery is performed.

## Integrated stations

The existing environment-provisioned station/dashboard admin PIN and `tvattligan_session` remain the authority for integrated stations. Their existing login/session policy is not silently replaced or weakened. The Arena-only six-digit KDF/elevation flow is used when an authenticated Arena station account exists; integrated displays without such an account keep the legacy admin login. Owner/Superadmin reset refuses integrated stations, whose credentials remain infrastructure-managed. Changing that separate established legacy policy is outside this release.

## Local verification

Unit tests cover format, concurrent lockout, valid/wrong PIN, station/session isolation, expiry, logout, PIN rotation/reset, reset races, Superadmin boundaries and legacy compatibility. Browser tests cover keyboard, touch keypad, wrong/locked feedback, idle lock, return, change, reset and six viewport sizes. Native local Worker tests exercise actual D1 and cookies. These are local tests, not production activation.
