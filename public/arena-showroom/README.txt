Arena showroom assets

portraits.webp and champions.webp are local AI-generated atlases of eight
entirely fictional adults, generated specifically for this Arena demo.
No stock photos, public profiles or real-person references were used.
Both atlases have identical 4 x 2 cell ordering. Portrait and champion states
keep the same fictional identity. CSS renders one cell, without fetching
individual images or generating a new identity on each render.

Only explicit showcase mode (?showcase=1, retained in the browser session)
uses these people. ?showcase=0 returns to ordinary fallback avatars.
An uploaded image, when supplied by the person data, takes priority.
Showcase mode changes presentation only and never creates demo sales data.

station-night.webp is a separate generated fictional station environment.
It contains no dashboard UI and is not a reference mockup or screenshot.

2026-10-15 final pass: champions.webp regenerated from the existing eight fictional
identities using the attached synthetic sheet as reference. More expressive victory
poses and blue/gold rim light. No real person/stock/web portrait was used. The same
sprite cell identifies a seller across portrait and champion views. WebP, quality 84.
Normal UI now uses these fictional identities when no uploaded portrait exists,
independently of showcase mode. The original pool contains eight fictional identities; an
uploaded real portrait always wins, including in a hero (never a different person).

Final pool:16 identities. portraits-extra.webp/champions-extra.webp add eight entirely fictional people, generated as matched synthetic sheets on2026-10-15. Each seller has a persisted avatar_index so collisions can use the additional identities while retaining original assigned cells. Sheets load on demand; no actual web/stock people. More than16 sellers may reuse a cell when no unused identity remains.
