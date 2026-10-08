# Privat import av butikens dagsnetto 2025

Filen med verkliga belopp och all genererad SQL ska ligga **utanför Git-repositoryt** med åtkomst enbart för behörig operatör. Verktyget vägrar skriva SQL i repositoryt och skapar filer med rättigheten `0600`. Det ansluter inte till D1.

## Kontrollera källan

Granska originalarbetsboken separat: vilket blad som avser Preem Tingsryd, att kolumnen är **butiksförsäljning exklusive moms**, att drivmedel och sammanfattningsrader är uteslutna, och att formelceller har kontrollerade resultat. Exportera endast verifierade värden till UTF-8 CSV med exakt rubrikerna `business_date,net_sales_ore`. Datum ska vara `YYYY-MM-DD` och belopp hela ören. Jämför exporten dag för dag med den fil som används för import. Ett matchande filhash bevisar att två CSV-filer är identiska, men bevisar inte deras relation till originalarbetsboken.

## Förhandsgranska och förbered

Kör från projektroten med en privat filsökväg. Ersätt kontrollvärdena med de värden som granskats mot originalkällan:

```sh
python3 scripts/prepare-station-import.py /ABSOLUT/PRIVAT/SOKVAG/station-2025.csv \
  --expected-sha256 KONTROLLERAT_SHA256 \
  --expected-total-ore KONTROLLERAD_TOTAL_ÖRE \
  --expected-sample-date KONTROLLERAT_DATUM \
  --expected-sample-ore KONTROLLERAT_STICKPROV_ÖRE
```

Verktyget kräver exakt 365 giltiga, unika dagar utan luckor under 2025, heltalsbelopp inom D1-gränsen, rätt hash, totalsumma och stickprov. Ett fel stoppar SQL-generering. Förhandsgranskningen gör ingen databasändring. När rapporten är granskad, upprepa kommandot med `--confirm-preview --write-preflight-sql /PRIVAT/station-preflight.sql --write-sql /PRIVAT/station-import.sql`.

`station-preflight.sql` är en läsfråga som redovisar antal befintliga dagar, matchande dagar och avvikande dagar utan att skriva. Kör den mot rätt D1 först **efter** migration 0004. Avvikande befintliga värden ska granskas; importen skriver aldrig över dem. `station-import.sql` innehåller ett enda atomiskt `INSERT ... ON CONFLICT DO NOTHING`, så en ny körning ger inga dubbletter och redan rättade värden bevaras. Importens auditposter skapas av databasens trigger. Ingen SQL-fil ska läggas i en pull request, byggartefakt, logg eller chatt.

Efter en godkänd import ska 2025-rader, summa, datumintervall och stickprov kontrolleras direkt i D1. Om preflight visade befintliga rättningar kan summan med rätta avvika från källfilen; stoppa och stäm av skillnaden före driftbeslut. Produktionsbackup, migration och import kräver separat godkännande.
