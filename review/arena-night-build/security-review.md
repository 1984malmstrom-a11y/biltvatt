# Demosäkerhet

Behörighet: servern återanvänder befintlig requireArenaSuperadmin för GET /api/arena/superadmin/presentation-access. Station/säljarcredential och showcase-parametrar ger inte tillträde. Endpoint returnerar bara authorized/role, no-store; ingen kunddata.

Isolering: separat minnesledger och injicerad runtime för anrop, tid och minneslagring. Ingen produktionsadapter-fallback. Endast lokala bootstrap/stats, kvittobunden registrering och undo tillåts; annan operation nekas. Dessutom vägrar live-API-klienten alla anrop från presentationsroutes utom auth-GET. Vanliga appbehörigheter och CSRF/tenantkontroller är bevarade.

Event/notiser: inget DB-, push-, e-post-, audit- eller snapshot-skrivande i demomotorn. Inga serviceanrop för inbjudningar. Real UI-länkar fångas så man inte hamnar i live-administration inifrån sessionen. Testinstrumentering: 0 mutationer och 0 DB total_changes under full offline-genomgång.

Livscykel: per-flik minnesstate, återstart avgränsad, effect-cleanup tar bort interval/listeners och dispose tömmer sessionen. Synlighetsbyte pausar; BFCache-återgång gör ny authkontroll. Pågående offlinevisning är avsiktligt tillåten efter godkänd start; servermutationer är fortfarande blockerade. Refresh kräver authanslutning.

Review: endast syntetiska säljare, redan befintliga fiktiva porträtt och tydligt märkta PDF-exempel. Ingen Preem-logotyp, secrets, sessionscookies, databaser eller kundexport. Mänsklig och fysisk POS-granskning återstår; detta är verifierad lokal isolering, ingen garanti mot framtida okända kodändringar.
