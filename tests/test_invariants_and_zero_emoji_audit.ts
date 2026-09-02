import * as fs from 'fs';
import * as path from 'path';

console.log("================================================================================");
console.log("  TESTING REPOSITORY INVARIANTS, ZERO-EMOJI AUDIT & STRUCTURAL INTEGRITY       ");
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

// 1. Zero Unicode Emoji Policy Audit across src/
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/u;

function scanForEmojis(dir: string): { file: string; line: number; text: string }[] {
  const violations: { file: string; line: number; text: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      violations.push(...scanForEmojis(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (emojiRegex.test(line)) {
          violations.push({ file: fullPath, line: idx + 1, text: line.trim() });
        }
      });
    }
  }
  return violations;
}

const srcViolations = scanForEmojis(path.resolve(__dirname, '../src'));
if (srcViolations.length > 0) {
  console.error("Emoji violations found in src/:", srcViolations);
}
assert(srcViolations.length === 0, `Zero Unicode Emojis in src/ (Found ${srcViolations.length} violations)`);

// 2. Facade Integrity Audit: ProjectIndexer Facade Exports
import { ProjectIndexer } from '../src/backend/projectIndexer';
const indexerProto = ProjectIndexer.prototype;
assert(typeof indexerProto.indexProject === 'function', "ProjectIndexer.indexProject exists");
assert(typeof indexerProto.propagateFormatChange === 'function', "ProjectIndexer.propagateFormatChange exists");
assert(typeof indexerProto.propagateFootnoteModeGlobally === 'function', "ProjectIndexer.propagateFootnoteModeGlobally exists");
assert(typeof indexerProto.compileProjectCorpus === 'function', "ProjectIndexer.compileProjectCorpus exists");
assert(typeof ProjectIndexer.compileDocumentText === 'function', "ProjectIndexer.compileDocumentText exists");

// 3. CSL Engine Style Generators Audit
import { CSLFormatters } from '../src/backend/csl/cslFormatters';
import { CitationEngine } from '../src/backend/citationEngine';

assert(typeof CSLFormatters.formatAPA7 === 'function', "CSLFormatters.formatAPA7 exists");
assert(typeof CSLFormatters.formatIEEE === 'function', "CSLFormatters.formatIEEE exists");
assert(typeof CSLFormatters.formatHarvard === 'function', "CSLFormatters.formatHarvard exists");
assert(typeof CSLFormatters.formatChicago === 'function', "CSLFormatters.formatChicago exists");
assert(typeof CSLFormatters.formatVancouver === 'function', "CSLFormatters.formatVancouver exists");
assert(typeof CitationEngine.formatBibliographyEntry === 'function', "CitationEngine.formatBibliographyEntry exists");
assert(typeof CitationEngine.formatInBody === 'function', "CitationEngine.formatInBody exists");

// 4. Citation Collections & UI Modals Invariants Audit
import { DEFAULT_COLLECTION, DEFAULT_COLLECTION_ID } from '../src/backend/types';
import { CollectionTransferModal } from '../src/frontend/CollectionTransferModal';
import { CollectionEditorModal } from '../src/frontend/CollectionEditorModal';
import { MoveToCollectionModal } from '../src/frontend/MoveToCollectionModal';

assert(DEFAULT_COLLECTION_ID === 'default', "DEFAULT_COLLECTION_ID is 'default'");
assert(DEFAULT_COLLECTION.isDefault === true, "DEFAULT_COLLECTION isDefault is true");
assert(typeof CollectionTransferModal === 'function', "CollectionTransferModal class exported");
assert(typeof CollectionEditorModal === 'function', "CollectionEditorModal class exported");
assert(typeof MoveToCollectionModal === 'function', "MoveToCollectionModal class exported");

console.log("================================================================================");
console.log(`  ALL REPOSITORY INVARIANTS & AUDIT TESTS PASSED (${passCount}/${passCount})!`);
console.log("================================================================================");
