# Performance – före/efter och nya vyer

Paired immutable START_HEAD och slutlig implementation med samma React-only Vite-konfiguration och samma femsäljardata. Chromium CDP 4× CPU, median av tre försök per variant/viewport. Employee portraits avkodade lika för båda; champion första användning ingår i båda. Dev-server/labb, ingen fysisk kassa. Klickmätning inkluderar Playwright actionability/DOM-wait och är inte ett rent React-profilermått.

| Viewport | Säljarval före → efter | Nästa aktivitet under celebration före → efter |
|---|---|---|
| 1920x1080 | 317 → 265 ms | 431 → 442 ms |
| 1536x864 | 283 → 265 ms | 441 → 458 ms |
| 1024x768 | 247 → 267 ms | 430 → 500 ms |
| 1448x1086 | 256 → 258 ms | 420 → 457 ms |
| 390x844 | 218 → 218 ms | 435 → 473 ms |
| 844x390 | 222 → 250 ms | 446 → 409 ms |

Säljarval nu 218–267 ms, ungefär samma storleksordning som tidigare. Nästa val under celebration 409–500 ms; 1024×768 ökar 70 ms i denna parade mätning, medan landscape minskar 37 ms. Vi gör inte anspråk på en generell prestandaförbättring. Råförsök, script-tid och long tasks finns i JSON; framtida Final Performance Audit är fortfarande release-blocker och fysisk kassa behöver testas.

| Viewport | Fight Center initialt | Egen match initialt | Tabell | Slutspel |
|---|---|---|---|---|
| 1920x1080 | 1153 ms | 741 ms | 179 ms | 92 ms |
| 1536x864 | 1178 ms | 730 ms | 161 ms | 111 ms |
| 1448x1086 | 1085 ms | 748 ms | 168 ms | 80 ms |
| 1024x768 | 1080 ms | 728 ms | 169 ms | 83 ms |
| 390x844 | 1059 ms | 719 ms | 119 ms | 78 ms |
| 844x390 | 1137 ms | 787 ms | 157 ms | 79 ms |

Fight Center har en scoped poll och egen full feed; övriga matchers scores är sammanfattningar. Steady state exklusive initiallast/registrering/retries/filter/byten: normal Home cirka 6 requests/min (stats 5 + bootstrap 1), aktiv fight Home cirka 13/min (stats 12 + bootstrap 1), egen matchdetalj 12/min, hidden 0 normalpolls. Timer är lokal 1 s. Verifierat med virtual-clock browser/unit, inte bara uppskattat från konstanter. Nya badge-counts ökar inte Home-endpoints.

JS+CSS total, lika produktionsbuild-konfiguration: 1189798 → 1243883 råa bytes; gzip 326329 → 342068 (delta +15739). Detta är alla lazy chunks tillsammans, inte Home-startlast. Ny UI/CSS laddas i lazy Fight Center/Superadmin-vyer. Inga nya bibliotek, WebGL, video, canvas eller partikelmotor. Full faktisk Cloudflare build godkänd separat.
