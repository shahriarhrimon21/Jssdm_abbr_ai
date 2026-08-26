/**
 * Ported from /tmp/mil/shell_bottom.html's runValidate. Logic is unchanged;
 * the original vanilla-JS version built raw HTML strings for the evidence
 * blocks (capIssueBlock/verifiedBlock/ruleSupportedBlock) since it rendered
 * by string concatenation. React renders from data instead, so those three
 * block-builders are ported here as structured EvidenceBlock objects with
 * the exact same fields (entered/expected/reason/source, or
 * input/result/reason/reference) — the presentation component in
 * src/components renders them, nothing here changed what is said.
 */
import type { Entry, RuleMatch } from "./types.ts";
import { fmtSource, RULEBYID } from "./database.ts";
import { isSentenceStart, findCaseMismatch, looksLikeAbbr } from "./parser.ts";
import { scanAbbrMatches } from "./deabbreviationEngine.ts";
import type { AbbrScanMatch } from "./deabbreviationEngine.ts";
import { checkConsistency } from "./consistency.ts";

export const WRITING_TYPES = [
  { id: "operational", label: "Operational writing / signal message" },
  { id: "nonoperational", label: "Non-operational writing (general)" },
  { id: "demiofficial", label: "Demi-official letter" },
  { id: "commanded", label: "Commanded letter" },
  { id: "formal", label: "Formal letter" },
  { id: "allied", label: "Correspondence with allied forces / non-service authorities" },
] as const;
export type WritingTypeId = (typeof WRITING_TYPES)[number]["id"];
export const RESTRICTED_TYPES: Record<string, 1> = { demiofficial: 1, commanded: 1, formal: 1 };

export const CAP_FIXED_REASON =
  "Section 2, Para 0241b(8) fixes an abbreviation's letter-case exactly as shown in Section 16, and it does not change with position in a sentence. Section 2, Para 0267-0268 (the general \"Capitals\" rules for sentence openings, headings, proper nouns, etc.) were checked directly: their only abbreviation-specific item (0267j / 0268j) references this same fixed-capital set and adds no separate sentence-position exception.";
export const CAP_SOURCE = "JSSDM Section 2, Para 0241b(8) (cross-checked against Para 0267-0268); Section 16";

export type EvidenceBlock =
  | { kind: "cap-issue"; entered: string; expected: string; reason: string; source: string }
  | { kind: "verified"; label: string; input: string; result: string | null; reason: string; reference: string }
  | { kind: "rule-supported"; input: string; result: string; reason: string; reference: string };

export type FindingLevel = "ok" | "warn" | "bad";
export interface Finding {
  level: FindingLevel;
  text?: string;
  block?: EvidenceBlock;
  rule: string | null;
}

export interface ValidateResult {
  overall: FindingLevel;
  findings: Finding[];
  abbrMatches: AbbrScanMatch[];
  writingType: string;
}

export function runValidate(text: string, writingType: string, force: string | null | undefined): ValidateResult {
  const scan1 = scanAbbrMatches(text, force);
  const tokens = scan1.tokens;
  const abbrMatches = scan1.matches;
  const findings: Finding[] = [];
  let worst: FindingLevel = "ok";
  function worsen(level: FindingLevel) {
    if (level === "bad") worst = "bad";
    else if (level === "warn" && worst !== "bad") worst = "warn";
  }

  abbrMatches.forEach((m) => {
    const e = m.entries[0];
    const isDecorQual = /decoration|qualification/i.test(e.category) || e.category === "Rank";
    if (writingType === "allied") {
      findings.push({
        level: "bad",
        text: '"' + m.text + '" — Section 16 abbreviations are not used in correspondence with allied forces or non-service authorities (rule 0241d). Write in full.',
        rule: "r0241d",
      });
      worsen("bad");
    } else if (RESTRICTED_TYPES[writingType] && !isDecorQual) {
      findings.push({
        level: "warn",
        text: '"' + m.text + '" — abbreviations are not normally used in demi-official, commanded, or formal letters except for decorations, qualifications, and Arms/Services (rule 0241c). Consider writing "' + e.full + '" in full.',
        rule: "r0241c",
      });
      worsen("warn");
    }
    if (m.forceStatus === "wrong-force") {
      findings.push({
        level: "warn",
        text: '"' + m.text + '" is only listed for ' + (e.service || "a specific force") + " in the manual, not the selected force. Confirm applicability before use.",
        rule: null,
      });
      worsen("warn");
    } else if (m.entries.length > 1) {
      findings.push({
        level: "warn",
        text: '"' + m.text + '" has more than one authorized meaning in the manual (see Annex B / multiple entries). Confirm from context: ' + m.entries.map((x) => x.full).join(" / ") + ".",
        rule: "r1604",
      });
      worsen("warn");
    }
    if (m.note === "rule-plural" && m.ruleInfo) {
      const ri = m.ruleInfo as RuleMatch;
      findings.push({
        level: "warn",
        block: { kind: "rule-supported", input: m.text, result: ri.full!, reason: ri.reason, reference: RULEBYID[ri.rule].source },
        rule: ri.rule,
      });
    } else {
      /* Exact-case match already means the entered text matches Section 16
         letter-for-letter. Surface the auditable "which rule was applied"
         evidence for the two cases where capitalization is actually doing
         work — a fixed-initial-capital entry (e.g. "Dir", "Atk"), or a
         lowercase-first entry used as the opening word of a sentence, which
         is exactly the case the reconciled 0241b(8)/0267-0268 reading
         governs — rather than annotating every ordinary mid-sentence match. */
      const capOk = e.abbr[0] === e.abbr[0].toUpperCase();
      const atStart = isSentenceStart(text, m.start);
      if (capOk) {
        findings.push({
          level: "ok",
          block: {
            kind: "verified",
            label: "Verified",
            input: m.text,
            result: e.full,
            reason: 'Capitalization matches Section 16 exactly ("' + e.abbr + '"); by Section 2, Para 0241b(8) this case is fixed and applies regardless of position in the sentence.',
            reference: RULEBYID.r0241b8.source,
          },
          rule: "r0241b8",
        });
      } else if (atStart) {
        findings.push({
          level: "ok",
          block: {
            kind: "verified",
            label: "Verified",
            input: m.text,
            result: e.full,
            reason: '"' + e.abbr + '" is stored fully lowercase in Section 16; Section 2, Para 0241b(8) fixes this case regardless of sentence position, and Para 0267-0268 add no sentence-initial-capitalization exception for it — so it is correctly written lowercase here even though it opens the sentence.',
            reference: RULEBYID.r0241b8.source,
          },
          rule: "r0241b8",
        });
      }
    }
  });

  /* case mismatches: tokens that look like an abbreviation but only match case-insensitively.
     Position in the sentence is deliberately NOT part of the expected case (see
     findCaseMismatch/CAP_FIXED_REASON) — Section 2, Para 0241b(8), cross-checked
     against Para 0267-0268, fixes it regardless of where the token falls. */
  const covered1 = new Set<number>();
  abbrMatches.forEach((m) => {
    for (let p = m.start; p < m.end; p++) covered1.add(p);
  });
  tokens.forEach((t) => {
    if (covered1.has(t.start)) return;
    const cm = findCaseMismatch(t.text, text, t.start);
    if (cm) {
      findings.push({
        level: "bad",
        block: { kind: "cap-issue", entered: t.text, expected: cm.expected.join(" / "), reason: CAP_FIXED_REASON, source: CAP_SOURCE },
        rule: "r0241b8",
      });
      worsen("bad");
    }
  });

  const consistency = checkConsistency(text, force);
  consistency.forEach((c) => {
    findings.push({
      level: "warn",
      text: '"' + c.concept + '" is written inconsistently: ' + c.forms.map((f) => '"' + f.surface + '"').join(", ") + ". Use one form throughout the document (rule 0241a(3)).",
      rule: "r0241a3",
    });
    worsen("warn");
  });

  const flaggedTokens: string[] = [];
  tokens.forEach((t) => {
    const covered = abbrMatches.some((m) => t.start >= m.start && t.end <= m.end);
    const isCaseMismatch = findCaseMismatch(t.text, text, t.start);
    if (!covered && !isCaseMismatch && looksLikeAbbr(t.text)) {
      flaggedTokens.push(t.text);
    }
  });
  if (flaggedTokens.length) {
    findings.push({
      level: "bad",
      text: "No authoritative entry found in the uploaded manual for: " + flaggedTokens.join(", ") + ". Cannot verify — do not treat as an approved abbreviation.",
      rule: null,
    });
    worsen("bad");
  }

  if (findings.length === 0) {
    findings.push({ level: "ok", text: "No abbreviation issues detected against the extracted manual text for the selected writing type.", rule: null });
  }

  return { overall: worst, findings, abbrMatches, writingType };
}
