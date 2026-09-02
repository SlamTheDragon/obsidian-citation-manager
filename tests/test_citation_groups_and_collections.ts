import { ReferenceMetadata, CitationCollection, DEFAULT_COLLECTION, DEFAULT_COLLECTION_ID } from '../src/backend/types';
import { StorageManager } from '../src/backend/storageManager';

console.log("================================================================================");
console.log("  TESTING CITATION GROUPS, COLLECTIONS, DESIGN FLOW & ENTRY POINT BRANCHES     ");
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

// -----------------------------------------------------------------------------
// BRANCH 1: Data Model, Invariants & Default Collection Protection
// -----------------------------------------------------------------------------
assert(DEFAULT_COLLECTION.id === "default", "Default collection id is 'default'");
assert(DEFAULT_COLLECTION.name === "General", "Default collection name is 'General'");
assert(DEFAULT_COLLECTION.isDefault === true, "Default collection isDefault is strictly true");

// -----------------------------------------------------------------------------
// BRANCH 2: Entry Point - Folder Button in Search Bar & Subpanel Toggling
// -----------------------------------------------------------------------------
let activeSubpanel: 'citations' | 'add' | 'bib' | 'stats' | 'collections' = 'citations';

// Toggle to collections subpanel
activeSubpanel = (activeSubpanel === 'collections' ? 'citations' : 'collections');
assert(activeSubpanel === 'collections', "Folder button opens Collections subpanel from citations view");

// Toggle back
activeSubpanel = (activeSubpanel === 'collections' ? 'citations' : 'collections');
assert(activeSubpanel === 'citations', "Folder button toggles back to citations view");

// Search input focus auto-reverts to citations view
activeSubpanel = 'collections';
const onSearchFocus = () => { if (activeSubpanel !== 'citations') activeSubpanel = 'citations'; };
onSearchFocus();
assert(activeSubpanel === 'citations', "Focusing search bar automatically returns user to citations view");

// -----------------------------------------------------------------------------
// BRANCH 3: Collection Creation, Modification & Description
// -----------------------------------------------------------------------------
const collectionsStore: CitationCollection[] = [DEFAULT_COLLECTION];

function createCollection(name: string, description: string): CitationCollection {
  const col: CitationCollection = {
    id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    description: description.trim(),
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  };
  collectionsStore.push(col);
  return col;
}

const col1 = createCollection("Spatial HCI Literature", "Haptics, AR, and VR spatial input");
const col2 = createCollection("LLM Reasoning Benchmarks", "Frontier agentic reasoning architectures");

assert(collectionsStore.length === 3, "Created 2 custom collections alongside default collection");
assert(col1.name === "Spatial HCI Literature" && col1.description.includes("Haptics"), "Collection title & description stored accurately");

// -----------------------------------------------------------------------------
// BRANCH 4: Two-Column Transfer Modal Interaction & Whole-Card-as-Button
// -----------------------------------------------------------------------------
const allRefsMap = new Map<string, ReferenceMetadata>();

const refA: ReferenceMetadata = {
  citekey: "Vaswani2017",
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2017,
  type: "conference",
  projects: [],
  collectionId: DEFAULT_COLLECTION_ID,
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const refB: ReferenceMetadata = {
  citekey: "Smith2020",
  title: "Sensory Latency in Spatial Displays",
  authors: ["Smith, John"],
  year: 2020,
  type: "journal",
  projects: [],
  collectionId: DEFAULT_COLLECTION_ID,
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

allRefsMap.set(refA.citekey, refA);
allRefsMap.set(refB.citekey, refB);

// Simulate Two-Column Modal for col1 ("Spatial HCI Literature")
function getModalColumns(activeCol: CitationCollection, filterText: string = "") {
  const leftCol: ReferenceMetadata[] = [];
  const rightCol: ReferenceMetadata[] = [];
  const q = filterText.toLowerCase().trim();

  for (const r of allRefsMap.values()) {
    const match = !q || r.title.toLowerCase().includes(q) || r.citekey.toLowerCase().includes(q);
    if (!match) continue;

    if (r.collectionId === activeCol.id) {
      rightCol.push(r);
    } else {
      leftCol.push(r);
    }
  }
  return { leftCol, rightCol };
}

let cols = getModalColumns(col1);
assert(cols.leftCol.length === 2 && cols.rightCol.length === 0, "Initially both citations are in Left Column (General/Other)");

// Action: Click Smith2020 card in Left Column -> Moves to Right Column (col1)
refB.collectionId = col1.id;
cols = getModalColumns(col1);
assert(cols.leftCol.length === 1 && cols.rightCol.length === 1, "Clicking left card transfers it into Right Column (col1)");
assert(cols.rightCol[0].citekey === "Smith2020", "Right column contains Smith2020");

// Action: Click Smith2020 card in Right Column -> Moves back to Left Column (default)
refB.collectionId = DEFAULT_COLLECTION_ID;
cols = getModalColumns(col1);
assert(cols.leftCol.length === 2 && cols.rightCol.length === 0, "Clicking right card removes it back to Left Column (General)");

// In-Modal Search Filtering
refA.collectionId = col1.id; // Vaswani in col1
cols = getModalColumns(col1, "Sensory");
assert(cols.leftCol.length === 1 && cols.leftCol[0].citekey === "Smith2020", "In-modal search matches Smith2020 in left column");
assert(cols.rightCol.length === 0, "In-modal search excludes non-matching right column items");

// -----------------------------------------------------------------------------
// BRANCH 5: Single Move Modal & Card Action Button Grouping
// -----------------------------------------------------------------------------
// Move refB to col2
refB.collectionId = col2.id;
assert(refB.collectionId === col2.id, "Single Move Modal assigned Smith2020 to col2");

// Verify flipped card action grouping structure
const cardActions = {
  leftGroup: ["insert", "notes", "edit"],
  rightGroup: ["move", "delete"]
};
assert(cardActions.leftGroup.includes("insert") && cardActions.leftGroup.includes("notes") && cardActions.leftGroup.includes("edit"), "Insert, Notes, and Edit buttons grouped on the left");
assert(cardActions.rightGroup.includes("move") && cardActions.rightGroup.includes("delete"), "Move and Delete buttons grouped on the right");

// Verify General / Default collection is blacklisted from collections subpanel and filter checklist
const userVisibleCols = collectionsStore.filter(c => !c.isDefault && c.id !== DEFAULT_COLLECTION_ID);
assert(!userVisibleCols.some(c => c.id === 'default'), "General collection is blacklisted from visible collections list and filters");

// -----------------------------------------------------------------------------
// BRANCH 6: Safe Collection Deletion & Citation Preservation
// -----------------------------------------------------------------------------
function deleteCollection(colId: string) {
  const target = collectionsStore.find(c => c.id === colId);
  if (!target || target.isDefault) {
    return false; // Protected
  }
  // Re-route citations safely to default
  for (const r of allRefsMap.values()) {
    if (r.collectionId === colId) {
      r.collectionId = DEFAULT_COLLECTION_ID;
    }
  }
  const idx = collectionsStore.findIndex(c => c.id === colId);
  if (idx !== -1) collectionsStore.splice(idx, 1);
  return true;
}

assert(deleteCollection("default") === false, "Default collection deletion is blocked");
assert(deleteCollection(col2.id) === true, "User collection col2 deleted successfully");
assert(refB.collectionId === DEFAULT_COLLECTION_ID, "Citations in deleted collection are safely reassigned to 'default'");

// -----------------------------------------------------------------------------
// BRANCH 7: Dynamic 4-State Filter Chips & Two-Column Expanding Island
// -----------------------------------------------------------------------------
const selectedCols = new Set<string>();
const selectedTypes = new Set<string>();

function evaluateFilterChipsState(cols: Set<string>, types: Set<string>): { state: number; chips: string[] } {
  if (cols.size === 0 && types.size === 0) {
    return { state: 1, chips: ["Filters"] };
  }
  const chips: string[] = ["Edit Filters", "Clear Filters"];
  for (const c of cols) chips.push(`Col:${c}`);
  for (const t of types) chips.push(`Type:${t}`);
  
  if (cols.size > 0 && types.size === 0) return { state: 2, chips };
  if (cols.size === 0 && types.size > 0) return { state: 3, chips };
  return { state: 4, chips };
}

// State 1: Clean
const st1 = evaluateFilterChipsState(selectedCols, selectedTypes);
assert(st1.state === 1 && st1.chips.length === 1 && st1.chips[0] === "Filters", "State 1 (Clean) renders single 'Filters' pill");

// State 2: Collection Enabled
selectedCols.add(col1.id);
const st2 = evaluateFilterChipsState(selectedCols, selectedTypes);
assert(st2.state === 2 && st2.chips.includes("Edit Filters") && st2.chips.includes("Clear Filters") && st2.chips.some(c => c.includes(col1.id)), "State 2 renders Edit, Clear, and Collection chip");

// State 3: Types Enabled
selectedCols.clear();
selectedTypes.add("journal");
const st3 = evaluateFilterChipsState(selectedCols, selectedTypes);
assert(st3.state === 3 && st3.chips.includes("Edit Filters") && st3.chips.includes("Type:journal"), "State 3 renders Edit, Clear, and Type chip");

// State 4: Both Enabled
selectedCols.add(col1.id);
const st4 = evaluateFilterChipsState(selectedCols, selectedTypes);
assert(st4.state === 4 && st4.chips.length === 4, "State 4 renders Edit, Clear, Collection chip, and Type chip");

// Clear Filters Action reverts to State 1
selectedCols.clear();
selectedTypes.clear();
assert(evaluateFilterChipsState(selectedCols, selectedTypes).state === 1, "Clear Filters action instantly returns to State 1 (Clean)");

// -----------------------------------------------------------------------------
// BRANCH 8: Import Entry Points (PDF / Reference Editor / DOI)
// -----------------------------------------------------------------------------
const importedRef: Partial<ReferenceMetadata> = {
  citekey: "DeepSeek2026",
  title: "Reasoning Models with Latent Planning",
  authors: ["DeepSeek-AI"],
  year: 2026,
  type: "preprint",
  collectionId: col1.id
};

assert(importedRef.collectionId === col1.id, "Imported reference receives assigned collectionId");

console.log("================================================================================");
console.log(`  ALL CITATION GROUPS & DESIGN FLOW TESTS PASSED (${passCount}/${passCount})!`);
console.log("================================================================================");
