# Responsivitet, touch och kontrast

## Kontroller

Normal/Stationspuls och aktiv Fight verifieras i 1920×1080, 1536×864, 1448×1086, 1024×768, 390×844 och 844×390. Testet mäter dokumentets scrollWidth/scrollHeight mot exakt viewport, öppnar och stänger säljarväljaren från samtliga sju aktiviteter och kontrollerar porträttens faktiska storlek/avkodning/tryckyta.

Desktop: vänsterkolumn med fem topprader och fem feedposter. Stats börjar till höger om vänsterspalten. Vänsterspalten når ned till åtta pixlars avstånd från navigationen.

16:9: tre kolumner. Eget kompakt breakpoint för lägre desktop/1536×864. 4:3: smalare vänsterspalt, kompakt högerspalt, tätare vertikal orbit och komprimerad statsrad. Inga cirkelkroppar överlappar varandra. Extra mellanformat verifieras av den befintliga orbit-sviten.

Mobil portrait: kompakt mål-HUD, tydlig fokusbild, sex satelliter i två gridrader, topplista/feed i paneler, kompakt puls/fight-kort, stats och touchmeny. Mobil landscape använder bred orbit och smalare matchkort. TB-läget får vid behov en något högre kompakt rad så hela beloppet kan läsas.

Alla aktivitetsknappar är minst 44×44 CSS-pixlar. På primär desktop är de betydligt större. Seller portrait-regression kontrollerar även negativfall med dold/nollstor bild och prioritet för uppladdat porträtt.

## Läsbarhet

`contrast-report.json` redovisar WCAG-luminans för centrala solida tokens. Ivory, guld, muted, energigrönt och amber uppfyller normal AA på de tre kontrollerade mörka ytorna. Danger på raised är en dekorativ/statusfärg, inte huvudtext; läsbar text och statusord används tillsammans med färg. Fotoområden granskas dessutom visuellt; fokusnamn och belöningsyta har eget kontrastunderlag.

Reduced-motion tar bort perimeterrotation, tie-puls, surge, konfetti och övergångar. Status, timer och resultat finns kvar som text. `motion-verification.json` innehåller deterministiska CSS-transformer vid två tidpunkter och kontroll av lokalt sekundtick utan extra nätverk.

## Fysisk hårdvara

1920×1080 och 1536×864 har granskats som riktiga Chromium-viewporter. Detta verifierar layout och CSS-tryckytor; faktisk touchprecision, skärmens nits, VA-vinklar och Windows 125 % kräver fysisk kassaskärm.
