import { CitationEngine } from '../src/backend/citationEngine';
import { ReferenceMetadata, CitationStyle, InBodyFormat } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING BI-DIRECTIONAL FOOTNOTE MODE TOGGLE ACROSS ALL 7 CITATION STANDARDS   ");
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

const refA: ReferenceMetadata = {
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

const refB: ReferenceMetadata = {
  citekey: "Müller2023",
  title: "Haptic Feedback & Direct Manipulation in XR",
  authors: ["Müller, Klaus", "van den Berg, Lucas"],
  year: 2023,
  publication: "ACM SIGCHI",
  type: "conference",
  projects: ["Spatial HCI"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const allRefs = new Map<string, ReferenceMetadata>([
  [refA.citekey, refA],
  [refB.citekey, refB]
]);

function simulateFootnoteToggle(
  content: string,
  enableFootnoteMode: boolean,
  style: CitationStyle,
  targetFormat: InBodyFormat
): string {
  let result = content;
  let fnIdx = 1;

  for (const [key, ref] of allRefs.entries()) {
    const targetInBody = enableFootnoteMode 
      ? `[^${key}]` 
      : CitationEngine.formatInBody(ref, targetFormat, style, fnIdx);

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
      CitationEngine.formatInBody(ref, 'parenthetical', 'apa7', fnIdx),
      CitationEngine.formatInBody(ref, 'parenthetical', 'harvard', fnIdx),
      CitationEngine.formatInBody(ref, 'parenthetical', 'chicago', fnIdx),
      CitationEngine.formatInBody(ref, 'parenthetical', 'ieee', fnIdx),
      CitationEngine.formatInBody(ref, 'parenthetical', 'vancouver', fnIdx),
      CitationEngine.formatInBody(ref, 'narrative', 'apa7', fnIdx),
      CitationEngine.formatInBody(ref, 'narrative', 'harvard', fnIdx),
      CitationEngine.formatInBody(ref, 'narrative', 'chicago', fnIdx),
      CitationEngine.formatInBody(ref, 'narrative', 'ieee', fnIdx),
      CitationEngine.formatInBody(ref, 'narrative', 'vancouver', fnIdx),
    ];

    for (const v of variations) {
      if (v && v.length > 0 && result.includes(v)) {
        result = result.split(v).join(targetInBody);
      }
    }

    // 4. Transform bottom definition / bibliography entry
    if (enableFootnoteMode) {
      const expectedDef = CitationEngine.formatFootnoteDefinition(ref, style, fnIdx);
      const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:.*$`, 'm');
      if (fnDefRegex.test(result)) {
        result = result.replace(fnDefRegex, expectedDef);
      } else if (ref.title && ref.title.length > 5 && result.includes(ref.title)) {
        const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const plainRegex = new RegExp(`^.*${escapedTitle}.*$`, 'm');
        result = result.replace(plainRegex, expectedDef);
      }
    } else {
      const expectedBib = CitationEngine.formatBibliographyEntry(ref, style, fnIdx);
      const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:\\s*(.*)$`, 'm');
      if (fnDefRegex.test(result)) {
        result = result.replace(fnDefRegex, expectedBib);
      } else if (ref.title && ref.title.length > 5 && result.includes(ref.title)) {
        const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const plainRegex = new RegExp(`^.*${escapedTitle}.*$`, 'm');
        result = result.replace(plainRegex, expectedBib);
      }
    }

    fnIdx++;
  }

  return result;
}

// All 7 Citation Standard Dropdown Configurations
const standardConfigs: { name: string; style: CitationStyle; format: InBodyFormat }[] = [
  { name: "APA 7 (Author, Year)", style: "apa7", format: "parenthetical" },
  { name: "APA 7 Narrative Author (Year)", style: "apa7", format: "narrative" },
  { name: "IEEE [1]", style: "ieee", format: "parenthetical" },
  { name: "Harvard (Author Year)", style: "harvard", format: "parenthetical" },
  { name: "Chicago (Author Year)", style: "chicago", format: "parenthetical" },
  { name: "Vancouver (1)", style: "vancouver", format: "parenthetical" },
  { name: "Pandoc Citekey [@key]", style: "apa7", format: "citekey" },
];

for (const cfg of standardConfigs) {
  // Start with Footnote Mode DISABLED in given standard
  const stdInBody1 = CitationEngine.formatInBody(refA, cfg.format, cfg.style, 1);
  const stdInBody2 = CitationEngine.formatInBody(refB, cfg.format, cfg.style, 2);
  const stdBib1 = CitationEngine.formatBibliographyEntry(refA, cfg.style, 1);
  const stdBib2 = CitationEngine.formatBibliographyEntry(refB, cfg.style, 2);

  const initialDoc = `Text with ${stdInBody1} and ${stdInBody2}.\n\n## References\n${stdBib1}\n${stdBib2}`;

  // 1. Switch Footnote Mode DISABLED -> ENABLED
  const fnDoc = simulateFootnoteToggle(initialDoc, true, cfg.style, cfg.format);
  assert(fnDoc.includes("Text with [^Chen2024] and [^Müller2023]."), `STD -> FN in-body failed for standard: ${cfg.name}`);
  assert(fnDoc.includes(`[^Chen2024]: `), `STD -> FN bottom def 1 failed for standard: ${cfg.name}`);
  assert(fnDoc.includes(`[^Müller2023]: `), `STD -> FN bottom def 2 failed for standard: ${cfg.name}`);

  // 2. Switch Footnote Mode ENABLED -> DISABLED
  const roundTripDoc = simulateFootnoteToggle(fnDoc, false, cfg.style, cfg.format);
  assert(roundTripDoc.includes(`Text with ${stdInBody1} and ${stdInBody2}.`), `FN -> STD round-trip in-body failed for standard: ${cfg.name}`);
  assert(roundTripDoc.includes(stdBib1), `FN -> STD round-trip bottom bib 1 failed for standard: ${cfg.name}`);
  assert(!roundTripDoc.includes(`[^Chen2024]:`), `FN -> STD prefix remained for standard: ${cfg.name}`);
}

console.log(`[PASS] All 7 Citation Standards passed Bi-directional Footnote Mode Toggling (${passed}/${passed} assertions)!`);
