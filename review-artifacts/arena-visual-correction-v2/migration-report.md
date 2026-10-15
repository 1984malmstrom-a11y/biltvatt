# Schema / migration status

Ingen ny migration behövdes och ingen migration har körts i detta pass, lokalt eller remote. Samtliga 0001–0010 är byte-identiska med START_HEAD; SHA-256 i schema-integrity.json. Fulla fresh-/upgrade-/frozen-result migrationstester ingår i enhetstestsviten.

Concept C återanvänder 0010:s immutable `arena_temporary_fight_activities`, befintliga activity-rule snapshots och den ordinarie `arena_registrations`-/undo-ledgern. Vid första giltiga registreringsförsöket materialiseras en namespacad `temp:`-aktivitet med `active=0`. Den är en historisk ledger-/FK-rad, visas aldrig i ordinarie bootstrap eller adminregister och kan inte redigeras via normal aktivitets-API. Därmed kan befintliga stats, TB, achievements, rapporter, void och frysta resultat fortsatt använda samma ledger utan en parallell försäljningsmodell.

Giltighet kontrolleras server-side samt vid den atomiska INSERT:en: rätt station, rätt descriptor/match, aktiv period, ej avbruten eller fryst fight. Föregående sudden death blockerar en väntande nästa match. Egen sudden death förlänger den faktiska matchperioden tills avgörande försäljning; då försvinner quick action. Inaktiva backing rows behålls för historik/FK och ändrar inte ordinarie sju aktiviteter eller setup.

Publicerade competition-regler, dagspoäng, seed/avancering och tiebreak-logik är oförändrade. Ingen gammal migration eller befintlig fryst resultat-JSON har skrivits om.
