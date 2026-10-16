# Implementationsstatus

- P0 Showtime: klart. Permanent behörighetsstyrd route, riktig ArenaHome och registreringsdialog, sex regisserade scener, minnesadapter och virtuell klocka. Intern, nationell individ, FAIR PLAY-station och tvåstationsfight visas via kvalificeringskvittens från delad poänglogik.
- P1 demosäkerhet: klart för testad lokal miljö. Nekande adapter och separat spärr i live-API-klienten. Endast läsande authkontroll tillåts. Två flikar isolerade; paus, refresh, back, omstart och exit verifierade. Bakgrundsflik pausar. Automatiken begränsas till 12 händelser per scen och försenade ticks ackumuleras inte i en burst.
- P2 Upptäck Arenan: klart. Sex manuella kapitel, riktig A-symbol och tre äkta renderade produktvyer. Befintlig award-komponent används för demoexemplet. Organisation visas schematiskt och märks som sådan. Inga påhittade produktknappar eller AI-prototyper används.
- P3 diplom: klart. Befintlig PDF-motor och snapshots bevarade. Detaljerade vektorsvärd, gemensam exakt centrerad A-geometri, läsbar sekundärtext och balanserade långa namn. Tre finala A4-PDF/PNG samt tre före-PNG.
- P4 Battle V3: klart. Grönare statisk atmosfär, kontursvärd och kontrollerad aktiv glow. Samma sju positioner, scoring, växlare, matchpanel och urgency. 13 oförsvagade befintliga tester godkända.
- P5 genrep/review: klart lokalt. Fem genrep, fem prioriterade viewports, 29 kuraterade PNG och tre PDF.

## Medvetna gränser

Ingen fejkhand/klickmakro eller extra spotlight byggdes (valfritt önskemål). Scenbakåt/replay återställer vald scen avsiktligt; framåt mellan Fight-scener bevarar ledgern. Automatiken är en kort regisserad sekvens, inte en obegränsad datagenerator. Nationell bakgrund visas som kontext och kvalificeringskvittens, inte som separat ny demo-tävlingsbyggare. Live-administration kan inte öppnas inifrån demon.

## Kvar utanför detta lokala pass

Mänskligt designgodkännande, fysisk kassahårdvara, utskrift på faktisk skrivare och eventuell framtida release. Ingen feature blockerar det verifierade lokala demogenrepet. Behörig session och anslutning krävs vid första öppning/refresh; därefter har hela Showtime-genomgången verifierats offline.
