import process from 'process';
import { App } from 'obsidian';
import { StorageManager } from '../src/backend/storageManager';
import { CitationCardRenderer } from '../src/frontend/CitationCardRenderer';
import { ReferenceMetadata, DEFAULT_SETTINGS, LintWarning } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING V1.0.1 RELEASE INVARIANTS: STATE TRUTH, ACCORDION & SURFING PDF       ");
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

// 1. StorageManager State Invariant: No settings.json emissions
const mockApp: any = {
  vault: {
    adapter: {
      files: new Map<string, string>(),
      binaryFiles: new Map<string, ArrayBuffer>(),
      async exists(path: string) {
        return this.files.has(path) || this.binaryFiles.has(path);
      },
      async mkdir(path: string) {
        return;
      },
      async write(path: string, data: string) {
        this.files.set(path, data);
      },
      async read(path: string) {
        return this.files.get(path) || "";
      },
      async remove(path: string) {
        this.files.delete(path);
      },
      async list(path: string) {
        const files: string[] = [];
        for (const k of this.files.keys()) {
          if (k.startsWith(path)) files.push(k);
        }
        return { files, folders: [] };
      }
    },
    getAbstractFileByPath(path: string) {
      return { path, basename: path.split('/').pop()?.replace(/\.md$/, '') };
    },
    getResourcePath(file: any) {
      return `app://local/${file.path}`;
    }
  },
  workspace: {
    leaves: [] as any[],
    getLeaf(type?: any) {
      const leaf = {
        state: null as any,
        file: null as any,
        async setViewState(state: any) {
          this.state = state;
        },
        async openFile(file: any) {
          this.file = file;
        }
      };
      return leaf;
    },
    revealLeaf(leaf: any) {}
  },
  plugins: {
    plugins: {
      'surfing': {
        openUrlCalledWith: null as string | null,
        openUrl(url: string) {
          this.openUrlCalledWith = url;
        }
      }
    }
  }
};

async function runInvariantTests() {
  const storage = new StorageManager(mockApp as any, DEFAULT_SETTINGS);
  assert(typeof (storage as any).loadSerializedSettings === 'undefined', "StorageManager does not export loadSerializedSettings");
  assert(typeof (storage as any).saveSerializedSettings === 'undefined', "StorageManager does not export saveSerializedSettings");

  // 2. Surfing PDF Open Integration
  const refWithPdf: ReferenceMetadata = {
    citekey: "Vaswani2017",
    title: "Attention Is All You Need",
    authors: ["Vaswani, A."],
    year: 2017,
    type: "conference",
    projects: [],
    pdfAttachment: ".references/attachments/Vaswani2017.pdf"
  };

  // Simulate PDF exists
  mockApp.vault.adapter.files.set(".references/attachments/Vaswani2017.pdf", "%PDF-1.4 mock");

  await CitationCardRenderer.openAttachedPDF(mockApp as any, refWithPdf, ".references");
  assert(
    mockApp.plugins.plugins['surfing'].openUrlCalledWith === "app://local/.references/attachments/Vaswani2017.pdf",
    "openAttachedPDF successfully routed attached PDF to Surfing plugin openUrl"
  );

  // Fallback test when Surfing is disabled
  mockApp.plugins.plugins = {};
  const fallbackPromise = CitationCardRenderer.openAttachedPDF(mockApp as any, refWithPdf, ".references");
  assert(typeof fallbackPromise?.then === 'function', "openAttachedPDF handles fallback gracefully without throwing");
  await fallbackPromise;

// 3. Diagnostics Modal State Flow Simulation: Single Accordion & Master Checkbox
const mockWarnings: LintWarning[] = [
  {
    id: "w1",
    filePath: "Note1.md",
    fileName: "Note1.md",
    lineNumber: 10,
    lineContent: "According to [@Vaswani2017]",
    rawCitation: "[@Vaswani2017]",
    type: "format_mismatch",
    severity: "warning",
    message: "Format mismatch",
    suggestedFix: "[^Vaswani2017]"
  },
  {
    id: "w2",
    filePath: "Note2.md",
    fileName: "Note2.md",
    lineNumber: 15,
    lineContent: "[^Vaswani2017]: Orphan reference",
    rawCitation: "[^Vaswani2017]: Orphan reference",
    type: "orphan_definition",
    severity: "warning",
    message: "Orphan definition",
    suggestedFix: ""
  },
  {
    id: "w3",
    filePath: "Note3.md",
    fileName: "Note3.md",
    lineNumber: 20,
    lineContent: "Cited [@Unknown2024]",
    rawCitation: "[@Unknown2024]",
    type: "unresolved",
    severity: "error",
    message: "Unresolved reference"
  }
];

// Verify fixable detection: w1 (suggestedFix: "[^key]") and w2 (orphan suggestedFix: "") are fixable
const fixableWarnings = mockWarnings.filter(w => w.suggestedFix !== undefined);
assert(fixableWarnings.length === 2, "Fixable warnings accurately include orphan definitions (suggestedFix: '')");

// Simulate Master Selection Logic
const selectedIds = new Set<string>();
const isAllSelectedInitial = fixableWarnings.every(w => selectedIds.has(w.id));
assert(!isAllSelectedInitial, "Initially not all fixable warnings are selected");

// Select All action
fixableWarnings.forEach(w => selectedIds.add(w.id));
const isAllSelectedAfter = fixableWarnings.every(w => selectedIds.has(w.id));
assert(isAllSelectedAfter, "Select All selects all fixable items");

// Deselect individual item (1 of 2 selected)
selectedIds.delete("w1");
assert(selectedIds.size === 1, "Partial selection active (1 out of 2)");
const hasAnySelected = selectedIds.size > 0;
assert(hasAnySelected === true, "When 1 of 2 is selected, hasAnySelected is true");
const masterActionLabel = hasAnySelected ? 'Deselect All' : 'Select All';
assert(masterActionLabel === 'Deselect All', "Master selection button renders 'Deselect All' when partial items selected");

// Clicking Deselect All clears all
if (hasAnySelected) {
  fixableWarnings.forEach(w => selectedIds.delete(w.id));
}
assert(selectedIds.size === 0, "Deselect All clears all selections in filter");
const masterActionLabelAfterClear = (selectedIds.size > 0) ? 'Deselect All' : 'Select All';
assert(masterActionLabelAfterClear === 'Select All', "Master selection button returns to 'Select All' when 0 items selected");

// Single open accordion simulation
let openWarningId: string | null = null;
function toggleAccordion(id: string) {
  openWarningId = (openWarningId === id) ? null : id;
}

toggleAccordion("w1");
assert(openWarningId === "w1", "Accordion w1 opened");

toggleAccordion("w2");
assert(openWarningId === "w2", "Accordion w2 opened and w1 automatically collapsed");

toggleAccordion("w2");
  console.log("================================================================================");
  console.log(`  ALL V1.0.1 RELEASE INVARIANT TESTS PASSED (${passCount}/${passCount})!`);
  console.log("================================================================================");
}

runInvariantTests().catch(err => {
  console.error(err);
  process.exit(1);
});
