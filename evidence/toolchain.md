# P00-T02 toolchain verification

- pnpm install: exit0; pnpm install --frozen-lockfile: exit0, lockfile unchanged. All direct dependencies exact; internal workspace dependencies remain workspace:* for pack-time rewriting.
- pnpm lint: exit0 (ESLint and Prettier).
- pnpm typecheck: exit0, 7 package builds and strict checks for all 9 child projects.
- pnpm check:boundaries: initial exit1 from checker regex syntax; fixed unmatched parenthesis, rerun exit0. No product test assertion was removed.
- pnpm check:state: exit0, 1/33 DONE at execution.
- Native dependencies only sharp/esbuild build allowlist; no global software upgrades.
- Next/React and Node compatibility checked against npm registry engine/peer metadata and official installation/release documentation; exact selections in execution/toolchain-lock.json. TypeScript6.0.3 satisfies ESLint adapter peer, whereas latest7 does not.
- Apps and packages are explicit skeletons at this task boundary. No compiler, reader, UI, database or release check is claimed complete. Unimplemented root commands exit1.
