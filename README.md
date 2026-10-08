# Tvättligan

Intern webbapp för Preem Tingsryds biltvättsförsäljning. Välj säljare, tryck på ett tvättprogram och fortsätt sälja. React/TypeScript körs med Vite; ett Cloudflare Worker-API lagrar data i D1. Inga betalda API:er eller externa applikationstjänster behövs. Drift är kompatibel med Workers/D1:s gratisnivå, inom Cloudflares gällande användningskvoter.

## Kör lokalt

Node.js 22.13 eller senare krävs (verifierat med Node 24). Använd den befintliga checkouten; molnuppgifter är redan isolerade och behöver inget extra Git-worktree.

```sh
npm ci
npm run setup
npm run dev
```

`setup` skapar en slumpmässig lokal PIN i den Git-ignorerade `.dev.vars` om filen inte finns, och applicerar D1-migrationerna **lokalt**. Befintlig PIN och lokal databas bevaras vid upprepade körningar. Öppna `.dev.vars` i din lokala editor för att läsa eller ändra din lokala PIN (6–12 siffror). Dela eller committa aldrig denna fil. Klienten får aldrig PIN-värdet. Utvecklingsservern använder normalt port 5173. Den lokala databasen ligger under `.wrangler/state`; den är separat från produktion.

I Codex molnmiljö är hemmakatalogen skrivskyddad. Kör först:

```sh
export npm_config_cache=/workspace/.npm-cache
export XDG_CONFIG_HOME=/workspace/.config
cd /workspace/biltvatt
```

Ingen Cloudflare-inloggning, API-nyckel eller produktionsdatabas behövs lokalt. Vite-pluginen kör den riktiga Worker-koden och D1 lokalt. `GET /api/staff` ska returnera de fem aktiva säljarna; `GET /api/wash-programs` ska returnera de sex programmen.

## Verifiering

```sh
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Enhet-/integrationstesterna kör faktisk migrations-SQL och Worker-anrop mot SQLite (`node:sqlite`). Webbläsartesterna startar Vite och kör Chromium mot lokal Worker/D1. `npm run setup` måste ha körts först. Chromium förväntas finnas på `/usr/bin/chromium`; sätt `CHROMIUM_PATH` till en annan installerad Chromium-binär vid behov. Testerna använder aldrig en fjärrdatabas. Webbläsartesterna registrerar och sedan makulerar testförsäljningar, och lämnar alltså makulerad testhistorik i den lokala databasen. De återställer priser och befintliga mål; kör inte dessa tester mot en produktionsinstans.

Tester täcker serverns prisuppslag, begärande-ID/dubbletter, kvittoskyddad makulering, omsättning, snittköp, Preemium-andel, personalbaserade topplistor och tre-tvättarsgränsen, historiska priser, aktiva poster, sessioner, CSRF, PIN-begränsning, export samt Stockholmstid och DST. Webbläsartester täcker dessutom dubbelklick, förlorat nätverkssvar och säker återförsökning, samtliga adminvyer samt mobil och surfplatta. Skärmbilder sparas i ignorerade `test-results/`.

`e2e/visual.spec.ts` granskar även namnval, försäljning, statistik och Admin/Personal vid 1440×900 samt försäljning och statistik vid 390×844. Testet kontrollerar programordning/priser, 3×2-layouten, synlig registreringsrad på desktop, minst 44-pixels tryckytor, mobilens omflöde och att visade KPI-värden stämmer med API:ets verkliga data. Det sparar skärmbilder som `test-results/visual-*.png` och injicerar inga påhittade statistikvärden.

## Vyer

**Stationsdashboard V1:** `/station` visar gårdagens manuellt rapporterade butiksförsäljning exklusive moms för Preem Tingsryd. Jämförelsen är samma veckodag exakt 364 kalenderdagar tidigare. `/station/login` aktiverar en separat lässession med en engångskod från `/station/admin`. En administratör använder befintlig PIN-session för dagsregistrering, rättningar, audit och för att återkalla visningsenheter. Stationsdata lagras i egna D1-tabeller från `0004_station_dashboard.sql`; Tvättligans försäljningar och pushdata används inte i beloppen. Import av Excel-historik 2025 förbereds enligt [docs/station-import.md](docs/station-import.md). Ingen historisk butikssiffra ingår i koden.

- **Registrera:** namnval, sex färgkodade touchkort, omedelbar registrering, bekräftelse och ”Ångra senaste”.
- **Statistik:** Idag, Vecka (måndag–söndag), Månad och Valfri period; hela laget eller en säljare, fyra KPI:er, Snittköpsligan, topplistor för antal/omsättning/Preemium-andel samt dagliga/månatliga lagmål. Automatisk uppdatering var 30:e sekund. Valfri period är begränsad till 367 dagar per anrop. Programfördelningen finns kvar i Admin.
- **Admin:** Översikt, Personal, Försäljningar, Tvättprogram, Mål, Statistik, Exportera, Notiser och Inställningar. Lägg till/redigera personal och avatarfärg, aktivera/inaktivera personal/program, arkivera historisk personal, korrigera och makulera/återställa registreringar, ändra priser och sortering, spara mål och exportera CSV. Separata, granskade nollställningar finns under Statistik.

All användartext är svensk. Tider visas i `Europe/Stockholm` och sparas i UTC. Preemium-andel betyder andelen tvättar av programmet **Preemium**, inte alla dyrare program. Snittköp och Preemium-andel kräver minst tre försäljningar i perioden för en plats på topplistan. Lika resultat sorteras deterministiskt på antal och namn. Lagmål räknar alltid aktuellt dygn/månad för hela laget, även vid personliga statistikfilter.

## Historiskt snitt och Snittköpsligan

Lagets historiska snittköp januari–september 2026 är **250 kr**, en fast affärsreferens i `shared/business.ts`. Det är inte ett aktuellt databasvärde och kan inte ändras i Admin. Referensen ändras inte när statistikperioden ändras. Lagets aktuella Snittköp för den valda perioden är fortfarande KPI-kortets stora huvudvärde. Under det visas skillnaden i hela kronor och procent med en decimal, följt av `mot jan–sep 2026 (250 kr)`:

- 276 kr → `+26 kr · +10,4 %`, diskret grönt.
- 238 kr → `−12 kr · −4,8 %`, diskret rött.
- 250 kr → `±0 kr · 0,0 %`, neutralt.
- Ingen giltig försäljning → `Ingen jämförelse ännu`, aldrig −100 %.

Admin använder samma jämförelse för lagets KPI. Personligt filtrerade KPI:er märks inte som lagets historiska jämförelse. Skillnaden beräknas på det verkliga, oavrundade snittet; huvudvärdet och kr-differensen avrundas bara för visning. Tecken och text kompletterar färgen.

Den primära statistiksidans vänsterblock ”Sålda tvättprogram” ersätts av **Snittköpsligan · Idag/Vecka/Månad/datumintervall**. Den återanvänder API:ets befintliga snittköpsranking, högst snitt först, och samma 30-sekundersuppdatering. Minst tre giltiga registreringar i vald period krävs. Säljare med en eller två visas separat under ”På väg in i listan”, exempelvis `2/3 tvättar`, utan placering, snitt eller benchmarkdelta. De tre första kvalificerade platserna har återhållna guld-/silver-/bronsmarkeringar. Övriga är neutrala. Den duplicerande högerspalten ”Högst snittköp” är borttagen; antal, omsättning och Preemium-andel finns kvar.

All ranking bygger på samma verkliga databasunderlag: makulerade/nollställda registreringar och arkiverad personal räknas inte. Inaktiv, ej arkiverad personal behåller giltig historik enligt tidigare regler. Det finns inga fabricerade försäljningsvärden i UI.

## PWA, installation och pushnotiser

Tvättligan har ett svenskt standalone-manifest och egna 192/512-pixels PNG-ikoner samt en maskable-ikon. Ikonerna är neutrala bilillustrationer, inte Preems logotyp; `StationLogo` är fortsatt en platshållare. Återskapa ikonerna lokalt från projektets SVG med `npm run pwa:icons` (kräver Chromium).

**App och notiser** är en diskret, hopfällbar kontroll. En tillgänglig installationsprompt visas bara efter klick på **Installera Tvättligan**. Installation ger inte automatiskt notisbehörighet. Push kräver HTTPS, en kompatibel webbläsare och att användaren själv trycker **Slå på pushnotiser**. Nekad behörighet ger svensk hjälp; ingen ny behörighetsfråga visas automatiskt. Efter ändring i webbplatsinställningar uppdateras behörighetsstatus när appen får fokus igen. På iPhone/iPad krävs iOS/iPadOS 16.4 eller senare, installation via **Dela → Lägg till på hemskärmen**, därefter öppning från hemskärmen och ett användarklick för push. Stöd varierar med webbläsare, OS och policy; unsupported/denied behandlas som normala tillstånd.

Enhetskopplingen väljs uttryckligen: **Gemensam enhet** eller en aktiv säljare. Den är helt separat från det vanliga säljarvalet; att välja Emma för en försäljning ändrar aldrig enhetens sparade koppling. Namnval prenumererar inte automatiskt. Kopplingen kan sparas om utan ny behörighet. **Skicka testnotis till den här enheten** använder bara den egna prenumerationen, aldrig alla enheter. **Stäng av pushnotiser** inaktiverar serverkopplingen och tar bort webbläsarens native-prenumeration. Om servern inte kan nås försöker klienten ändå stänga av native push och behåller ägaruppgiften för ett senare serverförsök.

Varje endpoint är unik. En slumpmässig förvaltnings-token sparas i den aktuella webbläsarens localStorage; endast dess SHA-256-hash lagras i D1. Den krävs tillsammans med enhets-ID för ändring, avregistrering och test. Endpoint ensam ger ingen rätt att ta över enheten. Återregistrering kräver samma hemliga browser-nycklar och roterar förvaltnings-token. Inaktivering/arkivering/radering av kopplad personal inaktiverar enheterna; fysisk personalradering lämnar dem inaktiva, aldrig automatiskt som aktiva gemensamma enheter. Ny aktivering kräver ett uttryckligt användarval.

### Admin → Notiser

Admin kan se om VAPID är konfigurerat, antal aktiva enheter/gemensamma enheter, enheter per aktiv säljare och de senaste 20 utskicksresultaten. Vyn visar aldrig endpoints, browser-authnycklar eller förvaltnings-/privata VAPID-nycklar. Inställningarna omfattar global ON/OFF, ”nära dagsmålet”, antal kvar (standard 5), samt ”dagsmålet nått”. Push är **globalt OFF efter migrationen**. OFF blockerar automatiska, manuella och testutskick, men användaren kan förbereda sin enhetskoppling när nycklar finns.

Kompositören skickar titel/meddelande till alla aktiva enheter, enbart gemensamma enheter eller en viss aktiv säljares enheter. Notisklick kan öppna Start eller Statistik, aldrig Admin. Resultatet visar verkligt antal accepterade leveranser och fel, inte att notisen säkert visats eller lästs. Automatisk notis vid ledarbyte är **inte implementerad och är OFF**. Det skickas inte en personlig notis efter varje försäljning.

### Automatik, säkerhet och leveransbegränsningar

Vid en ny, bekräftad försäljning skapas målnotisens event i samma atomiska D1-batch som registreringen. ”Nära mål” skapas exakt när giltigt antal når dagsmål minus tröskeln (bara om mål > tröskel); ”Mål nått” vid exakt dagsmålet. Varje typ har en unik beständig nyckel per `Europe/Stockholm`-kalenderdygn. Dubblettförsök, ångring, Admin-korrigering, återställning och nollställning utlöser inga nya event, och återpassering samma dag ger inte dubbla utskick. Nästa Stockholm-dygn kan utlösa båda igen. Avstängda event skickas inte retroaktivt.

Utskick sker efter sparad registrering via Workers `waitUntil`; leveransfel kan inte förvandla en sparad försäljning till ett fel eller blockera säljarens svar. En atomisk event-claim ger högst ett leveransförsök per event. Manuella/testutskick har UUID-idempotens, payloadkontroll och en gemensam gräns på tre nya utskick/minut. Enheten får explicit återaktiveras efter avregistrering eller ogiltig endpoint.

Native Web Push använder Worker-kompatibel Web Crypto: RFC 8291/8188 `aes128gcm` med ephemeral ECDH/HKDF/AES-GCM och RFC 8292 VAPID/ES256. Inga Node-API:er, betalda pushleverantörer eller serverprocesser krävs i Worker. HTTPS-endpoints till Google FCM, Mozilla, Apple och Windows push godkänns; redirects och godtyckliga hosts/portar nekas. HTTP 404/410 inaktiverar prenumerationen, temporära fel ökar felräknaren utan omedelbar avstängning, lyckad leverans nollställer den och sparar senaste framgång. En trasig enhet hindrar inte andra. Provider-svar och hemliga uppgifter loggas inte.

Leverans är **best effort, inte garanterad**: upp till fem parallella anrop, åtta sekunders transporttimeout, inga nya batcher efter 20 sekunder, högst 500 lagrade prenumerationer. Återstående enheter rapporteras som misslyckade vid tidsgräns eller avstängning, utan automatisk återutsändning. Ett avbrutet Worker-jobb kan lämna event i ”sending”; det skickas inte automatiskt igen. Begränsningarna skyddar säljflödet och Workers-resurser, men stora enhetsmängder kan behöva en separat framtida kölösning. Inget nytt cron-/Queue-/betalt resursbehov införs.

Service Worker hanterar installation, push och notisklick, **inte fetch/cache**. API, registrering, ångring och Admin är alltid nätverksberoende. Det finns ingen offlinekö, cachad API-statistik eller offline-”lyckad registrering”. SW/manifest har no-store och updateViaCache:none; gamla appskal hålls inte kvar i en egen cache. Vid notisklick fokuseras befintlig app utan omladdning. UI byter bara till Start/Statistik om ingen registrering är pågående eller obekräftad; annars lämnas säljflödet intakt med ett meddelande. När ingen app är öppen öppnas den tillåtna lokala sidan.

### Felsökning

- **VAPID saknas:** generera/bevara ett nyckelpar och sätt båda Worker-hemligheterna först efter produktionsgodkännande. UI kräver inte någon produktionsnyckel för vanligt säljflöde.
- **Globalt avstängt:** koppla enheten, slå sedan på push i Admin efter verifierad konfiguration. Global OFF ska aldrig kringgås av testknappen.
- **Blockerat/unsupported:** kontrollera HTTPS, webbplats-/OS-behörighet, iOS-version och hemskärmsinstallation. Ladda om om SW inte kan aktiveras.
- **Inga mottagare:** kontrollera aktiv prenumeration och kopplad säljares status. Återaktivering av säljare återaktiverar inte push automatiskt.
- **Accepterat men ingen synlig notis:** kontrollera OS-notisinställningar, stör ej, nätverk och browser-policy. Accepterat av pushservicen är inte en visnings-/läskvittens.
- **Ny VAPID-nyckel:** byt inte oavsiktligt; befintliga prenumerationer måste förnyas efter rotation. Spara nyckelparet privat, aldrig i Git/chat/logg.

Automatiska tester använder enbart mockad pushtransport och tillfälliga nycklar, aldrig internetpush. Testerna verifierar också riktig krypterings-dekrypteringsrunda, VAPID-signatur, tom statistik, benchmark/ranking i alla perioder och migrering av befintlig historik. Browserflöden verifierar installation utan automatisk permission, explicit enhetskoppling, Admin/Notiser och levande 30-sekundersranking på desktop/mobil. QA-personal/data skapas bara i lokal D1 och arkiveras därefter. Riktig slutleverans till fysiska iOS-/Android-enheter återstår efter ett separat godkänt produktionssteg.

## Arkitektur och databas

| Fil/katalog                                     | Ansvar                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `src/App.tsx`                                   | Säljflöde, statistik och adminvyer                                       |
| `src/components.tsx`                            | Gemensamma paneler, KPI:er, avatarer, illustrationer och StationLogo     |
| `src/styles.css`                                | Ljust blåvitt, navy text, färgkort, touchmål och responsiv layout        |
| `src/api.ts`, `src/types.ts`                    | API-klient, svenska format och gemensamma datatyper                      |
| `worker/index.ts`                               | Worker-routing, D1, validering, sessioner och CSV                        |
| `worker/stats.ts`                               | Statistik, topplistor och Stockholms periodgränser                       |
| `src/AdminMaintenance.tsx`                      | Försäljningshistorik, säkerhetsdialoger och nollställningar              |
| `worker/maintenance.ts`, `worker/http.ts`       | Admin-underhåll, transaktionsskydd och gemensam validering               |
| `migrations/0001_initial.sql`                   | Schema, index och initiala data                                          |
| `migrations/0002_admin_maintenance.sql`         | Additiv migration för arkivering, audit och återställbart underhåll      |
| `migrations/0003_push_notifications.sql`        | Additiva pushtabeller, inställningar och säkra personaltriggers          |
| `worker/notifications.ts`, `worker/webpush.ts`  | Push-API, mål-event, leverans, Web Crypto och VAPID                      |
| `src/PushControls.tsx`, `src/pwa.ts`, `public/` | Installation, enhetskoppling, Admin/Notiser, SW och egna ikoner          |
| `shared/business.ts`, `src/AverageLeague.tsx`   | Fast 250-kr-referens, minsta antal och Snittköpsligan                    |
| `wrangler.jsonc`, `vite.config.ts`              | Cloudflare Worker, asset-bundling, D1-binding och lokal Vite-integration |
| `tests/`, `e2e/`                                | API/SQLite-tester och Chromium-tester                                    |

Schema:

- `staff`: id, name, color, active, created_at, deleted_at. Historik bevaras vid inaktivering och arkivering.
- `wash_programs`: id, name, price_sek, sort_order, active, created_at, updated_at.
- `sales`: ursprungliga kolumner samt updated_at, updated_by, void_reason, voided_by, revision och reset_id. Priset kopieras server-side vid registrering. Prisändringar i programkatalogen ändrar inte gamla försäljningar; endast ett uttryckligt programbyte i Admin använder det nya programmets aktuella pris. Ångring behåller raden.
- `sales_audit`: försäljnings-ID, åtgärd, aktör, tidsstämpel samt före-/eftervärden. En SQLite-trigger skriver audit i samma transaktion som ändringen.
- `staff_audit`: motsvarande före-/eftervärden vid ändring, arkivering och fysisk radering av historiklös personal. Raderad identitet har ingen FK här, så audit bevaras.
- `maintenance_previews`, `maintenance_preview_sales`: serverlagrade förhandsgranskningar med exakta registrerings-ID:n och versioner, totalsumma, omfattning, låsta datumgränser och tio minuters giltighet.
- `reset_batches`: ursprungligt antal/belopp, omfattning, period och tid för nollställningar. Återställningar spåras i sales_audit.
- `settings`: key, value, updated_at. `daily_goal` och `monthly_goal` seedas med 25 och 500.
- `admin_sessions`: token_hash, expires_at. Sessionshemligheten lagras endast som SHA-256-hash; sessionslängd 8 timmar.
- `login_attempts`: ip_hash, attempts, window_start. Högst fem PIN-försök per IP under 15 minuter, räknat atomiskt i D1.
- `push_subscriptions`: id, endpoint (UNIQUE), p256dh, auth, management_token_hash, staff_id (nullable FK, ON DELETE SET NULL), device_label, active, created_at, updated_at, last_success_at, failure_count, disabled_at. Index på active/staff_id.
- `notification_events`: id, event_key (UNIQUE), event_type, event_date, title, body, url, audience, staff_id, subscription_id, state (pending/sending/complete/skipped), total, sent, failed, created_at, completed_at. Index på created_at/event_type. Bevarar daglig deduplicering även efter ångring/reset.
- Nya `settings`: push_enabled=0, push_goal_close_enabled=1, push_goal_close_threshold=5, push_goal_reached_enabled=1. Två triggers inaktiverar push vid personalinaktivering/arkivering och före fysisk radering. Migration 0003 ändrar inga historiska priser, affärsdata, sessioner eller tidigare migrationer.

Försäljningar indexeras på tidsperiod, säljare och program. Främmande nycklar och CHECK-villkor skyddar dataintegritet. Sessionsutgång har ett eget index. All användardata binds till förberedda SQL-satser.

Seed: Peter, Emma, Johan, Lisa, Kalle, med egna färger. Programordning: Preemium 389 kr, Finast Plus 329 kr, Hösttvätt 259 kr, Finast 219 kr, Fin 179 kr, Borstlös 199 kr.

## API och skydd

Publika API:er enligt det snabba personalflödet:

```text
GET  /api/staff
GET  /api/wash-programs
POST /api/sales                     { staff_id, wash_program_id, request_id }
POST /api/sales/:id/void            { request_id }
GET  /api/stats                     ?period=today|week|month|custom&start=YYYY-MM-DD&end=YYYY-MM-DD
GET  /api/stats/staff/:staffId       samma periodfilter
GET  /api/push/public-key
POST /api/push/subscribe             { subscription: { endpoint, keys: { p256dh, auth } }, staff_id: null|id, device_label? }
GET/PATCH /api/push/subscription     ägarheaders; PATCH { staff_id: null|id, device_label? }
DELETE /api/push/unsubscribe         ägarheaders
POST /api/push/test                 ägarheaders; { request_id }
```

Enbart aktiva poster visas och kan säljas. `request_id` är ett klientgenererat UUID v4: samma ID och data ger tillbaka samma försäljning, ändrade data ger HTTP 409. SQL läser det aktiva D1-priset atomiskt; klientpris avvisas. Samma ID fungerar som privat kvitto för ångring, kontrollerat med hash; kvittot visas inte i statistik eller CSV. Vid obekräftat nätverkssvar återförsöker UI med **samma** ID och låser andra registreringar tills resultatet är bekräftat. UI har även en kort dubbelklicksspärr.

```text
POST  /api/admin/login              { pin }
POST  /api/admin/logout
POST  /api/admin/staff              { name, color }
PATCH /api/admin/staff/:id          { name?, color?, active? }
PATCH /api/admin/wash-programs/:id  { price_sek?, sort_order?, active? }
GET   /api/admin/settings
PUT   /api/admin/settings           { daily_goal?, monthly_goal? }
GET   /api/admin/export             samma periodfilter
GET   /api/admin/notifications
PUT   /api/admin/notifications/settings { push_enabled?, push_goal_close_enabled?, push_goal_close_threshold?, push_goal_reached_enabled? }
POST  /api/admin/notifications/send { title, body, audience: "all"|"shared"|"staff", staff_id?, destination: "start"|"stats", request_id }
```

Push-ägarheaders är `X-Push-Id` och `X-Push-Token`. Admin-notiser kräver samma befintliga session/CSRF-skydd som annan administration. Publik nyckelstatus innehåller aldrig privata nyckeln. Prenumerationens endpoint/auth/p256dh returneras inte i Admin eller ägarstatus.

Admin skyddas av Worker-hemligheten `ADMIN_PIN`. Serverlagrad session använder `HttpOnly`, `SameSite=Lax`, `Path=/api` och `Secure` på HTTPS. Logout ogiltigförklarar sessionen. Muterande anrop avvisar främmande Origin/cross-site-anrop; JSON, fältnamn, storlek, färger, heltal och aktiva data valideras. `?all=1` på personal/program kräver Admin. Personal väljer namn utan egen inloggning, enligt specifikationen; PIN skyddar administration, inte det vanliga sälj- och statistikflödet.

Exporten har UTF-8 BOM, semikolon, CRLF, korrekt citering och skydd mot Excel-formler i personnamn. Makulerade försäljningar inkluderas och märks ”Makulerad”; de räknas aldrig i den vanliga statistiken.

## Säkert Admin-underhåll

Personal visar **Redigera**, **Inaktivera/Aktivera** och **Radera**. Inaktivering bevarar statistik. Radera hämtar alltid en servergranskning och kräver en separat bekräftelse:

- Noll försäljningsrader, även när makulerade poster räknas: fysisk DELETE av just personalraden. Detta är inte återställbart i appen; audit bevaras.
- Någon historik: `deleted_at` sätts och personen inaktiveras. Alla ännu registrerade försäljningar makuleras med `STAFF_DELETED`. Redan makulerade rader behåller sin tidigare orsak. Alla försäljningsrader och FK-relationer bevaras. Personen döljs i normalt namnval, topplistor och statistik och får inte sälja igen.
- Arkiverad personal är identifierbar i Admin. **Återställ säljare** kräver bekräftelse och återställer identiteten som inaktiv, aldrig försäljningar automatiskt. Därefter kan säljaren aktiveras och enskilda registreringar återställas uttryckligen under Försäljningar.

Försäljningar har datum/period, säljare, program och statusfilter, 25 rader per sida och knappen Uppdatera. Makulerade poster finns kvar. Redigera ändrar säljare/program, inte godtyckligt pris. Ett säljarbyte behåller historiskt pris. Programbyte visar det nya programmets aktuella pris; servern kontrollerar priset igen och avvisar med HTTP 409 om det ändrats. Versionskontroll hindrar att samtidiga ändringar skrivs över. Återställ en makulerad registrering innan den korrigeras. Historik visar tid, åtgärd, aktör och före-/eftervärden.

**Radera registrering** innebär makulering med `ADMIN_VOID`, aldrig fysisk DELETE. **Återställ** nollställer makuleringsfälten och återför posten till statistik med sparat pris; arkiverade säljare måste återställas först.

**Admin → Statistik → Nollställ statistik** är separat från ordinarie statistikfilter. Välj laget/en säljare och all historik, idag, denna vecka, denna månad eller valfri period (högst 367 dagar). Förhandsgranskningen visar omfattning, period, antal och belopp från verklig D1-data. För laget + all historik måste `NOLLSTÄLL` skrivas innan knappen aktiveras; även servern kräver denna bekräftelse. Inga affärsdata ändras av förhandsgranskning eller Avbryt.

Bekräftad nollställning makulerar endast granskade, ännu registrerade poster med `ADMIN_RESET`. Servern låser de exakta datumgränserna och registreringsversionerna. Förhandsgranskningen kan användas en gång under tio minuter. Nya, korrigerade, makulerade eller återställda försäljningar i omfattningen gör den inaktuell: HTTP 409 och ingen delvis nollställning. Kontroll och skrivningar körs i samma atomiska D1-batch. Ingen försäljningshistorik raderas fysiskt.

De 50 senaste nollställningarna visas med en separat **Granska återställning**. Bara fortfarande makulerade poster från just den nollställningen, vars säljare inte är arkiverad, kan återställas. En ny förhandsgranskning och bekräftelse krävs. Andra ångrade/makulerade poster påverkas inte. Individuell återställning och audit kan användas även för äldre nollställningar.

Samtliga underhållsendpoints kräver befintlig Admin-session och samma CSRF-/JSON-skydd. Aktör anges som `ADMIN` eller `SELLER`; den delade PIN-inloggningen identifierar inte en viss fysisk administratör. Kvittotoken och sessionshemligheter ingår aldrig i historik eller audit.

```text
GET    /api/admin/sales             ?period=today|week|month|custom|all&start=...&end=...&staff_id=...&wash_program_id=...&status=all|registered|voided&page=1&page_size=25
PATCH  /api/admin/sales/:id         { staff_id?, wash_program_id?, expected_revision, expected_program_price? }
POST   /api/admin/sales/:id/void    { expected_revision, confirmation: "RADERA" }
POST   /api/admin/sales/:id/restore { expected_revision, confirmation: "ÅTERSTÄLL" }
GET    /api/admin/sales/:id/audit
GET    /api/admin/staff/:id/deletion-preview
DELETE /api/admin/staff/:id         { preview_id, confirmation: "RADERA" }
POST   /api/admin/staff/:id/restore { confirmation: "ÅTERSTÄLL" }
POST   /api/admin/stats/reset/preview   { scope: "team"|"staff", staff_id?, period, start?, end? }
POST   /api/admin/stats/reset           { preview_id, confirmation: "NOLLSTÄLL" }
GET    /api/admin/stats/resets
POST   /api/admin/stats/restore/preview { reset_id }
POST   /api/admin/stats/restore         { preview_id, confirmation: "ÅTERSTÄLL" }
```

`0002_admin_maintenance.sql` är framåtgående och bevarar befintliga personal-/försäljningsvärden, FK och historiska priser. Den fyller endast nya metadatafält för äldre försäljningar; ingen försäljning makuleras av migrationen. `0001_initial.sql` är oförändrad. Tester migrerar även en databas med redan befintlig historik och kontrollerar bevarade värden och FK. Underhållstester kör hela UI-flödet och lämnar arkiverad lokal QA-personal, makulerad försäljningshistorik och audit. De får aldrig köras mot produktion.

## Visuella tillgångar

Den bifogade designen styr färger, kort, paneler och hierarki. Bilbilderna är egna SVG-illustrationer och inte fotografier från referensen. `StationLogo` är en avsiktlig återanvändbar platshållare som kan ersättas när godkänt logotypmaterial finns. Ingen företagslogotyp har laddats ned eller återskapats. Statistik kommer från databasen; inga exempelresultat visas som verklig försäljning.

## Befintlig Cloudflare-produktion – nästa godkända steg

Den befintliga D1-databasen är `tvattligan`, ID `695033b7-6bb2-47a3-a9c3-08d4ca818088`, binding `DB`. Skapa inte en ny databas och ändra inte redan applicerade migrationer. PWA/push/ligan har endast migrerats/testats lokalt; varken fjärrmigration, produktionshemligheter eller deployment har ändrats. Produktions-URL är `https://tvattligan.peter-malmstrom.workers.dev`.

Från projektroten på din dator, först efter ditt godkännande och kontroll av rätt Cloudflare-konto:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
```

Kontrollera redan applicerade migrationer och att den nya `0003_push_notifications.sql` väntar. Om 0002 ännu inte applicerats ska dess tidigare underhållssteg också granskas; `migrations apply` applicerar samtliga väntande migrationer i ordning. Ta en privat backup **utanför repositoryt** före schemaändringen (anpassa den absoluta sökvägen till din dator):

```sh
npx wrangler d1 export tvattligan --remote --config wrangler.jsonc --output /ABSOLUT/PRIVAT/SOKVAG/tvattligan-before-push.sql
npx wrangler d1 migrations apply tvattligan --remote --config wrangler.jsonc
npx wrangler d1 execute tvattligan --remote --config wrangler.jsonc --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name; PRAGMA table_info(push_subscriptions); PRAGMA table_info(notification_events); PRAGMA foreign_key_check;"
npx wrangler d1 migrations list tvattligan --remote --config wrangler.jsonc
```

Håll backupfilen privat och utanför Git. Migrera före deployment: äldre Worker-kod fungerar med de additiva tabellerna, men ny kod kräver den nya migrationen.

Generera **en gång** ett lokalt VAPID-par med:

```sh
npm run push:keys
```

Det skriver endast `.vapid-keys.json`, Git-ignorerad och med filrättigheter 0600; nyckelvärden skrivs inte till terminalen. Verktyget vägrar skriva över en befintlig fil. Öppna filen privat i lokal editor, behåll/backup-skydda samma par och ange respektive värde i Wranglers interaktiva hemlighetsprompt:

```sh
npx wrangler secret put VAPID_PUBLIC_KEY --config wrangler.jsonc
npx wrangler secret put VAPID_PRIVATE_KEY --config wrangler.jsonc
```

**Även `secret put` kan publicera en Worker-revision.** Dessa är endast framtida instruktioner och får inte köras före uttryckligt produktionsgodkännande. Befintlig `ADMIN_PIN` ska aldrig ändras. Båda VAPID-värden används som Worker-hemligheter, inte wrangler.jsonc-varianter, frontend-env, README-värden eller app-lagring. Den privata nyckeln är en base64url-kodad P-256-skalär; den publika är en base64url-kodad, okomprimerad 65-bytes P-256-nyckel. VAPID-subject använder dokumenterad produktions-URL; inget extra secret krävs för subject.

När migration, båda nycklarna och lokal verifiering är godkända:

```sh
npm run deploy
```

Detta bygger klient/Worker och deployar med Wrangler. Befintlig produktionshemlighet `ADMIN_PIN` ska bevaras, inte ersättas med utvecklings-PIN. Därefter verifierar du HTTPS, registrering/ångring, statistik, Admin-cookie, underhåll och CSV. Koppla först en godkänd testenhet, slå sedan på push via Admin → Notiser och prova testnotis på just den enheten, inklusive notisklick med pågående försäljning. Kontrollera installation och native leverans på Android/desktop samt iOS/iPadOS-hemskärmsapp. Prova inte full nollställning, breda riktiga utskick eller personalradering på riktiga data som ett smoke test.

Build-utdata är `dist/client` och `dist/tvattligan`. Lokal `.dev.vars` är ignorerad och används enbart för utveckling. Ingen produktionshemlighet ingår i klienten eller Git. Använd `--local --config wrangler.jsonc` för lokala migreringar; ett explicit konfigurationsval undviker omdirigering till äldre byggutdata.
