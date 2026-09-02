import { CitationEngine } from '../src/backend/citationEngine';
import { CSLFormatters } from '../src/backend/csl/cslFormatters';
import { ReferenceMetadata, ProjectRecord, CitationStyle, InBodyFormat } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING CITATION INSERTION, CAPITALIZATION & FORMATTING ACROSS ENTRY POINTS   ");
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

const refA: ReferenceMetadata = {
  citekey: "Vaswani2017",
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam", "Parmar, Niki"],
  year: 2017,
  publication: "NeurIPS",
  type: "conference",
  projects: ["nlp"]
};

const refB: ReferenceMetadata = {
  citekey: "Smith2020",
  title: "Neural Vision Models",
  authors: ["Smith, John", "Doe, Jane"],
  year: 2020,
  publication: "CVPR",
  type: "conference",
  projects: ["vision"]
};

const refC: ReferenceMetadata = {
  citekey: "Jones2021",
  title: "Reinforcement Learning Overview",
  authors: ["Jones, Robert"],
  year: 2021,
  publication: "Nature",
  type: "journal",
  projects: ["rl"]
};

const refLowercaseAuthor: ReferenceMetadata = {
  citekey: "Mnih2015",
  title: "Human-level control through deep reinforcement learning",
  authors: ["mnih, volodymyr", "kavukcuoglu, koray", "silver, david"],
  year: 2015,
  publication: "Nature",
  type: "journal",
  projects: ["rl"]
};

const allRefsMap = new Map<string, ReferenceMetadata>([
  [refA.citekey, refA],
  [refB.citekey, refB],
  [refC.citekey, refC],
  [refLowercaseAuthor.citekey, refLowercaseAuthor],
]);

// -----------------------------------------------------------------------------
// 1. CAPITALIZATION NORMALIZATION FOR CORRUPTED/LOWERCASE METADATA
// -----------------------------------------------------------------------------
assert(
  CSLFormatters.capitalizeName("vaswani") === "Vaswani",
  "capitalizeName capitalizes all-lowercase surname"
);
assert(
  CSLFormatters.capitalizeName("SMITH") === "Smith",
  "capitalizeName capitalizes all-uppercase surname"
);
assert(
  CitationEngine.formatInBody(refLowercaseAuthor, 'parenthetical', 'apa7') === "(Mnih et al., 2015)",
  "formatInBody normalizes all-lowercase author surname to capitalized Mnih"
);
assert(
  CitationEngine.formatInBody(refLowercaseAuthor, 'narrative', 'apa7') === "Mnih et al. (2015)",
  "formatInBody narrative normalizes all-lowercase author surname"
);

// -----------------------------------------------------------------------------
// 2. ENTRY POINT 1: SIDE PANEL CARD [INSERT] BUTTON SIMULATION
// -----------------------------------------------------------------------------
interface MockEditor {
  content: string;
  cursor: { line: number; ch: number };
  getLine(line: number): string;
  getValue(): string;
  lineCount(): number;
  replaceRange(replacement: string, from: { line: number; ch: number }, to?: { line: number; ch: number }): void;
  setCursor(pos: { line: number; ch: number }): void;
}

function createMockEditor(initialText: string, cursorCh: number = 0, cursorLine: number = 0): MockEditor {
  return {
    content: initialText,
    cursor: { line: cursorLine, ch: cursorCh },
    getLine(l: number) {
      return this.content.split('\n')[l] || '';
    },
    getValue() {
      return this.content;
    },
    lineCount() {
      return this.content.split('\n').length;
    },
    replaceRange(replacement: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) {
      const curLines = this.content.split('\n');
      if (from.line >= curLines.length) {
        this.content = this.content + replacement;
        return;
      }
      const targetLine = curLines[from.line] || '';
      const endCh = to ? to.ch : from.ch;
      const before = targetLine.slice(0, from.ch);
      const after = targetLine.slice(endCh);
      curLines[from.line] = before + replacement + after;
      this.content = curLines.join('\n');
    },
    setCursor(pos: { line: number; ch: number }) {
      this.cursor = pos;
    }
  };
}

function simulateSidePanelInsert(
  editor: MockEditor,
  ref: ReferenceMetadata,
  style: CitationStyle = 'apa7',
  format: InBodyFormat = 'parenthetical',
  isFootnoteMode: boolean = false
) {
  const cursor = editor.cursor;
  const lineText = editor.getLine(cursor.line);
  const docText = editor.getValue();
  const existingFnMatches = docText.match(/^\[\^[^\]]+\]:/gm) || [];
  const footnoteIndex = existingFnMatches.length + 1;

  const overload = CitationEngine.detectAndOverloadAtCursor(
    lineText,
    cursor.ch,
    [ref],
    allRefsMap,
    style,
    format,
    isFootnoteMode,
    footnoteIndex
  );

  if (overload.isOverloaded) {
    editor.replaceRange(
      overload.replacementText,
      { line: cursor.line, ch: overload.replaceStartCh },
      { line: cursor.line, ch: overload.replaceEndCh }
    );
    editor.setCursor({ line: cursor.line, ch: overload.replaceStartCh + overload.replacementText.length });
  } else {
    editor.replaceRange(overload.replacementText, cursor);
    editor.setCursor({ line: cursor.line, ch: cursor.ch + overload.replacementText.length });
  }

  if (isFootnoteMode) {
    const updatedDocText = editor.getValue();
    const fnDefRegex = new RegExp(`^\\[\\^${ref.citekey}\\]:`, 'm');
    if (!fnDefRegex.test(updatedDocText)) {
      const fnDefinition = CitationEngine.formatFootnoteDefinition(ref, style, footnoteIndex);
      const hasTrailingNewline = updatedDocText.endsWith("\n");
      const separator = hasTrailingNewline ? "\n" : "\n\n";
      const lineCount = editor.lineCount();
      editor.replaceRange(`${separator}${fnDefinition}\n`, { line: lineCount, ch: 0 });
    }
  }
}

// 2.1 Standard APA 7 Insertion
let ed = createMockEditor("As discussed in ", 16);
simulateSidePanelInsert(ed, refA, 'apa7', 'parenthetical', false);
assert(ed.getValue() === "As discussed in (Vaswani et al., 2017)", "Side panel APA 7 parenthetical insertion");

// 2.2 Standard IEEE Numerical Insertion
ed = createMockEditor("The transformer architecture ", 29);
simulateSidePanelInsert(ed, refA, 'ieee', 'parenthetical', false);
assert(ed.getValue() === "The transformer architecture [1]", "Side panel IEEE numerical [1] insertion");

// 2.3 Standard Vancouver Numerical Insertion
ed = createMockEditor("Previous methods ", 17);
simulateSidePanelInsert(ed, refA, 'vancouver', 'parenthetical', false);
assert(ed.getValue() === "Previous methods (1)", "Side panel Vancouver numerical (1) insertion");

// 2.4 Narrative Insertion
ed = createMockEditor("According to ", 13);
simulateSidePanelInsert(ed, refA, 'apa7', 'narrative', false);
assert(ed.getValue() === "According to Vaswani et al. (2017)", "Side panel APA 7 narrative insertion");

// 2.5 Pandoc Citekey Insertion
ed = createMockEditor("Refer to ", 9);
simulateSidePanelInsert(ed, refA, 'apa7', 'citekey', false);
assert(ed.getValue() === "Refer to [@Vaswani2017]", "Side panel Pandoc citekey insertion");

// 2.6 Footnote Mode ON Insertion
ed = createMockEditor("# Introduction\n\nAttention mechanisms are widespread .\n", 36, 2);
simulateSidePanelInsert(ed, refA, 'apa7', 'footnote', true);
assert(ed.getValue().includes("Attention mechanisms are widespread [^Vaswani2017]."), "Footnote Mode ON inserts [^Vaswani2017] at cursor");
assert(ed.getValue().includes("[^Vaswani2017]: Vaswani, A.,"), "Footnote Mode ON appends footnote definition at bottom");

// 2.7 Cursor Overload & Compounding
ed = createMockEditor("See previous work (Vaswani et al., 2017)", 25);
simulateSidePanelInsert(ed, refB, 'apa7', 'parenthetical', false);
assert(ed.getValue() === "See previous work (Smith & Doe, 2020; Vaswani et al., 2017)", "Side panel merges into sorted compound author-date citation");

// -----------------------------------------------------------------------------
// 3. ENTRY POINT 2: EDITOR SUGGEST / AUTOCOMPLETE SIMULATION
// -----------------------------------------------------------------------------
function simulateEditorSuggest(
  editor: MockEditor,
  triggerMatch: string,
  selectedRef: ReferenceMetadata,
  style: CitationStyle = 'apa7',
  format: InBodyFormat = 'parenthetical',
  isFootnoteMode: boolean = false
) {
  const cursor = editor.cursor;
  const line = editor.getLine(cursor.line);
  const startCh = cursor.ch - triggerMatch.length;
  const isExplicitFootnote = triggerMatch.startsWith('[^');

  const activeFootnote = isExplicitFootnote || isFootnoteMode;
  const inBodyText = activeFootnote 
    ? `[^${selectedRef.citekey}]` 
    : CitationEngine.formatInBody(selectedRef, format, style);

  // Consume trailing auto-paired bracket if present
  let endCh = cursor.ch;
  if (line.slice(cursor.ch).startsWith(']')) endCh++;

  editor.replaceRange(inBodyText, { line: cursor.line, ch: startCh }, { line: cursor.line, ch: endCh });

  if (activeFootnote) {
    const docText = editor.getValue();
    const existingFnMatches = docText.match(/^\[\^[^\]]+\]:/gm) || [];
    const footnoteIndex = existingFnMatches.length + 1;
    const fnDefRegex = new RegExp(`^\\[\\^${selectedRef.citekey}\\]:`, 'm');
    if (!fnDefRegex.test(docText)) {
      const fnDefinition = CitationEngine.formatFootnoteDefinition(selectedRef, style, footnoteIndex);
      const separator = docText.endsWith("\n") ? "\n" : "\n\n";
      editor.replaceRange(`${separator}${fnDefinition}\n`, { line: editor.lineCount(), ch: 0 });
    }
  }
}

// 3.1 Trigger [@vasw (all lowercase query) -> (Vaswani et al., 2017)
ed = createMockEditor("Transformer models [@vasw", 25);
simulateEditorSuggest(ed, "[@vasw", refA, 'apa7', 'parenthetical', false);
assert(ed.getValue() === "Transformer models (Vaswani et al., 2017)", "Editor suggest replaces lowercase [@vasw with capitalized (Vaswani et al., 2017)");

// 3.2 Trigger @vasw (direct @ query) -> [@Vaswani2017] in citekey format
ed = createMockEditor("See @vasw", 9);
simulateEditorSuggest(ed, "@vasw", refA, 'apa7', 'citekey', false);
assert(ed.getValue() === "See [@Vaswani2017]", "Editor suggest replaces @vasw with canonical uppercase [@Vaswani2017]");

// 3.3 Trigger [^vasw (footnote callout query) -> [^Vaswani2017]
ed = createMockEditor("# Introduction\n\nRecent models [^vasw\n", 20, 2);
simulateEditorSuggest(ed, "[^vasw", refA, 'apa7', 'footnote', true);
assert(ed.getValue().includes("Recent models [^Vaswani2017]"), "Editor suggest replaces lowercase [^vasw with canonical [^Vaswani2017]");
assert(ed.getValue().includes("[^Vaswani2017]: Vaswani, A.,"), "Editor suggest in footnote mode appends canonical footnote definition");

// 3.4 Trigger ((smith -> Smith and Doe (2020)
ed = createMockEditor("As shown by ((smith", 19);
simulateEditorSuggest(ed, "((smith", refB, 'apa7', 'narrative', false);
assert(ed.getValue() === "As shown by Smith and Doe (2020)", "Editor suggest replaces lowercase ((smith with capitalized narrative");

// -----------------------------------------------------------------------------
// 4. ENTRY POINT 3: MULTI-CITATION MODAL GROUP INSERTION
// -----------------------------------------------------------------------------
function simulateMultiCitationModalInsert(
  editor: MockEditor,
  refs: ReferenceMetadata[],
  style: CitationStyle = 'apa7',
  format: InBodyFormat = 'parenthetical'
) {
  const multiText = CitationEngine.formatMultiInBody(refs, format, style);
  editor.replaceRange(multiText, editor.cursor);
}

ed = createMockEditor("Multiple sources suggest ", 25);
simulateMultiCitationModalInsert(ed, [refB, refA, refC], 'apa7', 'parenthetical');
assert(
  ed.getValue() === "Multiple sources suggest (Jones, 2021; Smith & Doe, 2020; Vaswani et al., 2017)",
  "Multi-citation modal insertion produces sorted compound citation"
);

console.log("================================================================================");
console.log(`  ALL CITATION INSERTION & CAPITALIZATION TESTS PASSING (${passCount}/${passCount})!`);
console.log("================================================================================");
