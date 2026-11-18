import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tokens, sourceHash } from "@firstscene/tokens";
describe("P01 token contract", () => {
  it("exports the exact canonical source and six independently evaluated contrasts", () => {
    const source = readFileSync("design/tokens.json", "utf8");
    expect(tokens).toEqual(JSON.parse(source));
    expect(sourceHash).toBe(createHash("sha256").update(source).digest("hex"));
    const report = JSON.parse(
      readFileSync("evidence/design/contrast.json", "utf8"),
    );
    expect(report.pairs).toHaveLength(6);
    expect(
      report.pairs.every(
        (pair: { ratio: number; minimum: number }) =>
          pair.ratio >= pair.minimum,
      ),
    ).toBe(true);
  });
  it("preserves readable mobile type and OS-reduction policy", () => {
    expect(tokens.typography.reading.allowedSizesPx).toEqual([18, 20, 22, 24]);
    expect(tokens.typography.reading.defaultSizePx).toBe(20);
    expect(tokens.motion.reducedDurationMs).toBe(0);
  });
});
