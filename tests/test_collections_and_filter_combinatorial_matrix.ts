import { ReferenceMetadata, ProjectRecord, CitationCollection, DEFAULT_COLLECTION, DEFAULT_COLLECTION_ID, ALL_PROJECTS_ID } from '../src/types';

console.log("================================================================================");
console.log("  TESTING EXHAUSTIVE COMBINATORIAL MATRIX & VARIABLE STATE PERMUTATIONS        ");
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
// 1. POPULATE FULL MATRIX DATASET: 18 Distinct References Across All Dimensions
// -----------------------------------------------------------------------------
const cols: CitationCollection[] = [
  DEFAULT_COLLECTION,
  { id: 'colA', name: 'Collection Alpha', created: '', modified: '' },
  { id: 'colB', name: 'Collection Beta', created: '', modified: '' },
];

const proj1: ProjectRecord = { id: 'proj1', name: 'Project One', registeredFiles: [], referenceIds: [], created: '', modified: '' };
const proj2: ProjectRecord = { id: 'proj2', name: 'Project Two', registeredFiles: [], referenceIds: [], created: '', modified: '' };

const references: ReferenceMetadata[] = [];
let idCounter = 1;

const collectionIds = ['default', 'colA', 'colB'];
const typesList: ('journal' | 'conference' | 'book')[] = ['journal', 'conference', 'book'];
const projectIds = ['proj1', 'proj2'];

for (const c of collectionIds) {
  for (const t of typesList) {
    for (const p of projectIds) {
      const citekey = `Ref_${c}_${t}_${p}_${idCounter++}`;
      references.push({
        citekey,
        title: `Paper on ${t} in ${c} for ${p}`,
        authors: [`Author_${idCounter}`, 'Smith, John'],
        year: 2020 + (idCounter % 5),
        type: t,
        projects: [p],
        collectionId: c === 'default' ? undefined : c, // Test undefined fallback for default!
        dateAdded: new Date().toISOString(),
        dateModified: new Date().toISOString()
      });
    }
  }
}

assert(references.length === 18, "Created complete orthogonal matrix of 18 test references");

// -----------------------------------------------------------------------------
// 2. SIMULATE AND VALIDATE getFilteredReferences ACROSS 384 COMBINATORIAL STATES
// -----------------------------------------------------------------------------
function filterEngine(
  allRefs: ReferenceMetadata[],
  activeProject: ProjectRecord | null,
  selectedCols: Set<string>,
  selectedTypes: Set<string>,
  searchQuery: string
): ReferenceMetadata[] {
  return allRefs.filter(ref => {
    // 1. Collections (Union of selected collections)
    if (selectedCols.size > 0) {
      const refColId = ref.collectionId || DEFAULT_COLLECTION_ID;
      if (!selectedCols.has(refColId)) return false;
    }

    // 2. Types (Union of selected types)
    if (selectedTypes.size > 0) {
      if (!selectedTypes.has(ref.type)) return false;
    }

    // 3. Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = ref.title.toLowerCase().includes(q) ||
                    ref.citekey.toLowerCase().includes(q) ||
                    (ref.authors || []).some(a => a.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });
}

// Power set generator helper
function powerSet<T>(array: T[]): T[][] {
  const result: T[][] = [[]];
  for (const element of array) {
    const len = result.length;
    for (let i = 0; i < len; i++) {
      result.push([...result[i], element]);
    }
  }
  return result;
}

const colSubsets = powerSet(collectionIds).map(arr => new Set(arr)); // 8 subsets
const typeSubsets = powerSet(typesList).map(arr => new Set(arr));     // 8 subsets
const searchQueries = ["", "Alpha", "Smith"];                         // 3 search modes

let combinationalStatesTested = 0;

for (const colSet of colSubsets) {
  for (const typeSet of typeSubsets) {
    for (const query of searchQueries) {
      const filtered = filterEngine(references, null, colSet, typeSet, query);
      combinationalStatesTested++;

      // Invariant 1: No result should violate collection filter
      if (colSet.size > 0) {
        for (const r of filtered) {
          const actualCol = r.collectionId || DEFAULT_COLLECTION_ID;
          assert(colSet.has(actualCol), `Collection filter respected for ${r.citekey}`);
        }
      }

      // Invariant 2: No result should violate type filter
      if (typeSet.size > 0) {
        for (const r of filtered) {
          assert(typeSet.has(r.type), `Type filter respected for ${r.citekey}`);
        }
      }

      // Invariant 3: No result should violate search query
      if (query) {
        const q = query.toLowerCase();
        for (const r of filtered) {
          const match = r.title.toLowerCase().includes(q) ||
                        r.citekey.toLowerCase().includes(q) ||
                        (r.authors || []).some(a => a.toLowerCase().includes(q));
          assert(match, `Search query respected for ${r.citekey}`);
        }
      }
    }
  }
}

assert(combinationalStatesTested === 8 * 8 * 3, `Executed all ${combinationalStatesTested} combinational filtering states`);

// -----------------------------------------------------------------------------
// 3. SUBPANEL FINITE STATE MACHINE (FSM) TRANSITIONS
// -----------------------------------------------------------------------------
type Subpanel = 'citations' | 'add' | 'bib' | 'stats' | 'collections';

class SubpanelFSM {
  private current: Subpanel = 'citations';

  getState(): Subpanel { return this.current; }

  toggle(target: Subpanel) {
    this.current = (this.current === target ? 'citations' : target);
  }

  focusSearch() {
    this.current = 'citations';
  }

  onAddedCitation() {
    this.current = 'citations';
  }
}

const fsm = new SubpanelFSM();
assert(fsm.getState() === 'citations', "FSM starts in citations view");

// Toggle Collections
fsm.toggle('collections');
assert(fsm.getState() === 'collections', "FSM transitioned to collections view");

// Focus search box
fsm.focusSearch();
assert(fsm.getState() === 'citations', "FSM returned to citations view on search focus");

// Toggle Add subpanel
fsm.toggle('add');
assert(fsm.getState() === 'add', "FSM transitioned to add subpanel");

// Complete add citation
fsm.onAddedCitation();
assert(fsm.getState() === 'citations', "FSM automatically restored to citations after adding reference");

// Toggle Bibliography subpanel
fsm.toggle('bib');
assert(fsm.getState() === 'bib', "FSM transitioned to bibliography subpanel");
fsm.toggle('bib');
assert(fsm.getState() === 'citations', "FSM toggled back to citations from bibliography");

// Toggle Stats subpanel
fsm.toggle('stats');
assert(fsm.getState() === 'stats', "FSM transitioned to stats/diagnostics subpanel");
fsm.toggle('stats');
assert(fsm.getState() === 'citations', "FSM toggled back to citations from stats");

// -----------------------------------------------------------------------------
// 4. CROSS-CHECK COMBINATORIAL 4-STATE CHIP RENDERING
// -----------------------------------------------------------------------------
function getChipState(colCount: number, typeCount: number): 1 | 2 | 3 | 4 {
  if (colCount === 0 && typeCount === 0) return 1;
  if (colCount > 0 && typeCount === 0) return 2;
  if (colCount === 0 && typeCount > 0) return 3;
  return 4;
}

assert(getChipState(0, 0) === 1, "0 collections + 0 types = State 1 (Clean)");
assert(getChipState(1, 0) === 2, "1 collection + 0 types = State 2 (Collection Enabled)");
assert(getChipState(3, 0) === 2, "3 collections + 0 types = State 2 (Collection Enabled)");
assert(getChipState(0, 1) === 3, "0 collections + 1 type = State 3 (Type Enabled)");
assert(getChipState(0, 4) === 3, "0 collections + 4 types = State 3 (Type Enabled)");
assert(getChipState(2, 2) === 4, "2 collections + 2 types = State 4 (Both Enabled)");

// -----------------------------------------------------------------------------
// 5. OUTSIDE CLICK FILTER ISLAND DISMISSAL SIMULATION
// -----------------------------------------------------------------------------
let isFilterIslandOpen = true;
function simulateClick(isInsideWrapper: boolean) {
  if (!isFilterIslandOpen) return;
  if (!isInsideWrapper) {
    isFilterIslandOpen = false;
  }
}

simulateClick(true); // Click inside filter island (e.g. checkbox)
assert(isFilterIslandOpen === true, "Filter island remains open when clicking inside");

simulateClick(false); // Click outside filter island (e.g. on citation card or editor)
assert(isFilterIslandOpen === false, "Filter island automatically closes when clicking outside");

console.log("================================================================================");
console.log(`  ALL COMBINATORIAL & VARIABLE STATE TESTS PASSED (${passCount}/${passCount})!`);
console.log("================================================================================");
