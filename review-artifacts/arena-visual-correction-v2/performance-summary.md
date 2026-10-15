# Performance – parad före/efter, 4× CPU

Immutable START_HEAD och slutlig implementation, samma React/Vite-only-konfiguration och samma femsäljardata. Median av tre försök per viewport/variant. Båda parade varianterna använder explicit showroom så samma ansikten/hero ingår. Produktion med initial-policy är en separat tredje variant. Klicktid inkluderar Playwright actionability och synlig DOM, inte bara React-tid; labbmätning, inte fysisk kassahårdvara.

| Viewport | Initial render före → efter ms | Säljarval showroom före → efter ms | Nästa val showroom före → efter ms | Produktion: säljare / nästa ms |
|---|---|---|---|---|
| 1920x1080 | 1682 → 1783 | 234 → 300 | 423 → 444 | 303 / 469 |
| 1536x864 | 1641 → 1615 | 259 → 301 | 428 → 495 | 347 / 513 |
| 1024x768 | 1684 → 1659 | 280 → 259 | 421 → 517 | 276 / 452 |
| 1448x1086 | 1591 → 1679 | 256 → 279 | 482 → 458 | 294 / 462 |
| 390x844 | 1552 → 1738 | 233 → 261 | 479 → 427 | 292 / 440 |
| 844x390 | 1624 → 1628 | 246 → 260 | 382 → 442 | 279 / 455 |

Slutligt säljarval showroom: 259–301 ms; produktion: 276–347 ms. Nästa aktivitet: showroom 427–517 ms, produktion 440–513 ms. Önskad tidigare nivå 218–267 ms nås inte i alla format. FHD showroom ökar i den parade slutmätningen 234→300 ms; produktion ligger där på 303 ms och 1536-produktion på 347 ms. Detta är en kvarstående prestandabegränsning, inte en godkänd produktionsbudget. Råa tre försök, script-tid och long tasks i JSON. Skillnader mellan format och eventuell försämring ska läsas ur tabellen; ingen generell prestandaförbättring påstås.

| Viewport | Fight Center | Min match | Tabell | Slutspel |
|---|---|---|---|---|
| 1920x1080 | 1232 | 740 | 219 | 135 |
| 1536x864 | 1195 | 771 | 195 | 119 |
| 1448x1086 | 1254 | 745 | 186 | 115 |
| 1024x768 | 1158 | 824 | 177 | 121 |
| 390x844 | 1144 | 744 | 143 | 129 |
| 844x390 | 1175 | 775 | 162 | 109 |

Idle mätt med CDP Performance + devtools.timeline Paint under fem sekunders varma fönster, både normal Home och active Fight i FHD/4:3. Extra stage-disabled-diagnostik ändrar endast ett isolerat mätfönster, aldrig designen i slutresultat/screenshots. Exakta TaskDuration/script/layout/paint-events och mottagna stats-anrop finns i JSON. Enstaka fönster kan få ett poll-anrop och ska inte jämföras som om de hade samma arbete.

Scenen har inga nya asset-downloads. Statisk arkitektur/ljus/golv/punkter; normal idle ska inte kontinuerligt rita om den. Fokus-aura animerar bara opacity/transform. Unicode-segmenterare återanvänds. Ingen effekt eller funktion har tagits bort för benchmark.

Polling: normal Home 12 s, aktiv fight 5 s, hidden 0 normala polls, omedelbar synlig refresh, lokal sekundtimer. Ny fight-context finns i befintligt stats-svar; ingen separat Home-poll och ingen hämtning av alla ligamotståndares fulla eventfeeds. Normal steady state cirka 6 HTTP-anrop/min (stats 5 + bootstrap 1), aktiv Home cirka 13/min, egen matchdetalj 12/min, hidden 0. Filter/registrering/retry/initiallast tillkommer som tidigare.

Bundle JS+CSS: 1243883→1266943 råa bytes; gzip 342068→347544 (delta +5476). Totalt över alla lazy chunks, inte Home-startlast. Quick action laddas endast när relevant. Inga nya paket. Full riktig Cloudflare client/server-build godkänd lokalt.

Final Performance Audit & Optimization – Zero Design/Function Regression är fortsatt ett senare release-blocker-pass; fysisk gammal kassa och 19,5-tums touch måste verifieras innan produktionsrelease.
