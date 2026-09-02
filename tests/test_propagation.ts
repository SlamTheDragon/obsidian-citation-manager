import { CitationEngine } from '../src/backend/citationEngine';
import { ReferenceMetadata, CitationStyle, InBodyFormat } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING CROSS-STANDARD IN-BODY & BOTTOM PROPAGATION                           ");
console.log("================================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    failed++;
    throw new Error(msg);
  } else {
    passed++;
  }
}

const ref: ReferenceMetadata = {
  citekey: "Chen2024",
  title: "Understanding Phantom Tactile Sensation on Commercially Available Social Virtual Reality Platforms",
  authors: ["Chen, Qi", "Spapé, Michiel M.", "Jacucci, Giulio"],
  year: 2024,
  publication: "ACM TOCHI",
  type: "journal",
  projects: ["Spatial HCI"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const allRefs = new Map<string, ReferenceMetadata>([[ref.citekey, ref]]);

function simulatePropagation(
  content: string, 
  newFormat: InBodyFormat, 
  newStyle: CitationStyle, 
  globalFootnoteMode: boolean
): string {
  let result = content;
  let fnIdx = 1;

  for (const [key, r] of allRefs.entries()) {
    const targetInBody = globalFootnoteMode ? `[^${key}]` : CitationEngine.formatInBody(r, newFormat, newStyle, fnIdx);

    // 1. Citekey format [@key]
    const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
    if (citekeyRegex.test(result)) {
      result = result.replace(citekeyRegex, targetInBody);
    }

    // 2. Footnote call [^key]
    const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
    if (footnoteCallRegex.test(result)) {
      result = result.replace(footnoteCallRegex, targetInBody);
    }

    // 3. Known format variations across all possible styles
    const variations = [
      CitationEngine.formatInBody(r, 'parenthetical', 'apa7', fnIdx),
      CitationEngine.formatInBody(r, 'parenthetical', 'harvard', fnIdx),
      CitationEngine.formatInBody(r, 'parenthetical', 'chicago', fnIdx),
      CitationEngine.formatInBody(r, 'parenthetical', 'ieee', fnIdx),
      CitationEngine.formatInBody(r, 'parenthetical', 'vancouver', fnIdx),
      CitationEngine.formatInBody(r, 'narrative', 'apa7', fnIdx),
      CitationEngine.formatInBody(r, 'narrative', 'harvard', fnIdx),
      CitationEngine.formatInBody(r, 'narrative', 'chicago', fnIdx),
      CitationEngine.formatInBody(r, 'narrative', 'ieee', fnIdx),
      CitationEngine.formatInBody(r, 'narrative', 'vancouver', fnIdx),
    ];

    for (const v of variations) {
      if (v && v.length > 0 && result.includes(v)) {
        result = result.split(v).join(targetInBody);
      }
    }

    // 4. Transform bottom definition / bibliography entry
    if (globalFootnoteMode) {
      const fnDef = CitationEngine.formatFootnoteDefinition(r, newStyle, fnIdx);
      const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:.*$`, 'm');
      if (fnDefRegex.test(result)) {
        result = result.replace(fnDefRegex, fnDef);
      } else {
        const escapedTitle = r.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const plainRegex = new RegExp(`^.*${escapedTitle}.*$`, 'm');
        if (plainRegex.test(result)) {
          result = result.replace(plainRegex, fnDef);
        }
      }
    } else {
      const expectedBib = CitationEngine.formatBibliographyEntry(r, newStyle, fnIdx);
      const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:\\s*(.*)$`, 'm');
      if (fnDefRegex.test(result)) {
        result = result.replace(fnDefRegex, expectedBib);
      } else if (r.title && r.title.length > 5 && result.includes(r.title)) {
        const escapedTitle = r.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const plainRegex = new RegExp(`^.*${escapedTitle}.*$`, 'm');
        result = result.replace(plainRegex, expectedBib);
      }
    }

    fnIdx++;
  }

  return result;
}

// TEST CASE 1: APA 7 -> IEEE (Footnote Mode OFF)
const docAPA = `This method provides tactile illusions (Chen et al., 2024).\n\n## References\nChen, Q., Spapé, M. M., & Jacucci, G. (2024). Understanding Phantom Tactile Sensation on Commercially Available Social Virtual Reality Platforms. *ACM TOCHI*, *31*(4), 1-34.`;

const docIEEE = simulatePropagation(docAPA, 'parenthetical', 'ieee', false);
assert(docIEEE.includes("This method provides tactile illusions [1]."), `APA -> IEEE in-body failed: ${docIEEE}`);
assert(docIEEE.includes("[1] Q. Chen, M. M. Spapé, and G. Jacucci"), `APA -> IEEE bottom failed: ${docIEEE}`);
console.log("[PASS] Test 1: APA 7 -> IEEE (Footnote Mode OFF) converted both in-body and bottom correctly.");

// TEST CASE 2: IEEE -> Harvard (Footnote Mode OFF)
const docHarvard = simulatePropagation(docIEEE, 'parenthetical', 'harvard', false);
assert(docHarvard.includes("This method provides tactile illusions (Chen et al. 2024)."), `IEEE -> Harvard in-body failed: ${docHarvard}`);
assert(docHarvard.includes("Chen, Q., Spapé, M. M. and Jacucci, G. (2024)"), `IEEE -> Harvard bottom failed: ${docHarvard}`);
console.log("[PASS] Test 2: IEEE -> Harvard (Footnote Mode OFF) converted correctly.");

// TEST CASE 3: Harvard -> Vancouver (Footnote Mode OFF)
const docVancouver = simulatePropagation(docHarvard, 'parenthetical', 'vancouver', false);
assert(docVancouver.includes("This method provides tactile illusions (1)."), `Harvard -> Vancouver in-body failed: ${docVancouver}`);
assert(docVancouver.includes("1. Chen Qi, Spapé Michiel M"), `Harvard -> Vancouver bottom failed: ${docVancouver}`);
console.log("[PASS] Test 3: Harvard -> Vancouver (Footnote Mode OFF) converted correctly.");

// TEST CASE 4: Vancouver -> Footnote Mode ON (APA 7)
const docFootnote = simulatePropagation(docVancouver, 'parenthetical', 'apa7', true);
assert(docFootnote.includes("This method provides tactile illusions [^Chen2024]."), `Vancouver -> Footnote ON in-body failed: ${docFootnote}`);
assert(docFootnote.includes("[^Chen2024]: Chen, Q., Spapé, M. M., & Jacucci, G. (2024)"), `Vancouver -> Footnote ON bottom failed: ${docFootnote}`);
console.log("[PASS] Test 4: Vancouver -> Footnote Mode ON converted correctly.");

// TEST CASE 5: Footnote Mode ON -> APA 7 Narrative (Footnote Mode OFF)
const docNarrative = simulatePropagation(docFootnote, 'narrative', 'apa7', false);
assert(docNarrative.includes("This method provides tactile illusions Chen et al. (2024)."), `Footnote ON -> Narrative in-body failed: ${docNarrative}`);
assert(!docNarrative.includes("[^Chen2024]:"), `Footnote prefix remained in Narrative mode!`);
console.log("[PASS] Test 5: Footnote Mode ON -> Narrative (Footnote Mode OFF) converted correctly.");

console.log(`\nALL PROPAGATION SIMULATION TESTS PASSED (${passed}/${passed})!`);
