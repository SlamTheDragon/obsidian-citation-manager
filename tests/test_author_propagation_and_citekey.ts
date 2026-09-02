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
console.log("  TESTING AUTHOR FIRST/LAST NAME PARSING, CSL PROPAGATION & CITEKEY DERIVATION   ");
console.log("================================================================================");

// --- CASE 1: Standard Academic "Lastname, Firstname" format ---
console.log("\n--- Case 1: Academic 'Lastname, Firstname' input ---");
const refLastFirst: ReferenceMetadata = {
  citekey: "",
  type: "journal",
  title: "Phantom Tactile Sensation in Mid-Air Ultrasound Arrays",
  authors: ["Li, Ziheng", "Carter, Tom", "Subramanian, Sriram"],
  year: 2026,
  publication: "ACM TOCHI",
  projects: ["spatial-hci"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString(),
};

const citekey1 = CitationEngine.generateCitekey(refLastFirst.authors, refLastFirst.year, refLastFirst.title);
assert(citekey1 === "Li2026", `Auto-derived citekey from Lastname, Firstname: expected Li2026, got ${citekey1}`);

const apa1 = CitationEngine.formatAPA7(refLastFirst);
assert(apa1.includes("Li, Z., Carter, T., & Subramanian, S. (2026)"), `APA 7: ${apa1}`);

const ieee1 = CitationEngine.formatIEEE(refLastFirst, 1);
assert(ieee1.includes("[1] Z. Li, T. Carter, and S. Subramanian"), `IEEE: ${ieee1}`);

const harvard1 = CitationEngine.formatHarvard(refLastFirst);
assert(harvard1.includes("Li, Z., Carter, T. and Subramanian, S. (2026)"), `Harvard: ${harvard1}`);

const chicago1 = CitationEngine.formatChicago(refLastFirst);
assert(chicago1.includes("Li, Ziheng, Tom Carter, and Sriram Subramanian"), `Chicago: ${chicago1}`);

const inbody1 = CitationEngine.formatInBody(refLastFirst, 'parenthetical', 'apa7');
assert(inbody1 === "(Li et al., 2026)", `In-body parenthetical: ${inbody1}`);

const narrative1 = CitationEngine.formatInBody(refLastFirst, 'narrative', 'apa7');
assert(narrative1 === "Li et al. (2026)", `In-body narrative: ${narrative1}`);

// --- CASE 2: Natural "Firstname Lastname" format ---
console.log("\n--- Case 2: Natural 'Firstname Lastname' input ---");
const refFirstLast: ReferenceMetadata = {
  citekey: "",
  type: "journal",
  title: "Phantom Tactile Sensation in Mid-Air Ultrasound Arrays",
  authors: ["Ziheng Li", "Tom Carter", "Sriram Subramanian"],
  year: 2026,
  publication: "ACM TOCHI",
  projects: ["spatial-hci"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString(),
};

const citekey2 = CitationEngine.generateCitekey(refFirstLast.authors, refFirstLast.year, refFirstLast.title);
assert(citekey2 === "Li2026", `Auto-derived citekey from Firstname Lastname: expected Li2026, got ${citekey2}`);

const apa2 = CitationEngine.formatAPA7(refFirstLast);
assert(apa2.includes("Li, Z., Carter, T., & Subramanian, S. (2026)"), `APA 7: ${apa2}`);

const ieee2 = CitationEngine.formatIEEE(refFirstLast, 1);
assert(ieee2.includes("[1] Z. Li, T. Carter, and S. Subramanian"), `IEEE: ${ieee2}`);

const inbody2 = CitationEngine.formatInBody(refFirstLast, 'parenthetical', 'apa7');
assert(inbody2 === "(Li et al., 2026)", `In-body parenthetical: ${inbody2}`);

// --- CASE 3: Dynamic Citekey Recalculation on Field Mutation ---
console.log("\n--- Case 3: Dynamic Citekey Recalculation ---");
let currentAuthors = ["Vaswani, Ashish"];
let currentYear: number | string = 2026;
let currentTitle = "Attention Is All You Need";

let dynamicKey = CitationEngine.generateCitekey(currentAuthors, currentYear, currentTitle);
assert(dynamicKey === "Vaswani2026", `Initial citekey: ${dynamicKey}`);

// User changes first author
currentAuthors = ["Devlin, Jacob", "Chang, Ming-Wei"];
dynamicKey = CitationEngine.generateCitekey(currentAuthors, currentYear, currentTitle);
assert(dynamicKey === "Devlin2026", `Updated author citekey: expected Devlin2026, got ${dynamicKey}`);

// User changes year
currentYear = 2019;
dynamicKey = CitationEngine.generateCitekey(currentAuthors, currentYear, currentTitle);
assert(dynamicKey === "Devlin2019", `Updated year citekey: expected Devlin2019, got ${dynamicKey}`);

// Fallback to title when author is unknown
currentAuthors = ["Unknown Author"];
dynamicKey = CitationEngine.generateCitekey(currentAuthors, currentYear, "BERT: Pre-training of Deep Bidirectional Transformers");
assert(dynamicKey === "BERT2019", `Title fallback citekey: expected BERT2019, got ${dynamicKey}`);

console.log("\nALL AUTHOR FIRST/LAST NAME & DYNAMIC CITEKEY TESTS PASSED (15/15)!");
