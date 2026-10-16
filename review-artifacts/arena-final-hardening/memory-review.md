# Memory review

Accelerated 20-minute virtual-clock session, 60 real UI registrations, normal motion, 1920x1080, deterministic API, heap after explicit GC at 0/5/10/15/20 virtual minutes. Not a real 20-minute soak, thermal test, GPU memory measurement or physical cashier validation. FastForward coalesces timers; polling frequency is verified separately.

| Phase | Minute | Heap after GC | Nodes | Event listeners | Documents |
|---|---:|---:|---:|---:|---:|
| baseline | 0 | 11366120 | 528 | 195 | 1 |
| baseline | 5 | 13358956 | 551 | 196 | 1 |
| baseline | 10 | 13591840 | 551 | 196 | 1 |
| baseline | 15 | 13681628 | 553 | 196 | 1 |
| baseline | 20 | 13925832 | 551 | 196 | 1 |
| after | 0 | 11373612 | 528 | 195 | 1 |
| after | 5 | 13597356 | 551 | 196 | 1 |
| after | 10 | 13546756 | 551 | 196 | 1 |
| after | 15 | 13940428 | 566 | 198 | 1 |
| after | 20 | 13757048 | 538 | 196 | 1 |

One document and stable listener/DOM levels after warm-up; heap includes expected first-use React/dialog/image work and then fluctuates around a plateau. No monotonic detached-document/listener growth was found in this limited simulation. This is not proof of absence of leaks: run the documented real 30-minute cashier idle/Fight/repeated-sales check before production approval.
