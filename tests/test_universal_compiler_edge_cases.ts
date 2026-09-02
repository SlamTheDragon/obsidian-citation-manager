import { FormatPropagator } from '../src/backend/indexing/formatPropagator';
import { CitationEngine } from '../src/backend/citationEngine';
import { ReferenceMetadata } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING UNIVERSAL CITATION COMPILER EDGE CASES & INPUT FORMS                 ");
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

const allRefs = new Map<string, ReferenceMetadata>();

const refA: ReferenceMetadata = {
  citekey: 'Smith.2020',
  title: 'Attention in Spatial Displays',
  authors: ['Smith, John', 'Doe, Jane'],
  year: 2020,
  type: 'journal',
  projects: []
};

const refB: ReferenceMetadata = {
  citekey: 'Brown_2021',
  title: 'Haptic Feedback Telemetry',
  authors: ['Brown, Alex'],
  year: 2021,
  type: 'conference',
  projects: []
};

const refC: ReferenceMetadata = {
  citekey: 'Vaswani2017',
  title: 'Attention Is All You Need',
  authors: ['Vaswani, Ashish', 'Shazeer, Noam'],
  year: 2017,
  type: 'conference',
  projects: []
};

allRefs.set(refA.citekey, refA);
allRefs.set(refB.citekey, refB);
allRefs.set(refC.citekey, refC);

const indexMap = new Map<string, number>([
  ['Smith.2020', 1],
  ['Brown_2021', 2],
  ['Vaswani2017', 3],
]);

// 1. Test Dot & Special Chars in Citekeys Escaped Properly
const textWithSpecialChars = `Special citekey callout [^Smith.2020] and adjacent [^Smith.2020][^Brown_2021].`;
const compiledApa = FormatPropagator.compileDocumentText(textWithSpecialChars, allRefs, 'apa7', false, indexMap, true);
assert(compiledApa.includes('(Brown, 2021; Smith & Doe, 2020)'), "Adjacent footnotes with dot and underscore citekeys coalesced into sorted APA 7 parenthetical");

// 2. Test Narrative Citations Converted to IEEE and Vancouver
const textWithNarrative = `Prior studies by Vaswani and Shazeer (2017) demonstrated transformer scaling.`;
const compiledIeeeNarrative = FormatPropagator.compileDocumentText(textWithNarrative, allRefs, 'ieee', false, indexMap, true);
assert(compiledIeeeNarrative.includes('Vaswani and Shazeer [3]'), "Narrative citation converted to IEEE number [3]");

const compiledVancNarrative = FormatPropagator.compileDocumentText(textWithNarrative, allRefs, 'vancouver', false, indexMap, true);
assert(compiledVancNarrative.includes('Vaswani and Shazeer (3)'), "Narrative citation converted to Vancouver number (3)");

const compiledFnNarrative = FormatPropagator.compileDocumentText(textWithNarrative, allRefs, 'apa7', true, indexMap, false);
assert(compiledFnNarrative.includes('Vaswani and Shazeer [^Vaswani2017]'), "Narrative citation converted to Footnote anchor [^Vaswani2017]");

// 3. Test 3-Way Adjacent Number Coalescing in Vancouver & IEEE
const textWith3AdjacentNumerics = `Multiple findings [^Smith.2020][^Brown_2021] [^Vaswani2017].`;
const compiled3Ieee = FormatPropagator.compileDocumentText(textWith3AdjacentNumerics, allRefs, 'ieee', false, indexMap, true);
assert(compiled3Ieee.includes('[1, 2, 3]'), "Three adjacent footnote calls coalesced into single ascending IEEE bracket [1, 2, 3]");

const compiled3Vanc = FormatPropagator.compileDocumentText(textWith3AdjacentNumerics, allRefs, 'vancouver', false, indexMap, true);
assert(compiled3Vanc.includes('(1, 2, 3)'), "Three adjacent footnote calls coalesced into single ascending Vancouver paren (1, 2, 3)");

// 4. Test Missing Footnote Definition Appended in Footnote Mode ON
const textWithoutFootnoteDef = `A document with only an in-body citekey [@Vaswani2017].`;
const compiledFnWithGeneratedDef = FormatPropagator.compileDocumentText(textWithoutFootnoteDef, allRefs, 'apa7', true, indexMap, false);
assert(compiledFnWithGeneratedDef.includes('[^Vaswani2017]'), "In-body citekey converted to [^Vaswani2017]");
assert(compiledFnWithGeneratedDef.includes('[^Vaswani2017]: Vaswani, Ashish, & Shazeer, Noam (2017).') || compiledFnWithGeneratedDef.includes('Attention Is All You Need'), "Missing footnote definition appended at the bottom of note");

console.log(`================================================================================`);
console.log(`  ALL UNIVERSAL COMPILER TESTS PASSED (${passCount}/${passCount})!`);
console.log(`================================================================================`);
