# P04-T01 real database verification

Official17.12 image was pulled and pinned after the pre-existing cached17image reported17.9. The old image/tag was preserved. ActualCompose output confirmed creation of a new named volume/container/network, thenhealthyloopback127.0.0.1:55432. A private ownership receipt records workspace hash and volume creation timestamp; futureup rejects unconfirmedexistingresources. No existing DB/volume was removed or overwritten.

`pnpm db:up`:exit0; `pnpm db:migrate`:first applied0001_initial.sql, repeatapplied[]/checked1 exit0. Root/appenv and ownership receipt verifiedignored; generatedsecretsneverprinted. Owner/runtime credentials are separate. Localbootstrapowner is administrative only inside this project cluster; applicationruntime is nonsuperuser/nonowner/noinherit/noDDL/noTEMP/noCREATEpublicschema/no migrationtable access/no rolemembership. HostedTLS verification is required; remote privileges/migrations are not claimed tested or approved.

`pnpm test:db`:6/6actualPostgreSQL tests passed, repeated after role/ownershipguard changes. FreshUUID-ownedtestDB has8private tables; tracking isbootstrapped once, advisoryxactlock/transaction/checksum works; deliberately altered copiedSQL is refused; runtime app CRUD and sessioncascades preserve another session; expiry31days/font200/orphanFK failconstraints; expiry/session indexes present. Test DB cleanup checks its unique marker beforeDROP. Development DB was not reset. Lint/typecheck/boundariespassed during implementation; runtime security refinements were recompiled and realDBsuite rerun.

Actual version/tables/runtimeattributes/migrationhash: preflight.json. Integration report: test-results.json. This is databasefoundation evidence, not sessionAPI/CAS/IDOR/productrelease completion.
