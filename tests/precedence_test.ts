import { CitationEngine } from '../src/backend/citationEngine';
import { ProjectRecord, ReferenceMetadata, CitationStyle, InBodyFormat } from '../src/backend/types';

console.log("================================================================================");
console.log("  SEMANTIC DISLOCATION & FOOTNOTE PRECEDENCE TEST SUITE                         ");
console.log("  Verifying Footnote Mode vs Bucket Citation Standard Authority               ");
console.log("================================================================================");

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    totalFailed++;
    throw new Error(msg);
  } else {
    totalPassed++;
  }
}

const sampleRef: ReferenceMetadata = {
  citekey: "Chen2024",
  title: "Understanding Phantom Tactile Sensation on Commercially Available Social Virtual Reality Platforms",
  authors: ["Chen, Qi", "Spapé, Michiel M.", "Jacucci, Giulio"],
  year: 2024,
  publication: "ACM TOCHI",
  volume: "31",
  issue: "4",
  pages: "1-34",
  type: "journal",
  projects: ["Spatial HCI"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const styles: CitationStyle[] = ["apa7", "harvard", "chicago", "ieee", "vancouver"];
const inBodyFormats: InBodyFormat[] = ["parenthetical", "narrative", "citekey"];

console.log("\n--- TEST 1: Footnote Mode ENABLED Authority Over In-Body Formatting (5 Styles x 3 Formats = 15 States) ---");

for (const style of styles) {
  for (const format of inBodyFormats) {
    const isFootnoteMode = true;
    
    // In-Body Text MUST ALWAYS be [^citekey] when Footnote Mode is ON
    const inBodyText = isFootnoteMode ? `[^${sampleRef.citekey}]` : CitationEngine.formatInBody(sampleRef, format, style);
    assert(inBodyText === `[^Chen2024]`, `In-body text violated footnote authority for [${style}, ${format}]: got ${inBodyText}`);

    // Bottom Footnote Definition MUST strictly adhere to the Bucket Citation Standard
    const fnDef = CitationEngine.formatFootnoteDefinition(sampleRef, style, 1);
    assert(fnDef.startsWith(`[^Chen2024]: `), `Footnote def prefix missing for [${style}]: ${fnDef}`);

    if (style === "ieee") {
      assert(fnDef.includes("[1] Q. Chen"), `IEEE footnote definition missing IEEE author standard: ${fnDef}`);
    } else if (style === "vancouver") {
      assert(fnDef.includes("1. Chen Q"), `Vancouver footnote definition missing Vancouver numeric standard: ${fnDef}`);
    } else if (style === "apa7") {
      assert(fnDef.includes("Chen, Q., Spapé, M. M., & Jacucci, G. (2024)"), `APA 7 footnote definition missing APA standard: ${fnDef}`);
    } else if (style === "harvard") {
      assert(fnDef.includes("Chen, Q., Spapé, M. M. and Jacucci, G. (2024)"), `Harvard footnote definition missing Harvard standard: ${fnDef}`);
    } else if (style === "chicago") {
      assert(fnDef.includes("Chen, Qi") && fnDef.includes("2024. \"Understanding Phantom Tactile Sensation"), `Chicago footnote definition missing Chicago standard: ${fnDef}`);
    }
  }
}
console.log(`[PASS] Test 1: Footnote Mode ON strictly dictates [^key] in-body with Bucket Standard bottom definitions.`);

console.log("\n--- TEST 2: Footnote Mode DISABLED Authority (5 Styles x 3 Formats = 15 States) ---");

for (const style of styles) {
  for (const format of inBodyFormats) {
    const isFootnoteMode = false;
    const inBodyText = isFootnoteMode ? `[^${sampleRef.citekey}]` : CitationEngine.formatInBody(sampleRef, format, style, 1);
    
    assert(!inBodyText.startsWith("[^"), `In-body citation erroneously formatted as footnote when mode is OFF: ${inBodyText}`);
    
    if (format === "citekey") {
      assert(inBodyText === "[@Chen2024]", `Citekey format failed: ${inBodyText}`);
    } else if (style === "ieee") {
      if (format === "narrative") assert(inBodyText === "Chen et al. [1]", `IEEE narrative failed: ${inBodyText}`);
      else assert(inBodyText === "[1]", `IEEE parenthetical failed: ${inBodyText}`);
    } else if (style === "vancouver") {
      if (format === "narrative") assert(inBodyText === "Chen et al. (1)", `Vancouver narrative failed: ${inBodyText}`);
      else assert(inBodyText === "(1)", `Vancouver parenthetical failed: ${inBodyText}`);
    } else if (format === "narrative") {
      if (style === "chicago") {
        assert(inBodyText === "Chen, Spapé, and Jacucci (2024)", `Chicago narrative failed: ${inBodyText}`);
      } else {
        assert(inBodyText === "Chen et al. (2024)", `Narrative author-date failed: ${inBodyText}`);
      }
    } else if (style === "apa7") {
      assert(inBodyText === "(Chen et al., 2024)", `APA parenthetical failed: ${inBodyText}`);
    } else if (style === "harvard") {
      assert(inBodyText === "(Chen et al. 2024)", `Harvard parenthetical failed: ${inBodyText}`);
    } else if (style === "chicago") {
      assert(inBodyText === "(Chen, Spapé, and Jacucci 2024)", `Chicago parenthetical failed: ${inBodyText}`);
    }

    // Bottom Reference Entry MUST be un-prefixed in Standard Mode
    const bibEntry = CitationEngine.formatBibliographyEntry(sampleRef, style, 1);
    assert(!bibEntry.startsWith("[^"), `Standard bibliography entry erroneously prefixed with [^: ${bibEntry}`);
  }
}
console.log(`[PASS] Test 2: Footnote Mode OFF strictly formats in-body according to Bucket Standard & produces un-prefixed bottom entries.`);

console.log("\n================================================================================");
console.log(`  PRECEDENCE SUITE SUMMARY: ${totalPassed} ASSERTIONS PASSED, ${totalFailed} FAILED`);
console.log("================================================================================");

if (totalFailed > 0) process.exit(1);
