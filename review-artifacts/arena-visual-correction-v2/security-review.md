# Security / scope review

Befintliga station-/Owner-/Superadmin-sessioner, rate limits, recovery och portrait-ägarskap är bevarade. Ingen produktionshemlighet använd eller publicerad; inga externa meddelanden eller riktiga push-utskick.

- Home-context väljs server-side från stationens egen aktiva fight. Bara deltagare och samma qualifying-rule snapshots används. Positiva prestationer sorteras efter valt mått; bara tio personer och tio senaste försäljningar returneras. En främmande station kan inte välja den via station_id eller läsa competitionen.
- Lokala stats, interna mål/tävlingar och Min Arena fortsätter beräknas separat. Presentation växlar automatiskt tillbaka efter completed/cancelled. TOPPLISTOR visar fortsatt lokala/valda perioder.
- Tempdeskriptorer skapas endast genom befintlig Superadmin-gate, med rätt deltagare/bildägarskap och immutable snapshot. Stationsadmin kan inte lägga till dem i vanliga aktivitetsregistret.
- Tempregistrering kräver rätt stationssession, aktiv behörig säljare (inklusive integrerad staff-kontroll), aktiv descriptor och ej fryst/avbruten fight. Villkoren kontrolleras igen vid ledger-INSERT. Idempotent receipt och fem minuters befintlig undo återanvänds; UI återanvänder samma request-ID efter osäkert nätfel. Definitiva 4xx låser inte in användaren i modal.
- Namespacade inaktiva backing rows är interna FK/historikrader. Ingen åttonde vanlig aktivitet exponeras; ingen separat sale-ledger eller ny schemaändring.
- Production-avatar väljer uppladdad bild, därefter Unicode-initial. Trasig/osäker bild-URL blir initial. Fiktiva ansikten/champion-karaktärer kräver explicit showroom; inga ansiktsgissningar från riktiga namn.

Native lokal Worker och negativa SQLite/API-tester verifierar station isolation, samtidiga accepts, temp-registrering/undo, expiry/sudden-death/frozen-result och tidigare auth-/PDF-/profile-flöden. Detta är lokal kod-/testreview, inte ett externt penetrationstest eller hårdvarucertifiering.
