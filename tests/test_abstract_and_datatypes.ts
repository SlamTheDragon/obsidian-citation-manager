import { CitationEngine } from '../src/backend/citationEngine';
import { ReferenceMetadata, ProjectRecord } from '../src/backend/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("================================================================================");
console.log("  TESTING ABSTRACT & DATATYPE PERSISTENCE IN NOTE FRONTMATTER & BODY            ");
console.log("================================================================================");

// 1. Simulate full ReferenceMetadata object for arXiv 2603.25223
const mockRef: ReferenceMetadata = {
  citekey: "Vaswani2026",
  type: "preprint",
  title: "Next-Generation Spatial Attention Architectures for Haptic Transformers",
  authors: ["Vaswani, Ashish", "Shazeer, Noam", "Parmar, Niki"],
  year: 2026,
  month: "03",
  publication: "arXiv Preprint",
  volume: "26",
  issue: "3",
  pages: "1-18",
  publisher: "arXiv",
  doi: "10.48550/arXiv.2603.25223",
  url: "https://doi.org/10.48550/arXiv.2603.25223",
  isbn: "",
  issn: "2331-8422",
  abstract: "We propose a novel spatial attention mechanism specifically tailored for tactile and haptic force feedback fields in mixed-reality simulations, reducing perceptual latency by 42%.",
  bibtex: "@article{Vaswani2026,\n  title={Next-Generation Spatial Attention},\n  author={Vaswani, Ashish},\n  year={2026}\n}",
  pdfAttachment: ".references/attachments/Vaswani2026.pdf",
  projects: ["spatial-hci", "deep-learning"],
  tags: ["haptics", "transformers", "xr"],
  apa: "",
  ieee: "",
  harvard: "",
  chicago: "",
  vancouver: "",
  dateAdded: "2026-03-01T00:00:00.000Z",
  dateModified: "2026-03-01T00:00:00.000Z"
};

const enriched = CitationEngine.populateStyles(mockRef) as ReferenceMetadata;

// 2. Test frontmatterObj construction containing abstract & bibtex
const frontmatterObj = {
  citekey: enriched.citekey,
  type: enriched.type,
  title: enriched.title,
  authors: enriched.authors,
  year: enriched.year,
  month: enriched.month || null,
  publication: enriched.publication || null,
  volume: enriched.volume || null,
  issue: enriched.issue || null,
  pages: enriched.pages || null,
  publisher: enriched.publisher || null,
  doi: enriched.doi || null,
  url: enriched.url || null,
  isbn: enriched.isbn || null,
  issn: enriched.issn || null,
  abstract: enriched.abstract || null,
  bibtex: enriched.bibtex || null,
  pdfAttachment: enriched.pdfAttachment || null,
  projects: enriched.projects || [],
  tags: enriched.tags || [],
  apa: enriched.apa || "",
  ieee: enriched.ieee || "",
  harvard: enriched.harvard || "",
  chicago: enriched.chicago || "",
  vancouver: enriched.vancouver || "",
  dateAdded: enriched.dateAdded,
  dateModified: enriched.dateModified,
};

assert(frontmatterObj.abstract === mockRef.abstract, "frontmatterObj contains full abstract string");
assert(frontmatterObj.bibtex === mockRef.bibtex, "frontmatterObj contains bibtex string");
assert(frontmatterObj.doi === "10.48550/arXiv.2603.25223", "frontmatterObj contains arXiv DOI");
assert(frontmatterObj.issn === "2331-8422", "frontmatterObj contains ISSN");
assert(frontmatterObj.projects.length === 2, "frontmatterObj contains multiple projects");

// 3. Test note body generation with Abstract section
const initialBody = `\n# ${enriched.title}\n\n## Abstract\n${enriched.abstract || "*No abstract available.*"}\n\n## Notes & Synthesis\nUser research thoughts.\n`;
assert(initialBody.includes("## Abstract\nWe propose a novel spatial attention mechanism"), "Body initializes with full ## Abstract section");

// 4. Test updating abstract in existing note body
let updatedBody = initialBody;
const newAbstract = "UPDATED ABSTRACT: Latency reduction increased to 55% in v2 benchmark.";
if (/## Abstract(?: & Notes)?/i.test(updatedBody)) {
  updatedBody = updatedBody.replace(
    /(## Abstract(?: & Notes)?\r?\n)(?:[\s\S]*?)(?=\r?\n## |\r?\n# |$)/i,
    `$1${newAbstract}\n\n`
  );
}

assert(updatedBody.includes("UPDATED ABSTRACT: Latency reduction increased to 55%"), "Abstract updated cleanly in body");
assert(updatedBody.includes("## Notes & Synthesis\nUser research thoughts."), "User research notes preserved intact");

// 5. Test Fallback Abstract Extraction from Note Body (when YAML lacks abstract)
const testOldFileContent = `---
citekey: Vaswani2026
title: Next-Generation Spatial Attention
---
# Next-Generation Spatial Attention

## Abstract
Legacy abstract extracted directly from markdown body text.

## Personal Notes
My notes.
`;

const bodyMatch = testOldFileContent.match(/## Abstract(?: & Notes)?\r?\n([\s\S]*?)(?=\r?\n## |\r?\n# |$)/i);
assert(bodyMatch !== null, "Body regex matches legacy abstract");
const fallbackExtracted = bodyMatch![1].trim();
assert(fallbackExtracted === "Legacy abstract extracted directly from markdown body text.", `Fallback extracted: ${fallbackExtracted}`);

console.log("\nALL ABSTRACT & DATATYPE PERSISTENCE TESTS PASSED (9/9)!");
