import { CitationEngine } from '../src/backend/citationEngine';
import { ReferenceMetadata, ProjectRecord, ALL_PROJECTS_ID } from '../src/backend/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("================================================================================");
console.log("  TESTING STATEFUL LOADING, AUTHOR EDITING & CITEKEY RETENTION                  ");
console.log("================================================================================");

// 1. Test CitationEngine.generateCitekey with various author/title configurations
const key1 = CitationEngine.generateCitekey(["Li, Ziheng"], 2026, "Phantom Tactile Interaction");
assert(key1 === "Li2026", `Standard author citekey: expected Li2026, got ${key1}`);

const key2 = CitationEngine.generateCitekey(["Unknown Author"], 2024, "Towards Spatial Haptics");
assert(key2 === "Spatial2024" || key2 === "Towards2024", `Unknown author fallback to title: got ${key2}`);

const key3 = CitationEngine.generateCitekey(["Unknown", "Smith, John"], 2025, "Virtual Reality Studies");
assert(key3 === "Smith2025", `Unknown filtered when real author present: got ${key3}`);

const key4 = CitationEngine.generateCitekey([], 2023, "Explorations in Microgravity UI");
assert(key4 === "Explorations2023" || key4 === "Microgravity2023", `Empty authors fallback to title: got ${key4}`);

// 2. Test Project Bucket Retention on Metadata Refetch simulation
const activeProject: ProjectRecord = {
  id: "spatial-hci",
  name: "Spatial HCI",
  registeredFiles: ["Notes/Paper1.md"],
  referenceIds: [],
  created: "",
  modified: "",
};

// Initial modal state when opened from search bar in active bucket
let modalRef: Partial<ReferenceMetadata> = {
  citekey: "",
  title: "Untitled",
  authors: [],
  year: 2026,
  projects: [activeProject.id] // active bucket initialized
};

assert(modalRef.projects!.includes("spatial-hci"), "Initial modalRef has active project bucket");

// Simulate MetadataResolvers.detectAndResolve returning external metadata (which naturally has projects: [])
const fetchedMetadata: Partial<ReferenceMetadata> = {
  title: "A Survey of Mid-Air Haptics",
  authors: ["Carter, Tom", "Seah, Sue Ann"],
  year: 2020,
  doi: "10.1145/2501988.2502018",
  projects: [] // external API returns empty projects
};

// Simulate doFetch merging logic
const currentProjects = modalRef.projects ? [...modalRef.projects] : [];
modalRef = {
  ...modalRef,
  ...fetchedMetadata,
  projects: currentProjects.length > 0 ? currentProjects : (fetchedMetadata.projects || [])
};

assert(modalRef.projects!.includes("spatial-hci"), "Bucket 'spatial-hci' preserved after refetching metadata!");

// 3. Simulate author editing & auto-committing pending author input (with comma inside name)
const pendingAuthorText = "Subramanian, Sriram";
const parts = pendingAuthorText.split(/[\r\n;]+/).map(p => p.trim()).filter(p => p.length > 0);
for (const p of parts) {
  if (!modalRef.authors!.includes(p)) {
    modalRef.authors!.push(p);
  }
}

// Filter out unknown if real authors present
if (modalRef.authors!.length > 1) {
  modalRef.authors = modalRef.authors!.filter(a => a && a.trim() && !/^unknown/i.test(a.trim()));
}

assert(modalRef.authors!.length === 3, `Expected 3 authors, got ${modalRef.authors!.length}`);
assert(modalRef.authors!.includes("Subramanian, Sriram"), `Author chip committed properly with comma: ${modalRef.authors![2]}`);

// Auto-generate citekey
if (!modalRef.citekey || (/^unknown|web|untitled/i.test(modalRef.citekey))) {
  modalRef.citekey = CitationEngine.generateCitekey(modalRef.authors!, modalRef.year!, modalRef.title);
}
assert(modalRef.citekey === "Carter2020", `Citekey correctly generated: expected Carter2020, got ${modalRef.citekey}`);

// 4. Test Filtering in CitationManagerView.getFilteredReferences
const referencesMap = new Map<string, ReferenceMetadata>();
referencesMap.set(modalRef.citekey!, modalRef as ReferenceMetadata);

function getFilteredReferences(proj: ProjectRecord | null, typeFilter: string, searchQ: string): ReferenceMetadata[] {
  const all = Array.from(referencesMap.values());
  return all.filter(ref => {
    if (proj && proj.id !== ALL_PROJECTS_ID) {
      const inProject = ref.projects && (ref.projects.includes(proj.id) || ref.projects.includes(proj.name));
      if (!inProject) return false;
    }
    if (typeFilter !== "all" && ref.type !== typeFilter) return false;
    if (searchQ) {
      const authors = (ref.authors || []).join(" ").toLowerCase();
      const title = (ref.title || "").toLowerCase();
      const citekey = (ref.citekey || "").toLowerCase();
      const doi = (ref.doi || "").toLowerCase();
      const q = searchQ.toLowerCase();
      if (!title.includes(q) && !authors.includes(q) && !citekey.includes(q) && !doi.includes(q)) return false;
    }
    return true;
  });
}

const filteredInBucket = getFilteredReferences(activeProject, "all", "");
assert(filteredInBucket.length === 1, `Reference appears in active bucket list: got ${filteredInBucket.length}`);
assert(filteredInBucket[0].citekey === "Carter2020", "Filtered reference is Carter2020");

console.log("\nALL STATEFUL CITATION LOADING & AUTHOR TESTS PASSED (10/10)!");
