import { CitationEngine } from '../src/citationEngine';
import { ReferenceMetadata, CitationStyle, InBodyFormat } from '../src/types';

console.log("================================================================================");
console.log("  TESTING CITATION OVERLOADING & IN-PLACE MERGING AT CURSOR                     ");
console.log("  Testing all formatting types, bracket groups, and cursor positions            ");
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
  citekey: "Smith2020",
  title: "Foundations of Spatial Audio",
  authors: ["Smith, John"],
  year: 2020,
  type: "journal",
  projects: ["Spatial HCI"],
  dateAdded: "2020-01-01",
  dateModified: "2020-01-01"
};

const refB: ReferenceMetadata = {
  citekey: "Jones2021",
  title: "Haptic Feedback Synthesis",
  authors: ["Jones, Alice", "Brown, Bob"],
  year: 2021,
  type: "journal",
  projects: ["Spatial HCI"],
  dateAdded: "2021-01-01",
  dateModified: "2021-01-01"
};

const refC: ReferenceMetadata = {
  citekey: "Chen2024",
  title: "Phantom Tactile Sensation",
  authors: ["Chen, Qi", "Spapé, Michiel M."],
  year: 2024,
  type: "journal",
  projects: ["Spatial HCI"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const allRefs = new Map<string, ReferenceMetadata>([
  [refA.citekey, refA],
  [refB.citekey, refB],
  [refC.citekey, refC]
]);

// Helper: Author Year Index
const authorYearIndex = new Map<string, ReferenceMetadata>();
for (const r of allRefs.values()) {
  if (r.authors && r.authors.length > 0 && r.year) {
    const firstAuthor = r.authors[0].split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    authorYearIndex.set(`${firstAuthor}_${r.year}`, r);
    if (r.authors.length > 1) {
      const secondAuthor = r.authors[1].split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      authorYearIndex.set(`${firstAuthor}_${secondAuthor}_${r.year}`, r);
    }
  }
}

interface OverloadResult {
  isOverloaded: boolean;
  replaceStartCh: number;
  replaceEndCh: number;
  replacementText: string;
  allRefsInGroup: ReferenceMetadata[];
}

function detectAndOverloadAtCursor(
  line: string,
  cursorCh: number,
  newRefs: ReferenceMetadata[],
  style: CitationStyle = 'apa7',
  format: InBodyFormat | 'footnote' = 'parenthetical',
  isFootnoteMode: boolean = false,
  startIndex: number = 1
): OverloadResult {
  const targetFormat: InBodyFormat | 'footnote' = isFootnoteMode ? 'footnote' : format;

  // 1. Pandoc Citekey Group: [... @key ...]
  const citeGroupRegex = /\[([^\]]*@[\p{L}\p{N}_:\.-]+[^\]]*)\]/gu;
  let match: RegExpExecArray | null;
  while ((match = citeGroupRegex.exec(line)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    if (cursorCh >= start && cursorCh <= end) {
      const keys = Array.from(match[1].matchAll(/@([\p{L}\p{N}_:\.-]+)/gu)).map(m => m[1]);
      const existingRefs: ReferenceMetadata[] = [];
      for (const k of keys) {
        if (allRefs.has(k)) existingRefs.push(allRefs.get(k)!);
      }
      const mergedRefs = [...existingRefs];
      for (const nr of newRefs) {
        if (!mergedRefs.some(r => r.citekey === nr.citekey)) mergedRefs.push(nr);
      }
      const replacementText = CitationEngine.formatMultiInBody(mergedRefs, targetFormat, style, startIndex);
      return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: mergedRefs };
    }
  }

  // 2. Parenthetical Author-Date Group: (Smith, 2020) or (Smith, 2020; Jones & Brown, 2021)
  if (!isFootnoteMode && (style === 'apa7' || style === 'harvard' || style === 'chicago')) {
    const parenGroupRegex = /\(([^)]*(?:19\d{2}|20\d{2})[^)]*)\)/gu;
    while ((match = parenGroupRegex.exec(line)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (cursorCh >= start && cursorCh <= end) {
        const entries = match[1].split(';').map(s => s.trim()).filter(Boolean);
        const existingRefs: ReferenceMetadata[] = [];
        for (const entry of entries) {
          const yearMatch = entry.match(/\b(19\d{2}|20\d{2})\b/);
          if (yearMatch) {
            const year = yearMatch[1];
            const authorPart = entry.slice(0, entry.indexOf(year)).replace(/[,:\(\)]/g, '').trim().toLowerCase();
            const parts = authorPart.split(/[\s,&]+/).filter(Boolean).map(p => p.replace(/[^a-z0-9]/g, ''));
            let matched: ReferenceMetadata | undefined;
            if (parts.length >= 2) {
              matched = authorYearIndex.get(`${parts[0]}_${parts[1]}_${year}`) || authorYearIndex.get(`${parts[0]}_${year}`);
            } else if (parts.length === 1) {
              matched = authorYearIndex.get(`${parts[0]}_${year}`);
            }
            if (matched) existingRefs.push(matched);
          }
        }
        const mergedRefs = [...existingRefs];
        for (const nr of newRefs) {
          if (!mergedRefs.some(r => r.citekey === nr.citekey)) mergedRefs.push(nr);
        }
        const replacementText = CitationEngine.formatMultiInBody(mergedRefs, targetFormat, style, startIndex);
        return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: mergedRefs };
      }
    }
  }

  // 3. IEEE Numeric Bracket Group: [1] or [1, 2]
  if (!isFootnoteMode && style === 'ieee') {
    const ieeeBracketRegex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
    while ((match = ieeeBracketRegex.exec(line)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (cursorCh >= start && cursorCh <= end) {
        const existingIndices = match[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        const newIndices = [...existingIndices];
        for (let i = 0; i < newRefs.length; i++) {
          const nextIdx = Math.max(...newIndices, 0) + 1;
          newIndices.push(nextIdx);
        }
        const replacementText = `[${newIndices.join(', ')}]`;
        return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: newRefs };
      }
    }
  }

  // 4. Vancouver Numeric Paren Group: (1) or (1, 2)
  if (!isFootnoteMode && style === 'vancouver') {
    const vancParenRegex = /\((\d+(?:\s*,\s*\d+)*)\)/g;
    while ((match = vancParenRegex.exec(line)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (cursorCh >= start && cursorCh <= end) {
        const existingIndices = match[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        const newIndices = [...existingIndices];
        for (let i = 0; i < newRefs.length; i++) {
          const nextIdx = Math.max(...newIndices, 0) + 1;
          newIndices.push(nextIdx);
        }
        const replacementText = `(${newIndices.join(', ')})`;
        return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: newRefs };
      }
    }
  }

  // 5. Footnote Call: [^key]
  if (isFootnoteMode || format === 'footnote') {
    const fnCallRegex = /\[\^([\p{L}\p{N}_:\.-]+)\](?!:)/gu;
    while ((match = fnCallRegex.exec(line)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (cursorCh >= start && cursorCh <= end) {
        // Append adjacent footnote cleanly immediately after existing footnote bracket
        const newFootnotes = newRefs.map(r => `[^${r.citekey}]`).join('');
        return { isOverloaded: true, replaceStartCh: end, replaceEndCh: end, replacementText: newFootnotes, allRefsInGroup: newRefs };
      }
    }
  }

  // Default: Normal prose insertion
  const defaultText = CitationEngine.formatMultiInBody(newRefs, targetFormat, style, startIndex);
  return { isOverloaded: false, replaceStartCh: cursorCh, replaceEndCh: cursorCh, replacementText: defaultText, allRefsInGroup: newRefs };
}

// -----------------------------------------------------------------------------
// TEST SUITE: OVERLOADING ACROSS ALL FORMATS & PERMUTATIONS
// -----------------------------------------------------------------------------

console.log("\n--- TEST 1: Pandoc Citekey Group Overloading [@Smith2020] + Jones2021 ---");
const line1 = "Recent results demonstrate spatial immersion [@Smith2020].";
const res1 = detectAndOverloadAtCursor(line1, 48, [refB], 'apa7', 'citekey', false);
assert(res1.isOverloaded, "Pandoc citekey overloading failed to activate!");
assert(res1.replacementText === "[@Smith2020; @Jones2021]" || res1.replacementText === "[@Jones2021; @Smith2020]", `Citekey merge failed: ${res1.replacementText}`);
const newLine1 = line1.slice(0, res1.replaceStartCh) + res1.replacementText + line1.slice(res1.replaceEndCh);
assert(newLine1 === "Recent results demonstrate spatial immersion [@Smith2020; @Jones2021]." || newLine1 === "Recent results demonstrate spatial immersion [@Jones2021; @Smith2020].", `Resulting text malformed: ${newLine1}`);
console.log(`[PASS] Test 1: Pandoc Citekey merged: ${newLine1}`);

console.log("\n--- TEST 2: APA 7 Parenthetical Overloading (Smith, 2020) + Jones2021 ---");
const line2 = "Prior studies confirmed haptic latency (Smith, 2020).";
const res2 = detectAndOverloadAtCursor(line2, 45, [refB], 'apa7', 'parenthetical', false);
assert(res2.isOverloaded, "APA 7 parenthetical overloading failed to activate!");
assert(res2.replacementText === "(Jones & Brown, 2021; Smith, 2020)", `APA merge failed: ${res2.replacementText}`);
const newLine2 = line2.slice(0, res2.replaceStartCh) + res2.replacementText + line2.slice(res2.replaceEndCh);
assert(newLine2 === "Prior studies confirmed haptic latency (Jones & Brown, 2021; Smith, 2020).", `Resulting text malformed: ${newLine2}`);
console.log(`[PASS] Test 2: APA 7 merged with alphabetical sorting: ${newLine2}`);

console.log("\n--- TEST 3: IEEE Numeric Overloading [1] + Jones2021 ---");
const line3 = "High frame rate decreases sickness [1].";
const res3 = detectAndOverloadAtCursor(line3, 36, [refB], 'ieee', 'parenthetical', false, 2);
assert(res3.isOverloaded, "IEEE numeric overloading failed to activate!");
assert(res3.replacementText === "[1, 2]", `IEEE merge failed: ${res3.replacementText}`);
const newLine3 = line3.slice(0, res3.replaceStartCh) + res3.replacementText + line3.slice(res3.replaceEndCh);
assert(newLine3 === "High frame rate decreases sickness [1, 2].", `Resulting text malformed: ${newLine3}`);
console.log(`[PASS] Test 3: IEEE numeric merged: ${newLine3}`);

console.log("\n--- TEST 4: Vancouver Numeric Overloading (1) + Jones2021 ---");
const line4 = "High frame rate decreases sickness (1).";
const res4 = detectAndOverloadAtCursor(line4, 36, [refB], 'vancouver', 'parenthetical', false, 2);
assert(res4.isOverloaded, "Vancouver numeric overloading failed to activate!");
assert(res4.replacementText === "(1, 2)", `Vancouver merge failed: ${res4.replacementText}`);
const newLine4 = line4.slice(0, res4.replaceStartCh) + res4.replacementText + line4.slice(res4.replaceEndCh);
assert(newLine4 === "High frame rate decreases sickness (1, 2).", `Resulting text malformed: ${newLine4}`);
console.log(`[PASS] Test 4: Vancouver numeric merged: ${newLine4}`);

console.log("\n--- TEST 5: Footnote Mode ON Overloading [^Smith2020] + Jones2021 ---");
const line5 = "Sensory integration was evaluated [^Smith2020].";
const res5 = detectAndOverloadAtCursor(line5, 38, [refB], 'apa7', 'parenthetical', true);
assert(res5.isOverloaded, "Footnote mode overloading failed to activate!");
assert(res5.replacementText === "[^Jones2021]", `Footnote append failed: ${res5.replacementText}`);
const newLine5 = line5.slice(0, res5.replaceStartCh) + res5.replacementText + line5.slice(res5.replaceEndCh);
assert(newLine5 === "Sensory integration was evaluated [^Smith2020][^Jones2021].", `Resulting text malformed: ${newLine5}`);
console.log(`[PASS] Test 5: Footnote adjacent token appended: ${newLine5}`);

console.log("\n--- TEST 6: Normal Prose Insertion (No Overloading) ---");
const line6 = "Here is fresh text where user inserts a citation.";
const res6 = detectAndOverloadAtCursor(line6, 49, [refA], 'apa7', 'parenthetical', false);
assert(!res6.isOverloaded, "Normal prose falsely detected as overloaded!");
assert(res6.replacementText === "(Smith, 2020)", `Normal text failed: ${res6.replacementText}`);
console.log("[PASS] Test 6: Normal prose insertion behaves standardly.");

console.log(`\n================================================================================`);
console.log(`  ALL CITATION OVERLOADING TESTS PASSED (${passed}/${passed} ASSERTIONS)!        `);
console.log(`================================================================================`);
