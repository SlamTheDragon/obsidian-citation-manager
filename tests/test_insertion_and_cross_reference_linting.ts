import { CitationEngine } from '../src/backend/citationEngine';
import { ProjectIndexer } from '../src/backend/projectIndexer';
import { LintEngine } from '../src/backend/lintEngine';
import { ReferenceMetadata, ProjectRecord, CitationStyle, InBodyFormat, LintWarning } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING FORMATTING INSERTION, FOOTNOTE GOVERNANCE & CROSS-REFERENCE LINTING   ");
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

const ref1: ReferenceMetadata = {
  citekey: "Vaswani2017",
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam", "Parmar, Niki"],
  year: 2017,
  publication: "NeurIPS",
  volume: "30",
  pages: "5998-6008",
  doi: "10.5555/3295222.3295349",
  type: "conference",
  projects: ["nlp"]
};

const ref2: ReferenceMetadata = {
  citekey: "Smith2020",
  title: "Neural Vision Models",
  authors: ["Smith, John", "Doe, Jane"],
  year: 2020,
  publication: "CVPR",
  type: "conference",
  projects: ["vision"]
};

const allRefsMap = new Map<string, ReferenceMetadata>([
  [ref1.citekey, ref1],
  [ref2.citekey, ref2],
]);

// 1. FORMATTING INSERTION COMPLIANCE ACROSS ALL 5 CSL STANDARDS
assert(
  CitationEngine.formatInBody(ref1, 'parenthetical', 'apa7') === "(Vaswani et al., 2017)",
  "APA 7 parenthetical in-body insertion"
);
assert(
  CitationEngine.formatInBody(ref1, 'narrative', 'apa7') === "Vaswani et al. (2017)",
  "APA 7 narrative in-body insertion"
);
assert(
  CitationEngine.formatInBody(ref1, 'citekey', 'apa7') === "[@Vaswani2017]",
  "APA 7 Pandoc citekey in-body insertion"
);

// IEEE
assert(
  CitationEngine.formatInBody(ref1, 'parenthetical', 'ieee', 1) === "[1]",
  "IEEE numerical in-body insertion [1]"
);
assert(
  CitationEngine.formatInBody(ref1, 'narrative', 'ieee', 1) === "Vaswani et al. [1]",
  "IEEE narrative in-body insertion"
);

// Harvard & Chicago
assert(
  CitationEngine.formatInBody(ref1, 'parenthetical', 'harvard') === "(Vaswani et al. 2017)",
  "Harvard parenthetical in-body insertion (no comma between author and year)"
);
assert(
  CitationEngine.formatInBody(ref1, 'parenthetical', 'chicago') === "(Vaswani, Shazeer, and Parmar 2017)",
  "Chicago 17th parenthetical in-body insertion (lists all 3 authors without comma before year)"
);

// Vancouver
assert(
  CitationEngine.formatInBody(ref1, 'parenthetical', 'vancouver', 1) === "(1)",
  "Vancouver numerical in-body insertion (1)"
);
assert(
  CitationEngine.formatInBody(ref1, 'narrative', 'vancouver', 1) === "Vaswani et al. (1)",
  "Vancouver narrative in-body insertion"
);

// 2. FOOTNOTE NATIVE TOGGLE GOVERNANCE (Footnote Mode ON vs OFF)
const fnOverload = CitationEngine.detectAndOverloadAtCursor(
  "Here is some text ",
  18,
  [ref1],
  allRefsMap,
  'apa7',
  'footnote',
  true,
  1
);
assert(fnOverload.replacementText === "[^Vaswani2017]", "Footnote Mode ON inserts [^key] callout");

const fnDef = CitationEngine.formatFootnoteDefinition(ref1, 'apa7', 1);
assert(fnDef.startsWith("[^Vaswani2017]: Vaswani, A.,"), "Footnote definition generated with APA 7 canonical citation");

const stdOverload = CitationEngine.detectAndOverloadAtCursor(
  "Here is some text ",
  18,
  [ref1],
  allRefsMap,
  'apa7',
  'parenthetical',
  false,
  1
);
assert(stdOverload.replacementText === "(Vaswani et al., 2017)", "Footnote Mode OFF inserts standard author-date token without footnote wrapper");

// 3. CROSS-REFERENCE LINTING: MISSING FOOTNOTE DEFINITION
const mockApp: any = {
  vault: {
    files: new Map<string, string>(),
    getAbstractFileByPath(p: string) {
      if (this.files.has(p)) return { path: p, basename: p.replace(/\.md$/, '') };
      return null;
    },
    async read(fileObj: any) {
      return this.files.get(fileObj.path) || '';
    },
    async modify(fileObj: any, newContent: string) {
      this.files.set(fileObj.path, newContent);
    }
  }
};

const testFile = "note_with_missing_def.md";
const noteContentMissingDef = `# Background\n\nRecent transformers have demonstrated impressive capability [^Vaswani2017].\n`;
mockApp.vault.files.set(testFile, noteContentMissingDef);

const missingDefWarning: LintWarning = {
  id: `${testFile}::3::[^Vaswani2017]::missing_definition`,
  filePath: testFile,
  fileName: "note_with_missing_def",
  lineNumber: 3,
  lineContent: "Recent transformers have demonstrated impressive capability [^Vaswani2017].",
  rawCitation: "[^Vaswani2017]",
  citekey: "Vaswani2017",
  suggestedFix: fnDef,
  severity: "error",
  type: "missing_footnote_definition",
  message: "Footnote [^Vaswani2017] is missing its footnote definition at the bottom of the file."
};

const fixResult = await LintEngine.applyLintFix(mockApp, missingDefWarning);
assert(fixResult === true, "applyLintFix successfully applied missing footnote definition fix");

const updatedContent = await mockApp.vault.read({ path: testFile });
assert(updatedContent.includes("[^Vaswani2017]: Vaswani, A.,"), "Missing footnote definition appended cleanly to bottom of note");
assert(updatedContent.includes("[^Vaswani2017]"), "In-body footnote callout preserved in note text");

// 4. CROSS-REFERENCE LINTING: PURGE ORPHAN FOOTNOTE DEFINITION
const orphanFile = "note_with_orphan.md";
const noteContentOrphan = `# Methodology\n\nNo citations in this paragraph.\n\n[^Smith2020]: Smith, J., & Doe, J. (2020). Neural Architectures for Vision.\n`;
mockApp.vault.files.set(orphanFile, noteContentOrphan);

const orphanWarning: LintWarning = {
  id: `${orphanFile}::5::[^Smith2020]::orphan_definition`,
  filePath: orphanFile,
  fileName: "note_with_orphan",
  lineNumber: 5,
  lineContent: "[^Smith2020]: Smith, J., & Doe, J. (2020). Neural Architectures for Vision.",
  rawCitation: "[^Smith2020]: Smith, J., & Doe, J. (2020). Neural Architectures for Vision.",
  citekey: "Smith2020",
  severity: "warning",
  type: "orphan_definition",
  message: "Footnote definition [^Smith2020] declared at bottom, but never cited in markdown body."
};

const orphanFixResult = await LintEngine.applyLintFix(mockApp, orphanWarning, { label: 'Remove Orphan Definition', action: 'purge' });
assert(orphanFixResult === true, "applyLintFix successfully purged orphan footnote definition");

const cleanedOrphanContent = await mockApp.vault.read({ path: orphanFile });
assert(!cleanedOrphanContent.includes("[^Smith2020]"), "Orphan footnote definition purged from document");

console.log("================================================================================");
console.log(`  ALL FORMATTING INSERTION & CROSS-REFERENCE LINT TESTS PASSED (${passCount}/${passCount})!`);
console.log("================================================================================");
