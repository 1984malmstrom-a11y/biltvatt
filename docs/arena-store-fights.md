# Butiksfight: scoring and immutable results

Superadmin creates an event with 2–32 approved stations, an explicit start/end
instant and one metric: points, integer öre TB, or number of registrations.
Scores use the rewards saved on each registration, never current activity prices.
TB is the configured estimated margin, not POS data. Unknown historic TB is
reported separately. Ranking uses competition ranks (1, 1, 3 on ties), and all
stations sharing first place are winners at the finish, including a zero-sale tie.

The period is **[start, end)**: a sale at start counts, a sale at end does not.
Only server-recorded timestamps are accepted, assigned by SQLite when the insert
or undo statement executes, rather than at the beginning of a potentially delayed
HTTP request. A request that crosses the cutoff cannot backdate its write into an
already finalized fight. Live scores exclude undone sales;
final scores exclude sales undone *before* the end, while undo at or after the end
does not alter the final result. Regular Arena statistics still honor every undo.
The final snapshot is computed as of the end even if nobody reads until later.
It is saved on the first read or registration/undo refresh after the boundary;
there is no deployed cron job. Subsequent reads return this saved result, with
database triggers guarding result and participant changes. List APIs compute the
effective phase from the server clock rather than relying on delayed finalization.

Each live publication uses revision-based compare-and-swap and an observation
timestamp. Only a new unique positive leader adds a versioned event; a continued
lead does not. Ties clear the unique leader without claiming an overtake. Concurrent
polls cannot duplicate the same event or replace newer data with an older poll.
The client ignores events from its initial load and acknowledges later versions
once, with a 3.6-second nonblocking announcement and reduced-motion support.

The separate fight view polls every 30 seconds while visible. Its small countdown
component updates once a second and fetches at start/end boundaries; it does not
rerender the full standings once a second. The home indicator reuses existing
Arena stats polling. A successful sale/undo remains acknowledged if an auxiliary
fight refresh fails; the next read can retry. Station readers must belong to the
fight. Creation and cross-station inspection require the separate Superadmin
session. No client-controlled station ID can bypass membership.

The admin form displays Europe/Stockholm local time. The API requires explicit
ISO timezone offsets and canonicalizes to UTC. The form rejects nonexistent spring
DST times and ambiguous autumn DST times instead of silently picking a wrong
instant. A fight's score metric and participants cannot be edited through the API.

Migration `0006_arena_store_fights.sql` is additive. Existing count fights retain
their metric; TB uses the new score metric column alongside the original legacy
points/count column. Apply locally for QA. Production migration, secret provisioning,
station source bindings and deployment require separate human review.
