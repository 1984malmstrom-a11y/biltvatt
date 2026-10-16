# Bundle and asset audit

Actual production build files (raw / gzip), not estimates from development modules.

| Phase | All JS | All JS gzip | All CSS | All CSS gzip |
|---|---:|---:|---:|---:|
| baseline | 898543 | 280023 | 394690 | 71641 |
| after | 910394 | 284438 | 399376 | 73409 |

Totals include all lazy routes, not the initial download. Main Arena still lazy-loads Admin/Superadmin/Competition UI. Reports and the new Award preview are now lazy inside both Admin and Superadmin; PDF vector generation stays server-side and is not shipped to the startscreen. ArenaAdminPin is a small shared admin/security module. No new package or animation library is installed.

The main startscreen loads the same resource count in the CDP trace; the in-flight helper adds approximately 0.5 kB raw. See asset-transfer.json for the exact observed files and byte counts.

No product, champion, portrait, background or branding file is changed. Existing WebP motifs, contain scaling, avatar sprite policy and fictional champion selection remain. Uploaded portraits remain private/no-store behind tenant checks; caching must not bypass revocation/isolation. Public static edge caching/compression must be verified in an approved deployed test environment; this pass makes no remote configuration change.
