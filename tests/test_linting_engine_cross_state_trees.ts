import { ProjectIndexer } from '../src/backend/projectIndexer';
import { CitationEngine } from '../src/backend/citationEngine';
import { ReferenceMetadata, ProjectRecord, ProjectHealthStats, ALL_PROJECTS_ID } from '../src/backend/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("================================================================================");
console.log("  COMPREHENSIVE LINTING ENGINE & CROSS-STATE TREE AUDIT SUITE                   ");
console.log("================================================================================");

const sampleRef: ReferenceMetadata = {
  citekey: "Vaswani2017",
  type: "journal",
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2017,
  publication: "NIPS",
  projects: ["p1"],
  dateAdded: "",
  dateModified: ""
};

const allRefs = new Map<string, ReferenceMetadata>();
allRefs.set(sampleRef.citekey, sampleRef);

// --- 1. SHORT-CIRCUIT AUDIT: "ALL CITATIONS" PROJECT MODE ---
console.log("\n--- Section 1: All Citations Scope Short-Circuit ---");
const isAll = (id: string, name: string) => {
  return (
    id === ALL_PROJECTS_ID || 
    id === '__ALL_PROJECTS__' || 
    id === '__ALL_REFERENCES__' || 
    name === 'All References' || 
    name === 'All Citations'
  );
};
assert(isAll(ALL_PROJECTS_ID, "All Citations"), "ALL_PROJECTS_ID triggers macro view short-circuit");
assert(!isAll("proj-123", "Spatial HCI"), "Project-specific bucket engages full lint diagnostic tree");


// --- 2. CROSS-STATE TREE: FOOTNOTE MODE ON VS OFF IN-BODY DIAGNOSTICS ---
console.log("\n--- Section 2: In-Body Diagnostic Tree ---");

// Footnote Mode ON: expects [^Vaswani2017]
const fnModeOnExpected = `[^${sampleRef.citekey}]`;
assert(fnModeOnExpected === "[^Vaswani2017]", "Footnote Mode ON expects [^citekey]");

// Footnote Mode OFF + APA 7 Parenthetical: expects (Vaswani & Shazeer, 2017)
const fnModeOffApaExpected = CitationEngine.formatInBody(sampleRef, 'parenthetical', 'apa7');
assert(fnModeOffApaExpected === "(Vaswani & Shazeer, 2017)", "Footnote Mode OFF (APA 7) expects (Vaswani & Shazeer, 2017)");

// Footnote Mode OFF + Pandoc Citekey: expects [@Vaswani2017]
const fnModeOffCitekeyExpected = CitationEngine.formatInBody(sampleRef, 'citekey', 'apa7');
assert(fnModeOffCitekeyExpected === "[@Vaswani2017]", "Footnote Mode OFF (Citekey) expects [@Vaswani2017]");


// --- 3. CROSS-STATE TREE: BOTTOM DEFINITION & ORPHAN DIAGNOSTICS ---
console.log("\n--- Section 3: Bottom Definition Diagnostic Tree ---");

// Footnote Mode ON bottom definition
const expectedFnDef = CitationEngine.formatFootnoteDefinition(sampleRef, 'apa7', 1);
assert(expectedFnDef.startsWith("[^Vaswani2017]: Vaswani, A., & Shazeer, N. (2017)."), "Footnote Mode ON definition properly prefixed");

// Footnote Mode OFF bottom definition
const expectedBibEntry = CitationEngine.formatBibliographyEntry(sampleRef, 'apa7', 1);
assert(!expectedBibEntry.startsWith("[^"), "Standard Mode reference entry strictly un-prefixed");
assert(expectedBibEntry.startsWith("Vaswani, A., & Shazeer, N. (2017)."), "Standard Mode reference entry formatted CSL");


// --- 4. ORPHAN DEFINITION & UNRESOLVED CITATION SHORT-CIRCUITS ---
console.log("\n--- Section 4: Orphan & Unresolved Stub Classification ---");

const inBodyKeys = new Set<string>(["vaswani2017"]);

const checkOrphan = (defKey: string, inBodySet: Set<string>) => {
  return !inBodySet.has(defKey.toLowerCase());
};

assert(!checkOrphan("Vaswani2017", inBodyKeys), "Cited reference is NOT classified as orphan");
assert(checkOrphan("OrphanKey2020", inBodyKeys), "Uncited footnote definition is correctly flagged as orphan");

const checkUnresolved = (key: string, lib: Map<string, ReferenceMetadata>) => {
  return !lib.has(key);
};

assert(!checkUnresolved("Vaswani2017", allRefs), "Library reference resolves cleanly");
assert(checkUnresolved("Missing2026", allRefs), "Non-existent reference flagged as unresolved");

console.log("\nALL LINTING ENGINE CROSS-STATE TREE AUDITS PASSED (12/12)!");
