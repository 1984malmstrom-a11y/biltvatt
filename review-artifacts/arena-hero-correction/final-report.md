# Arena – focused champion correction

Start HEAD: 74768ac46606c96ab11a092dbf1c1d23d96ae6de
Final HEAD: 7e9ea4fdb18bcc2d1ced7dc256d7f54eb6c8826e
Branch: feat/arena-v1.

## NY ETTA
A bounded, opaque green/gold victory stage and strong dimming now separate the champion from the idle dashboard. The fictional showcase figure has no fading mask. A giant illuminated #1 sits behind the person, with a crown. NY ETTA!, the real seller/result names and a dedicated reward/activity panel have distinct areas. Responsive text bounds are tested against both stats and navigation. Existing production identity policy, 3600 ms lifetime, click-through registration and reduced motion are preserved.

## Goal hero
One fictional showcase figure, one trophy and a crown replace the competing portrait/product/decorative layers. MÅL UPPNÅTT! is the main title; personal/station/focus type and week/month appear separately. Seller, sale reward/activity and achieved goal result use individual rows. The same bounded opaque scene prevents underlying circles from showing through.

## Blank desktop quick-action: A, screenshot timing
The old desktop capture ran immediately after page.goto, before the lazy React view/data was ready. Its font/image decode wait did not guarantee the quick-action UI existed. Mobile captured after button interaction and therefore waited implicitly. The capture test now waits for the match widget, enabled quick-action button, selected activity and enabled seller button on both platforms. An 800 ms delayed fixture reproduces Laddar Arenan first and then the full working dialog in both sizes. No quick-action product logic was changed. See quick-action-verification.json and the two new temporary-fight-quick-action PNGs.

## Bracket
Only connector contrast/a small static edge glow and final title/border emphasis changed. Match structure, scroll geometry, seeding, results and competition logic remain untouched. Three curated images show desktop, mobile semifinal overview and the mobile final.

## Scope and QA
Six source/test files are listed in changed-files.txt. No idle start layout, ring size/glow, left-column geometry, stage background, focus textPath, Dynamic Fight Context, shared/worker code, schema or migrations changed.
Typecheck/build PASS, relevant unit tests 103 PASS. Playwright: 159 distinct passing cases, 1 explicit-fixture-gated native competition case skipped. Initial expected-label/server-target failures were resolved and confirmed as detailed in test-report.txt; original evidence is retained.
19 curated PNGs in index.html/artifacts.json. Human visual approval remains separate from automated geometry/function verification.

No push, deploy, remote migration, merge or branch switch.
