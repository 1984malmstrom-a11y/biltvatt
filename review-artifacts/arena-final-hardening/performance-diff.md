# Performance before / after

Immutable START_HEAD versus candidate production client. Five alternating-order trials per viewport/state, Chromium 4× CPU, ten sellers and the same deterministic API. Full showcase effects remain enabled. Entries are medians in milliseconds, before → after.

| Viewport/state | Initial render | Interactive | Seller selector | Sale → confirmation | Next sale during celebration |
|---|---:|---:|---:|---:|---:|
| 1920x1080 / standard | 1176 → 1205 | 1183 → 1213 | 247 → 273 | 357 → 325 | 284 → 206 |
| 1920x1080 / ny-etta | 1205 → 1356 | 1215 → 1366 | 284 → 244 | 318 → 322 | 310 → 266 |
| 1536x864 / standard | 1168 → 1283 | 1177 → 1297 | 253 → 239 | 288 → 326 | 210 → 225 |
| 1536x864 / ny-etta | 1241 → 1241 | 1249 → 1257 | 266 → 254 | 369 → 363 | 327 → 314 |
| 1024x768 / standard | 1264 → 1199 | 1273 → 1208 | 227 → 205 | 331 → 315 | 247 → 230 |
| 1024x768 / ny-etta | 1196 → 1184 | 1213 → 1195 | 255 → 232 | 353 → 319 | 320 → 262 |
| 390x844 / standard | 1171 → 1184 | 1196 → 1212 | 207 → 213 | 228 → 216 | 177 → 161 |
| 390x844 / ny-etta | 1167 → 1177 | 1194 → 1204 | 202 → 223 | 246 → 234 | 184 → 166 |
| 844x390 / standard | 1201 → 1157 | 1226 → 1191 | 218 → 228 | 210 → 239 | 169 → 160 |
| 844x390 / ny-etta | 1152 → 1178 | 1179 → 1210 | 237 → 204 | 237 → 247 | 208 → 219 |

Across the ten viewport/state medians:

- initialRenderMs: 1186.0 → 1191.5 ms.
- interactiveMs: 1204.5 → 1211.0 ms.
- selectorMs: 242.0 → 230.0 ms.
- saleConfirmationMs: 303.0 → 317.0 ms.
- nextSaleMs: 228.5 → 222.0 ms.

The samples are mixed. Seller selection and next-sale medians improve, but some loads and confirmation points are slower. A uniform latency improvement or zero timing regression is **not** established. Examples include the 1920 NY ETTA cold render and 1536 standard confirmation; their full five-trial ranges remain in JSON. CPU scheduling, image decode, V8 GC and Playwright actionability add variance. The new in-flight helper is ~0.5 kB raw and has no presentation work; the evidence establishes request/query savings, not a causal explanation for every latency fluctuation. Physical cashier validation remains a release requirement.

No visual features/effects, data, realtime cadence or animation quality were removed. All ten seller-selector medians remain below 300 ms at 4× CPU. Sale-to-confirmation includes the real pointer action and rendered confirmation, not server-only latency. First-use champion asset costs remain in the NY ETTA scenario.

Resource timing body sizes under the emulated clock are not reliable; see separate CDP asset-transfer.json, measured without clock emulation. Production static HTTP is local and uncompressed; gzip file sizes are reported independently. Initial development measurements and the first production run are retained in work/; they are not substituted for the final paired measurement.

## Fight Center / table / bracket

| Phase / viewport | Center | Own match | Table tab | Bracket tab |
|---|---:|---:|---:|---:|
| baseline / 1920x1080 | 707 | 494 | 155 | 89 |
| baseline / 1536x864 | 764 | 513 | 160 | 97 |
| baseline / 1024x768 | 677 | 493 | 171 | 99 |
| baseline / 390x844 | 709 | 495 | 113 | 98 |
| baseline / 844x390 | 709 | 496 | 133 | 98 |
| after / 1920x1080 | 706 | 539 | 152 | 89 |
| after / 1536x864 | 693 | 501 | 149 | 92 |
| after / 1024x768 | 671 | 502 | 147 | 93 |
| after / 390x844 | 698 | 492 | 122 | 93 |
| after / 844x390 | 762 | 511 | 144 | 99 |

## Idle and authorized administration

Five-second warm idle windows include the real one-second countdown (active Fight) and ordinary approved effects. TaskDuration measures browser main-thread work, not physical CPU power. Three-trial Admin/Superadmin opens assume already authorized access; the extra security prompt is a new requested feature, not removed from measurement by weakening auth.

| Phase / viewport | View | Time / browser task |
|---|---|---:|
| baseline / 1920x1080 | Normal idle | 10 ms task / 5006 ms window |
| baseline / 1920x1080 | Fight idle | 98 ms task / 5003 ms window |
| baseline / 1920x1080 | admin-authorized | 790 ms open |
| baseline / 1920x1080 | superadmin | 698 ms open |
| baseline / 1536x864 | Normal idle | 9 ms task / 5005 ms window |
| baseline / 1536x864 | Fight idle | 76 ms task / 5002 ms window |
| baseline / 1536x864 | admin-authorized | 712 ms open |
| baseline / 1536x864 | superadmin | 633 ms open |
| baseline / 1024x768 | Normal idle | 9 ms task / 5002 ms window |
| baseline / 1024x768 | Fight idle | 74 ms task / 5003 ms window |
| baseline / 1024x768 | admin-authorized | 729 ms open |
| baseline / 1024x768 | superadmin | 680 ms open |
| baseline / 390x844 | Normal idle | 11 ms task / 5004 ms window |
| baseline / 390x844 | Fight idle | 83 ms task / 5002 ms window |
| baseline / 390x844 | admin-authorized | 748 ms open |
| baseline / 390x844 | superadmin | 726 ms open |
| baseline / 844x390 | Normal idle | 10 ms task / 5004 ms window |
| baseline / 844x390 | Fight idle | 78 ms task / 5004 ms window |
| baseline / 844x390 | admin-authorized | 692 ms open |
| baseline / 844x390 | superadmin | 640 ms open |
| after / 1920x1080 | Normal idle | 9 ms task / 5003 ms window |
| after / 1920x1080 | Fight idle | 112 ms task / 5006 ms window |
| after / 1920x1080 | admin-authorized | 694 ms open |
| after / 1920x1080 | superadmin | 710 ms open |
| after / 1536x864 | Normal idle | 11 ms task / 5003 ms window |
| after / 1536x864 | Fight idle | 86 ms task / 5004 ms window |
| after / 1536x864 | admin-authorized | 700 ms open |
| after / 1536x864 | superadmin | 710 ms open |
| after / 1024x768 | Normal idle | 10 ms task / 5003 ms window |
| after / 1024x768 | Fight idle | 92 ms task / 5002 ms window |
| after / 1024x768 | admin-authorized | 753 ms open |
| after / 1024x768 | superadmin | 646 ms open |
| after / 390x844 | Normal idle | 7 ms task / 5005 ms window |
| after / 390x844 | Fight idle | 64 ms task / 5003 ms window |
| after / 390x844 | admin-authorized | 702 ms open |
| after / 390x844 | superadmin | 660 ms open |
| after / 844x390 | Normal idle | 6 ms task / 5004 ms window |
| after / 844x390 | Fight idle | 69 ms task / 5005 ms window |
| after / 844x390 | admin-authorized | 698 ms open |
| after / 844x390 | superadmin | 647 ms open |
