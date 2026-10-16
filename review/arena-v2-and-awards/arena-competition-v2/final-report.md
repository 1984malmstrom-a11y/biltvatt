# ARENAN 2.0 – lokal leverans

Start-HEAD: `ea44439efd9a6fc828bfeef3f6c7117e24c05945`  
Slut-HEAD: `61701deb5b579bcb40192c740c0efd49219763ff`  
Branch: `feat/arena-v1`

## Lokala commits

```
069bd89a01893d7a7a1f9f8dc68d3fbd6e17d827 Arena V2: add multi-scope competition foundation
dd0d6f56a19fd66b43728bf493f88a84b52748ff Arena V2: add fair play scoring
08635183fb7ed8456dab7780c00c2627cbf1f163 Arena V2: introduce full battle mode
ecb1a55573dbf733d4518c84896e3b6b60fb535a Arena V2: finalize competition UX and hardening
61701deb5b579bcb40192c740c0efd49219763ff Arena V2: keep compact battle controls clear of hero
```

## Färdigt

- Gemensam befintlig tävlingsmotor för individ, station, tvåstations-Butiksfight och liga/cup/slutspel.
- Organisation → region → distrikt → station med befintliga konton och serverkontrollerade mandat. Ingen automatisk kundkoppling.
- Samma försäljningsledger kan bidra till parallella berättigade tävlingar utan att en ny registrering skapas per tävling.
- Frivilligt FAIR PLAY med källangivet kundsnitt, frysta versioner/regler, konfigurerbar referens/maxfaktor och exakt heltalsavrundning.
- Fullt Battle Mode använder sju befintliga ringplatser, verkliga frysta kategorier, egen stations kvalificerade poäng och inaktiva tomma platser. Två lätta svärd, kort icke blockerande intro och reduced-motion.
- Manuell Station-vy sparas per station/match. Avslut återgår till ordinarie läge. Normal registrering, kvittens och stationens statistik ligger kvar.
- Tävlingsöversikt, byggare med förhandsvisning, organisation/kundflöde samt paginerade resultat och närmaste konkurrenter/eget säljarval.
- Gaming Awards använder de tre bevarade designerna och frysta resultat. Ingen ny vinnare skapas vid avbrott eller delad seger.

## Verifiering och prestanda

Typecheck och build PASS. **297 Arena-tester och 22 Playwright-tester PASS**. Migrations- och FK-tester körs lokalt i minnesdatabaser.

40 stationer / 10 000 syntetiska försäljningar: 21.14, 17.35, 29.72 ms i tre lokala körningar, 4 frågor per topplisteberäkning och 25457 byte publikt svar. SQL-plan använder index för aktivitets-/tidsintervall. Detta är lokalt underlag, inte en D1- eller kassahårdvarugaranti.

## Migrationer

`0012_arena_competition_scopes.sql` och `0013_arena_organization_lookup_indexes.sql`, enbart nya lokala additiva filer. Ingen remote eller persistent kundmigration.

## Review

`/workspace/work/artifacts/arena-competition-v2/` – **21 kuraterade PNG**, `index.html`, manifest och tillhörande rapporter. Alla bilddata är tydligt märkta syntetiska demosiffror. Inga interna extra browserbilder ingår.

Se `changed-files.txt` för samtliga ändrade filer. Centralt: `worker/arena-competitions.ts`, `worker/arena-contest.ts`, `worker/arena-organizations.ts`, `shared/arena-contest.ts`, `src/ArenaApp.tsx` och nya tävlingsvyer. Full teknisk dokumentation finns i repots `docs/arena-competition-v2.md`.

## Avgränsningar och risker

Se `known-limitations.md`, `security-review.md`, `migration-review.md` och `manual-configuration.md`. Gruppspel och resultatmått utan verifierad datakälla har inte lagts till. Individuellt kundflödes-FAIR PLAY är avvisat. Organisationer, mandat och kundsnitt kräver uttrycklig lokal konfiguration och mänsklig review. Ett stort mästerskaps kompletta spelschema kan fortfarande ge större detaljsvar än den paginerade nationella tabellen.

## Git och externa system

Slutkontroll: clean working tree på `feat/arena-v1`. Diplomcheckpointen `ea44439efd9a6fc828bfeef3f6c7117e24c05945` är bevarad i historiken. Ingen push, deploy, remote migration, databasåterställning, merge, branchväxling eller kontakt med skarp kundmiljö har genomförts.
