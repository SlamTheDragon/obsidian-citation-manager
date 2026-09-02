import { CitationEngine } from '../src/backend/citationEngine';
import { ReferenceMetadata } from '../src/backend/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("================================================================================");
console.log("  COMPREHENSIVE CITATION PROPAGATION & STANDARDS INTEGRITY SUITE               ");
console.log("================================================================================");

// --- 1. MULTI-AUTHOR IN-BODY FORMATTING ACROSS STYLES ---
console.log("\n--- Section 1: Multi-Author In-Body Formatting ---");

const ref1: ReferenceMetadata = {
  citekey: "Smith2024",
  type: "journal",
  title: "Ultrasound Simulation",
  authors: ["Smith, John"],
  year: 2024,
  projects: ["p1"],
  dateAdded: "",
  dateModified: ""
};

const ref2: ReferenceMetadata = {
  citekey: "SmithJones2024",
  type: "journal",
  title: "Dual Haptic Interfaces",
  authors: ["Smith, John", "Jones, Alice"],
  year: 2024,
  projects: ["p1"],
  dateAdded: "",
  dateModified: ""
};

const ref3: ReferenceMetadata = {
  citekey: "SmithJonesBrown2024",
  type: "journal",
  title: "Tripartite Sensory Integration",
  authors: ["Smith, John", "Jones, Alice", "Brown, Charles"],
  year: 2024,
  projects: ["p1"],
  dateAdded: "",
  dateModified: ""
};

const ref4: ReferenceMetadata = {
  citekey: "SmithEtAl2024",
  type: "journal",
  title: "Frontier Haptics",
  authors: ["Smith, John", "Jones, Alice", "Brown, Charles", "Taylor, Robert"],
  year: 2024,
  projects: ["p1"],
  dateAdded: "",
  dateModified: ""
};

// APA 7 In-Body
assert(CitationEngine.formatInBody(ref1, 'parenthetical', 'apa7') === "(Smith, 2024)", "APA 7: 1 author parenthetical");
assert(CitationEngine.formatInBody(ref1, 'narrative', 'apa7') === "Smith (2024)", "APA 7: 1 author narrative");
assert(CitationEngine.formatInBody(ref2, 'parenthetical', 'apa7') === "(Smith & Jones, 2024)", "APA 7: 2 authors parenthetical with &");
assert(CitationEngine.formatInBody(ref2, 'narrative', 'apa7') === "Smith and Jones (2024)", "APA 7: 2 authors narrative with and");
assert(CitationEngine.formatInBody(ref3, 'parenthetical', 'apa7') === "(Smith et al., 2024)", "APA 7: 3 authors parenthetical et al.");
assert(CitationEngine.formatInBody(ref4, 'narrative', 'apa7') === "Smith et al. (2024)", "APA 7: 4 authors narrative et al.");

// Chicago Author-Date In-Body
assert(CitationEngine.formatInBody(ref1, 'parenthetical', 'chicago') === "(Smith 2024)", "Chicago: 1 author parenthetical (no comma)");
assert(CitationEngine.formatInBody(ref2, 'parenthetical', 'chicago') === "(Smith and Jones 2024)", "Chicago: 2 authors parenthetical with and");
assert(CitationEngine.formatInBody(ref3, 'parenthetical', 'chicago') === "(Smith, Jones, and Brown 2024)", "Chicago: 3 authors parenthetical full list");
assert(CitationEngine.formatInBody(ref4, 'parenthetical', 'chicago') === "(Smith et al. 2024)", "Chicago: 4+ authors parenthetical et al.");

// Harvard In-Body
assert(CitationEngine.formatInBody(ref1, 'parenthetical', 'harvard') === "(Smith 2024)", "Harvard: 1 author parenthetical");
assert(CitationEngine.formatInBody(ref2, 'parenthetical', 'harvard') === "(Smith and Jones 2024)", "Harvard: 2 authors parenthetical");
assert(CitationEngine.formatInBody(ref4, 'parenthetical', 'harvard') === "(Smith et al. 2024)", "Harvard: 4+ authors parenthetical");

// IEEE & Vancouver In-Body
assert(CitationEngine.formatInBody(ref1, 'parenthetical', 'ieee', 5) === "[5]", "IEEE: parenthetical index [5]");
assert(CitationEngine.formatInBody(ref1, 'narrative', 'ieee', 5) === "Smith [5]", "IEEE: narrative Author [5]");
assert(CitationEngine.formatInBody(ref1, 'parenthetical', 'vancouver', 3) === "(3)", "Vancouver: parenthetical index (3)");
assert(CitationEngine.formatInBody(ref1, 'narrative', 'vancouver', 3) === "Smith (3)", "Vancouver: narrative Author (3)");


// --- 2. MULTI-CITATION BRACKET & PARENTHETICAL GROUPING ---
console.log("\n--- Section 2: Multi-Citation In-Body Grouping ---");

const multiAPA = CitationEngine.formatMultiInBody([ref2, ref1], 'parenthetical', 'apa7');
console.log(`Multi APA: ${multiAPA}`);
assert(multiAPA === "(Smith, 2024; Smith & Jones, 2024)", "APA 7 multi-citation grouped & sorted");

const multiChicago = CitationEngine.formatMultiInBody([ref3, ref1], 'parenthetical', 'chicago');
console.log(`Multi Chicago: ${multiChicago}`);
assert(multiChicago === "(Smith 2024; Smith, Jones, and Brown 2024)", "Chicago multi-citation grouped & sorted");

const multiIEEE = CitationEngine.formatMultiInBody([ref1, ref2, ref3], 'parenthetical', 'ieee', 1);
console.log(`Multi IEEE: ${multiIEEE}`);
assert(multiIEEE === "[1, 2, 3]", "IEEE multi-citation bracket index list");

const multiVancouver = CitationEngine.formatMultiInBody([ref1, ref2], 'parenthetical', 'vancouver', 1);
console.log(`Multi Vancouver: ${multiVancouver}`);
assert(multiVancouver === "(1, 2)", "Vancouver multi-citation paren index list");


// --- 3. ALL RESOURCE TYPES CITATION BENCHMARK ---
console.log("\n--- Section 3: Cross-Resource Citation Benchmark ---");

const journalRef: ReferenceMetadata = {
  citekey: "Vaswani2017",
  type: "journal",
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2017,
  publication: "Advances in Neural Information Processing Systems",
  volume: "30",
  pages: "5998-6008",
  doi: "10.48550/arXiv.1706.03762",
  projects: ["ml"],
  dateAdded: "",
  dateModified: ""
};

const bookRef: ReferenceMetadata = {
  citekey: "Sutton2018",
  type: "book",
  title: "Reinforcement Learning: An Introduction",
  authors: ["Sutton, Richard S.", "Barto, Andrew G."],
  year: 2018,
  publisher: "MIT Press",
  isbn: "9780262039246",
  projects: ["ml"],
  dateAdded: "",
  dateModified: ""
};

const webRef: ReferenceMetadata = {
  citekey: "Anthropic2026",
  type: "webpage",
  title: "Constitutional AI Principles and Architecture",
  authors: ["Anthropic"],
  year: 2026,
  publication: "Anthropic Research",
  url: "https://www.anthropic.com/research/constitutional-ai",
  accessedDate: "September 2, 2026",
  projects: ["safety"],
  dateAdded: "",
  dateModified: ""
};

// Journal Assertions
const apaJournal = CitationEngine.formatAPA7(journalRef);
assert(apaJournal.includes("Vaswani, A., & Shazeer, N. (2017). Attention Is All You Need. *Advances in Neural Information Processing Systems*, *30*, 5998-6008. https://doi.org/10.48550/arXiv.1706.03762"), "APA 7 Journal matches specification");

// Book Assertions
const apaBook = CitationEngine.formatAPA7(bookRef);
assert(apaBook.includes("Sutton, R. S., & Barto, A. G. (2018). *Reinforcement Learning: An Introduction.* MIT Press."), "APA 7 Book matches specification");

// Webpage Assertions
const apaWeb = CitationEngine.formatAPA7(webRef);
console.log(`APA Web: ${apaWeb}`);
assert(apaWeb.includes("Anthropic. (2026). *Constitutional AI Principles and Architecture.* Anthropic Research. Retrieved September 2, 2026, from https://www.anthropic.com/research/constitutional-ai"), "APA 7 Webpage matches specification");

const ieeeWeb = CitationEngine.formatIEEE(webRef, 1);
assert(ieeeWeb.includes("[1] Anthropic, \"Constitutional AI Principles and Architecture,\" *Anthropic Research*, 2026. Accessed: September 2, 2026. [Online]. Available: https://www.anthropic.com/research/constitutional-ai."), "IEEE Webpage matches specification");


// --- 4. RECURRING AUTHORS MULTI-TIER SORTING & BIBLIOGRAPHY INTEGRITY ---
console.log("\n--- Section 4: Multi-Tier Chronological Sorting ---");

const testCorpus: ReferenceMetadata[] = [
  { citekey: "Zheng2025", type: "journal", title: "Zero Shot Reasoning", authors: ["Zheng, Long"], year: 2025, projects: [], dateAdded: "", dateModified: "" },
  { citekey: "Smith2024b", type: "journal", title: "B Applied Haptics", authors: ["Smith, John"], year: 2024, projects: [], dateAdded: "", dateModified: "" },
  { citekey: "Smith2021", type: "journal", title: "Foundational Waves", authors: ["Smith, John"], year: 2021, projects: [], dateAdded: "", dateModified: "" },
  { citekey: "Smith2024a", type: "journal", title: "A Mid-Air Arrays", authors: ["Smith, John"], year: 2024, projects: [], dateAdded: "", dateModified: "" },
  { citekey: "SmithJones2023", type: "journal", title: "Co-authored Systems", authors: ["Smith, John", "Jones, Alice"], year: 2023, projects: [], dateAdded: "", dateModified: "" }
];

const sortedCorpus = CitationEngine.sortReferences(testCorpus, 'apa7');
assert(sortedCorpus[0].citekey === "Smith2021", "Smith 2021 chronologically first");
assert(sortedCorpus[1].citekey === "Smith2024a", "Smith 2024a title 'A' before 'B'");
assert(sortedCorpus[2].citekey === "Smith2024b", "Smith 2024b title 'B'");
assert(sortedCorpus[3].citekey === "SmithJones2023", "Smith co-authored after single author");
assert(sortedCorpus[4].citekey === "Zheng2025", "Zheng alphabetically after Smith");

console.log("\nALL 27/27 PROPAGATION & INTEGRITY ASSERTIONS PASSED WITH ZERO ERRORS!");
