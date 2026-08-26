/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html (tokenization, greedy-window
 * scanning, case-sensitivity / sentence-position handling per Section 2,
 * Para 0241b(8) reconciled against Para 0267-0268, and fuzzy suggestion
 * matching). No logic changed — typed and modularized only.
 */
import type { Entry, Token } from "./types.ts";
import { abbrIndexCS, lookupAbbrCI } from "./database.ts";

/** ---------- Tokenization ---------- */
export function findWordTokens(text: string): Token[] {
  const re = /[A-Za-z0-9][A-Za-z0-9&'-]*/g;
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Greedy longest-match window search over word tokens using a lookup function.
 *  lookupFn(phraseString, tokenCount, startIndex) -> array of entries or null. */
export interface WindowMatch<T> {
  start: number;
  end: number;
  text: string;
  entries: T;
}
export function scanWindows<T>(
  text: string,
  tokens: Token[],
  maxWords: number,
  lookupFn: (phrase: string, w: number, i: number) => T | null,
): WindowMatch<T>[] {
  const matches: WindowMatch<T>[] = [];
  let i = 0;
  while (i < tokens.length) {
    let found: T | null = null;
    let usedW = 0;
    const maxW = Math.min(maxWords, tokens.length - i);
    for (let w = maxW; w >= 1; w--) {
      const startTok = tokens[i];
      const endTok = tokens[i + w - 1];
      const phrase = text.slice(startTok.start, endTok.end);
      const res = lookupFn(phrase, w, i);
      if (res) {
        found = res;
        usedW = w;
        break;
      }
    }
    if (found) {
      matches.push({
        start: tokens[i].start,
        end: tokens[i + usedW - 1].end,
        text: text.slice(tokens[i].start, tokens[i + usedW - 1].end),
        entries: found,
      });
      i += usedW;
    } else {
      i += 1;
    }
  }
  return matches;
}

/** ---------- Case sensitivity & sentence position (Section 2, Para 0241b(8),
 *  reconciled against Para 0267-0268) ----------------------------------------
 *  0241b(8): if an abbreviation's first letter is shown in capitals in Section
 *  16, it is written in capitals throughout its use anywhere - case is fixed
 *  and POSITION-INDEPENDENT, so "addl"/"Addl"/"ADDL" are NOT automatically
 *  equivalent, and this does not change at the start of a sentence.
 *  0267/0268 ("Capitals"): a separate, later list of general document
 *  capitalization conventions (headings, proper nouns, the opening word of a
 *  sentence, etc). Its only abbreviation-specific item (0267j / 0268j) reads
 *  "certain abbreviations that are already capitals as shown in Section 16" -
 *  i.e. it cross-references the SAME fixed-capital set as 0241b(8); it is not
 *  a separate instruction to capitalize an otherwise-lowercase abbreviation
 *  because it opens a sentence. Verified directly against real Section 16
 *  data: "Tank" -> "tk" is stored fully lowercase, and "Tk" is itself a
 *  DIFFERENT, distinct explicit entry ("Taka", the currency) - so a
 *  sentence-initial "Tk" is read as Taka, not as a capitalized Tank, and
 *  "tk" stays lowercase in every position, sentence-initial included. */
export function isSentenceStart(text: string, pos: number): boolean {
  let i = pos - 1;
  while (i >= 0 && /[\s"'“‘()]/.test(text[i])) i--;
  if (i < 0) return true;
  return /[.!?]/.test(text[i]);
}
export function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}
export function upperFirst(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/* Ordinary English function words that happen to coincide, case-insensitively,
   with a real Section 16 code (e.g. "is"/IS, "in"/IN, "at"/AT, "or"/OR, "do"/DO,
   "as"/AS, "so"/SO, "no"/NO, "be"/BE, "it"/IT). In free-flowing prose these are
   read as ordinary English virtually all the time, not as the abbreviation — the
   same reasoning already applied to Units of Measurement (only accepted in the
   one context the manual authorizes) is applied here: exclude them from the
   case-mismatch check entirely rather than flag every "is"/"in"/"at" in a
   document as a capitalization error. */
export const COMMON_ENGLISH_WORDS: Set<string> = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "in", "on", "at", "by", "to", "of", "for", "from", "with", "as", "or", "and", "but", "if", "so", "no", "not",
  "it", "its", "he", "she", "we", "you", "they", "this", "that", "these", "those", "do", "does", "did", "has",
  "have", "had", "will", "would", "can", "could", "may", "might", "shall", "should", "must", "up", "down",
  "out", "off", "over", "under", "into", "onto", "than", "then", "also", "all", "any", "one",
]);

export function looksLikeAbbr(tok: string): boolean {
  if (!/[A-Za-z]/.test(tok)) return false; /* pure numbers (dates, quantities) are never abbreviation-shaped */
  if (/[&\d]/.test(tok)) return true;
  if (tok.length >= 2 && tok.length <= 8 && tok === tok.toUpperCase() && /[A-Z]/.test(tok)) return true;
  return false;
}

export interface CaseMismatch {
  entries: Entry[];
  expected: string[];
  atStart: boolean;
}

/** Given a token that failed exact case-sensitive lookup, check whether it matches
 *  a known abbreviation with different capitalization - a genuine case mismatch to
 *  flag, distinct from an OCR/typo (different letters). Expected case is always
 *  exactly the stored Section 16 form - position in the sentence never changes it
 *  (see note above), per 0241b(8) as reconciled with 0267/0268. */
export function findCaseMismatch(token: string, text: string, pos: number): CaseMismatch | null {
  if (COMMON_ENGLISH_WORDS.has(token.toLowerCase())) return null;
  const ci = lookupAbbrCI(token);
  if (!ci) return null;
  const atStart = isSentenceStart(text, pos);
  const expected: string[] = [];
  ci.forEach((e) => {
    if (expected.indexOf(e.abbr) === -1) expected.push(e.abbr);
  });
  if (expected.length === 1 && expected[0] === token) return null; /* not actually a mismatch */
  return { entries: ci, expected, atStart };
}

export function levenshtein(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

export interface FuzzyMatch {
  abbr: string;
  dist: number;
  entries: Entry[];
}
export function fuzzyAbbrMatches(token: string, maxDist?: number): FuzzyMatch[] {
  maxDist = maxDist || 1;
  if (token.length < 3) return [];
  const out: FuzzyMatch[] = [];
  abbrIndexCS.forEach((list, key) => {
    if (Math.abs(key.length - token.length) > maxDist!) return;
    const d = levenshtein(key, token);
    if (d > 0 && d <= maxDist!) out.push({ abbr: key, dist: d, entries: list });
  });
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, 5);
}
