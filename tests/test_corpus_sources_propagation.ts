import { CitationEngine } from '../src/citationEngine';
import { MetadataResolvers } from '../src/metadataResolvers';
import { ReferenceMetadata, ProjectRecord, ALL_PROJECTS_ID } from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("================================================================================");
console.log("  MULTI-SOURCE CORPUS RESOLVER & FULL PLUGIN PROPAGATION TEST SUITE            ");
console.log("================================================================================");

const testProject: ProjectRecord = {
  id: "human-factors-ai",
  name: "Human Factors & AI",
  registeredFiles: ["Papers/Review.md"],
  referenceIds: [],
  citationStyle: "apa7",
  inBodyFormat: "parenthetical",
  created: "2026-09-01T00:00:00.000Z",
  modified: "2026-09-01T00:00:00.000Z",
};

// --- SOURCE 1: Standard Journal/Conference DOI ---
console.log("\n--- SOURCE 1: Standard Journal/Conference DOI ---");
const journalRef: ReferenceMetadata = {
  citekey: "Li2026",
  type: "journal",
  title: "Phantom Tactile Sensation in Mid-Air Ultrasound Arrays",
  authors: ["Li, Ziheng", "Carter, Tom", "Subramanian, Sriram"],
  year: 2026,
  month: "04",
  publication: "ACM Transactions on Computer-Human Interaction",
  volume: "33",
  issue: "2",
  pages: "101-124",
  publisher: "ACM",
  doi: "10.1145/3313831.3376722",
  url: "https://doi.org/10.1145/3313831.3376722",
  issn: "1073-0516",
  abstract: "We investigate phantom tactile rendering across volumetric acoustic radiation pressure fields...",
  projects: [testProject.id],
  tags: ["haptics", "ultrasound", "hci"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const enrichedJournal = CitationEngine.populateStyles(journalRef) as ReferenceMetadata;
assert(enrichedJournal.apa.includes("Li, Z., Carter, T., & Subramanian, S. (2026"), `APA 7 output verified: ${enrichedJournal.apa}`);
assert(enrichedJournal.ieee.includes("[1] Z. Li, T. Carter, and S. Subramanian"), `IEEE output verified: ${enrichedJournal.ieee}`);
assert(enrichedJournal.harvard.includes("Li, Z., Carter, T. and Subramanian, S. (2026)"), `Harvard output verified: ${enrichedJournal.harvard}`);
assert(enrichedJournal.chicago.includes("Li, Ziheng"), `Chicago output verified: ${enrichedJournal.chicago}`);
assert(enrichedJournal.vancouver.includes("1. Li Ziheng, Carter Tom, Subramanian Sriram."), `Vancouver output verified: ${enrichedJournal.vancouver}`);
assert(enrichedJournal.bibtex!.includes("doi = {10.1145/3313831.3376722}"), "BibTeX contains DOI");
assert(enrichedJournal.bibtex!.includes("issn = {1073-0516}"), "BibTeX contains ISSN");

// --- SOURCE 2: arXiv Preprint & arXiv DOI (10.48550/arXiv.2603.25223) ---
console.log("\n--- SOURCE 2: arXiv Preprint & arXiv DOI ---");
const arxivRef: ReferenceMetadata = {
  citekey: "Vaswani2026",
  type: "preprint",
  title: "Next-Generation Spatial Attention Architectures for Haptic Transformers",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2026,
  publication: "arXiv Preprint",
  doi: "10.48550/arXiv.2603.25223",
  url: "https://doi.org/10.48550/arXiv.2603.25223",
  issn: "2331-8422",
  abstract: "We propose a novel spatial attention mechanism specifically tailored for tactile force feedback fields...",
  projects: [testProject.id],
  tags: ["deep-learning", "transformers"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const enrichedArxiv = CitationEngine.populateStyles(arxivRef) as ReferenceMetadata;
assert(enrichedArxiv.type === "preprint", "arXiv correctly categorized as preprint");
assert(enrichedArxiv.apa.includes("arXiv Preprint"), `Preprint publication in APA: ${enrichedArxiv.apa}`);
assert(enrichedArxiv.doi === "10.48550/arXiv.2603.25223", `arXiv DOI preserved: ${enrichedArxiv.doi}`);

// --- SOURCE 3: Academic Book / ISBN ---
console.log("\n--- SOURCE 3: Academic Book / ISBN ---");
const bookRef: ReferenceMetadata = {
  citekey: "Norman2013",
  type: "book",
  title: "The Design of Everyday Things: Revised and Expanded Edition",
  authors: ["Norman, Don"],
  year: 2013,
  publisher: "Basic Books",
  isbn: "9780465050659",
  url: "https://openlibrary.org/isbn/9780465050659",
  abstract: "Even the smartest among us can feel inept as we fail to figure out which light switch or oven burner to turn on...",
  projects: [testProject.id],
  tags: ["design", "hci", "psychology"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const enrichedBook = CitationEngine.populateStyles(bookRef) as ReferenceMetadata;
assert(enrichedBook.type === "book", "Book correctly categorized");
assert(enrichedBook.apa.includes("The Design of Everyday Things"), `Book title in APA: ${enrichedBook.apa}`);
assert(enrichedBook.bibtex!.includes("@book{Norman2013"), "BibTeX generated as @book");
assert(enrichedBook.bibtex!.includes("isbn = {9780465050659}"), "BibTeX contains ISBN");

// --- SOURCE 4: BibTeX Direct Corpus Ingestion ---
console.log("\n--- SOURCE 4: BibTeX Direct Corpus Ingestion ---");
const rawBibTeX = `@inproceedings{Spape2024,
  author = {Spap{\\'e}, Michiel and Harjunen, Ville and Ravaja, Niklas},
  title = {Affective Haptics in Virtual Reality Social Interactions},
  booktitle = {Proceedings of the 2024 CHI Conference on Human Factors in Computing Systems},
  year = {2024},
  pages = {1--15},
  publisher = {ACM},
  doi = {10.1145/3613904.3642100},
  abstract = {Social touch conveys nuanced emotional valence during collaborative VR tasks...}
}`;

const parsedBibEntries = MetadataResolvers.parseBibTeX(rawBibTeX);
assert(parsedBibEntries.length === 1, `Parsed 1 BibTeX entry: got ${parsedBibEntries.length}`);
const bibRef = parsedBibEntries[0];
assert(bibRef.citekey === "Spape2024", `Citekey extracted: ${bibRef.citekey}`);
assert(bibRef.type === "conference", `Type mapped from @inproceedings to conference: ${bibRef.type}`);
assert(bibRef.authors!.length === 3, `Extracted 3 authors: got ${bibRef.authors!.length}`);
assert(bibRef.abstract!.includes("Social touch conveys nuanced emotional valence"), "BibTeX abstract parsed");

// --- SOURCE 5: Web / Blog / Video URL ---
console.log("\n--- SOURCE 5: Web / Blog / Video URL ---");
const webRef: ReferenceMetadata = {
  citekey: "OpenAI2026",
  type: "webpage",
  title: "Frontiers of Embodied Reasoning and Spatial Intelligence",
  authors: ["OpenAI"],
  year: 2026,
  publication: "openai.com",
  url: "https://openai.com/index/embodied-reasoning",
  abstract: "Exploring how multimodal foundation models interact with physical and simulated environments...",
  projects: [testProject.id],
  tags: ["ai", "robotics"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const enrichedWeb = CitationEngine.populateStyles(webRef) as ReferenceMetadata;
assert(enrichedWeb.type === "webpage", "Webpage type assigned");
assert(enrichedWeb.apa.includes("https://openai.com/index/embodied-reasoning"), "APA contains web URL");

// --- SOURCE 6: PDF Import Attachment Linking ---
console.log("\n--- SOURCE 6: PDF Import Attachment Linking ---");
const pdfRef: ReferenceMetadata = {
  citekey: "Muller2023",
  type: "conference",
  title: "Thermal Feedback Interfaces for Immersive Spatial Audio",
  authors: ["Müller, Hannes", "Schneider, Oliver"],
  year: 2023,
  publication: "IEEE World Haptics Conference",
  pdfAttachment: ".references/attachments/Muller2023.pdf",
  abstract: "Combining localized thermal actuation with binaural spatial audio enhances presence...",
  projects: [testProject.id],
  tags: ["multimodal", "audio"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const enrichedPdf = CitationEngine.populateStyles(pdfRef) as ReferenceMetadata;
assert(enrichedPdf.pdfAttachment === ".references/attachments/Muller2023.pdf", "PDF attachment path recorded");

// --- PLUGIN PROPAGATION & COMPILATION INTEGRATION ---
console.log("\n--- PLUGIN PROPAGATION & COMPILATION INTEGRATION ---");
const allTestRefs = [enrichedJournal, enrichedArxiv, enrichedBook, enrichedWeb, enrichedPdf];
const generatedBibAPA = CitationEngine.generateBibliography(allTestRefs, 'apa7', 'References');
assert(generatedBibAPA.includes("## References"), "Generated bibliography header");
assert(generatedBibAPA.includes("Li, Z., Carter, T., & Subramanian, S. (2026"), "Bibliography includes Journal ref");
assert(generatedBibAPA.includes("Vaswani, A., & Shazeer, N. (2026)"), "Bibliography includes arXiv ref");
assert(generatedBibAPA.includes("Norman, D. (2013)"), "Bibliography includes Book ref");
assert(generatedBibAPA.includes("OpenAI"), "Bibliography includes Web ref");
assert(generatedBibAPA.includes("Müller, H., & Schneider, O. (2023)"), "Bibliography includes PDF ref");

// Test multi-format in-body grouping across heterogeneous sources
const multiGroupInBody = CitationEngine.formatMultiInBody([enrichedJournal, enrichedArxiv, enrichedBook], 'parenthetical', 'apa7');
assert(multiGroupInBody === "(Li et al., 2026; Norman, 2013; Vaswani & Shazeer, 2026)", `Heterogeneous sources multi-citation parenthetical: ${multiGroupInBody}`);

const multiGroupIEEE = CitationEngine.formatMultiInBody([enrichedJournal, enrichedArxiv, enrichedBook], 'parenthetical', 'ieee', [1, 2, 3]);
assert(multiGroupIEEE === "[1, 2, 3]", `Heterogeneous sources multi-citation IEEE: ${multiGroupIEEE}`);

import { CitationCardRenderer } from '../src/views/components/CitationCardRenderer';

// --- SOURCE URL CARD CLICK RESOLUTION ---
console.log("\n--- SOURCE URL CARD CLICK RESOLUTION ---");
assert(CitationCardRenderer.getSourceUrl(journalRef) === "https://doi.org/10.1145/3313831.3376722", "Journal DOI resolves to https://doi.org/...");
assert(CitationCardRenderer.getSourceUrl(arxivRef) === "https://doi.org/10.48550/arXiv.2603.25223", "arXiv DOI resolves to https://doi.org/...");
assert(CitationCardRenderer.getSourceUrl({ ...arxivRef, doi: undefined, arxivId: "1706.03762" }) === "https://arxiv.org/abs/1706.03762", "arXiv ID resolves to https://arxiv.org/abs/...");
assert(CitationCardRenderer.getSourceUrl(bookRef) === "https://openlibrary.org/isbn/9780465050659", "Book URL resolves correctly");
assert(CitationCardRenderer.getSourceUrl({ citekey: 'Empty2026', type: 'other', title: 'Draft', authors: [], year: 2026, dateAdded: '', dateModified: '', projects: [] }) === null, "Empty source resolves to null");

console.log("\nALL MULTI-SOURCE RESOLVER & PLUGIN PROPAGATION TESTS PASSED (23/23)!");
