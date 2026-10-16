# Performance review

Local production React, mocked API, Chromium 4x CPU throttle. Readiness is mounted seven-activity UI excluding the 3s presentation gate. Actions use Playwright click-to-visible latency (includes runner overhead). Not physical 19.5-inch till hardware. Idle paint measured with CDP devtools.timeline X/Paint events. All phases measured sequentially after browser QA.

| Phase | Viewport | Ready ms | Selector ms | Next sale ms |
|---|---|---:|---:|---:|
| baseline | [1920, 1080] | 1436 | 300 | 234 |
| baseline | [1024, 768] | 1167 | 249 | 186 |
| baseline | [390, 844] | 1224 | 231 | 174 |
| after | [1920, 1080] | 1279 | 284 | 299 |
| after | [1024, 768] | 1227 | 257 | 217 |
| after | [390, 844] | 1044 | 262 | 146 |

Local stadium WebP: 71700 bytes, used only by the rendered intro. No new logo artwork, animation dependency, video, WebGL, canvas or global blur. Fight perimeter animates opacity on a small static gradient. Countdown is local and isolated; hidden tabs pause it. Normal 12s / active-fight 5s polling unchanged. Raw CDP task/script/layout/paint, heap and DOM observations are in performance-report.json. These are browser smoke measurements, not physical legacy-till certification.

Additional alternating browser-frame measurement at 4x CPU: baseline seller selector 83ms → 74ms after; next sale during celebration 53ms → 48ms. These are five-trial medians from pointerdown to the first frame after dialog mount, excluding Playwright dispatch/wait overhead. Raw rows and method are included in performance-report.json.

Idle observations over 6 seconds: baseline task 107ms / paint 6ms; after normal task 130ms / paint 5ms; after final urgency task 146ms / paint 5ms. Each window: 6 local clock mutations, 0 stage DOM mutations, 1 active-fight polling request. Heap after explicit GC: 3,035,448 bytes before / 3,826,952 after 16 selector open-close cycles (nodes 544 → 618). This short warm-up measurement is not a long-duration leak certification.
