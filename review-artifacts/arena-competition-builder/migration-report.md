# Migration review

En ny additiv Arena-migration: `migrations-arena/0010_arena_competition_builder.sql`. Högsta befintliga migration var 0009. Samtliga nio äldre SQL-filer är byte-identiska med START_HEAD; SHA-256-bevis i `migration-integrity.json`.

## Vad som ändras

Befintliga `arena_leagues` blir behållare för fem format, med validerade regler, REAL-matchpoäng, unik retry-nyckel och frysta resultat. Befintliga `arena_fights` fortsätter vara matchmotor. Nya stödtabeller: bracket slots, stationsbokningar, kanoniska kategorier, frysta aktivitetsmappningar, challenge requests, notifierings-outbox och tidsbegränsade aktivitetsdeskriptorer. Rapporter får competition_id. Registreringar får ett extra sale-time identitetssnapshot via trigger; gamla registreringar lämnas null och använder kompatibel fallback.

Bokningstriggers upprätthåller överlappningsskydd i själva DB-transaktionen. Halvöppna intervall [start, slut) tillåter angränsande framtida perioder. En hel liga inklusive vilodagar reserveras för att samma station inte ska delta i två överlappande tävlingar. Befintliga överlappningar migreras utan att historiken skrivs om; nya konflikter blockeras.

## Verifierat

- Fresh SQLite: 0001–0010 i ordning, foreign keys på, foreign_key_check utan fel.
- Befintlig 0009: gammal fryst fight JSON och alla gamla kolumnvärden bevaras; nytt bokningsskydd fungerar.
- Befintliga fight-/league-/report-/daily-unit och native Worker-regressioner passerar.
- Immutable triggers för scope, regler, medlemsnamn/seed, dag/match/slutresultat, bracket advancement och tempdeskriptorer. Retries ger inga dubbla matcher eller poäng.
- 0010 har applicerats endast på den uttryckliga lokala Wrangler D1-testdatabasen. Index och slutliga integritetstriggers under iterationen har synkats endast lokalt; hela slutfilen körs från början i fresh/upgrade-testerna.

Ingen remote migration, inget schemaarbete på produktions- eller stationsdatabaser. Migrationen är additiv, men bör inför en senare release följas av ordinarie backup-/releaseplan. Ingen automatisk destruktiv rollback tillhandahålls.
