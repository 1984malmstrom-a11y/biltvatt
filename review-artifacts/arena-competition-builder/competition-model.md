# Competition Builder – modell och regler

## Befintlig arkitektur utökas

`arena_leagues` är competition-behållaren. `request_key IS NOT NULL` identifierar den nya modellen; äldre ligor behåller sin befintliga väg. `arena_fights` är gemensam matchmotor för direktfight, daglig serie, liga och knockout. Befintliga league fixtures och daily snapshots återanvänds. Ingen parallell competition-/matchmotor införs.

| Format | Deltagare | Avgörande |
|---|---|---|
| Sprint | 2–16 | Högst total poäng/TB/antal under vald period; lika resultat kan delas |
| Dagsserie | exakt 2 | Varje Stockholmsdag ger 1/0,5/0 som standard; livevärde visas separat |
| Liga | 2–16 | Enkel/dubbel round robin; MP, måttskillnad, totalt mått, seed/id |
| Liga + slutspel | 2–16 | Tabellen seedar topp 2/4/8; samma Fight-engine avgör utslagning |
| Cup | exakt 2/4/8 | Seedad ingångsordning, direkt utslagning, ingen godtycklig wildcard |

Matchperioder i liga/cup är 1–14 kalenderdagar. Total kalender är begränsad till ett år. En dag/vecka/kalendermånad/custom finns för direktformat; månad använder riktig kalender, inte fast 30 dagar. Alla dygnsgränser använder Europe/Stockholm inklusive DST.

## Round robin och slutspel

Deterministisk cirkelalgoritm återanvänds; dubbelserien lägger returhalvan efter hela första halvan och byter hemma/borta. 10 stationer: 9×5=45 matcher; dubbelserie 18×5=90. 5 stationer: fem omgångar, en roterande vilodag per station, noll vilodagspoäng.

Topp 4: 1–4, 2–3. Topp 8: 1–8, 4–5, 2–7, 3–6. Publicerade tabellseed och bracket-resultat är frysta. Deterministiska match-ID:n, CAS och unika nycklar förhindrar dubbel avancering. Efter finalen fryses mästare, tabell, matcher, bracket och report snapshot.

Knockout default: sekundärt mått, därefter högre seed i ligaslutspel; sekundärt mått, därefter sudden death i ren cup. Alternativ: direkt högre seed (endast slutspel) eller sudden death. Nästa giltiga, ej makulerade qualifying sale avgör sudden death; händelsen och skiljeregeln lagras/auditeras.

## En station, en tävling

Stationsbokningar reserverar hela tävlingsperioden. DB-exclusion triggers och atomiska D1-batches är sista skyddet, inte bara ett UI-test. Samtidiga acceptförsök: en lyckas, den andra får 409, utan halvskapade tävlingar.

Sudden death behåller stationen även efter ordinarie sluttid. En redan förbokad nästa match väntar. Scoring börjar först efter avgörande registrering +1 ms; väntande försäljningar räknas inte dubbelt. Om hela nästa matchperiod blockeras avbryts matchen utan vinnare/MP. En avbruten knockout ger pausat bracket; ingen automatisk forfeit eller uppfunnen vinnare. Superadmin kan avbryta hela tävlingen. Detta gränsfall kräver mänsklig policy-review före release.

## Utmaningar och mappning

Stationsadmin skickar en dagsduell från sin serverbestämda station: idag eller högst 90 dagar framåt, alla aktiviteter/fokus/kanonisk kategori/specifik lokal aktivitet. Pending låser ingen station. Mottagaren måste godkänna scope och vid behov välja egen aktivitet. Namn/kategorilikhet ger förslag, aldrig tyst automataccept. Accept fryser deltagare, mått, period, activity IDs och regler.

Status: pending → accepted/declined/withdrawn/expired; accepted → cancelled vid giltigt avbrott. Utgången förfrågan visas som expired och kan inte accepteras. Aktiv/completed finns i den accepterade competitionens status; ingen duplicerad state machine för matchresultat.

Lokala kategorinamn finns kvar. Valfri `arena_category_id` är en separat stabil mappning: wash/fika/food/drink/car-care/campaign/other. Ofullständig kategori-/fokusmappning avvisas tydligt. Publicerade regler är låsta; ändra utkast före skapande. Ingen serverbaserad regelredigerare införs och därför finns ingen efterhandsmutation av frysta regler.

## Avbrott och rapporter

Inblandad stationsadmin kan avbryta en pågående spontan duell med confirm+anledning. Superadmin kan avbryta officiell match eller competition. Score, tid, aktör, station och anledning sparas; ingen ny vinnare eller MP. Historiken raderas inte och bokningar frigörs vid tävlingsavbrott. Redan frysta matcher kan inte skrivas om.

Rapporter använder befintligt report snapshot med extra nested competition-data. PDF-design, tidigare PDF-validitet och gamla bytes är kvar. Nya rapporter innehåller frysta tabeller, bracket, match-/dagsresultat och avbrott. Gaming-diplom är framtida arbete.

## Tillfällig aktivitet – stöd, inget placeringsbeslut

Immutable, deltagarägd deskriptor med matchperiod, namn/bild/belöning/kategori och härledd aktiv-status. Ingen permanent ordinarie aktivitet skapas. Att registrera den från ett nytt permanent UI är avsiktligt inte aktiverat innan placering godkänts. Spontan accept utan lämplig lokal aktivitet ger ett tydligt fel i stället för att välja fel aktivitet. Tre lokala DEV-koncept, A/B/C, visas endast för review och är märkta CONCEPT ONLY / HUMAN REVIEW REQUIRED. Home behåller sju ringar.

## Realtime och kostnad

Home 12 s; aktiv fight 5 s; bootstrap 60 s; hidden 0 normala polls; synlig igen ger omedelbar refresh; timer lokalt 1 s. Fight Center hämtar ett sammanhållet payload: egna fulla match-eventfeed plus motståndarnas score-sammanfattningar via en aggregate. Ingen station pollar alla andras fulla feeds. Catch-up av stora avslutade scheman är begränsad till 32 matcher per pass och visar verifieringsstatus; ingen falsk slutmästare innan alla resultat frysts.
