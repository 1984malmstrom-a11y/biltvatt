# Responsive QA

Alla sex obligatoriska format passerar: desktop 1920×1080 / 1536×864, 4:3 1448×1086 / 1024×768 samt mobil 390×844 / 844×390.

| Viewport | Stationspuls före (px) | Stationspuls efter (px) |
|---|---:|---:|
| 1920x1080 | 446.97×758.00 | 446.97×394.16 |
| 1536x864 | 357.58×600.00 | 357.58×312.00 |
| 1448x1086 | 323.05×764.00 | 323.05×397.27 |
| 1024x768 | 228.45×504.00 | 228.45×262.08 |
| 390x844 | 366.00×66.00 | 366.00×66.00 |
| 844x390 | 178.00×220.00 | 178.00×220.00 |

Desktophöjden är 52 % av tidigare (48 % lägre), samma bredd. Mobilens befintliga HUD-yta behålls. Ingen ändring av scen, ordinarie rings storlek/koordinater, fokusbåge, vänsterkolumn, statsbar eller navigation enligt före-/eftermätning.

- Normal mode, temporary objective, dagserie för points/TB/count och qualifying badges kontrollerade i alla sex format.
- Ingen dokument-scroll/overflow i huvudvyn. Header-/paneltexter och ringbadges ryms inom relevanta ytor.
- Tillfällig ring är fristående från sju ordinarie slots. Exakta orb-rects är identiska före och efter att temporary objective tillkommer.
- Mobil portrait: 64 px rund objective bredvid Fight-sektionen. Landscape: ring ovanför panelen, 80 px normalt / 64 px för dagsserie. Ingen extra permanent grid-slot.
- Den stora Fight-panelen behålls. Endast med extra objective komprimeras interna gaps/typografi och redundant pepptext på kort höjd.
- LIVE/status och vänsterrubriker från senaste compact-header-fixen är regressionsprovade.
