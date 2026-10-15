# Arena auth/security review · lokalt slutpass

## Konton och roller

Individuella konton har Owner eller Superadmin. Databasen tillåter en Owner. Varje anrop läser kontots aktuella roll/status och kontrollerar sessionens auth_epoch. Disabled/revoked/utgångna sessioner nekas direkt. Operativ Superadmin kan hantera nätverket men inte Owner, konton, recovery-koder eller ownership. Även Owner skyddas från generisk account-edit; överföring är en separat lösenordsbekräftad process till aktivt verifierat konto. Sessioner och recovery-koder återkallas vid transfer.

Den tidigare delade Superadmin-nyckeln är borttagen från produktionsåtkomst/UI. En begränsad bakåtkompatibel lokal testadapter finns bara på loopback, alternativt explicit ARENA_AUTH_DEV=1 på .test, och slutar fungera när Owner finns. Den kan inte ge åtkomst från produktionshost. Ingen publik bootstrap, outbox eller break-glass endpoint finns.

## Lösenord och KDF

PBKDF2-HMAC-SHA256 med separat slumpmässig 256-bitars salt, 256-bitars output, **600000 iterationer**. En faktisk lokal Workerd/Miniflare-prob verifierade stöd för både100000 och600000; resultatet finns i kdf-runtime-verification.json. Nytt explicit format `pbkdf2-sha256$600000$<hex>`. Gamla råa hexhashar och tidigare versionerade100k-hashar accepteras och uppgraderas efter lyckad login. Ogiltiga iterationer/salt nekas. Konstanttidsjämförelse för härledda värden. Både legacy-format och verklig uppgradering100k→600k testas. Registreringar och vanlig stationspolling beräknar ingen lösenords-KDF.

## Sessionspolicy

Stationskassa: 365 dagar, persistent HttpOnly-cookie, förnyelse först när mindre än 30 dagar återstår. Vid förnyelse roteras bearer-token atomiskt; gammal token blir ogiltig. Sessionsskapandet kontrollerar atomiskt att den verifierade credentialen fortfarande är aktuell och stationen inte är suspenderad; en reset som hinner före utfärdandet kan inte återöppna kontot med gammalt lösenord. Sessionen kan återkallas individuellt, vid logout, station suspension eller lösenordsreset. Avsikten är att undvika daglig kassainloggning. Parallella förnyelser använder compare-and-swap så att en gammal token inte kan skriva över en ny.

Owner/Superadmin: fyra timmar absolut giltighet, ingen automatisk förlängning. För konto-/recovery-/sessions-/ownership-ändringar krävs lösenordsbekräftelse inom fem minuter och explicit bekräftelse. Sessioner lagrar SHA-256 av 256-bitars slumpmässig token. Inventering visar en separat irreversibel identifierare, aldrig bearer-token eller dess primära hash. Cookie Path=/api, SameSite=Lax, HttpOnly; Secure på HTTPS. HTTPS är ett produktionskrav.

## Recovery och e-post

Reset: 256-bitars random token, SHA-256 i databasen, 30 min, single-use, giltighetsvillkor i samma transaktion som lösenordsändring och sessionsrevoke. Samtidiga anrop testas: exakt ett lyckas. Inbjudan: 24h och samma engångsskydd. Verifieringslänk: 30min, bunden till aktuell mejladress. Ett overifierat produktionskonto kan endast få verifieringssession, läsa egen auth-session, begära mejlverifiering och logga ut. Operativa API:er nekas tills mejlen är verifierad. Gamla stationskonton låses inte ute.

Owner får tio engångskoder med 128 bitars entropi per kod; endast hash lagras. Regenerering invalidaterar tidigare koder. Förbrukning ändrar lösenord, höjer auth_epoch och återkallar sessioner. Koder returneras endast vid generation under autentisering/re-auth och Cache-Control:no-store. De lagras inte i localStorage. Offline infra-recovery dokumenteras separat och är testad lokalt; inget statiskt reservlösenord.

Mailer är en servicebinding ARENA_MAILER med payload `{to,purpose,url}`. Ingen riktig leverantör eller e-post har aktiverats/skickats här. Lokalt läggs testleveranser i dev-outbox utan publik läs-endpoint. Reset/invite-token ligger i URL-fragment; webbvyn tar omedelbart bort fragmentet från adressfältet. Ingen token exponeras i produktions-API-svar eller audit.

## CSRF, throttling, enumeration

Alla state changes går genom befintlig same-origin-kontroll: främmande Origin och Sec-Fetch-Site:cross-site nekas. SameSite-cookie kompletterar kontrollen. Inga mutationer via GET för auth. Ingen permissiv CORS. Login begränsas per IP och konto, forgot per IP/mejl, recovery per IP/konto och reauth per konto. Glömt-lösenord ger samma svar för frånvarande, overifierade och verifierade konton. Misslyckad login härleder KDF även för saknat konto.

## Isolation och bilder

Profiländringar kräver stationsadmin/stationskonto och serverhärledd station. Säljar-ID och blob har stationsguard, kontrolleras före varje ändring. Aktiviteternas bildpipeline har generaliserats: begränsad streamläsning, magic header, dimensioner och 250kB. Profilbilder högst512×512 på servern, normalt384px WebP från client med center-crop och utan EXIF. SVG/HTML/otillåtna typer nekas. Ingen extern bildtjänst. Gamla blobbar raderas vid byte/borttagning. Bilder levereras private/no-store/nosniff. En gammal Superadmin-cookie får inte blockera ett i övrigt giltigt stationsporträtt.

Annans profil kan endast läsas genom explicit gemensam grupp/fight eller giltig Superadmin. Annans privata reports/admin/seller/session kan inte läsas/ändras med en stationssession. Fight-rapporter syns för deltagande stationer; övriga rapporter är privata för respektive station. Negativa unit- och native Worker-browserfall finns.

## Audit och rapportintegritet

Audit har actor id/display/role, action, resource, stationreferens, tid, sanerat före/efter och metadata. DB-triggers gör loggen append-only. Kontohändelser, recovery, session revoke, stationer, grupper, fight-mutationer och PDF-export loggas. Lösenord, hash/salt, råa tokens, recovery-koder och cookies filtreras bort. Stations-/grupp-/fight-konfigurationsändringar och kontohantering skriver audit i samma databasbatch som ändringen. Vissa recovery-/rapport-events loggas direkt efter den atomiska credential-/snapshot-operationen; driftövervakning ska fånga databasfel där.

Report snapshot är serverbyggt, station-scopat och immutable via DB-triggers. PDF är faktisk deterministisk PDF1.4 med svensk WinAnsi-text, A4 och paginering, utan externa API:er. Export regenereras från samma snapshot. Lazy archive kräver ett autentiserat arkivbesök; framtida schemaläggning krävs för exakt arkivering vid varje periodgräns. Namn fryses vid snapshotets skapande, inte genom en påhittad historisk namnlogg.

## Kvar före produktion

Konfigurera och verifiera riktig mailer, separat Owner-setup/recovery-koder, säker backup/restore och fysisk kassadatortest. Lång sessionspolicy, långsiktig throttling-tabellstädning, datalagringspolicy samt återstående atomisk audit bör granskas i framtida säkerhetshärdning. PDF stöder svenska/västeuropeiska tecken; andra skriftsystem ersätts konservativt med frågetecken och kräver framtida fontinbäddning. PDF:en bäddar inte in ansikten/bilder; HTML-preview kan visa porträtt. Ingen claim om färdig aktiverad produktion görs.
