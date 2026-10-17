> **Aktuellt 2026-10-17:** Operatören bekräftar installerade 13 migrationer, verifierad faktisk Windows-restore och Resend **Verified**. Fortsätt enligt [den korta nästa-steg-runbooken](arena-pilot-next-steps.md). Kör inte D1-create/Restore/Migrate igen. Detta är operatörsuppgifter, inte Codex remote-verifiering.

# ARENAN: sista pilotstegen på Windows

Gäller endast konto `aff95af21a7f160722dd524471fc25b0`, befintlig D1 `arenan-pilot-vd-20261019` / `8044ee1b-9185-4644-954f-d5455330a7a7`, ny app-Worker med samma namn och separat `arenan-mailer-pilot`. Ingen D1 skapas. Tvättligan, master-test och deras tre databas-ID:n tillåts aldrig som mål. Inga standardconfig-, DNS-, mailutskicks- eller raderingskommandon ingår.

## Börja här

Den nya lokala checkpointen måste först överföras till jobbdatorn genom ett **separat godkänt kodöverföringssteg**. Detta pass pushar inget. Att bara ha gamla `35cfdc6…` räcker inte: den saknar dessa nya verktyg.

Kör i interaktiv Windows Terminal/PowerShell, inte ISE eller en obevakad pipeline. Reservera de två nya pilotnamnen under körningen så ingen annan operatör publicerar samtidigt; identiteter kontrolleras igen efter godkännande men Cloudflare erbjuder inte en transaktion över kontroll och deploy.

Kräver Node >=22.13, installerade låsta npm-beroenden, `git`, Wrangler-inloggning med åtkomst till rätt konto och befintlig `.arena-pilot/pilot.json` genererad i just Windows-checkouten. Kör inte `npm run deploy` eller standardconfig. Skriptet kräver `feat/arena-v1`, clean tree och historik som innehåller `35cfdc6…`. Privata kvitton är bundna till aktuell HEAD; om koden ändras måste underlagen granskas igen.

```powershell
Set-Location -LiteralPath 'C:\Users\Preem\Documents\ARENAN-PILOT'
.\scripts\arena-pilot-release.ps1
```

Standardsteget `Plan` är helt offline och gör inga ändringar. `Preflight` kör lokala config/build-kontroller, två dry-runs och mockad native mailersmoke; ingen remote-läsning eller -ändring. Alla kommandon nedan gör **ett** steg och avslutas; de ska köras var för sig efter granskning av föregående resultat. Vid minsta fel: STOPP. Ingen automatisk fortsättning eller blind retry. Ta inte bort ett misslyckat kvitto för att försöka igen; kontrollera först det verkliga remote-resultatet och fatta ett separat beslut.

## 1. Bevisa återställningen lokalt

```powershell
.\scripts\arena-pilot-release.ps1 -Step Restore
```

Standardfil är `C:\Users\Preem\ARENAN-Private-Backups\arenan-pilot-before-migrations-20261017.sql`. Alternativ plats: `-BackupPath 'D:\Privat mapp\samma-backup.sql'`. Exakt godkänd SHA-256 måste vara `12B4D609D563571A2BBE9615DADD52FA835EE6F0E29CDF77EF6C64CA8EC3CB68`.

Detta steg är redan genomfört enligt operatören; upprepa det inte i den fortsatta releasekedjan. Tidigare PASS i backupverifieraren betyder att SQL kunde laddas i minnet, **inte** att Wrangler-importen kördes. Den nya kontrollen importerar själv i ny disponibel lokal D1, kör separata quick/FK-kontroller, öppnar återställd SQLite read-only för full integritet och jämför schema och alla radfingerprints med källan. SQL-filen bevaras. Rapport `.arena-pilot/restore-proof.json` får aldrig läggas i Git/review; heller inte lokal D1-state.

`SQLITE_AUTH` kom från workerds förbud mot `PRAGMA integrity_check`, vilket har reproducerats lokalt. Det är inte ett bevis på fel config, fel backup eller att flera SQL-satser är förbjudna. Full integritetskontroll försvinner inte: den körs utanför workerd på den faktiskt importerade databasen.

## 2. Läs och kontrollera remote-identiteter

```powershell
.\scripts\arena-pilot-release.ps1 -Step Inspect
```

Endast läsning: rätt konto, exakt D1-namn/UUID, schema, migrationsledger och om de två dedikerade Worker-namnen redan finns. Okänd API-/behörighetsrespons ger STOPP. Saknad Worker godtas bara för den specifika Cloudflare-koden 10007; autentiseringsfel får aldrig tolkas som ledigt namn. Verifieringen listar versions-ID:n, inga mailadresser eller API-nycklar.

## 3. Godkänn migration separat

```powershell
.\scripts\arena-pilot-release.ps1 -Step Migrate
```

Kontrollerar samma backupfil, kvitto/HEAD, alla 13 migrationsfiler och att remote fortfarande är tomt. Visar konto, Worker, mailer, databas, SHA och åtgärd. **Remote mutation kräver att du skriver exakt frasen som visas**, t.ex. `GODKANN MIGRATE aff95af21a7f160722dd524471fc25b0`. Skriptet skapar aldrig D1 och skriver aldrig till andra bindningar. En delvis applicerad ledger stoppas. När alla 13 redan är korrekt applicerade görs endast läskontroller.

Wranglers migrationskörning kan lämna tidigare lyckade migrationer applicerade om en senare misslyckas; verktyget registrerar därför varje försök före anropet och blockerar blind retry. D1:s separata quick/FK-kontroller samt exakt ledger verifieras efteråt. En ny backup/export efter migration är en egen remote-åtgärd som kräver separat godkännande; ingen automatisk export görs här.

## 4. Resend måste bli helt Verified

**Uppdaterad status enligt operatören: Verified.** EU-region, avstängd tracking och faktisk pilot-origin måste fortfarande bekräftas före mailer, Owner och publicering. Ingen riktig e-post får skickas. Ändra inte DNS via detta verktyg. Domänägaren måste åtgärda/avvakta verifieringen separat, bekräfta EU-region `eu-west-1`, stänga av open/click tracking och besluta en dedikerad restricted sending API-nyckel för rätt domän enligt [mailer-guiden](arena-resend-mailer.md). Infrastrukturansvarig måste också verifiera kontots verkliga workers.dev-namnrymd; hitta inte på en URL.

När detta är gjort, ange den **verifierade faktiska** pilot-URL:en som visas i kontot. Följande placeholder får inte kopieras bokstavligt:

```powershell
$PilotOrigin = Read-Host 'Verifierad faktisk https://arenan-pilot-vd-20261019.<kontonamnrymd>.workers.dev'
.\scripts\arena-pilot-release.ps1 -Step PrepareMailer -Origin $PilotOrigin
```

Endast lokal config/dry-run, ingen publicering. Kräver explicit attestation av Verified/EU/tracking/origin och skriver inte över befintlig mailerconfig. Verktyget verifierar inte Resend via API och får inte användas som bevis på domänstatus. Det skapar ingen API-nyckel och läser inga gamla produktionssecrets.

## 5. Separat godkännande för mailer-secret och mailer-publicering

```powershell
.\scripts\arena-pilot-release.ps1 -Step MailerSecret
```

Remote-stoppunkt: dedikerad `RESEND_API_KEY` anges i Wranglers interaktiva prompt, aldrig som argument, miljövariabel eller i Git. **Secret put kan skapa en tom mailer-Worker om den inte finns**, vilket också står i godkännandesammanfattningen. Ingen publik route/D1 eller e-post. Om en mailer med namnet redan finns oväntat: STOPP, inget secret skrivs över.

```powershell
.\scripts\arena-pilot-release.ps1 -Step DeployMailer
```

Remote-stoppunkt: endast `arenan-mailer-pilot`, `workers_dev=false`, inga routes/D1. Named entrypoint `ArenaMailer`, caller `arenan-pilot-vd-20261019`, exakt allowlistad HTTPS-origin. Separat dry-run och godkännande. Secret och deploy är två separata steg; fel i något ger ingen fortsättning.

## 6. Verklig Owner, separat godkännande för skrivning

Stäng skärmdelning och PowerShell transcript. Besluta en verklig individuell Owner/recovery-adress och lösenord; ingen syntetisk Owner får användas i riktig pilot. Ingen default-PIN. SQL innehåller lösenordshash och personuppgifter, ska granskas privat och aldrig ingå i review eller Git.

```powershell
.\scripts\arena-pilot-release.ps1 -Step OwnerSql
```

Endast lokalt; lösenord dolt, JSON via UTF-8 stdin, samma befintliga bootstrapverktyg. Ingen automatisk e-postverifiering. Fil `.arena-pilot/owner-bootstrap-private.sql`, skydda ACL/krypterad disk.

```powershell
.\scripts\arena-pilot-release.ps1 -Step OwnerBootstrap
```

Remote-stoppunkt: korrekt ledger, mailer publicerad och noll befintliga Owners. Skriver endast i pilot-D1 efter uttryckligt godkännande. SHA säkrar att den granskade SQL-filen inte ändrats. Kontrollerar en Owner efteråt. Radera privat SQL efter lyckad kontroll. Owner måste verifiera sin e-post via ordinarie flöde senare; inget kringgås.

## 7. Första app-publicering, eget godkännande

```powershell
.\scripts\arena-pilot-release.ps1 -Step DeployPilot
```

Remote-stoppunkt: **skapar/publicerar bara ny pilot-Worker**, inget tidigare Worker-namn skrivs över. Kräver godkänd mailer + Owner, korrekt config/ledger, en Owner och dry-run. Endast `ARENA_DB`, `ARENA_MAILER`, `ASSETS`, `ARENA_ONLY=1` och pilot-STATION_ID. Ingen `DB`/Tvättligan-bindning. Ingen DNS, migration eller e-post i deploysteget. Om Workern redan finns krävs separat uppdateringsbeslut; scriptet är avsiktligt ingen generell deploymotor.

## 8. Läsverifiera och genomför godkänt demogenrep

```powershell
.\scripts\arena-pilot-release.ps1 -Step Verify
```

Endast remote-läsning. Därefter eget uttryckligt godkännande för varje verkligt mejl, recovery-/testskrivning och syntetisk pilotstation. Ingen sådan acceptans körs automatiskt:

1. Öppna verklig pilot-URL, `/arena/superadmin`, logga in och begär verifieringsmejl till godkänd Owner. Bekräfta faktisk leverans, länk, engångsbruk och korrekt origin. Ingen DB-länk eller manuell verified-flagga som genväg.
2. Recovery: generera/förvara koder offline. Testa reset/invite bara till godkända mottagare. Verifiera även felad mailtransport utan kontoenumerering/tokenloggning.
3. Godkända syntetiska pilotstationer: signup → Owner approval → individuellt admin-PIN → unlock. Ingen admin-PIN i config eller demo-default.
4. Showtime sex scener, paus/fortsätt, offline och återgång utan ändrad normal statistik. Discover och tillbaka. Battle: utmaning/accept båda stationer, scoring/retry/undo, cross-tenant-denial och avslut/historik.
5. Läs befintliga skyddade Workers/D1-identiteter och hälsokontroller enligt ursprungliga inventeringen, jämför deployment/version före/efter. Ändra inget. Faktisk edge-CPU/D1-budget och fysisk kassadator/utskrift återstår att mäta i pilot.

Lokala UI/API-, auth/PIN-, mailer/RPC- och migrationsbevis redovisas i slutrapporten. De ersätter inte Windows-backupbevis eller remote acceptans. Rollback är ett nytt separat godkännande enligt [backup-/rollback-avsnittet](arena-isolated-pilot.md#9-rollback--eget-beslut-vid-varje-remote-ändring); första pilotpubliceringen har ingen föregående version. Verktyget gör aldrig automatisk delete/rollback/import.
