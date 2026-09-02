import { FormatPropagator } from '../src/indexing/formatPropagator';
import { ReferenceMetadata, ProjectRecord } from '../src/types';

console.log("================================================================================");
console.log("  TESTING COMPILE PROJECT CORPUS BATCH EXPORT SIMULATION                        ");
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

// Mock App & Vault Adapter
const virtualFileSystem: Map<string, string> = new Map();

virtualFileSystem.set('docs/intro.md', `---
title: Introduction
citation-manager:
  - HCI Project
---
# Introduction
Recent studies [@Vaswani2017] and multi-agent interaction [@Smith2024; @Vaswani2017] proved effective.
Footnote citation here [^Vaswani2017].

[^Vaswani2017]: Vaswani, A., et al. (2017). Attention Is All You Need.
`);

virtualFileSystem.set('docs/methods.md', `---
title: Methods
citation-manager:
  - HCI Project
---
# Methods
We built upon [@Smith2024].
`);

const mockApp: any = {
  vault: {
    adapter: {
      exists: async (p: string) => virtualFileSystem.has(p),
      mkdir: async (p: string) => {},
      write: async (p: string, content: string) => {
        virtualFileSystem.set(p, content);
      },
    },
    read: async (f: any) => virtualFileSystem.get(f.path) || '',
  }
};

const project: ProjectRecord = {
  id: "hci-project",
  name: "HCI Project",
  registeredFiles: ['docs/intro.md', 'docs/methods.md'],
  referenceIds: ['Vaswani2017', 'Smith2024'],
  created: "",
  modified: ""
};

const allReferences = new Map<string, ReferenceMetadata>();
allReferences.set('Vaswani2017', {
  citekey: 'Vaswani2017',
  title: 'Attention Is All You Need',
  authors: ['Vaswani, Ashish', 'Shazeer, Noam'],
  year: 2017,
  type: 'conference',
  projects: ['hci-project']
});
allReferences.set('Smith2024', {
  citekey: 'Smith2024',
  title: 'Haptic Telemetry Systems',
  authors: ['Smith, John'],
  year: 2024,
  type: 'journal',
  projects: ['hci-project']
});

const mockGetFiles = (p: any, r: any) => [
  { path: 'docs/intro.md', name: 'intro.md', basename: 'intro' } as any,
  { path: 'docs/methods.md', name: 'methods.md', basename: 'methods' } as any,
];

// Test 1: IEEE Corpus Batch Export
async function runTests() {
  const ieeeRes = await FormatPropagator.compileProjectCorpus(
    mockApp,
    mockGetFiles,
    project,
    allReferences,
    'ieee',
    'publication',
    '.references'
  );

  assert(ieeeRes.compiledFilesCount === 2, "Compiled 2 files for IEEE");
  assert(ieeeRes.totalCitationsCount === 2, "Indexed 2 unique citations globally");

  const exportedIntro = virtualFileSystem.get('publication/intro.md') || '';
  assert(!exportedIntro.includes('citation-manager:'), "Strips citation-manager tag from exported frontmatter");
  assert(exportedIntro.includes('[1]'), "IEEE numerical token [1] inserted");
  assert(!exportedIntro.includes('[^Vaswani2017]:'), "Strips footnote definition from bottom of note in publication");

  const exportedBib = virtualFileSystem.get('publication/References - HCI Project.md') || '';
  assert(exportedBib.includes('## References - HCI Project'), "Master bibliography header generated");
  assert(exportedBib.includes('[1]'), "Master bibliography includes IEEE entries");

  // Test 2: APA 7 Corpus Batch Export
  const apaRes = await FormatPropagator.compileProjectCorpus(
    mockApp,
    mockGetFiles,
    project,
    allReferences,
    'apa7',
    'publication_apa',
    '.references'
  );

  assert(apaRes.compiledFilesCount === 2, "Compiled 2 files for APA 7");
  const exportedApaIntro = virtualFileSystem.get('publication_apa/intro.md') || '';
  assert(exportedApaIntro.includes('(Smith, 2024; Vaswani & Shazeer, 2017)'), "APA 7 compound parenthetical formatted with alphabetical sorting");

  console.log(`================================================================================`);
  console.log(`  CORPUS BATCH EXPORT FULLY VERIFIED (${passCount}/${passCount})!`);
  console.log(`================================================================================`);
}

runTests();
