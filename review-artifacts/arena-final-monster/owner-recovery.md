# Arena Owner och recovery

Ingen webbaserad bootstrap eller break-glass finns. Owner skapas av en operatör med kontroll över deployment och D1. Inga produktionspersonuppgifter är hårdkodade.

## Lokal bootstrap och test

Kör nya migrationer lokalt först. Skicka JSON `{email, display_name, password}` via stdin till `node scripts/arena-owner-maintenance.mjs --mode bootstrap --environment local-mastertest --confirm "ARENA local-mastertest BOOTSTRAP" --output /tmp/arena-owner-private.sql`. Använd inte lösenord i shellargument eller historik. Verktyget accepterar även `--persist-to` för isolerad lokal testdatabas. Det tillåter inte remote exekvering och raderar sin temporära SQL efter lokal körning.

Bootstrap fungerar bara när ingen Owner finns. Initial e-post är **overifierad**. Lokalt kan kontot logga in och begära verifieringslänk; den läggs i den lokala dev-outboxen. I produktion kan operatören skapa verifiering genom den infra-kontrollerade processen nedan eller konfigurera verifieringsleverans vid setup. Ingen produktionsklar Owner ska lämnas utan verifierad recovery-email.

## Produktionssetup, endast senare och manuellt

Konfigurera mailer-servicebindningen ARENA_MAILER före setup. Verktygets `--emit-only --environment <exakt miljönamn> --confirm "ARENA <exakt miljönamn> BOOTSTRAP"` skriver en privat SQL-fil och kör aldrig remote. Tvåpersonersgranska miljö, databas och SQL innan en behörig infraoperatör tillämpar den. För en initial verifieringslänk måste Owner kunna logga in till en **begränsad verifieringssession**; övriga operativa API:er kräver verifierad mejl. Följ länken som skickas av mailer, logga därefter in och generera recovery-koder.

## Glömt lösenord

Verifierad recovery-email → random 256-bitars token → SHA-256 i databasen → 30 minuters giltighet → engångsanvändning i en databastransaktion. Frågans HTTP-svar avslöjar inte om kontot finns. Efter reset återkallas sessionerna. Återställningslänken använder URL-fragment och tas bort från adressfältet när sidan öppnas. Tokens returneras aldrig av produktions-API:er eller loggas.

## Recovery-koder

Owner kan efter aktuell lösenordsbekräftelse skapa tio koder med 128 bitars entropi vardera. Endast SHA-256 sparas. De visas en gång, kan sparas/skrivas ut och fungerar en gång. Regenerering ogiltigförklarar gamla koder. Recovery kräver mejladress, kod och nytt lösenord; sessionerna återkallas och auditlogg skapas.

## Break glass, om både mejl och koder är förlorade

Kräver faktisk kontroll över Cloudflare/deployment/D1, separat identitetskontroll och granskad backup. Kör verktyget med `--mode recover --emit-only --environment <miljö> --confirm "ARENA <miljö> RECOVER" --output <privat.sql>` och stdin-JSON. Det riktar sig endast mot befintlig Owner, återställer lösenord, höjer auth_epoch, återkallar sessioner och engångstokens samt ogiltigförklarar recovery-koder. SQL innehåller append-only `owner.break_glass` audit event. Inget statiskt reservlösenord finns.

Inspektera SQL privat, kontrollera databasen och applicera först efter separat manuell infra-auktorisering. Detta arbete utför inga sådana remote-kommandon. Radera privat SQL och eventuella stdin-filer efter användning. Verifierad mejl ersätts inte av ett otestat nytt mejl. Om mejladressen behöver ändras krävs separat verifierad infra-process och dokumenterad audit. Logga sedan in, verifiera mejl och generera nya koder.

D1 saknar stöd för TEMP-tabeller. Infra-SQL börjar därför med en guard som kastar ett SQLite-fel via en ogiltig JSON-expression endast om förutsättningen inte stämmer. Den ska inte ignoreras. Bootstrap kräver ingen befintlig Owner; recovery kräver ett matchande Owner-mejl. Alla recovery-skrivningar begränsas till just den identiteten.
