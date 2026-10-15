# Arena: framtida MASTER-test och kontrollerad utrullning

**Detta pass gör ingen push, deploy, remote migration eller merge.** Följande är en framtida manuell process som kräver separat auktorisering.

1. **Backup:** exportera målmiljöns D1 samt tillhörande bindings/config. Kontrollera att återläsning fungerar i en separat lokal databas. Förvara backup krypterat.
2. **Branch/commit:** kontrollera exakt godkänd lokal slutcommit, tester och review-gallery. Ingen station-branch eller main ska uppdateras av misstag.
3. **Migrationsplan:** inventera målmiljöns migrationsstatus; tillämpa endast nya Arena-migrationer efter backup. Gamla migrationsfiler får aldrig redigeras. Rollback sker via kompatibel föregående kod eller verifierad backup, inte destruktiva improviserade down-migrationer.
4. **Env/secrets:** separata DB-bindings; station isolation; ARENA_ONLY där relevant; station-ID konfigureras på servern. HTTPS krävs. Produktionsdomän ska inte vara localhost/.test. ARENA_AUTH_DEV får inte vara satt i produktion. Ingen lokal legacy-Superadmin-nyckel i produktion.
5. **Owner bootstrap:** infraoperatör använder granskad offline-process i arena-owner-recovery.md. Konfigurera inte personuppgifter i koden. Endast en Owner. Verifiera recovery-mejl; generera och förvara recovery-koder offline; skapa individuella operativa Superadmins.
6. **E-post:** koppla ARENA_MAILER till en egen granskat skyddad servicebinding som accepterar `{to,purpose,url}` på intern `/send`. Provider-adaptern måste skicka verifiering, reset och inbjudan, och hantera fel. SPF/DKIM/DMARC och godkänd avsändare ska testas. Inga tokens i providerloggar. Lokal dev-outbox får aldrig exponeras från produktion.
7. **MASTER-test:** separat miljö, verifierad rätt databas, domän och commit. Tillåt ingen kundtrafik innan smoke test.
8. **Smoke:** stationslogin, Owner-login, verifiering, recovery, session revoke, profiluppladdning, tvåtrycksregistrering, undo, topplista/TB, mål, fight/dedupe/fryst final, rapportarkiv och faktisk PDF-download. Testa alla fem upplösningarna samt reduced-motion.
9. **Rollback:** stoppa onboarding om fel uppstår; återgå till kompatibel tidigare kod. Bevara audit och frysta snapshots. Vid återläsning av backup ska transaktioner sedan backup dokumenteras. Återkalla sessionsnycklar vid misstänkt säkerhetshändelse.
10. **Tingsryd-pilot:** begränsad testgrupp, Peter genomför fysiskt kassatest enligt arena-old-cashier-test.md. Följ fel, response latency och registreringarnas integritet.
11. **Karlshamn/Karlskrona:** kontrollerad utrullning först efter pilotgodkännande; verifiera respektive personaldatabas och fight-membership.
12. **Extern station:** signup → pending → individuellt Superadmin-godkännande → egen personal/admin → verifierad recovery-mejl → stationsisolerade rapporter och bilder. Testa avstängning och återaktivering.

Rapporter skapas när avslutade perioder läses i autentiserat rapportarkiv och vid fryst fight-final. Det finns ingen konfigurerad extern scheduler i detta pass; drift bör schemalägga bounded archive-maintenance om exakt avslutstid utan adminbesök krävs. Snapshotet är oföränderligt efter att det skapats. Första arkivering av äldre perioder använder då tillgängliga namn/aktivitetsnamn; inga historiska namnversioner uppfinns.

Kvar före produktionsklar markering: verklig mailer-konfiguration och leveranstest, granskad Owner-setup, backup/rollback-test, fysisk kassadator, mänsklig designreview. Det kända CSV UTF-8-felet ligger utanför detta Arena-pass.
