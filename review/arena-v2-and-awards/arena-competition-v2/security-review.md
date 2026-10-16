# Säkerhetsgranskning – fokuserad kod- och testreview

Ingen extern penetrationstest eller produktionstest påstås.

- Befintlig stationssession, admin-elevation, verifierade Superadmin-konton och Owner används; inget separat auth-system.
- Servern kontrollerar organisation och hela deltagarscopet vid skapande, läsning och avbrott. Nationell betyder en kundorganisation, inte hela plattformen.
- Kundens centrala admin har endast tilldelat mandat. Owner behåller separat plattformsbehörighet. Återkallade mandat kontrolleras på nytt vid nästa anrop.
- Stationschef får skapa endast sin egen lokala individ-/stationstävling. Främmande säljare, stationer och personval avvisas.
- Privata låsta aktivitets-/deltagararrayer ligger kvar internt men skickas inte i den paginerade publika vyn.
- Klienten får inte leverera frysta kundflöden, deltagarsnapshots eller låstidpunkter. Grundpoäng och kundunderlag kan inte bytas mitt i en låst tävling.
- Nya organisationsstationer kan inte använda äldre globala grupper/fight-discovery som brygga mellan kunder. Äldre globala administrationsvyer kräver Owner när organisationsläge är konfigurerat.
- Aktivitets-ID + stations-ID och kanoniskt kategori-ID används för kvalificering; ingen jämförelse av fria produktnamn.
- Parametriserad SQL/JSON-bundna listor. En källa till försäljning; ingen separat kopia per tävling.
- Reviewbilder och fixtures innehåller syntetiska data. Paketet innehåller inga databaser, hemligheter, migrations-SQL, node_modules eller build-output.

Säkerhetsberoende: Owner måste ange korrekta organisationstillhörigheter och granska administrativa kundmätningar. Programmet kan inte själv bevisa sanningshalten i en manuellt angiven källa.
