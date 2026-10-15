# Responsive verification

Verklig React/CSS i Chromium. 1920×1080, 1536×864, 1448×1086, 1024×768, 390×844, 844×390 verifierade automatiskt i både normal och aktiv fight-kontext.

- Huvudvyn har sju ringar, contain-produkter och samma slotordning. Cirkelkropparna överlappar inte och dokumentet har varken vertikal eller horisontell overflow. Separate desktop-/4:3-/mobile-regler behålls; mobil tvingas inte till desktopdiameter.
- Desktop har fem rankingrader och fem recent-rader. Extra stationsrad i fight mode har egen höjdbudget; ett test kontrollerar att varje feed-person ryms inne i sin rad. Smal 4:3 har komprimerad header och matchande VS-bredd; namn går inte in i VS.
- Samma böjda SVG-title finns i alla sex format, ingen fallback till roterad rak text. Fem särskilda crop-bilder visar krona, verklig textPath, spacing och ring.
- Mobil öppnar lokal/fight-feed som panel; separat TOPPLISTOR förblir lokal. Fight Center tillåter vertikal sidsroll och lokal bracket-/tabellscroll, ingen page-level horizontal overflow.
- Touch, reduced motion, native dialog-fokus/locking, sale/undo/TB/achievement, PDF, recovery och profile regression verifierade.

45 utvalda PNG för mänsklig review. 52 unika internt sparade browser-PNG (omkörningar skriver över samma namn). Inga hundratals bilder i huvudgalleriet. Fysisk 19,5-tums kassa har inte testats; premiumkänsla, glownivå och den nya bågtypografin behöver mänsklig visuell review.
