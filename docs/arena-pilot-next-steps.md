# ARENAN – fortsätt piloten, ett steg i taget

## Aktuellt läge 2026-10-17

**Operatören har bekräftat** att alla 13 migrationer är installerade i pilot-D1, Windows-backupen faktiskt återställd och `arenanplay.se` nu är **Verified**. Codex har inte läst detta Cloudflare-/Resend-konto och gör inget nytt remote-verifieringspåstående. Ingen Worker är publicerad enligt operatören. **Kör inte D1-create, Restore eller Migrate igen för att fortsätta denna release.**

Fast konto: `aff95af21a7f160722dd524471fc25b0`. Pilot-Worker/D1: `arenan-pilot-vd-20261019`, D1 UUID `8044ee1b-9185-4644-954f-d5455330a7a7`. Mailer: `arenan-mailer-pilot`. Endast `ARENA_DB`, `ARENA_MAILER` → namngiven `ArenaMailer` med rätt caller, och `ASSETS`; `ARENA_ONLY=1`. Ingen `DB`/stationsmaster-bindning. De två gamla Worker-namnen och alla tre gamla D1-UUID:n är spärrade.

## 0. Hämta rätt kod efter eget överföringsgodkännande

Detta förberedelsepass skapar bara en **lokal checkpoint**, ingen push. Innan kommandona nedan används måste den checkpointen finnas i jobbcheckouten genom separat godkänd kodöverföring. Ingen branchväxling, merge eller reset av privat arbete. Befintliga ignorerade `.arena-pilot/pilot.json`, `release-state.json`, backup och migrationskvitton ska bevaras; skriv inte över dem. Configens paths ska gälla just Windows-checkouten.

Stå i interaktiv Windows Terminal/PowerShell, inte ISE eller en obevakad pipeline. Node >=22.13, låsta npm-beroenden och godkänd Wrangler-inloggning behövs. Använd inte `npm run deploy` eller den vanliga Wrangler-configen. Alla nedanstående steg är separata körningar; stanna på varje fel och kör inte nästa kommando förrän utfallet granskats.

```powershell
Set-Location -LiteralPath 'C:\Users\Preem\Documents\ARENAN-PILOT'
.\scripts\arena-pilot-release.ps1 -Step Plan
.\scripts\arena-pilot-release.ps1 -Step Preflight
```

`Plan` gör inga ändringar. Ett äldre restorekvitto kan sakna match mot den nya kod-HEAD:en; när migrationen redan är slutförd ska detta inte utlösa en ny Restore/Migrate. Behåll kvittot och kontrollera aktuell ledger med Inspect. `Preflight` kontrollerar rätt config/build/13 migrationsfiler och kör app/mailer **--dry-run** samt riktig lokal workerd-mailersmoke med helt mockad leverantör. Inga hemligheter, konton eller mejl används. Utfallet `PASS_LOCAL_ONLY` bevisar inte remote-drift. Om build saknas: kör `npm run build`, avbryt på fel, sedan Preflight igen. PowerShell 7/Linux är faktiskt testat; fysisk Windows/PowerShell 5.1 måste verifieras hos operatören.

## 1. Kontrollera remote endast genom läsning

```powershell
.\scripts\arena-pilot-release.ps1 -Step Inspect
```

Kräver rätt konto, exakt D1-namn/UUID och inga främmande affärstabeller. Förväntat: `migrationCount: 13`, `ledgerComplete: true`, pilot och mailer ännu ej skapade. Fel konto, behörighet, partiell ledger eller oväntat Worker-namn: **STOPP**. Ta aldrig bort ett misslyckat releasekvitto för att tvinga en retry. Ingen migrering/skapelse sker i Inspect.

## 2. Förbered mailern lokalt

Fyll endast i pilotens **verkliga kontonamnrymd/origin**, kopierad från Cloudflare-kontots workers.dev-inställning. Ingen gissad URL och ingen preview-URL. Bekräfta också att Resend-domänens region är `eu-west-1` och både **open tracking och click tracking är avstängt**. Domänens Verified-status är nu rapporterad som klar, men region/tracking har inte separat bekräftats i chatten.

```powershell
$PilotOrigin = Read-Host 'Verifierad exakt https://arenan-pilot-vd-20261019.<kontonamnrymd>.workers.dev utan slash'
.\scripts\arena-pilot-release.ps1 -Step PrepareMailer -Origin $PilotOrigin
```

Endast lokal config/dry-run. Skriv den exakta `VERIFIED eu-west-1 TRACKING-OFF ...`-frasen när samtliga uppgifter är kontrollerade. Origin måste vara exakt rätt Worker + en kontonamnrymd, HTTPS, utan port/path/extra preview-led. Fel namespace kan inte upptäckas enbart genom formatkontroll: operatörens faktiska kontokontroll är nödvändig. `mailer.json` skapas med `wx`, aldrig automatisk overwrite. En redan existerande fil eller felkvitto kräver privat inspektion, inte borttagning och blind retry.

Mailern skickar som **ARENAN <noreply@arenanplay.se>**, via fast Resend-API. Ingen separat EU-API-endpoint behövs; regionen är en domäninställning. Standard-entrypointen nekar alltid, workers.dev/preview/routes är av. Bara namngiven Service Binding kan nå transporten enligt den betrodda deploymentkonfigurationen. IAM måste begränsa vilka kontooperatörer som får deploya bindings.

## 3. Första remote-stoppunkten: dedikerad mailer-secret

Operatören ordnar en domänbegränsad **Sending access**-nyckel privat enligt Resend-kontots stöd. Codex skapar, läser eller skriver ingen riktig API-nyckel. Nyckeln ska aldrig finnas i config, Git, kommandorad, transcript, skärmdelning eller reviewfiler. Använd inte en befintlig skarp verksamhetsnyckel.

```powershell
.\scripts\arena-pilot-release.ps1 -Step MailerSecret
```

**Uttryckligt remote-godkännande krävs.** Skriptet visar konto, D1, båda Worker-namnen och åtgärden innan du skriver exakt GODKANN-fras. Därefter anger du nyckeln dolt i Wranglers prompt. `secret put` kan skapa en tom mailer-Worker och fråga om detta: det är del av samma uttryckligen redovisade resursgodkännande. Ingen app/e-post publiceras. Oväntat befintlig mailer stoppas; ingen secret skrivs över.

## 4. Andra remote-stoppunkten: publicera bara mailern

```powershell
.\scripts\arena-pilot-release.ps1 -Step DeployMailer
```

**Eget remote-godkännande krävs.** Rätt mailer/config/Verified/origin och tidigare secret-steg krävs. Endast secretens **namn/typ** kontrolleras via Wrangler metadata, aldrig dess värde. Saknad Worker/secret ger STOPP. Ingen DB, offentlig route, e-post eller appdeploy. Ett lokalt kvitto sparas; inget nästa steg startas automatiskt.

## 5. Owner: lokala uppgifter, sedan separat remote-skrivning

Besluta en verklig individuell Owner och en fungerande recovery-adress. Stäng transcript och skärmdelning. Fyll i recovery-mejl, visningsnamn och dolt lösenord 12–256 tecken. Lösenord, hashad bootstrap-SQL, recoverykoder och senare PIN hör aldrig hemma i Git/review. Skydda privata filer med ACL/krypterad disk.

```powershell
.\scripts\arena-pilot-release.ps1 -Step OwnerSql
```

Endast lokal SQL-generering, samma befintliga bootstrapmotor med PBKDF2-SHA256 600 000 iterationer. JSON via UTF-8 stdin, inte lösenord i processargument. Granska `.arena-pilot/owner-bootstrap-private.sql` privat: rätt person, single-Owner-guard, audit och **email_verified_at=NULL**. Inga syntetiska konton eller påhittad verifiering i riktig pilot.

```powershell
.\scripts\arena-pilot-release.ps1 -Step OwnerBootstrap
```

**Eget remote-godkännande krävs.** Exakt ledger, publicerad mailer med secretmetadata och noll befintliga Owners. SQL-hash och noll Owners kontrolleras igen efter godkännande; ändrad fil eller parallell Owner ger STOPP. Efteråt ska exakt en Owner finnas. Radera privat SQL säkert efter lyckad kontroll; kvittot behövs för publiceringen. Första mejlet skickas först efter separat godkänd acceptans när appen är publicerad.

## 6. Fjärde remote-stoppunkten: första pilotpubliceringen

Godkänn först kontots plan/CPU-budget för PBKDF2 och begränsad pilotgrupp. Reservera de två nya Worker-namnen under release så ingen annan deployar samtidigt. Verktyget kontrollerar identitet efter godkännandet, men Cloudflare erbjuder ingen transaktion över kontroll och deploy.

```powershell
.\scripts\arena-pilot-release.ps1 -Step DeployPilot
```

**Eget remote-godkännande krävs.** Rätt UUID/bindings, en Owner, godkända tidigare kvitton, mailerconfig/secretmetadata och app dry-run. Den nya pilot-Workern måste fortfarande vara opublicerad: inget befintligt Worker-namn skrivs över. Ingen DNS/migration eller e-post ingår. Tvättligan/master/stationer är inga tillåtna mål.

## 7. Läsverifiering och separat godkänd acceptans

```powershell
.\scripts\arena-pilot-release.ps1 -Step Verify
```

Endast läsning av konto/D1/ledger/Workers/secretmetadata samt rätt kvitton och en Owner. `METADATA_VERIFIED_ONLY` är **inte** bevis på inbox, Owner-login eller rätt visuellt slutresultat. Verify stoppar om Workers saknas.

Godkänn därefter varje verkligt utskick/testskrivning uttryckligen:

1. Öppna den faktiska returnerade pilot-URL:en på HTTPS och matcha den mot mailerns exakta allowlist. Vid mismatch: STOPP; använd inte admin-devflagga eller offentlig mailrelay som genväg.
2. Logga in på `/arena/superadmin`. Begär ett godkänt verifieringsmejl till Owner. Verifiera verklig leverans, svensk HTML/text, oförändrad recovery-origin, avstängd tracking och engångsanvändning. Appen ska neka skyddade funktioner före verifieringen.
3. Generera recoverykoder efter nylig återautentisering, lagra offline. Reset/invite/återställning bara till godkända mottagare. Sessioner/recoverykoder är hashade och återkallas enligt befintliga regler.
4. Godkända syntetiska pilotstationer: signup → Owner approval → unik individuell admin-PIN → unlock. Registrering/retry/undo, interna/nationella tävlingar, utmaning/accept/Battle och avslut/historik. Ingen riktig kund-/stationdata.
5. Showtime/Upptäck: inga produktionsskrivningar; jämför vanlig statistik före/efter och utloggat tillträde ska nekas. Kontrollera tre Gaming Awards med verkligt frysta resultat i riktiga diplom; syntetiska data endast tydligt märkta previews.
6. **Mänsklig visuell slutgranskning är kvar på checklistan**: startsida, Battle Mode, Showtime och tre diplom på fysisk kassadator/mobil/utskrift. Lokal test-PASS ersätter inte designgodkännande.
7. Läs skyddade Tvättligan-/master-resursers version/bindningar/hälsa före/efter utan ändringar. Mät faktisk pilot edge-CPU/D1-budget. Återställning/avpublicering/rollback är nya separata beslut enligt befintliga rollbackguiden, aldrig automatisk följd av fel.

**STOPP-regel:** vid fel, oväntad remote-resurs, fel origin, saknat secret, ändrad SQL eller okänt tidigare försök: avbryt. Gör ingen blind omkörning, delete, ny D1 eller extra deploy. Skriptet är en kontrollerad första release, ingen generell uppdateringsmotor.
