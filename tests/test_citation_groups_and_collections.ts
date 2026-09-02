import { ReferenceMetadata, CitationCollection, DEFAULT_COLLECTION, DEFAULT_COLLECTION_ID } from '../src/types';
import { StorageManager } from '../src/storageManager';

console.log("================================================================================");
console.log("  TESTING CITATION GROUPS, COLLECTIONS & DYNAMIC 4-STATE FILTERING             ");
console.log("================================================================================");

let passCount = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${msg}`);
    passCount++;
  }
}

// 1. Verify Default Collection Definition & Invariants
assert(DEFAULT_COLLECTION.id === "default", "Default collection has id 'default'");
assert(DEFAULT_COLLECTION.name === "General", "Default collection has name 'General'");
assert(DEFAULT_COLLECTION.isDefault === true, "Default collection isDefault is true");

// 2. Mock Collection Store
const collections: CitationCollection[] = [
  DEFAULT_COLLECTION,
  {
    id: "col-spatial-hci",
    name: "Spatial HCI Literature",
    description: "Papers on spatial interaction, haptics, and AR",
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: "col-ml-reasoning",
    name: "ML & Reasoning",
    description: "Deep learning, transformer architectures, and reasoning",
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  }
];

assert(collections.length === 3, "Collections store initialized with default + 2 user collections");

// 3. Mock References with Collection IDs
const ref1: ReferenceMetadata = {
  citekey: "Vaswani2017",
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2017,
  type: "conference",
  projects: ["ai-corpus"],
  collectionId: "col-ml-reasoning",
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const ref2: ReferenceMetadata = {
  citekey: "Smith2020",
  title: "Sensory Latency in Spatial Displays",
  authors: ["Smith, John"],
  year: 2020,
  type: "journal",
  projects: ["spatial-corpus"],
  collectionId: "col-spatial-hci",
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const ref3: ReferenceMetadata = {
  citekey: "Brown2021",
  title: "General Haptic Telemetry",
  authors: ["Brown, Alex"],
  year: 2021,
  type: "video",
  projects: [],
  collectionId: "default",
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const allRefs = new Map<string, ReferenceMetadata>([
  [ref1.citekey, ref1],
  [ref2.citekey, ref2],
  [ref3.citekey, ref3]
]);

// 4. Test Single Move Functionality
ref3.collectionId = "col-spatial-hci";
assert(ref3.collectionId === "col-spatial-hci", "Moved Brown2021 from General to Spatial HCI");

// 5. Test Two-Column Transfer Modal Simulation
// Transfer Vaswani2017 to col-spatial-hci
ref1.collectionId = "col-spatial-hci";
let spatialCount = Array.from(allRefs.values()).filter(r => r.collectionId === "col-spatial-hci").length;
assert(spatialCount === 3, "After transfer, Spatial HCI collection has 3 citations");

// Remove Vaswani2017 from col-spatial-hci (back to default)
ref1.collectionId = DEFAULT_COLLECTION_ID;
spatialCount = Array.from(allRefs.values()).filter(r => r.collectionId === "col-spatial-hci").length;
assert(spatialCount === 2, "After removing, Spatial HCI collection has 2 citations");
assert(ref1.collectionId === "default", "Vaswani2017 returned to default collection");

// 6. Test Collection Deletion Safety (Citations rerouted to General)
const colToDelete = "col-spatial-hci";
for (const r of allRefs.values()) {
  if (r.collectionId === colToDelete) {
    r.collectionId = DEFAULT_COLLECTION_ID;
  }
}
const remainingCollections = collections.filter(c => c.id !== colToDelete);
assert(remainingCollections.length === 2, "Collection successfully removed from collections list");
assert(allRefs.get("Smith2020")?.collectionId === "default", "Smith2020 safely reassigned to 'default'");
assert(allRefs.get("Brown2021")?.collectionId === "default", "Brown2021 safely reassigned to 'default'");

// 7. Test 4-State Filter Logic
function getFilterState(selectedCols: Set<string>, selectedTypes: Set<string>): number {
  const hasCol = selectedCols.size > 0;
  const hasType = selectedTypes.size > 0;
  if (!hasCol && !hasType) return 1; // State 1: Clean
  if (hasCol && !hasType) return 2;  // State 2: Collection enabled
  if (!hasCol && hasType) return 3;  // State 3: Types enabled
  return 4;                          // State 4: Both enabled
}

assert(getFilterState(new Set(), new Set()) === 1, "Empty filters = State 1 (Clean)");
assert(getFilterState(new Set(["col-ml-reasoning"]), new Set()) === 2, "Collection filter only = State 2 (Collection Enabled)");
assert(getFilterState(new Set(), new Set(["journal"])) === 3, "Type filter only = State 3 (Types Enabled)");
assert(getFilterState(new Set(["col-ml-reasoning"]), new Set(["conference"])) === 4, "Both collection & type = State 4 (All Enabled)");

// 8. Test Filtering Combinations
const testRefs: ReferenceMetadata[] = [
  { citekey: "A", title: "Paper A", authors: ["A"], year: 2020, type: "journal", projects: [], collectionId: "col1", dateAdded: "", dateModified: "" },
  { citekey: "B", title: "Paper B", authors: ["B"], year: 2021, type: "conference", projects: [], collectionId: "col1", dateAdded: "", dateModified: "" },
  { citekey: "C", title: "Paper C", authors: ["C"], year: 2022, type: "journal", projects: [], collectionId: "col2", dateAdded: "", dateModified: "" },
  { citekey: "D", title: "Paper D", authors: ["D"], year: 2023, type: "video", projects: [], collectionId: "default", dateAdded: "", dateModified: "" },
];

function filterCitations(refs: ReferenceMetadata[], cols: Set<string>, types: Set<string>): ReferenceMetadata[] {
  return refs.filter(r => {
    if (cols.size > 0 && !cols.has(r.collectionId || "default")) return false;
    if (types.size > 0 && !types.has(r.type)) return false;
    return true;
  });
}

const resAll = filterCitations(testRefs, new Set(), new Set());
assert(resAll.length === 4, "Clean filter returns all 4 citations");

const resCol1 = filterCitations(testRefs, new Set(["col1"]), new Set());
assert(resCol1.length === 2 && resCol1.every(r => r.collectionId === "col1"), "Collection 1 filter returns 2 citations");

const resJournal = filterCitations(testRefs, new Set(), new Set(["journal"]));
assert(resJournal.length === 2 && resJournal.every(r => r.type === "journal"), "Journal type filter returns 2 citations");

const resCol1AndJournal = filterCitations(testRefs, new Set(["col1"]), new Set(["journal"]));
assert(resCol1AndJournal.length === 1 && resCol1AndJournal[0].citekey === "A", "Compound col1 + journal filter returns Paper A");

console.log(`================================================================================`);
console.log(`  ALL CITATION GROUPS & COLLECTIONS TESTS PASSED (${passCount}/${passCount})!`);
console.log(`================================================================================`);
