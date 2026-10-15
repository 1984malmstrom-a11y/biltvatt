# Visuell jämförelse mot de två gröna mastrarna

Bedömningen är en visuell granskning av riktig React/CSS med syntetisk testdata, inte ett uppmätt pixel- eller procentbetyg. Bild A styr helheten; bild B styr klustret. De blå stationsreferenserna används inte som master.

| Kategori | Bedömning | Jämförelse |
|---|---|---|
| Palette | PASS | Forest-black, djupgrönt, champagne, energigrönt och varm ivory. Ingen cyan/RGB som UI-identitet. |
| Material | PASS | Mörka gradientytor, tunna gröna/guldiga kanter, statiska inner shadows. Ingen helskärmsblur. |
| Glow | PASS | Gemensamt green/gold-material på alla sju ringar. Fokus har starkare metallkant och ljushierarki. |
| Center cluster | PASS | Biltvätt i mitten; korv/25 uppe, kaffe/spolarvätska mitt, sallad/30 nere. Satellit/fokus cirka 0,62. Krona och tydlig fokusmarkering ovanför ringen enligt den nya gröna mastern. |
| Produktmotiv | PASS | Ny tvättmiljö med mörk bil, cola/orange-burkar, vit kopp/bulle, svart salladsskål och chokladpar. Korv och vit/blå dunk behålls. Alla använder contain. Text och ringar ligger i UI. |
| Spacing | PASS | Tre separata kolumner, fria cirkelkroppar, vänsterspalt ned till menyraden och stats endast till höger om vänsterspalten. 4:3 har egna regler. |
| Vänsterspalt | PASS | Fem porträttrader och fem senaste aktiviteter; diskret metallrank, guldhighlight på ettan, Live och riktiga dynamiska värden. |
| Högerspalt | PASS | Stationspuls med faktisk dagsdata, eller större Butiksfight. Ingen tom högerkolumn och ingen påhittad procentjämförelse. |
| Fight | PASS | Lag, exakt metric/differens, lokal timer, matchbalans, rörlig ram, slutspurt och slutresultat. Presentationen följer befintlig engine. |
| Stats | PASS | Mörkgrön horisontell rad med ivory-värden och champagneaccent; count, points och sellers kommer från today-data. |
| Navigation | NEEDS DIFFERENCE | Samma gröna/guldiga material och touchvänliga huvudknappar. Befintlig navigation med fyra ingångar behålls; referensens åtta ingångar läggs inte till som nya funktioner i ett visuellt pass. |
| Premiumhelhet | PASS | Självständig ARENAN-wordmark, produktfoton och återhållsam arena-belysning. Ingen stationskedja, bränslesymbol eller kedjebakgrund. |

## Medvetna skillnader och begränsningar

- Riktiga namn, belöningar, mål och resultat ersätter referensens exempelvärden. Belöningarna hårdkodas inte till +1/+2.
- Fokusmarkeringen är en tydlig lätt roterad UI-rubrik, inte en exakt krökt textbana.
- Citatkortets bergsilhuett är lätt CSS i stället för ett fotografiskt landskap. Produktfoton är separata optimerade WebP.
- Porträttsystemets befintliga syntetiska championfoto behålls. Dess fotografiska kalla kantljus kan fortfarande synas; UI-ytor och effekter är gröna/guldiga.
- Mobil använder en stark fokusdel, kompakt aktivitetsgrid och ett litet livekort. Vänsterspaltens innehåll öppnas i paneler. Den krymper inte hela desktopvyn.
- Stationspuls visar inte trend/mot-igår när sådan jämförelsedata saknas. Aktuellt tillgängligt lagmål används utan att ett månadsmål kallas dagsmål.
- Fysisk 19,5-tumsskärm, VA, ljusstyrka, antireflex och Windows-rendering kan inte verifieras i Chromium på servern. 1536×864 är viewportapproximationen för 125 %.
