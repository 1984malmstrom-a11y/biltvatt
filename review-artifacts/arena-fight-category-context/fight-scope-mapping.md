# Fight scope authority

`fight_objective` är ett presentationstillägg i befintliga stats-svaret. Ett medlemskontrollerat, station-filtrerat uppslag hämtar IDs ur `arena_fight_activity_rules`, samma frysta medlemskap som scoring och feed använder.

- All: Competition Builder-fights får frysta lokala IDs även för scope all. Nya aktiviteter läggs inte till automatiskt.
- Focus: fryst focus-ID, inte senare kampanjval.
- Category: alla frysta lokala IDs som mappades till canonical category; inte senare kategori/namn.
- Activity: fryst lokalt ID.
- Legacy utan scope_json: null IDs betyder den existerande obegränsade scoringen; alla tillgängliga slots kvalificerar.
- Tom ID-lista betyder inget ordinarie medlemskap. Saknad authority eller fel fight-ID ger ingen markering.
- Temporary: befintliga fight-only descriptors från stats-svaret används; bara aktuell active fight. De skapar ingen vanlig activity config.

En descriptor tar inte bort ordinarie frysta regler. Om en fight faktiskt räknar både vanliga och tillfälliga aktiviteter visas båda korrekt. I temp-only reviewscenariot är ordinarie medlemskap tomt.

Ny API-egenskap kräver ingen schemaändring. Ingen Competition Builder-, scoring-, snapshot-, registrerings- eller migrationslogik har ändrats. Test med senare ändrade aktivitetsnamn/kategorier verifierar att frysta IDs förblir authority och att andra stationers IDs inte läcker.
