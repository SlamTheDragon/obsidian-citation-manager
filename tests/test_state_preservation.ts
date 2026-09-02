import process from 'process';
import { App } from 'obsidian';
import { ExportPublicationModal } from '../src/frontend/ExportPublicationModal';
import { ProjectRecord, ReferenceMetadata, CitationManagerSettings, DEFAULT_SETTINGS, ALL_PROJECTS_ID } from '../src/backend/types';
import { ProjectIndexer } from '../src/backend/projectIndexer';

console.log("================================================================================");
console.log("  TESTING STATEFUL CHANGES & EXPORT PANEL SETTINGS PRESERVATION                ");
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

const mockApp: any = {
  vault: {
    getRoot: () => ({ path: '/', children: [] }),
    adapter: {
      exists: async () => false,
      write: async () => {},
      read: async () => ''
    }
  },
  workspace: {
    getActiveFile: () => ({ path: 'Test.md', basename: 'Test', name: 'Test.md' })
  }
};

const indexer = new ProjectIndexer(mockApp);
const allRefs = new Map<string, ReferenceMetadata>();

async function runStateTests() {
  let savedSettingsCount = 0;
  const mockSaveSettings = async () => {
    savedSettingsCount++;
  };

  const initialSettings: CitationManagerSettings = {
    ...DEFAULT_SETTINGS,
    projects: [
      {
        id: 'proj_1',
        name: 'Manuscript 2026',
        registeredFiles: ['Test.md'],
        referenceIds: [],
        citationStyle: 'apa7',
        inBodyFormat: 'parenthetical',
        publicationFolder: 'custom_output',
        exportSettings: {
          style: 'ieee',
          scope: 'global',
          cleanFootnotes: false,
          appendBib: true,
          outputFolder: 'custom_output'
        },
        created: '',
        modified: ''
      }
    ]
  };

  // 1. Open Export Modal with Project that has existing exportSettings
  const project = initialSettings.projects[0];
  const modal = new ExportPublicationModal(
    mockApp,
    project,
    allRefs,
    indexer,
    initialSettings,
    null,
    mockSaveSettings
  );

  assert((modal as any).selectedStyle === 'ieee', "ExportPublicationModal restored saved style: ieee");
  assert((modal as any).bibScope === 'global', "ExportPublicationModal restored saved scope: global");
  assert((modal as any).cleanFootnotes === false, "ExportPublicationModal restored saved cleanFootnotes: false");
  assert((modal as any).appendBib === true, "ExportPublicationModal restored saved appendBib: true");
  assert((modal as any).outputFolder === 'custom_output', "ExportPublicationModal restored saved outputFolder: custom_output");

  // 2. Change settings inside modal and verify persistence
  (modal as any).selectedStyle = 'vancouver';
  (modal as any).outputFolder = 'published_final';
  (modal as any).cleanFootnotes = true;
  await (modal as any).persistProjectState();

  assert(savedSettingsCount === 1, "onSaveSettings callback was triggered upon state change");
  assert(project.exportSettings?.style === 'vancouver', "Project record exportSettings updated to vancouver");
  assert(project.exportSettings?.outputFolder === 'published_final', "Project record outputFolder updated to published_final");
  assert(initialSettings.lastExportSettings?.style === 'vancouver', "Global lastExportSettings updated to vancouver");
  assert(initialSettings.lastExportSettings?.outputFolder === 'published_final', "Global lastExportSettings outputFolder updated to published_final");

  // 3. Open Export Modal when project is null (All Citations / ALL_PROJECTS_ID)
  const allModal = new ExportPublicationModal(
    mockApp,
    null,
    allRefs,
    indexer,
    initialSettings,
    null,
    mockSaveSettings
  );

  assert((allModal as any).selectedStyle === 'vancouver', "Null-project export modal restored global lastExportSettings style: vancouver");
  assert((allModal as any).outputFolder === 'published_final', "Null-project export modal restored global lastExportSettings outputFolder: published_final");

  (allModal as any).selectedStyle = 'chicago';
  (allModal as any).outputFolder = 'chicago_docs';
  await (allModal as any).persistProjectState();

  assert(savedSettingsCount === 2, "onSaveSettings callback triggered for null-project export change");
  assert(initialSettings.lastExportSettings?.style === 'chicago', "Global lastExportSettings updated to chicago");
  assert(initialSettings.lastExportSettings?.outputFolder === 'chicago_docs', "Global lastExportSettings outputFolder updated to chicago_docs");

  console.log("================================================================================");
  console.log(`  ALL STATE PRESERVATION TESTS PASSED (${passCount}/${passCount})!`);
  console.log("================================================================================");
}

runStateTests().catch(err => {
  console.error(err);
  process.exit(1);
});
