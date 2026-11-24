export type ClassicParagraphKind =
  | "narration"
  | "dialogue"
  | "section"
  | "source";

export type ClassicParagraph = {
  kind: ClassicParagraphKind;
  text: string;
};

const sentences = new Intl.Segmenter("ko", { granularity: "sentence" });
const targetLength = 200;
const preferredMaximum = 340;

// A transcription can have missing or inconsistent closing quotation marks.
// Match within each source line so an incomplete quotation cannot consume
// the remainder of the manuscript or swallow the next explicit opening mark.
const quotationPattern =
  /“[^“”]*(?:”|(?=“)|$)|"[^"]*(?:"|$)|「[^「」]*(?:」|(?=「)|$)/gu;

function appendParagraphs(
  paragraphs: ClassicParagraph[],
  raw: string,
  kind: ClassicParagraphKind,
) {
  const value = raw.trim();
  if (!value) return;

  if (
    kind === "section" ||
    kind === "source" ||
    value.length <= preferredMaximum
  ) {
    paragraphs.push({ kind, text: value });
    return;
  }

  // Group complete sentences in long prose (or unusually long speeches).
  // Never divide a sentence merely because it exceeds a character limit.
  let group = "";
  for (const { segment } of sentences.segment(value)) {
    if (
      group.trim() &&
      (group.trim().length >= targetLength ||
        (group + segment).trim().length > preferredMaximum)
    ) {
      paragraphs.push({ kind, text: group.trim() });
      group = "";
    }
    group += segment;
  }
  if (group.trim()) paragraphs.push({ kind, text: group.trim() });
}

function isSpeech(line: string, match: RegExpExecArray) {
  const after = line.slice(match.index + match[0].length);
  // Quoted terms immediately joined to a grammatical particle are not
  // dialogue turns. A reporting suffix such as 하고/라고 is different.
  const terminalPunctuation = /[.!?…─―—][”"」]$/u.test(match[0]);
  return (
    terminalPunctuation ||
    !/^(?:하는|이라는|라는|이다|인|의|은|는|이|가|을|를|와|과|에)/u.test(
      after,
    ) ||
    /^(?:하고|하며|하니|라고|라며)/u.test(after)
  );
}

function reportingClauseLength(gap: string) {
  const tail = gap.trimStart();
  if (!tail) return 0;
  const first = sentences.segment(tail)[Symbol.iterator]().next().value;
  const clause = first?.segment ?? "";
  if (!clause || clause.trim().length > 180) return 0;

  const explicitSuffix =
    /^(?:,?\s*)(?:하고|하며|하니|하자|하더니|하곤|하여|하면서|하였|했다|하는|라고|라며|라\s*하고|라니|라곤)/u;
  const speechVerb =
    /(?:말[하했]|말을\s*(?:하|했)|물었|묻[는고]|대답|중얼|부르짖|외쳤|외치|소리[를로]|한\s*마디|반문|속삭|내뱉|고함|응수)/u;

  if (!explicitSuffix.test(tail) && !speechVerb.test(clause)) return 0;
  return gap.length - tail.length + clause.length;
}

function formatLine(paragraphs: ClassicParagraph[], raw: string) {
  let line = raw.trim();
  if (!line) return;

  // Some source files include their original title/author in a single line
  // before the first sentence. Keep the characters, but isolate the heading.
  const heading = line.match(/^([가-힣 ]{2,20}<[^>\n]{1,60}>)(?=\s|$)/u);
  if (heading?.[1]) {
    appendParagraphs(paragraphs, heading[1], "section");
    line = line.slice(heading[1].length).trimStart();
    if (!line) return;
  }

  if (/^(?:\d{1,2}|\*{1,3})$/u.test(line)) {
    appendParagraphs(paragraphs, line, "section");
    return;
  }
  if (/^출전\s*:/u.test(line)) {
    appendParagraphs(paragraphs, line, "source");
    return;
  }

  const matches = Array.from(line.matchAll(quotationPattern)).filter((match) =>
    isSpeech(line, match),
  );
  let cursor = 0;

  for (const [index, match] of matches.entries()) {
    appendParagraphs(
      paragraphs,
      line.slice(cursor, match.index),
      /^[―—]/u.test(line.slice(cursor).trimStart())
        ? "dialogue"
        : "narration",
    );
    const quoteEnd = match.index + match[0].length;
    const nextStart = matches[index + 1]?.index ?? line.length;
    const gap = line.slice(quoteEnd, nextStart);
    const end = quoteEnd + reportingClauseLength(gap);
    appendParagraphs(paragraphs, line.slice(match.index, end), "dialogue");
    cursor = end;
  }

  const remainder = line.slice(cursor);
  appendParagraphs(
    paragraphs,
    remainder,
    /^[―—]/u.test(remainder.trimStart()) ? "dialogue" : "narration",
  );
}

/**
 * Presentation-only paragraph reconstruction. Existing source line breaks
 * remain boundaries. The stored transcription is never rewritten; only
 * whitespace at the new block boundaries is trimmed or introduced.
 */
export function formatClassicParagraphs(text: string): ClassicParagraph[] {
  const paragraphs: ClassicParagraph[] = [];
  const lines = text
    .replace(/([^\S\r\n]+)(?=출전\s*:)/gu, "\n")
    .replace(/(^|\s)(\*{1,3})(?=\s|$)/gu, "$1\n$2\n")
    .split(/\r\n?|\n/u);

  for (const line of lines) formatLine(paragraphs, line);
  return paragraphs;
}
