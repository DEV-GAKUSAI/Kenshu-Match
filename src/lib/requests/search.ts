// Forgiving keyword search (#47 follow-up): several words in any order, upper/lower case, full-width/half-width,
// hiragana/katakana and separators (space - _ . ・) do not matter. Part of a word is enough.

function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const SEPARATORS = /[\s\-_.・,、。]+/g;

function compact(s: string): string {
  return s.replace(SEPARATORS, "");
}

/** True when every word of the query is found in the text (an empty query matches everything). */
export function matchesSearch(query: string, text: string): boolean {
  const q = fold(query).trim();
  if (!q) return true;
  const hay = fold(text);
  const hayCompact = compact(hay);
  return q
    .split(/[\s　]+/)
    .filter(Boolean)
    .every((word) => hay.includes(word) || hayCompact.includes(compact(word)));
}
