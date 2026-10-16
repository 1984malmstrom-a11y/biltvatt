# Responsiv verifiering

Automatiskt kontrollerat i 1920×1080, 1536×864, 1448×1086, 1024×768, 390×844 och 844×390.

- Huvudvyn behåller exakt sju befintliga cirkelplatser. Ingen generell kolumnbredd/ringstorlek ändras.
- Dashboardens horisontella och vertikala viewport-overflow kontrolleras.
- Aktiva Battle-kategoriers namn, livepoäng och belöningar har separata rader; bounding-box-test hindrar textöverlapp även vid mindre kassaskärmar och mobil.
- Mobilens lägesväxlare har egen yta och går att trycka på utan att panelknappar täcker den.
- Station/Battle-val överlever refresh och byts inte tillbaka vid polling. Slutresultat återgår till Station.
- Tre kategorier ger fyra nedtonade inaktiva platser. Ingen åttonde temporär ring visas i full Battle-vy.
- Reduced-motion stänger av svärdspuls och filmisk intro; registrering fungerar direkt.
- Förvaltnings-/tabellvyer får naturligt scrolla, med kontrollerat horisontellt overflow. No-scroll-kravet gäller dashboarden.
- Screenshots väntar på riktig ready-state utan intro-overlay. Endast 21 valda PNG ingår i galleriet.
