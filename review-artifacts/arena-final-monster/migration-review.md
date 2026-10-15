# Arena migrationsreview

Startschema:0001–0006. Samtliga gamla migrationsfiler lämnas byte-oförändrade.

- 0007_arena_people_security_reports.sql: additiv profile_image_id, profilblobbar med station guard; individuella Superadmins; session account_id/auth_epoch/reauth; station-email-verifiering; hashade engångstokens och recovery-koder; lokal outbox; append-only audit; immutable reports.
- 0008_arena_stable_portrait_identity.sql: nullable avatar_index0–15 på säljare. Befintliga ansikten prioriteras vid assignment, kollisioner får tillgång till extra pool. Inget namnbyte ändrar sparat index.

Tester: tom SQLite med foreign_keys=ON genom samtliga migrationer; schema0006 med existerande station/säljare/credential/försäljning/TB → båda nya migrationer; kontroll av bibehållna registreringar/credentials och PRAGMA foreign_key_check. Immutable audit/report-triggers och station guard täcks i funktionella tester.

Dessutom kördes båda nya migrationerna med Wrangler mot ENDAST den lokala D1-instansen i /workspace/work/arena-e2e-state. Samtliga åtta migrationer testas också på en helt ny lokal D1 i /workspace/work/arena-final-fresh-state; exekveringsloggen sparas i review-underlaget. Den riktiga lokala Workern verifierade Owner, mejlverifiering via dev-outbox, profiluppladdning, tenant-denial och PDF-download.

Inga remote migrationer. Inga gamla migrationsnummer redigerade. Ingen applikations- eller CSV-data städades bort. Password hashes övergår bakåtkompatibelt vid lyckad login. Gamla null-account Superadmin-sessioner gäller endast den begränsade lokala testadaptern; produktion kräver individuellt konto.

Rollback: föregående kod kan använda de gamla kolumnerna med additiva tabeller kvar. Planera separat databasbackup före framtida remoteändring. Ingen destruktiv down-migration eller remoteåtgärd kördes här.
