# Fysiskt kassadatortest

Status: MANUAL REQUIRED. Chromium 4× CPU och snabbspolad virtuell tid är approximationer; inget fysiskt kassadatortest har genomförts i denna miljö.

1. Notera CPU, RAM, OS, webbläsare och 19,5-tumsskärm/touchmodell. Öppna endast en separat godkänd MASTER-testmiljö med testpersonal.
2. Kontrollera 1920×1080 vid både 100% och 125% OS-/webbläsarskalning. Notera faktisk CSS-viewport. Testa också 1024×768 och tillgänglig 4:3-upplösning. Huvudvyn ska rymmas utan vertikal scroll: sju aktiviteter, vänsterspalt till navigationen och stats till höger.
3. Använd touch: aktivitet → säljarens namn → klart. Upprepa minst 50 försäljningar, inklusive dubbeltryck och blandade aktiviteter. Notera tid till säljare och kvittens samt eventuella tappade tryck; inga dubbletter.
4. Starta nästa försäljning direkt under vanlig celebration, NY ETTA och Goal Hero. Kontrollera att reward, namn, fiktiv showroom-person respektive riktig produktionsidentitet är läsbara och att heron inte blockerar nästa tryck.
5. Kör aktiv Butiksfight, kvalificerande och icke-kvalificerande aktiviteter, tillfällig quick action, multistationsnamn och återgång till normal kontext. Öppna Fight Center, ligatabell och slutspel. Kontrollera att timersekunden inte ger helsideryck.
6. Aktivera reduced motion. Bekräftelsen måste vara tydlig även utan animation. Kontrollera kontrast på den faktiska äldre skärmen.
7. Bryt nätet kort. Försök igen med osäker kvittens får inte dubbelspara. Ångra och kontrollera vanlig topplista; redan fryst Fight/award ska inte ändras.
8. Växla flik/fönster: dold vy ska inte pollas, synlig vy ska uppdateras direkt. Kontrollera 12s normalt / 5s Fight utan parallella dubbelförfrågningar.
9. Öppna Admin med fysisk numpad och touch-keypad. Fel PIN, lockout, korrekt PIN, byte, återgång och tjugo minuters inaktivitet ska hanteras tydligt. Stationens vanliga displayinloggning ska bestå.
10. Testa Owner/Superadmin-reset separat med behörigt testkonto. Ingen gammal PIN ska kunna visas. Kontrollera att alla gamla adminsessioner upphör.
11. Öppna arkiverat award, ladda ned och skriv ut A4. Kontrollera svenska tecken, marginaler, namn, period och läsbarhet även på vanlig skrivare. Byt ett testnamn/TB efteråt och kontrollera att gammalt award är oförändrat.
12. Låt normalvyn stå i verklig idle i 30 minuter och upprepa sedan med aktiv Fight. Notera CPU, arbetsminne, fläkt/temperatur, långsamma uppdateringar och minne före/efter. Kör ytterligare upprepade försäljningar och kontrollera att resurser återgår till stabil nivå.
13. Kontrollera vanlig stationsinloggning över natt, logout, sessionsåterkallning och inloggning igen. Ta bort testprofilbild: produktion ska få stabil initial/fallback; showroom-porträtt får endast visas i explicit showcase.
14. Dokumentera utfall, faktisk viewport/skala, tider och reproducerbara steg. Godkänn först när tvåtrycksflödet är snabbt och stabilt på den riktiga datorn.
