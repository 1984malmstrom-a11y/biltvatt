# Responsive verification

Required viewports: 1920×1080, 1536×864, 1448×1086, 1024×768, 390×844, 844×390.

Normal mode geometry and headers match the start checkpoint at all six sizes (geometry-verification.json). Stationspuls layout is unchanged. Ordinary seven-ring positions/sizes remain unchanged before/after Fight state and before/after temporary objective.

Portrait temporary objective:
- Ring 144×144 px (previously 64×64), centered, product contain, title 14 px, reward 16 px, objective header 11 px.
- Vertical section: EXTRA FIGHT-OBJEKTIV, ring, then full-width readable Fight panel. No extra grid slot.
- Only this state extends the internal Arena scroll range by 224 px; receipt adds 52 px (276 total). Bottennavigation stays sticky and visible. Document remains viewport-sized; no horizontal overflow.
- Stage height stays unchanged because both the outer main track and the objective row grow equally.
- Two portrait review frames: temp-objective-390x844-top.png at scrollTop 0 and temp-objective-390x844.png at scrollTop 224. The second deliberately focuses on the objective section; the top hero moves above the viewport when scrolling.
- On Fight end the extra scroll range disappears automatically and normal mode returns.

Desktop and landscape temporary objective position/size remain approved. A slightly lower monthly-focus FIGHT badge only in landscape prevents the enlarged badge from touching the product bounds. No ring or focus hierarchy moves.

Qualifying emphasis, badges, mixed-station labels, local labels absent, registration/undo, daily series points/TB/count, reduced motion and overflow passed. Effects use static borders/shadows with existing 300ms opacity transition; no continuous added animation.
