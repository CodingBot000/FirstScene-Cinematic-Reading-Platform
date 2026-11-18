# Local PostgreSQL

`database/migrations/0001_initial.sql` is the implemented schema. The runner creates migration tracking once, takes a transaction advisory lock, verifies SHA256 and applies the remaining tables transactionally. The original `0001_initial.sql` remains the reference input; its migration-trackingDDL is deliberately owned by the runner instead of duplicated.

- `pnpm db:up`: generated ignored local environment, owned loopback container and preserved volume. Rejects another workspace's container/volume. No volume-removal command is provided.
- `pnpm db:migrate`: dedicated local owner connection only; checksum drift fails. Runtime role has noDDL/publicschema/TEMP/migration-table rights or role memberships.
- `pnpm test:db`: creates an isolated UUID-named disposable test DB, confirms its ownership comment before cleanup, and never resets the development DB.

PostgreSQL17.12 official image is pinned by digest incompose.yaml. Credentials are generated into ignored0600`.env.local`; app scoped env is an ignored project-internal symlink. Do not print or commit either. Runtime poolmax2, idle10s/connect5s/statement5s/query10s follow docs08. HostedTLS verification is enabled; no remote migration is implicitly authorized.

Current evidence is inevidence/database. Six actual PostgreSQL integration tests passed for fresh8tables, rerun/checksum, role restrictions, cascades, constraints and expiry indexes. Session authentication/CAS/API ownership are separate implementation tasks; this is notRLS and not a product-ready declaration.
