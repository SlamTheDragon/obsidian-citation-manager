import { CitationEngine } from '../src/backend/citationEngine';
import { MetadataResolvers } from '../src/backend/metadataResolvers';
import { ProjectIndexer } from '../src/backend/projectIndexer';
import { CitationStyle, InBodyFormat, ReferenceMetadata } from '../src/backend/types';

console.log("================================================================================");
console.log("  NIST CIT-BASED COMBINATORIAL INTERACTION TESTING (CIT) SUITE                  ");
console.log("  Don Norman's 7 Stages of Action & Deterministic State Tree Verification      ");
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

// Reference Test Fixtures
const author1Ref: ReferenceMetadata = {
  citekey: "Smith2020",
  title: "A Single Author Empirical Study",
  authors: ["Smith, John"],
  year: 2020,
  publication: "Journal of HCI",
  volume: "10",
  issue: "2",
  pages: "100-120",
  type: "journal",
  projects: ["TestProject"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const author2Ref: ReferenceMetadata = {
  citekey: "Baltar2012",
  title: "Social research 2.0: virtual snowball sampling method using Facebook",
  authors: ["Baltar, Fabiola", "Brunet, Ignasi"],
  year: 2012,
  publication: "Internet Research",
  volume: "22",
  issue: "1",
  pages: "57-74",
  type: "journal",
  projects: ["TestProject"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const author3Ref: ReferenceMetadata = {
  citekey: "Chen2024",
  title: "Understanding Phantom Tactile Sensation on Commercially Available Social Virtual Reality Platforms",
  authors: ["Chen, Qi", "Spapé, Michiel M.", "Jacucci, Giulio"],
  year: 2024,
  publication: "ACM Transactions on Computer-Human Interaction",
  volume: "31",
  issue: "4",
  pages: "1-34",
  doi: "10.1145/3649887",
  type: "journal",
  projects: ["TestProject"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const authorSuffixRef: ReferenceMetadata = {
  citekey: "King1963",
  title: "Letter from Birmingham Jail",
  authors: ["Martin Luther King Jr."],
  year: 1963,
  type: "journal",
  projects: ["TestProject"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const authorHyphenRef: ReferenceMetadata = {
  citekey: "Sartre1943",
  title: "Being and Nothingness",
  authors: ["Jean-Paul Sartre"],
  year: 1943,
  type: "book",
  projects: ["TestProject"],
  dateAdded: "2024-01-01",
  dateModified: "2024-01-01"
};

const allRefsMap = new Map<string, ReferenceMetadata>([
  [author1Ref.citekey, author1Ref],
  [author2Ref.citekey, author2Ref],
  [author3Ref.citekey, author3Ref],
  [authorSuffixRef.citekey, authorSuffixRef],
  [authorHyphenRef.citekey, authorHyphenRef],
]);

const styles: CitationStyle[] = ["apa7", "harvard", "chicago", "ieee", "vancouver"];
const formats: InBodyFormat[] = ["parenthetical", "narrative", "citekey"];
const footnoteModes = [true, false];

console.log("\n--- TEST PHASE 1: Combinatorial In-Body Format x Style x Author Counts (5 x 3 x 5 = 75 States) ---");

for (const style of styles) {
  for (const format of formats) {
    for (const [key, ref] of allRefsMap.entries()) {
      const formatted = CitationEngine.formatInBody(ref, format, style, 1);
      assert(typeof formatted === "string" && formatted.length > 0, `In-body format failed for [${style}, ${format}, ${key}]`);
      
      // Verify style specific formatting invariants
      if (format === "citekey") {
        assert(formatted === `[@${ref.citekey}]`, `Citekey format invariant violated: ${formatted}`);
      } else if (style === "ieee") {
        if (format === "narrative") {
          assert(formatted.endsWith("[1]") && !formatted.startsWith("["), `IEEE narrative format invariant violated: ${formatted}`);
        } else {
          assert(formatted === "[1]", `IEEE in-body bracket invariant violated: ${formatted}`);
        }
      } else if (style === "vancouver") {
        if (format === "narrative") {
          assert(formatted.endsWith("(1)") && !formatted.startsWith("("), `Vancouver narrative format invariant violated: ${formatted}`);
        } else {
          assert(formatted === "(1)", `Vancouver in-body round paren invariant violated: ${formatted}`);
        }
      } else if (format === "narrative") {
        assert(formatted.includes(`(${ref.year || "n.d."})`), `Narrative year parenthesis invariant violated: ${formatted}`);
      }
    }
  }
}
console.log(`[PASS] Phase 1: All 75 In-Body Combinatorial Configurations Verified.`);

console.log("\n--- TEST PHASE 2: Combinatorial Multi-Citation Grouping (5 Styles x 3 Formats = 15 States) ---");

const multiList = [author1Ref, author2Ref, author3Ref];
for (const style of styles) {
  for (const format of formats) {
    const multiFormatted = CitationEngine.formatMultiInBody(multiList, format, style, [1, 2, 3]);
    assert(typeof multiFormatted === "string" && multiFormatted.length > 0, `Multi in-body failed for [${style}, ${format}]`);
    
    if (format === "citekey") {
      assert(multiFormatted === "[@Smith2020; @Baltar2012; @Chen2024]", `Multi citekey failed: ${multiFormatted}`);
    } else if (style === "ieee" && format === "parenthetical") {
      assert(multiFormatted === "[1, 2, 3]", `Multi IEEE failed: ${multiFormatted}`);
    } else if (style === "vancouver" && format === "parenthetical") {
      assert(multiFormatted === "(1, 2, 3)", `Multi Vancouver failed: ${multiFormatted}`);
    } else if (format === "parenthetical") {
      assert(multiFormatted.startsWith("(") && multiFormatted.endsWith(")"), `Multi parenthetical outer paren missing: ${multiFormatted}`);
      assert(multiFormatted.includes(";"), `Multi parenthetical delimiter missing: ${multiFormatted}`);
    }
  }
}
console.log(`[PASS] Phase 2: All 15 Multi-Citation Configurations Verified.`);

console.log("\n--- TEST PHASE 3: Combinatorial Bibliography & Footnote Definition Invariants (5 Styles x 5 Refs = 25 States) ---");

for (const style of styles) {
  let idx = 1;
  for (const [key, ref] of allRefsMap.entries()) {
    const bibEntry = CitationEngine.formatBibliographyEntry(ref, style, idx);
    const fnDef = CitationEngine.formatFootnoteDefinition(ref, style, idx);
    
    assert(bibEntry.length > 0, `Bib entry empty for [${style}, ${key}]`);
    assert(fnDef.startsWith(`[^${ref.citekey}]: `), `Footnote def prefix missing for [${style}, ${key}]: ${fnDef}`);
    assert(fnDef.endsWith(bibEntry), `Footnote def body does not match bib entry for [${style}, ${key}]`);
    
    if (style === "ieee") {
      assert(bibEntry.startsWith(`[${idx}] `), `IEEE bib entry numeric prefix missing: ${bibEntry}`);
    } else if (style === "vancouver") {
      assert(bibEntry.startsWith(`${idx}. `), `Vancouver bib entry numeric prefix missing: ${bibEntry}`);
    }
    idx++;
  }
}
console.log(`[PASS] Phase 3: All 25 Bibliography & Footnote Invariant Configurations Verified.`);

console.log("\n--- TEST PHASE 4: Combinatorial Code, Math, & Structural Masking Matrix (7 Contexts) ---");

const contextTests = [
  { name: "Fenced Code Block", text: "```python\n# [@Smith2020]\nx = '[^Baltar2012]'\n```\nReal: [@Chen2024]", expectedPresent: ["[@Chen2024]"], expectedMasked: ["[@Smith2020]", "[^Baltar2012]"] },
  { name: "Tilde Fenced Block", text: "~~~js\n// [@Smith2020]\n~~~\nReal: [@Chen2024]", expectedPresent: ["[@Chen2024]"], expectedMasked: ["[@Smith2020]"] },
  { name: "Inline Code", text: "Use `[@Smith2020]` here. Real: [@Chen2024]", expectedPresent: ["[@Chen2024]"], expectedMasked: ["[@Smith2020]"] },
  { name: "LaTeX Display Math", text: "$$ \\mathbf{A} = [1, 2; 3, 4] $$\nReal: [@Chen2024]", expectedPresent: ["[@Chen2024]"], expectedMasked: ["\\mathbf{A} = [1, 2; 3, 4]"] },
  { name: "LaTeX Inline Math", text: "Let $x \\in [1, 2]$ be given. Real: [@Chen2024]", expectedPresent: ["[@Chen2024]"], expectedMasked: ["x \\in [1, 2]"] },
  { name: "HTML Comment", text: "<!-- [@DraftSmith2020] -->\nReal: [@Chen2024]", expectedPresent: ["[@Chen2024]"], expectedMasked: ["[@DraftSmith2020]"] },
  { name: "YAML Frontmatter", text: "---\ntitle: Note [@Smith2020]\n---\nReal: [@Chen2024]", expectedPresent: ["[@Chen2024]"], expectedMasked: ["title: Note [@Smith2020]"] }
];

for (const tc of contextTests) {
  const masked = ProjectIndexer.maskIgnoredMarkdown(tc.text);
  for (const pres of tc.expectedPresent) {
    assert(masked.includes(pres), `${tc.name}: Expected citation '${pres}' was corrupted!`);
  }
  for (const msk of tc.expectedMasked) {
    assert(!masked.includes(msk), `${tc.name}: Token '${msk}' was NOT masked!`);
  }
}
console.log(`[PASS] Phase 4: All 7 Masking Context Configurations Verified.`);

console.log("\n================================================================================");
console.log(`  COMBINATORIAL SUITE SUMMARY: ${totalPassed} ASSERTIONS PASSED, ${totalFailed} FAILED `);
console.log("================================================================================");

if (totalFailed > 0) process.exit(1);
