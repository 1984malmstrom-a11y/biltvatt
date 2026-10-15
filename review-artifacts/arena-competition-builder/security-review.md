# Security / authorization review

Ingen produktionshemlighet har använts. Inga remote mutationer eller verkliga push-utskick har utförts. Samma befintliga sessions-, Owner/Superadmin- och stationsadmin-gates återanvänds. Inga lösenords-/MFA-/rate-limit-regler har försvagats.

## Verifierade negativa fall

- Challenge-avsändare bestäms från session/resolved station, inte request body; spoofade/okända fält avvisas.
- Bara mottagaren får acceptera/avböja. Bara avsändaren får återkalla. Utomstående station får inte läsa/ändra en främmande challenge eller competition.
- Stationsadmin får inte skapa liga/cup, anropa Superadmin-route, ändra motståndarens aktivitet eller avbryta en central tävling.
- Aktivitets- och bildägarskap kontrolleras server-side. Tempdeskriptorer kräver Superadmin och verklig matchdeltagare.
- Booking-/race-/state-exclusion ligger i DB-transaktionen. Simultan accept verifierad både med SQLite-testadapter och riktig lokal Worker: 200/409, en tävling, inga orphan bookings.
- Scope, deltagarsnapshot, publicerade regler, frysta dagar/matcher/bracket/report skyddas av triggers och unika nycklar. Replay/idempotens verifierad.
- Publik Fight Center returnerar bara egna challenges/notiser/tävlingar/aktiviteter. Andra stationers bokningar visar endast generisk upptagen-period, inte deras tävlingsnamn. Superadmin får global availability enligt befintlig rollmodell.
- Notification-read avgränsas alltid till den egna stationen. React renderar text som text; inga nya osäkra HTML-injektioner.

## Notifieringar

In-app-notiser lagras atomiskt med domänändringen. Home-counts finns i befintligt stats-svar. Push återanvänder `notification_events`/`processEvent` och befintliga explicit bundna station stores. En obunden Arena-kund får in-app-notiser och kan inte använda en annan kunds push-store. En unik outbox-claim undviker dubbla försök. Pushfel tar inte bort notisen och stoppar inte accept/avbrott. Ingen automatisk spam-retry; push-konfiguration och fysisk enhetsleverans behöver kontrolleras vid senare release.

## Audit och lokala testdata

Skapande/schema, challenge sent/accepted/declined/withdrawn, mapping, daily freeze, match freeze, seed/advance, final och avbrott auditeras med deterministiska retry-nycklar. Äldre native QA-events avslutas via den auditerade cancel-API:n när testet behöver en ledig period; historiken raderas inte.

En lokal testnyckel kom av misstag med i en konfigurationssökning under arbetet. Den var endast för den lokala testservern och roterades omedelbart lokalt; servern startades om. Nyckelvärden, konfigurationsfiler och credentials ingår inte i review-paketet. Produktionsnycklar var inte berörda.

Detta är en kod-/testbaserad review, inte ett externt penetrationstest. Fysisk push/kassahårdvara och en framtida produktionsrelease ingår inte i denna lokala körning.
