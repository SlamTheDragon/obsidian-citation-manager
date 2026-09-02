import process from 'process';
import { MetadataResolvers } from '../src/backend/metadataResolvers';
import { BibTeXResolver } from '../src/backend/resolvers/bibtexResolver';
import { RISResolver } from '../src/backend/resolvers/risResolver';
import { EndNoteXMLResolver } from '../src/backend/resolvers/endnoteXmlResolver';
import { LibraryImportResolver } from '../src/backend/resolvers/libraryImportResolver';
import { ReferenceMetadata } from '../src/backend/types';

console.log("================================================================================");
console.log("  TESTING CITATION LIBRARY IMPORT: BIBTEX, RIS & ENDNOTE XML                  ");
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

// 1. BibTeX Sample
const sampleBibTeX = `
@article{Vaswani2017,
  author = {Ashish Vaswani and Noam Shazeer and Niki Parmar and Jakob Uszkoreit},
  title = {Attention Is All You Need},
  journal = {Advances in Neural Information Processing Systems},
  volume = {30},
  year = {2017},
  pages = {5998--6008},
  doi = {10.5555/3295222.3295349}
}

@book{Knuth1997,
  author = {Donald E. Knuth},
  title = {The Art of Computer Programming},
  publisher = {Addison-Wesley},
  year = {1997},
  isbn = {9780201896831}
}
`;

// 2. RIS Sample (Zotero / Mendeley style)
const sampleRIS = `
TY  - JOUR
AU  - Shannon, Claude E.
TI  - A Mathematical Theory of Communication
JO  - Bell System Technical Journal
PY  - 1948
VL  - 27
IS  - 3
SP  - 379
EP  - 423
DO  - 10.1002/j.1538-7305.1948.tb01338.x
ER  - 

TY  - CONF
AU  - Turing, Alan M.
TI  - Computing Machinery and Intelligence
JO  - Mind
PY  - 1950
VL  - 59
IS  - 236
SP  - 433
EP  - 460
ER  - 
`;

// 3. EndNote XML Sample
const sampleEndNoteXML = `
<?xml version="1.0" encoding="UTF-8" ?>
<xml>
  <records>
    <record>
      <ref-type name="Journal Article">17</ref-type>
      <contributors>
        <authors>
          <author>Einstein, Albert</author>
          <author>Podolsky, Boris</author>
          <author>Rosen, Nathan</author>
        </authors>
      </contributors>
      <titles>
        <title>Can Quantum-Mechanical Description of Physical Reality be Considered Complete?</title>
        <secondary-title>Physical Review</secondary-title>
      </titles>
      <dates>
        <year>1935</year>
      </dates>
      <volume>47</volume>
      <number>10</number>
      <pages>777-780</pages>
      <electronic-resource-num>10.1103/PhysRev.47.777</electronic-resource-num>
    </record>
  </records>
</xml>
`;

// --- TEST SUITE EXECUTION ---
async function runLibraryImportTests() {
  // Test 1: Direct BibTeX Resolver
  const bibRefs = BibTeXResolver.parseBibTeX(sampleBibTeX);
  assert(bibRefs.length === 2, `Parsed 2 BibTeX records (found: ${bibRefs.length})`);
  assert(bibRefs[0].citekey === 'Vaswani2017', 'BibTeX citekey Vaswani2017 extracted');
  assert(bibRefs[0].authors?.length === 4, 'BibTeX 4 authors parsed');
  assert(bibRefs[0].doi === '10.5555/3295222.3295349', 'BibTeX DOI parsed');
  assert(bibRefs[1].citekey === 'Knuth1997', 'BibTeX citekey Knuth1997 extracted');
  assert(bibRefs[1].type === 'book', 'BibTeX type book recognized');

  // Test 2: Direct RIS Resolver
  const risRefs = RISResolver.parseRIS(sampleRIS);
  assert(risRefs.length === 2, `Parsed 2 RIS records (found: ${risRefs.length})`);
  assert(risRefs[0].authors?.[0] === 'Shannon, Claude E.', 'RIS author Shannon extracted');
  assert(risRefs[0].title === 'A Mathematical Theory of Communication', 'RIS title extracted');
  assert(risRefs[0].year === 1948, 'RIS year 1948 extracted');
  assert(risRefs[0].pages === '379-423', 'RIS pages 379-423 merged correctly');
  assert(risRefs[0].doi === '10.1002/j.1538-7305.1948.tb01338.x', 'RIS DOI extracted');
  assert(risRefs[0].type === 'journal', 'RIS type JOUR mapped to journal');
  assert(risRefs[1].authors?.[0] === 'Turing, Alan M.', 'RIS Turing author extracted');
  assert(risRefs[1].type === 'conference', 'RIS type CONF mapped to conference');

  // Test 3: Direct EndNote XML Resolver
  const xmlRefs = EndNoteXMLResolver.parseEndNoteXML(sampleEndNoteXML);
  assert(xmlRefs.length === 1, `Parsed 1 EndNote XML record (found: ${xmlRefs.length})`);
  assert(xmlRefs[0].authors?.length === 3, 'EndNote XML 3 authors parsed');
  assert(xmlRefs[0].authors?.[0] === 'Einstein, Albert', 'EndNote XML Einstein author extracted');
  assert(xmlRefs[0].title === 'Can Quantum-Mechanical Description of Physical Reality be Considered Complete?', 'EndNote XML title extracted');
  assert(xmlRefs[0].publication === 'Physical Review', 'EndNote XML secondary-title mapped to publication');
  assert(xmlRefs[0].year === 1935, 'EndNote XML year 1935 extracted');
  assert(xmlRefs[0].doi === '10.1103/PhysRev.47.777', 'EndNote XML electronic-resource-num mapped to DOI');

  // Test 4: Unified LibraryImportResolver auto-detection by filename
  const autoBib = LibraryImportResolver.parseLibrary(sampleBibTeX, 'export.bib');
  assert(autoBib.length === 2, 'Auto-detected .bib by extension');

  const autoRis = LibraryImportResolver.parseLibrary(sampleRIS, 'citations.ris');
  assert(autoRis.length === 2, 'Auto-detected .ris by extension');

  const autoXml = LibraryImportResolver.parseLibrary(sampleEndNoteXML, 'endnote_library.xml');
  assert(autoXml.length === 1, 'Auto-detected .xml by extension');

  // Test 5: Content sniffing without filename
  const sniffBib = LibraryImportResolver.parseLibrary(sampleBibTeX);
  assert(sniffBib.length === 2, 'Sniffed raw BibTeX content without filename');

  const sniffRis = LibraryImportResolver.parseLibrary(sampleRIS);
  assert(sniffRis.length === 2, 'Sniffed raw RIS content without filename');

  const sniffXml = LibraryImportResolver.parseLibrary(sampleEndNoteXML);
  assert(sniffXml.length === 1, 'Sniffed raw EndNote XML content without filename');

  console.log("================================================================================");
  console.log(`  ALL CITATION LIBRARY IMPORT TESTS PASSED (${passCount}/${passCount})!`);
  console.log("================================================================================");
}

runLibraryImportTests().catch(err => {
  console.error(err);
  process.exit(1);
});
