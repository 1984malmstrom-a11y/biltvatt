# Arena Fight Category / Stationspuls

START_HEAD: `3b880c25904c67f4b307c62840bc4a53873267ee`.
Branch: `feat/arena-v1`.
Begärd lokal commit: `Arena V1: add compact station pulse and fight category emphasis`.

## Resultat

Stationspuls är 48 % lägre på desktop, med oförändrad bredd och befintlig scengeometri. Header, måltempo, avstånd till dagsplan och återstående poäng till befintligt mål ersätter det tidigare långa innehållet. Ingen påhittad TB/trend, inga dubblerade Dagens stats-KPI:er. Saknat mål visar befintlig starkaste/senaste aktivitet eller tom-state.

Fight-qualifying ringar får en tydligare champagneperimeter, grön aura och liten FIGHT-badge utanför produktområdet. Accessible namn beskriver att aktiviteten räknas i Butiksfight. Frysta lokala mappings styr exakt vilka ringar som markeras, se fight-scope-mapping.md.

Tillfällig rund objective visas separat ovanför höger Fight-panel. Den vanliga sju-ringsstrukturen är intakt. Produktmotiv använder descriptor-bild (eller befintligt känt produktmotiv), contain och korrekt namn/reward. Om en egen aktivitet saknar både bild och känt motiv visas ärlig svärdsikon, ingen felaktig produkt.

Concept C-komponenten har en ringvariant. Säljarselector, request-ID/idempotency, registreringsendpoint, kvitto och undo är samma befintliga kod. Fight Center behåller sin ordinarie Quick Action. Både desktop- och mobilflöden är testade, inklusive retry/409 i existerande Concept C-regressioner.

Fight slut/cancel återställer vanliga ringar och lokal ranking/feed automatiskt, utan reload. Den befintliga korta slutresultatvisningen följs av Stationspuls. Stale descriptors från annan fight visas inte.

## Dimensioner och mobil

| Viewport | Före (px) | Efter (px) |
|---|---:|---:|
| 1920x1080 | 446.97×758.00 | 446.97×394.16 |
| 1536x864 | 357.58×600.00 | 357.58×312.00 |
| 1448x1086 | 323.05×764.00 | 323.05×397.27 |
| 1024x768 | 228.45×504.00 | 228.45×262.08 |
| 390x844 | 366.00×66.00 | 366.00×66.00 |
| 844x390 | 178.00×220.00 | 178.00×220.00 |

Se responsive-report.md för tabell med rubriker och full verifiering. Mobilen använder sin befintliga HUD-yta; temporary ring ligger i Fight-sektionen, utanför activity-grid. För kort landscape används mindre objective och kompaktare intern panelspacing. Dagserie för alla tre metrics ryms.

## Realtime och prestanda

Normal 12 s, active fight 5 s, hidden 0 poll och lokal countdown 1 s är oförändrade. Ingen ny poll-loop eller begäran från ringen. Stats-svaret kompletteras med ett extra indexerat read-only-uppslag endast för aktiv fight. Inga dependencies, nya assets, canvas, WebGL, blurfilter eller kontinuerliga objective-animationer. Objective-perimetern tonas in/ut med opacity i 300 ms, och temporary-entry använder opacity/transform i 300 ms och blir statisk vid reduced motion. performance-report.json redovisar byggstorlekar och begränsningen att fysisk äldre kassa inte har benchmarkats.

## QA och review

Typecheck/build gröna. 227 Arena-unit-tester och 67 relevanta Playwright-tester gröna. Alla sex begärda format är kontrollerade med dokument-overflow, paneltext, scope-badges, temporary, säljarflöde och återställning. Diffkontroll utan whitespacefel.

19 kuraterade PNG i index.html: sex normalvyer, fyra scope-vyer, sex temp-vyer, säljarval, återställt normal-state samt en före-bild från startcheckpointen. Inga interna debugbilder ingår. Tidigare mellanresultat från QA har hållits i scratch.

Ändrade filer finns i changed-files.txt. Endast presentation, läsmodell för frysta activity-ID:n och relaterade tester; inga migrations- eller Competition Builder-filer ändrade.

## HUMAN REVIEW

Visuell sign-off återstår för kompakt HUD, glow-kontrast och den lilla mobilringen. En egen temporary activity behöver en uppladdad produktbild om det inte finns ett känt lokalt motiv. Tekniska kontroller är gröna; ingen mänsklig designapproval påstås.

NO PUSH · NO DEPLOY · NO REMOTE MIGRATION · NO MERGE · NO BRANCH SWITCH.

FINAL_HEAD: `6cee8c96910bbe1c7ea437134700bfb0380445c5`. En lokal commit, parent exakt START_HEAD. Working tree clean på `feat/arena-v1`; origin tracking-ref oförändrad.
