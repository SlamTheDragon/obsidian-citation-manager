import { CitationEngine } from '../src/citationEngine';
import { MetadataResolvers } from '../src/metadataResolvers';
import { ProjectIndexer } from '../src/projectIndexer';

console.log("==================================================");
console.log("  CITATION STUDIO READINESS & VERIFICATION SUITE  ");
console.log("==================================================");

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

// 1. CITEKEY GENERATION
test("Citekey Generation (Standard)", () => {
  const ck = CitationEngine.generateCitekey(["Chen, Q.", "Spape, M. M."], 2024, "Understanding Phantom Tactile");
  if (ck !== "Chen2024") throw new Error(`Expected Chen2024, got ${ck}`);
});

test("Citekey Generation (No Authors, Title Fallback)", () => {
  const ck = CitationEngine.generateCitekey([], 2023, "Quantum Computing Breakthroughs");
  if (ck !== "Quantum2023") throw new Error(`Expected Quantum2023, got ${ck}`);
});

// 2. IN-BODY CITATION FORMATTING
const ref1 = {
  citekey: "Chen2024",
  title: "Understanding Phantom Tactile Sensation on Commercially Available Social Virtual Reality Platforms",
  authors: ["Chen, Q.", "Spapé, M. M.", "Jacucci, G."],
  year: 2024,
  publication: "ACM Transactions on Computer-Human Interaction",
  volume: "31",
  issue: "4",
  pages: "1-34",
  doi: "10.1145/3649887",
  type: "journal" as const,
  projects: ["Spatial HCI"]
};

const ref2 = {
  citekey: "Baltar2012",
  title: "Social research 2.0: virtual snowball sampling method using Facebook",
  authors: ["Baltar, F.", "Brunet, I."],
  year: 2012,
  publication: "Internet Research",
  type: "journal" as const,
  projects: ["Spatial HCI"]
};

test("In-Body APA 7 (Parenthetical)", () => {
  const res = CitationEngine.formatInBody(ref1, "parenthetical", "apa7");
  if (res !== "(Chen et al., 2024)") throw new Error(`Got: ${res}`);
});

test("In-Body APA 7 (Narrative)", () => {
  const res = CitationEngine.formatInBody(ref1, "narrative", "apa7");
  if (res !== "Chen et al. (2024)") throw new Error(`Got: ${res}`);
});

test("In-Body Harvard (Author Date without comma)", () => {
  const res = CitationEngine.formatInBody(ref1, "parenthetical", "harvard");
  if (res !== "(Chen et al. 2024)") throw new Error(`Got: ${res}`);
});

test("In-Body Chicago (Author Date without comma)", () => {
  const res = CitationEngine.formatInBody(ref1, "parenthetical", "chicago");
  if (res !== "(Chen et al. 2024)") throw new Error(`Got: ${res}`);
});

test("In-Body IEEE (Numeric index)", () => {
  const res = CitationEngine.formatInBody(ref1, "parenthetical", "ieee", 1);
  if (res !== "[1]") throw new Error(`Got: ${res}`);
});

test("In-Body Vancouver (Numeric round index)", () => {
  const res = CitationEngine.formatInBody(ref1, "parenthetical", "vancouver", 1);
  if (res !== "(1)") throw new Error(`Got: ${res}`);
});

test("In-Body Citekey (@key)", () => {
  const res = CitationEngine.formatInBody(ref1, "citekey", "apa7");
  if (res !== "[@Chen2024]") throw new Error(`Got: ${res}`);
});

// 3. MULTI-CITATION IN-BODY FORMATTING
test("Multi-Citation APA 7", () => {
  const res = CitationEngine.formatMultiInBody([ref2, ref1], "parenthetical", "apa7");
  if (res !== "(Baltar & Brunet, 2012; Chen et al., 2024)") throw new Error(`Got: ${res}`);
});

test("Multi-Citation Harvard", () => {
  const res = CitationEngine.formatMultiInBody([ref2, ref1], "parenthetical", "harvard");
  if (res !== "(Baltar & Brunet 2012; Chen et al. 2024)") throw new Error(`Got: ${res}`);
});

test("Multi-Citation IEEE", () => {
  const res = CitationEngine.formatMultiInBody([ref2, ref1], "parenthetical", "ieee", [1, 2]);
  if (res !== "[1, 2]") throw new Error(`Got: ${res}`);
});

// 4. BIBLIOGRAPHY ENTRY FORMATTING
test("Bibliography Entry APA 7", () => {
  const res = CitationEngine.formatBibliographyEntry(ref1, "apa7");
  if (!res.includes("Chen, Q., Spapé, M. M., & Jacucci, G.") || !res.includes("(2024)")) {
    throw new Error(`Got: ${res}`);
  }
});

test("Bibliography Entry IEEE", () => {
  const res = CitationEngine.formatBibliographyEntry(ref1, "ieee", 1);
  if (!res.startsWith("[1] Q. Chen, M. M. Spapé, and G. Jacucci")) {
    throw new Error(`Got: ${res}`);
  }
});

test("Footnote Definition IEEE", () => {
  const res = CitationEngine.formatFootnoteDefinition(ref1, "ieee", 1);
  if (!res.startsWith("[^Chen2024]: [1] Q. Chen, M. M. Spapé, and G. Jacucci")) {
    throw new Error(`Got: ${res}`);
  }
});

// 5. METADATA RESOLVERS (BibTeX)
test("BibTeX Parser", () => {
  const bib = `@article{Baltar2012,
    author = {Baltar, Fabiola and Brunet, Ignasi},
    title = {Social research 2.0: virtual snowball sampling method using Facebook},
    journal = {Internet Research},
    year = {2012},
    volume = {22},
    number = {1},
    pages = {57--74},
    doi = {10.1108/10662241211199960}
  }`;
  const refs = MetadataResolvers.parseBibTeX(bib);
  if (refs.length !== 1) throw new Error(`Expected 1 ref, got ${refs.length}`);
  if (refs[0].citekey !== "Baltar2012") throw new Error(`Expected Baltar2012, got ${refs[0].citekey}`);
  if (refs[0].authors.length !== 2) throw new Error(`Expected 2 authors, got ${refs[0].authors.length}`);
});

// 6. CODE MASKING & TAMPER PROOFING
test("Mask Ignored Markdown (Fenced Code, Inline Code, YAML, LaTeX Math, HTML Comments)", () => {
  const markdown = `---
title: Test
citation-manager: [Spatial HCI]
---
# Main
Fenced block:
\`\`\`python
# [^IgnoreMe]
x = "[@IgnoreMe2024]"
\`\`\`
Inline code: \`[^IgnoreMeInline]\`
LaTeX Display Math:
$$ \\mathbf{A} = [1, 2; 3, 4] $$
LaTeX Inline Math: $x \\in [1, 2]$
HTML Comment: <!-- [@IgnoreMeInComment] -->
Real: [@Chen2024] and [^Chen2024]`;

  const masked = ProjectIndexer.maskIgnoredMarkdown(markdown);
  if (masked.includes("[@IgnoreMe2024]")) throw new Error("Fenced code was not masked");
  if (masked.includes("[^IgnoreMeInline]")) throw new Error("Inline code was not masked");
  if (masked.includes("\\mathbf{A} = [1, 2; 3, 4]")) throw new Error("LaTeX display math was not masked");
  if (masked.includes("x \\in [1, 2]")) throw new Error("LaTeX inline math was not masked");
  if (masked.includes("[@IgnoreMeInComment]")) throw new Error("HTML comment was not masked");
  if (!masked.includes("[@Chen2024]")) throw new Error("Real citekey was corrupted");
  if (!masked.includes("[^Chen2024]")) throw new Error("Real footnote was corrupted");
});

// 7. COMPLEX AUTHOR NAME FORMATTING (Hyphenated, Suffixes, Particles)
test("Author Formatting (Hyphenated Given Name: Jean-Paul Sartre)", () => {
  const formatted = CitationEngine.formatAuthorsAPA(["Jean-Paul Sartre"]);
  if (formatted !== "Sartre, J.-P.") throw new Error(`Got: ${formatted}`);
});

test("Author Formatting (Suffix: Martin Luther King Jr.)", () => {
  const formatted = CitationEngine.formatAuthorsAPA(["Martin Luther King Jr."]);
  if (formatted !== "King, Jr., M. L.") throw new Error(`Got: ${formatted}`);
});

test("In-Body Narrative with Suffix (Martin Luther King Jr.)", () => {
  const ref = {
    citekey: "King1963",
    title: "Letter from Birmingham Jail",
    authors: ["Martin Luther King Jr."],
    year: 1963,
    type: "journal" as const,
    projects: []
  };
  const res = CitationEngine.formatInBody(ref, "narrative", "apa7");
  if (res !== "King Jr. (1963)") throw new Error(`Got: ${res}`);
});

// 8. FRONTMATTER CLEANER FOR PUBLICATION EXPORT
test("Clean Export Frontmatter", () => {
  const frontmatter = `---
title: Export Note
citation-manager:
  - Spatial HCI
citation_project: Spatial HCI
tags:
  - academic
---
# Body`;

  const cleaned = ProjectIndexer.cleanExportFrontmatter(frontmatter);
  if (cleaned.includes("citation-manager")) throw new Error("citation-manager was not removed");
  if (cleaned.includes("citation_project")) throw new Error("citation_project was not removed");
  if (!cleaned.includes("title: Export Note")) throw new Error("Title frontmatter was lost");
});

console.log("==================================================");
console.log(`  RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log("==================================================");

if (failCount > 0) process.exit(1);
