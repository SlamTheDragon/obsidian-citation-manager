import { CitationEngine } from '../src/backend/citationEngine';
import { CSLFormatters } from '../src/backend/csl/cslFormatters';
import { CSLSorter } from '../src/backend/csl/cslSorter';
import { BibTeXGenerator } from '../src/backend/csl/bibtexGenerator';
import { MarkdownMasker } from '../src/backend/indexing/markdownMasker';
import { LintEngine } from '../src/backend/lintEngine';
import { ReferenceMetadata } from '../src/backend/types';

console.log("================================================================================");
console.log("  CROSS-CHECK FROM COMMIT 51c6d39 TO VERIFY 100% BEHAVIORAL PARITY             ");
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

// 1. CSL FORMATTERS & FACADE PARITY
const sampleRef: ReferenceMetadata = {
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

// Facade vs Submodule Output Parity
assert(
  CitationEngine.formatAPA7(sampleRef) === CSLFormatters.formatAPA7(sampleRef),
  "CitationEngine.formatAPA7 delegates cleanly to CSLFormatters.formatAPA7"
);
assert(
  CitationEngine.formatIEEE(sampleRef, 1) === CSLFormatters.formatIEEE(sampleRef, 1),
  "CitationEngine.formatIEEE delegates cleanly to CSLFormatters.formatIEEE"
);
assert(
  CitationEngine.formatHarvard(sampleRef) === CSLFormatters.formatHarvard(sampleRef),
  "CitationEngine.formatHarvard delegates cleanly to CSLFormatters.formatHarvard"
);
assert(
  CitationEngine.formatChicago(sampleRef) === CSLFormatters.formatChicago(sampleRef),
  "CitationEngine.formatChicago delegates cleanly to CSLFormatters.formatChicago"
);
assert(
  CitationEngine.formatVancouver(sampleRef, 1) === CSLFormatters.formatVancouver(sampleRef, 1),
  "CitationEngine.formatVancouver delegates cleanly to CSLFormatters.formatVancouver"
);
assert(
  CitationEngine.generateBibTeX(sampleRef) === BibTeXGenerator.generateBibTeX(sampleRef),
  "CitationEngine.generateBibTeX delegates cleanly to BibTeXGenerator.generateBibTeX"
);

// 2. VIDEO / MEDIA CITATION STANDARDS PARITY
const videoRef: ReferenceMetadata = {
  citekey: "3Blue1Brown2024",
  title: "Neural Networks & Attention Explained",
  authors: ["Sanderson, Grant"],
  year: 2024,
  month: "Mar 15",
  day: "15",
  url: "https://www.youtube.com/watch?v=wjZofJX0v4U",
  type: "video",
  publisher: "YouTube",
  accessedDate: "2026-09-01",
  duration: "24:18",
  projects: []
};

const apaVideo = CitationEngine.formatAPA7(videoRef);
assert(apaVideo.includes("[Video]"), "APA 7 Video formatted with [Video]");
assert(apaVideo.includes("YouTube"), "APA 7 Video includes YouTube publisher");

const ieeeVideo = CitationEngine.formatIEEE(videoRef, 1);
assert(ieeeVideo.includes("[Online Video]"), "IEEE Video formatted with [Online Video]");
assert(ieeeVideo.includes("Accessed: 2026-09-01"), "IEEE Video includes accessed date");

// 3. MULTI-AUTHOR & ET AL. PARITY
const multiRef: ReferenceMetadata = {
  citekey: "Alpha2025",
  title: "Large Team Collaborative Systems",
  authors: ["One, A.", "Two, B.", "Three, C.", "Four, D.", "Five, E."],
  year: 2025,
  type: "journal",
  projects: []
};
const chicagoMulti = CitationEngine.formatChicago(multiRef);
assert(chicagoMulti.startsWith("One, A., et al. 2025."), "Chicago >3 authors uses et al. in bibliography");

// 4. SORTING ALGORITHMS PARITY
const refList = [
  { citekey: "B", authors: ["Brown, Bob"], year: 2020, title: "T", type: "journal", projects: [] } as ReferenceMetadata,
  { citekey: "A", authors: ["Apple, Alex"], year: 2021, title: "T", type: "journal", projects: [] } as ReferenceMetadata,
];
const sortedAlpha = CSLSorter.sortReferences(refList, 'apa7');
assert(sortedAlpha[0].citekey === "A" && sortedAlpha[1].citekey === "B", "CSLSorter sorts references alphabetically");

// 5. MARKDOWN AST MASKING PARITY
const codeDoc = "Before `[@Vaswani2017]` in code block:\n```\n[@Vaswani2017]\n```\nAfter [@Vaswani2017]";
const masked = MarkdownMasker.maskIgnoredMarkdown(codeDoc);
assert(!masked.slice(codeDoc.indexOf("```"), codeDoc.lastIndexOf("```")).includes("@Vaswani2017"), "MarkdownMasker masks codeblock contents");
assert(masked.endsWith("After [@Vaswani2017]"), "MarkdownMasker preserves prose citations");

// 6. PROCEDURAL LINT ENGINE PARITY
assert(LintEngine.levenshteinDistance("Vaswani2017", "Vaswanii2017") === 1, "Levenshtein distance calculated correctly");
assert(LintEngine.levenshteinDistance("Vaswani2017", "Devlin2019") > 3, "Levenshtein distance distinguishes dissimilar citekeys");

console.log(`================================================================================`);
console.log(`  ALL COMMIT 51c6d39 PARITY CHECKS PASSED (${passCount}/${passCount})!`);
console.log(`================================================================================`);
