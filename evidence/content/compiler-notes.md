# P02-T01 compiler verification

Production compiler uses remark-parse + remark-directive + frontmatter AST, strict node/attribute whitelists, explicit directive closing, safe YAML duplicate/alias/tag rejection, NFC/BOM/LF normalization, schema/semantic validation and canonical SHA256. It does not execute HTML, MDX, links, images or code. Schema constant/types are generated from the canonical JSON Schema. Semantic validation enforces6scenes x6beats, role/ownership of assets, speaker IDs and4emphasis beats <=120graphemes.

`pnpm content:check` exit0: full semantic JSON equality to both expected fixtures; hashes preserved,5deliberately invalid fixtures rejected. Generated output comes from the AST compiler. `pnpm test:unit`:21passed, including15compiler cases for Unicode, full fixture parity, malicious AST, YAML safety, duplicate/unknown attrs, explicit closure, one-beat mood override, tampering, emphasis/speaker/assets. `pnpm lint` and `pnpm typecheck` exit0.

Initial compiler typecheck failed on Node type visibility and YAML visitor narrowing; added Node-only package types and object narrowing, then repeated same compiler/type suites successfully. No checks were skipped or weakened. Official remark-directive/YAML/Ajv APIs checked against primary docs and installed declarations. This proves content compilation, not product UI or human editorial review.
