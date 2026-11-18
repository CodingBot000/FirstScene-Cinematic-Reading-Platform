# Browser sessions and nonce rendering

Status: implemented locally,2026-11-18. Anonymousbrowserownership is represented by an opaque HttpOnlycookie and hashed token in PostgreSQL, with owner/runtime role separation. There is no account identity or cross-device sync.

The local productionbuild uses explicitlocaldeployment+loopbackHTTP to select the developmentcookie; publicorigin requiresHTTPS and__HostSecurecookie. This resolves local productionQA versus publiccookie requirements while refusing localcookie configuration on a publicorigin. Runtime configuration receives no migrationowner credentials.

AllHTML uses per-requestnonce anddynamicSSR, following the securityspecification and [Next CSP guidance](https://nextjs.org/docs/app/guides/content-security-policy). Content remains validated builddata and never depends on DBavailability. We trade staticHTMLcache benefit for nonce isolation; hashedassets remain immutablecached. GSAPstyle changes are permitted bystyle-src, while productionunsafe-eval is absent.

Ajv-formats3.0.1 was pinned for canonicalUUID/date-time contract validation rather than creating a parallel formatvalidator. OpenAPIdefinitions are transformed atbuildtime; no YAML/schemafetch runs in the browser. This adds a small Node-only dependency without a service or paidAPI.

Tests start the actual standaloneartifact against a fresh ownedtestdatabase. Realcookie/session/SQL paths are exercised; test-onlyconfiguration is outsideapplicationcode. Testfixtures never reset the developmentDB. Creationrate uses conservativeglobalHMACkey when a trustednetworkproxy is not identified. The feedback5/day reset policy remains undecided; no calendar/rollingwindow has been silently selected.
