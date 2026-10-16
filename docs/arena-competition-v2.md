# Arena Competition V2

The existing `arena_leagues`, matches, registration ledger, immutable reports and
Gaming Awards remain authoritative. No second sale ledger or authentication
system is introduced. This feature has only been run locally.

## Entry points

- `/arena/competitions`: the signed-in station's competitions and final results.
- `/arena/superadmin/contests`: scoped competition builder and organization tools.
- `/arena/admin/competitions`: elevated station-admin local competitions/traffic.
- Existing `/arena/[superadmin/]competitions/:id` also renders individual and
  station boards. Match leagues, cups and playoffs retain their existing views.
- Dashboard mode choices are keyed by station **and** current match. Battle is
  default for a new active match; a manual Station choice survives polls/reload.
  No active match means Station. Older fights without frozen category mappings
  retain ordinary registration and the existing fight panel, with an explanation.

## Local migrations

`0012_arena_competition_scopes.sql` adds organizations, regions, districts,
station membership, scoped grants, append-only customer flow versions and the
competition organization key. `0013_arena_organization_lookup_indexes.sql` adds
scoped administrative lookup indexes. Both are additive. No customer assignment
or historical result is inferred. Tests apply migrations to isolated in-memory
SQLite databases; no deployed database is modified.

## Owner configuration

1. Open the organization tools as the existing platform Owner.
2. Create an organization with its own country code, then regions and districts.
3. Assign eligible stations explicitly. Old global group links and unfinished
   matches must be resolved before assignment. In-place organization transfers
   are intentionally unavailable.
4. Grant an existing verified Superadmin account national, region or district
   authority **within this organization**. Assignment/revocation is audited.
5. Record customer/day measurements with source and completed measurement dates
   if FAIR PLAY is desired. Saving creates a new immutable historical version.
6. Create the contest, verify local canonical activity mappings, preview and
   confirm. Rules, names, membership, flow versions and weights lock at creation.
   Cancelling and recreating a scheduled contest is the supported rule-change path.

No invitation mail, production push or external configuration is performed here.
A customer central admin has no platform Owner powers. Once organizations exist,
non-Owner accounts use scoped tools rather than legacy global administration.
Local station management continues to require existing server-verified elevation.

## Contest rules and one-sale accounting

- Individual and station boards share existing league storage without acquiring
  match bookings, so they can overlap each other and legitimate matches.
- A new Butiksfight always has exactly two stations. Multi-team championships
  generate independent pair matches through the existing schedule/bracket engine.
  Historical N-way fight data remains readable, but new N-way matches are rejected.
- One qualification join to frozen local activity IDs counts each source
  registration once per contest. Different eligible contests can reuse that row.
- Category identity comes from `arena_activity_categories`, never label matching.
  Select 1–7 categories and explicitly set their base milli-point values.
- A category with several local products opens a product choice before seller
  selection. A single mapped product retains activity → seller → receipt.
- The regular receipt, raw points, registration count and TB remain ordinary
  station data. Custom contest points are a separate projection.
- Voids remove live contributions. Final period/day snapshots retain the cutoff
  policy of the existing engine, including a late first read after a later void.
- Calendar periods use Europe/Stockholm. A contest created during its first day
  starts counting at its actual rule-lock instant, not retrospectively at midnight.
- Equal scores share rank, with stable name/ID display order. A tied, empty or
  cancelled V2 result produces no winner diploma.

## FAIR PLAY arithmetic

For each eligible sale:

`base_milli × min(reference_milli / customers_milli, max_factor_milli / 1000)`

The rational numerator/denominator is compared and multiplied with BigInt. Round
HALF UP to an integer milli-point **per sale**, then sum integers. A factor printed
with three decimals is descriptive; scoring never uses that rounded factor.

No production reference/factor defaults are selected. Admin must enter and
explicitly confirm both. Bounds: verified customer/day averages and references
>0 and ≤1,000,000; maximum factor 0.1–10; base points 0–10,000 with up to three
decimals. Missing, nonfinite, negative and unconfirmed values are rejected.
The exact source/version and measurement period are frozen. Editing traffic
through the API during an active FAIR PLAY contest is rejected. Individual
contests reject customer-flow FAIR PLAY, since working hours/opportunities are
not modeled. Normal station statistics never receive the adjustment.

## Permissions and bounded reads

The server checks organization membership, full selected participant scope and
current account grants. National means eligible stations inside one organization,
not platform-wide. Owner is an explicit platform privilege, separate from customer
national grants. Client-supplied frozen people, flows or lock timestamps are rejected.
Legacy global discovery/groups cannot bridge newly assigned customer organizations.

A grouped ledger query serves all selected competitors. Station boards aggregate
by station/category; individual boards by seller/category, never per-participant
queries. Public pages contain at most 50 rows plus the selected owned seller's
neighbors. Private activity-mapping arrays and all-participant snapshot arrays are
removed from public view DTOs, while preserved internally for frozen results.

Supported bounds: 100 board stations, 5,000 individual sellers, 5,000 frozen local
activity mappings, 40 championship stations. League fields support up to 40 stations; existing cup sizes are 2/4/8 and playoff fields 2/4/8. A 40-station single league has 780
pair matches. Dashboard polling remains 12 seconds / 5 seconds during a live fight,
with existing visibility/coalescing behaviour. The only new ambient effect is a
small inline sword SVG with opacity animation and reduced-motion support.

## Awards and deliberate exclusions

The three cinematic diploma designs remain in the existing report/award/PDF path.
Individual winners use the individual template, pair matches the duel template,
and championship/ordinary station winners the station champion composition.
Ordinary station awards do not claim that an opponent duel was played. Awards
use frozen real data and can be re-exported despite later live changes.

No group-stage format was previously available; no additional group-stage engine
is added. Sales value, average basket and goal-achievement winning criteria are
not offered without verified source data/denominators. Existing TB and count
metrics remain available. New locked contests cannot receive a post-creation
ad-hoc activity/rule injection; legacy temporary quick actions remain supported.
No new awards, graphics libraries, videos or raster brand assets are introduced.
