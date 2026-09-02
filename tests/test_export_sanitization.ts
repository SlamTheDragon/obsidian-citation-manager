import { CitationEngine } from '../src/backend/citationEngine';
import { ReferenceMetadata } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING IEEE BRACKET OVERLOADING & EXPORT SANITIZATION                        ");
console.log("================================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failed++;
    throw new Error(msg);
  } else {
    passed++;
  }
}

// 1. In IEEE, multiple citations must be coalesced into single bracket [1, 2]
const ref1: ReferenceMetadata = { citekey: "Chen2024", title: "Paper 1", authors: ["Chen, Q."], year: 2024, type: "journal", projects: [], dateAdded: "", dateModified: "" };
const ref2: ReferenceMetadata = { citekey: "Spape2024", title: "Paper 2", authors: ["Spapé, M."], year: 2024, type: "journal", projects: [], dateAdded: "", dateModified: "" };
const ref3: ReferenceMetadata = { citekey: "Jacucci2024", title: "Paper 3", authors: ["Jacucci, G."], year: 2024, type: "journal", projects: [], dateAdded: "", dateModified: "" };

const multiIEEE = CitationEngine.formatMultiInBody([ref1, ref2, ref3], 'parenthetical', 'ieee', [1, 2, 3]);
assert(multiIEEE === "[1, 2, 3]", `IEEE Multi-citation was not grouped: ${multiIEEE}`);
console.log(`[PASS] IEEE Multi-citation correctly formatted as single bracket: ${multiIEEE}`);

// 2. Sanitization helper: Coalesce accidental adjacent [1][2] or [1] [2] in raw text
function sanitizeIEEEText(rawText: string): string {
  // Coalesce adjacent numeric brackets [1][2] or [1] [2] -> [1, 2]
  let sanitized = rawText;
  const adjacentBracketRegex = /\[(\d+(?:\s*,\s*\d+)*)\]\s*\[(\d+(?:\s*,\s*\d+)*)\]/g;
  while (adjacentBracketRegex.test(sanitized)) {
    sanitized = sanitized.replace(adjacentBracketRegex, '[$1, $2]');
  }
  return sanitized;
}

const rawCorruptedText = "Prior studies [1][2] and later tests [3] [4] confirmed findings.";
const sanitized = sanitizeIEEEText(rawCorruptedText);
assert(sanitized === "Prior studies [1, 2] and later tests [3, 4] confirmed findings.", `Sanitization failed: ${sanitized}`);
console.log(`[PASS] Adjacent bracket coalescing: "${rawCorruptedText}" -> "${sanitized}"`);

// 3. Optional Escaping for Non-Coalesced Isolated Brackets during Raw Markdown Export
function escapeMarkdownBrackets(text: string): string {
  // Escapes lone [N] that might collide with reference-link definitions
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '\\[$1\\]');
}

const escaped = escapeMarkdownBrackets(sanitized);
assert(escaped === "Prior studies \\[1, 2\\] and later tests \\[3, 4\\] confirmed findings.", `Escaping failed: ${escaped}`);
console.log(`[PASS] Markdown bracket escaping verified: ${escaped}`);

console.log(`\nALL EXPORT SANITIZATION TESTS PASSED (${passed}/${passed})!`);
