# ARENAN – separat Resend-mailer för pilot

Lokalt implementerad och testad. **Ingen remote Worker, secret, e-post, DNS eller D1 har ändrats i detta pass.** Domänen är nu **Verified enligt operatörens uppdatering 2026-10-17**; inte live-verifierad av Codex. EU-region och avstängd tracking måste fortfarande bekräftas. Den incheckade standardkonfigurationen fortsätter avsiktligt att spärra sändning tills operatören skapar den effektiva verifierade configen.

## Arkitektur och faktiska kontrakt

`worker/arena-security.ts` skapar redan verifierings-/reset-/invite-token, sparar bara tokenhash och skickar `{to,purpose,url}` med POST till `https://arena-mailer.internal/send` genom ARENA_MAILER. Länken är `/arena/recovery#token=...&realm=superadmin|station&purpose=verify|reset|invite`. Befintlig tokenlivslängd, engångsbruk, roller och sessionsrevokering behålls; ingen authkod ändrades.

`worker/arena-mailer.ts` exporterar den namngivna Cloudflare-entrypointen **ArenaMailer**. Bara dess fetch anropar `worker/arena-mailer-core.ts`. Standard-entrypointen svarar alltid 404, även på en korrekt POST med internt hostname eller förfalskad caller-header. Mailern har ingen DB-/stations-/assetbinding och inga cron/queue-funktioner.

Wranglerfil: **wrangler.arena-mailer.jsonc**. Separat Worker **arenan-mailer-pilot**, konto **aff95af21a7f160722dd524471fc25b0** enligt operatörsuppgift. `workers_dev=false`, `preview_urls=false`, `routes=[]`, observability av. Ingen nyckel finns i vars eller Git. Dessa inställningar + standard-entrypointens nekande skydd samverkar; hostname är aldrig autentisering.

Pilotens servicebinding måste vara:

```json
{"binding":"ARENA_MAILER","service":"arenan-mailer-pilot","entrypoint":"ArenaMailer","props":{"caller":"arenan-pilot-vd-20261019"}}
```

`ctx.props.caller` kommer från plattformens binding-konfiguration, inte från HTTP. Den är en deklaration av betrodd deployment, **inte** en automatiskt verifierad kryptografisk calleridentitet. En kontooperatör med behörighet att deploya Workers kan skapa motsvarande binding; begränsa sådan behörighet med kontots IAM. Inga påståenden om exklusivitet gentemot privilegierade kontooperatörer görs. Ingen offentlig send-endpoint eller delad extra authnyckel införs.

Generatorn har det bakåtkompatibla tillägget `--mailer-entrypoint ArenaMailer`; generiska äldre mailerbindings ändras inte. Preflight vägrar den nya dedikerade mailern om entrypoint eller rätt caller-prop saknas.

## Resend och säkerhet

- Fast POST till **https://api.resend.com/emails**, Authorization Bearer från **RESEND_API_KEY**, konstant avsändare **ARENAN <noreply@arenanplay.se>**. Inga godtyckliga endpoint-/from-/HTML-parametrar.
- EU-region **eu-west-1** stöds i Resends domänmodell enligt officiella SDK-källan. Regionen hör till den faktiska Resend-domänen; det finns ingen separat EU-endpoint i denna implementation. Operatören måste verifiera domänens verkliga region och kontots stöd innan release. Domänregion är inte i sig ett löfte om all datalagring/alla loggars hemvist; verifiera leverantörsvillkor separat vid sådant krav. Ingen region eller DNS ändrades här.
- `RESEND_DOMAIN_VERIFIED=0` och `ARENA_ALLOWED_ORIGINS=[]` i incheckad config. Tjänsten returnerar 503 utan provideranrop tills operatören uttryckligen konfigurerat en verifierad HTTPS-origin, domängodkännandet och secret. Flaggan är operatörens releasebeslut, inte en påstådd automatisk kontroll av Resend-kontot. Resend gör också sina egna domän-/nyckelkontroller.
- Bare mottagaradress, exakt tre fält, strikt purpose, requestgräns 8192 byte även för strömmad body, URL max 2048 tecken, exakt origin-matchning. Bara HTTPS, rätt recovery-path och befintlig token/realm/purpose-struktur; inga användaruppgifter i URL, query/forward-parametrar, extra fragmentparametrar, CRLF eller externa länkar. Ingen kryptografisk token-/kontovalidering i mailern.
- `ARENA_ALLOWED_ORIGINS` är en JSON-array med högst fyra **verifierade exakta origins**. Ingen wildcard och inget antagande om pilotens workers.dev-subdomän. Det går bra med verifierad workers.dev-origin före eventuell arenanplay.se-route. Endast arenanplay.se i allowlist räcker inte om appen använder workers.dev.
- Svenska HTML-mejl med inline CSS, mörkgrönt/champagneguld, tydlig CTA och textversion. Inga bilder, Preem, JavaScript, pixelspårning eller externa styles. Fungerar med blockerade bilder. URL HTML-escapas; ingen request-HTML kan injiceras.
- Stäng **click/open tracking** för säkerhetsmejlen i Resends domäninställningar. SDK:n visar detta som domäninställningar; inga påhittade per-mail trackingfält används. Länkarna innehåller engångstoken och får inte omskrivas/loggas i onödan.
- 8 sekunders AbortController-timeout, ingen automatisk retry. Stabil SHA-256-idempotency-key för exakt samma mottagare/purpose/länk, utan rå token/adress i headers. Provider-idempotens har leverantörens egna villkor/tidsfönster; det är ingen ny lokal leveransdatabas.
- Cloudflare workerd stöder `redirect: manual`, inte `redirect: error`. Alla 3xx nekas och följs aldrig med provider-credential. 4xx/5xx → kontrollerat 502, 429 → 429 + fast Retry-After, timeout → 504. Bara 2xx med giltig Resend-kvittens ger **202 accepted**. API-acceptans är inte inkorgsleverans. Inga råa providerfel/adresser/token returneras eller app-loggas.
- Befintlig auth behåller generisk resetrespons utan kontouppräkning; verify/invite visar kontrollerat leveransfel. Misslyckad invite kan skickas igen via befintlig Owner-reinvite efter att konfigurationen rättats. Ny token ersätter gammal. Dessa flöden är regressionstestade.

## Lokal repetition – inga riktiga nycklar eller mejl

Kör från apprepot. Använd endast uttrycklig mailerconfig, aldrig vanliga wrangler.jsonc eller npm run deploy.

```powershell
npm run typecheck
npm run build
npx vitest run tests/arena-mailer.test.ts tests/arena-mailer-auth.test.ts tests/arena-security.test.ts tests/arena-network.test.ts tests/arena-pilot-config.test.ts tests/arena-release-preflight.test.ts
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config wrangler.arena-mailer.jsonc --outdir .arena-pilot/mailer-dry-run
node scripts/arena-mailer-smoke.mjs --bundle .arena-pilot/mailer-dry-run/arena-mailer.js --report .arena-pilot/mailer-native-proof.json
```

Stanna på varje felkod. Smoken använder riktig lokal workerd/named Service Binding men mockar **alla** provideranrop och läser ingen riktig nyckel. Den kontrollerar standard-entrypoint/headerspoofing, fel caller-props, alla tre mejltyper, redirect och 429 utan retry. Ingen offentlig mutationsväg används. Inga omfattande E2E-matriser behövs.

## Kontrollerad manuell release – eget godkännande före varje fjärrändring

Följ även `docs/arena-isolated-pilot.md` för inventering, målbackup, migration och rollback. Operatören har angivit ny separat pilot-D1 **8044ee1b-9185-4644-954f-d5455330a7a7**. Verifiera med read-only GET i rätt konto; skapa inte ännu en databas eller kör dess skapandeblock på nytt utan separat beslut. Tvättligan/MASTER och deras tre tidigare UUID:er förblir skyddade. Ingen uppgift här är ett nytt remote-verifieringsbevis.

1. **Verifiera först:** Resend arenanplay.se har full **Verified** status och fungerande sending capability, faktisk region **eu-west-1** om kontot stöder vald regionalisering, godkänd sender och avstängd click/open tracking. Partially Verified räcker inte. Inga DNS-/regionändringar får göras utan separat beslut.
2. **Eget godkännande:** skapa begränsad Resend **Sending access**-nyckel, knuten till arenanplay.se där kontot stöder domänbegränsning. Ge inte Full access i onödan. Spara privat och förbered återkallelse; inget nyckelköp ingår.
3. Verifiera Cloudflare-konto, att arenan-mailer-pilot är ledigt och inga Worker-/D1-bindningar kan blandas ihop. Hämta pilot-origin från faktiskt verifierad workers.dev-URL eller verifierat kontonamespace, inte ett gissat namn. Förbered lokal effektiv config enligt nedan.
4. **Eget godkännande:** sätt RESEND_API_KEY som Cloudflare-secret i **endast** mailer-Workern. `secret put` kan erbjuda att skapa en tom Worker om namnet inte finns; det är också en remote-resursskapelse som kräver uttryckligt godkännande. Avbryt vid annat namn, konto eller oväntad uppdatering av befintlig Worker. Ingen delad extra nyckel sätts i Arena.
5. **Eget godkännande:** publicera endast mailern med granskad effektiv config. Bekräfta workers.dev/preview/routes av och att default-endpoint aldrig kan sända. Standard-entrypointen ska inte göras publik för att "testa" mejl.
6. Generera pilotconfig med namngiven binding + props; kör preflight/dry-run. **Eget godkännande:** koppla genom senare pilot-Worker-deploy, inte genom att deploya Tvättligan. Säkerställ exakt origin-allowlist matchar den faktiskt använda pilot-URL:n.
7. **Eget godkännande:** ett kontrollerat verifieringsmejl till egen godkänd testadress via behörigt appflöde eller en separat uttryckligen godkänd intern testcaller. Ingen publik test-relay. Kontrollera Resend event/status, inkorg/spam, svensk HTML/text, exakt länk utan trackingomskrivning och engångsanvändning.
8. Fortsätt säker Owner-bootstrap/verify/reset/invite enligt pilotrunbooken. Om första kontrollerade mejlet är Owners verifiering, krävs offline bootstrap först; skapa inte ett parallellt testauth-/bootstrap-API för att kringgå detta beroende. Förvara Owner-/recovery-uppgifter offline och radera privat bootstrap-SQL efter användning.

Använd nu enbart [nästa-steg-runbooken](arena-pilot-next-steps.md) och `scripts/arena-pilot-release.ps1`. Den befintliga pilotconfigen och migrationskvittot ska bevaras. Gör inte om D1-creation, migration, backup/restore eller configgenerering bara för att fortsätta till mailern.

Ordning: lokal `Preflight` → read-only `Inspect` → lokal `PrepareMailer -Origin <verifierad exakt origin>` → separat godkänd `MailerSecret` → separat godkänd `DeployMailer` → lokal `OwnerSql` → separat godkänd `OwnerBootstrap` → separat godkänd `DeployPilot` → read-only `Verify`. Varje steg avslutas utan automatisk fortsättning. Verktyget kontrollerar konfiguration och bara secretens namn/typmetadata, aldrig dess värde. Ingen verklig e-post skickas av releaseverktyget. Kontrollerat första verifieringsmejl och inbox/engångslänk är ett senare eget godkännande.

## Fel och rollback

Fel vid mail: stanna onboarding, kontrollera provider-/domän-/origin-/secretstatus privat; undvik upprepade klick som skapar nya token. Korrigera efter eget beslut och använd befintlig resend/reinvite. API accepted kan ännu ge bounce; kontrollera verkligt leveransevent/inkorg.

Återkalla/rotera misstänkt provider-nyckel i Resend efter eget godkännande. Ingen nyckel får dumpas i incidentlogg. Avpublicera/återgå enbart mailern efter eget beslut; rör inte D1 eller Tvättligan. Senare rollback av pilotbinding/kod är ett eget releasebeslut, inte databasrollback. Felaktig secret/origin får aldrig "lösas" med offentlig send-route eller ARENA_AUTH_DEV.

## Officiella referenser

- Cloudflare [HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/), [named entrypoints](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/#named-entrypoints), [ctx.props](https://developers.cloudflare.com/workers/runtime-apis/context/#props), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). Officiella publicerade markdownkällor lästa från cloudflare/cloudflare-docs, production-branchen.
- Resend [send email](https://resend.com/docs/api-reference/emails/send-email), [API implementation](https://github.com/resend/resend-node/blob/main/src/resend.ts), [emails](https://github.com/resend/resend-node/blob/main/src/emails/emails.ts), [payload](https://github.com/resend/resend-node/blob/main/src/emails/interfaces/create-email-options.interface.ts), [domain regions/status](https://github.com/resend/resend-node/blob/main/src/domains/interfaces/domain.ts), [domain options/tracking](https://github.com/resend/resend-node/blob/main/src/domains/interfaces/create-domain-options.interface.ts). Kontrakt/region verifierades mot dessa officiella SDK-källor; inget verkligt Resend-konto/API anropades och inga villkor om fullständig datalagring antogs.
