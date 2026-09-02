import process from 'process';
import { App } from 'obsidian';
import { StorageManager } from '../src/backend/storageManager';
import { ProjectIndexer } from '../src/backend/projectIndexer';
import { ReferenceMetadata, ProjectRecord, DEFAULT_SETTINGS } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING DISMISSED LINTS CACHE PERSISTENCE, RESET & PER-FILE SCOPING          ");
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

// 1. Mock Obsidian App Environment
const mockFiles = new Map<string, string>();
const mockApp: any = {
  vault: {
    adapter: {
      async exists(path: string) {
        return mockFiles.has(path);
      },
      async write(path: string, data: string) {
        mockFiles.set(path, data);
      },
      async read(path: string) {
        return mockFiles.get(path) || "";
      },
      async remove(path: string) {
        mockFiles.delete(path);
      },
      async list(path: string) {
        const files: string[] = [];
        for (const k of mockFiles.keys()) {
          if (k.startsWith(path)) files.push(k);
        }
        return { files, folders: [] };
      }
    },
    getMarkdownFiles() {
      const arr: any[] = [];
      for (const p of mockFiles.keys()) {
        if (p.endsWith('.md') && !p.startsWith('.references')) {
          arr.push({ path: p, basename: p.split('/').pop()?.replace(/\.md$/, '') });
        }
      }
      return arr;
    },
    getAbstractFileByPath(path: string) {
      if (mockFiles.has(path)) {
        return { path, basename: path.split('/').pop()?.replace(/\.md$/, '') };
      }
      return null;
    },
    async cachedRead(file: any) {
      return mockFiles.get(file.path) || "";
    },
    async read(file: any) {
      return mockFiles.get(file.path) || "";
    },
    async modify(file: any, content: string) {
      mockFiles.set(file.path, content);
    }
  },
  metadataCache: {
    getFileCache(file: any) {
      const content = mockFiles.get(file.path) || "";
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (match) {
        return {
          frontmatter: {
            'citation-manager': 'TestBucket'
          }
        };
      }
      return null;
    }
  }
};

const storage = new StorageManager(mockApp, DEFAULT_SETTINGS);
const indexer = new ProjectIndexer(mockApp);

// 2. Setup Test Bucket and 2 Notes with same unresolved reference [@Unknown2024]
const testProject: ProjectRecord = {
  id: "proj_test",
  name: "TestBucket",
  citationStyle: "apa7",
  inBodyFormat: "parenthetical",
  registeredFiles: ["NoteA.md", "NoteB.md"],
  createdDate: new Date().toISOString()
};

mockFiles.set("NoteA.md", "---\ncitation-manager: TestBucket\n---\nHere is citation [@Unknown2024] in Note A.\n");
mockFiles.set("NoteB.md", "---\ncitation-manager: TestBucket\n---\nHere is citation [@Unknown2024] in Note B.\n");

const allRefs = new Map<string, ReferenceMetadata>();

// 3. Initial index: Both notes produce warnings
async function runTests() {
  const initialDismissed = await storage.loadDismissedLints();
  assert(initialDismissed.size === 0, "Initial dismissed lints set is empty");

  let stats = await indexer.indexProject(testProject, allRefs, '.references', [testProject], initialDismissed);
  assert(stats.lintWarnings.length === 2, `Initial indexing found 2 warnings (found: ${stats.lintWarnings.length})`);
  
  const warnA = stats.lintWarnings.find(w => w.filePath === "NoteA.md");
  const warnB = stats.lintWarnings.find(w => w.filePath === "NoteB.md");
  assert(Boolean(warnA), "Warning generated for NoteA.md");
  assert(Boolean(warnB), "Warning generated for NoteB.md");
  assert(warnA!.id !== warnB!.id, `Per-file scope invariant: Warning IDs are distinct (${warnA!.id} vs ${warnB!.id})`);

  // 4. Dismiss Warning in NoteA only
  await storage.saveDismissedLint(warnA!.id);
  assert(mockFiles.has(".references/.cache/dismissed_lints.json"), "Cache file .references/.cache/dismissed_lints.json was created");

  // Reload cache
  const loadedDismissed = await storage.loadDismissedLints();
  assert(loadedDismissed.has(warnA!.id), "Dismissed warning ID for NoteA was persisted in storage cache");
  assert(!loadedDismissed.has(warnB!.id), "NoteB warning ID was NOT marked as dismissed");

  // Re-index: NoteA should be masked, NoteB must STILL be reported
  stats = await indexer.indexProject(testProject, allRefs, '.references', [testProject], loadedDismissed);
  assert(stats.lintWarnings.length === 1, `After dismissing NoteA, exactly 1 warning remains (found: ${stats.lintWarnings.length})`);
  assert(stats.lintWarnings[0].filePath === "NoteB.md", "Remaining warning is scoped strictly to NoteB.md");

  // 5. Test Cache Reset (Clear Dismissed Lints)
  await storage.clearDismissedLints();
  assert(!mockFiles.has(".references/.cache/dismissed_lints.json"), "Cache file was deleted on clearDismissedLints()");

  const afterResetDismissed = await storage.loadDismissedLints();
  assert(afterResetDismissed.size === 0, "Loaded dismissed lints set is empty after cache reset");

  // Re-index after cache reset: Both warnings restored
  stats = await indexer.indexProject(testProject, allRefs, '.references', [testProject], afterResetDismissed);
  assert(stats.lintWarnings.length === 2, `After cache reset, all 2 warnings are restored (found: ${stats.lintWarnings.length})`);

  console.log("================================================================================");
  console.log(`  ALL DISMISSED LINTS CACHE & SCOPING TESTS PASSED (${passCount}/${passCount})!`);
  console.log("================================================================================");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
