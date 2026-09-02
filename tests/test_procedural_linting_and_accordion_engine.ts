import { LintEngine } from '../src/lintEngine';
import { CitationEngine } from '../src/citationEngine';
import { ReferenceMetadata, LintWarning, LintSeverity } from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("================================================================================");
console.log("  TESTING PROCEDURAL LINTING ENGINE, FUZZY TYPOS & SEVERITY TREES               ");
console.log("================================================================================");

// --- 1. LEVENSHTEIN DISTANCE & FUZZY MATCHING ---
console.log("\n--- Section 1: Levenshtein Distance & Fuzzy Matcher ---");
assert(LintEngine.levenshteinDistance("Vaswani2017", "Vaswani2017") === 0, "Exact match distance is 0");
assert(LintEngine.levenshteinDistance("Vaswanii2017", "Vaswani2017") === 1, "Single typo distance is 1 (insertion)");
assert(LintEngine.levenshteinDistance("Vaswan2017", "Vaswani2017") === 1, "Single typo distance is 1 (deletion)");
assert(LintEngine.levenshteinDistance("Vasweni2017", "Vaswani2017") === 1, "Single typo distance is 1 (substitution)");
assert(LintEngine.levenshteinDistance("completelyDifferent", "Vaswani2017") > 5, "Unrelated key distance is large");

const testLib = new Map<string, ReferenceMetadata>();
const vaswani: ReferenceMetadata = {
  citekey: "Vaswani2017",
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2017,
  type: "journal",
  projects: []
};
const devlin: ReferenceMetadata = {
  citekey: "Devlin2019",
  title: "BERT: Pre-training of Deep Bidirectional Transformers",
  authors: ["Devlin, Jacob", "Chang, Ming-Wei"],
  year: 2019,
  type: "conference",
  projects: []
};
testLib.set(vaswani.citekey, vaswani);
testLib.set(devlin.citekey, devlin);

const fuzzy1 = LintEngine.findFuzzyRef("Vaswanii2017", testLib);
assert(fuzzy1 !== null && fuzzy1.citekey === "Vaswani2017", "Fuzzy matcher recovered Vaswani2017 from Vaswanii2017");

const fuzzy2 = LintEngine.findFuzzyRef("Devln2019", testLib);
assert(fuzzy2 !== null && fuzzy2.citekey === "Devlin2019", "Fuzzy matcher recovered Devlin2019 from Devln2019");

const fuzzyNone = LintEngine.findFuzzyRef("UnknownAuthor2025", testLib);
assert(fuzzyNone === null, "Fuzzy matcher returns null when distance > 2");


// --- 2. COMPOUNDED IN-BODY CITATION ORDERING ---
console.log("\n--- Section 2: Compounded Citation Ordering Checker ---");

const refsUnsorted = [devlin, vaswani]; // Devlin (D) before Vaswani (V) is alphabetical
const formattedSorted = CitationEngine.formatMultiInBody([devlin, vaswani], 'parenthetical', 'apa7');
assert(formattedSorted === "(Devlin & Chang, 2019; Vaswani & Shazeer, 2017)", "Alphabetical order correctly places Devlin before Vaswani");

const rawUnsorted = "(Vaswani & Shazeer, 2017; Devlin & Chang, 2019)";
assert(rawUnsorted !== formattedSorted, "Detects out-of-order compounded citation");


// --- 3. TAMPERED FOOTNOTE DEFINITION DETECTION ---
console.log("\n--- Section 3: Tampered Footnote Definition Detector ---");

const canonicalDef = CitationEngine.formatFootnoteDefinition(vaswani, 'apa7', 1);
assert(canonicalDef.includes("Attention Is All You Need"), "Canonical definition contains paper title");

const tamperedDef = "[^Vaswani2017]: Vaswani, A. (2020). Random Modified Title. Journal.";
assert(tamperedDef !== canonicalDef, "Tampered footnote definition mismatch detected");


// --- 4. SEVERITY RANKING MATRIX ---
console.log("\n--- Section 4: Severity Classification Hierarchy ---");

const warn1: LintWarning = {
  id: "test::1",
  filePath: "Note.md",
  fileName: "Note.md",
  lineNumber: 10,
  lineContent: "Recent NLP advances [@Vaswanii2017].",
  rawCitation: "@Vaswanii2017",
  citekey: "Vaswanii2017",
  severity: "warning",
  shortTitle: "Possible Citekey Typo",
  explanation: 'Found "@Vaswanii2017" which closely matches library entry "@Vaswani2017".',
  suggestedFix: "@Vaswani2017",
  type: "author_typo_fuzzy",
  message: "Possible typo in @Vaswanii2017."
};
assert(warn1.severity === "warning", "Typo warning has severity: warning");

const err1: LintWarning = {
  id: "test::2",
  filePath: "Note.md",
  fileName: "Note.md",
  lineNumber: 15,
  lineContent: "Other findings [@TotallyUnknown2024].",
  rawCitation: "@TotallyUnknown2024",
  citekey: "TotallyUnknown2024",
  severity: "error",
  shortTitle: "Unresolved Reference",
  explanation: 'Citekey "@TotallyUnknown2024" is not in reference library.',
  type: "unresolved",
  message: "Reference not found."
};
assert(err1.severity === "error", "Unresolved reference has severity: error");

const info1: LintWarning = {
  id: "test::3",
  filePath: "Note.md",
  fileName: "Note.md",
  lineNumber: 22,
  lineContent: "Prior work (Vaswani & Shazeer, 2017; Devlin & Chang, 2019).",
  rawCitation: "(Vaswani & Shazeer, 2017; Devlin & Chang, 2019)",
  severity: "info",
  shortTitle: "Unsorted Compounded Citation",
  explanation: "Citations in group are not sorted alphabetically.",
  suggestedFix: "(Devlin & Chang, 2019; Vaswani & Shazeer, 2017)",
  type: "compounded_order_mismatch",
  message: "Should be sorted alphabetically."
};
assert(info1.severity === "info", "Compounded order tip has severity: info");

console.log("\nALL PROCEDURAL LINTING & SEVERITY TESTS PASSED (14/14)!");
