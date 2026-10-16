# Migrationsgranskning

- `migrations-arena/0012_arena_competition_scopes.sql`: additiva organisationer, regioner, distrikt, stationskopplingar, mandat, kundflödeshistorik, organisationsnyckel på befintliga ligor samt index.
- `migrations-arena/0013_arena_organization_lookup_indexes.sql`: index för organisationsbundna region-/distriktsuppslag.
- Ingen tabell tas bort eller återställs. Inga äldre stationer tilldelas automatiskt en kundorganisation. Historiska match-/award-resultat skrivs inte om.
- Kundflödeshistorik är append-only med databas-trigger. Tävlingsregler, deltagare, matchmappning och snapshots behåller befintliga oföränderlighetsregler.
- Komposit-FK hindrar distrikts-/regionkoppling över organisationsgräns. Tester verifierar främmande nycklar inklusive ett mästerskap med 40 stationer och 780 tvåstationsmatcher.
- Endast isolerade lokala SQLite-minnesdatabaser har migrerats i verifieringen. Ingen persistent kunddatabas eller remote migration har berörts.
