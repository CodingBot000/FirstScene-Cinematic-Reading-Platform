# Typography provenance

No font binaries are redistributed (0 bytes). The specified Noto Serif KR / Nanum Myeongjo and Noto Sans KR are preferred family names with system serif/sans fallbacks. Font failure must never block rendering or anchor restoration. Desktop macOS uses its installed Korean fallback; exact glyph metrics are verified later in browser QA.

Official family/license references: https://github.com/notofonts/noto-cjk and https://github.com/google/fonts/tree/main/ofl/notoserifkr (SIL Open Font License); https://github.com/google/fonts/tree/main/ofl/notosanskr. We do not imply the user's locally installed fonts are redistributed under these licenses.

No external Google Fonts request is introduced. This avoids a network dependency and an unreviewed large Korean font transfer; serif rendering may vary by system. If bundled subsets are later necessary, license/hash/byte size and font-ready remeasurement must be verified before release.

Reading sizes are18/20/22/24 actual CSS px with1.9line-height and34rem maximum width. UI15px and caption14px remain separate. Mobile display minimum36px, Korean keep-all with overflow-wrap:anywhere.
