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

  // Test 6: ACM BibTeX Real-World User Sample
  const userACMBibTeX = `@inproceedings{10.1145/3450618.3469166,
author = {Zhang, Li and He, Weiping and Bai, Huidong and He, Jun and Qiao, Yiyue and Billinghurst, Mark},
title = {A Hybrid 2D-3D Tangible Interface for Virtual Reality},
year = {2021},
isbn = {9781450383714},
publisher = {Association for Computing Machinery},
address = {New York, NY, USA},
url = {https://doi.org/10.1145/3450618.3469166},
doi = {10.1145/3450618.3469166},
abstract = {Virtual Reality (VR) controllers are widely used for easy object selection and manipulation as a primary 3D input method in the virtual environment. Mobile devices with touchscreens like smartphones or tablets provide precise 2D tangible inputs. This research combines a VR controller and a touch-based smartphone to create a novel hybrid 2D-3D interface for enhanced VR interaction. We present the interface design and its implementation and also demonstrate four featured scenarios with the hybrid interface.},
booktitle = {ACM SIGGRAPH 2021 Posters},
articleno = {9},
numpages = {2},
keywords = {hybrid interface, Virtual Reality, VR controller, Smartphone},
location = {Virtual Event, USA},
series = {SIGGRAPH '21}
}`;
  const acmBibParsed = LibraryImportResolver.parseLibrary(userACMBibTeX);
  assert(acmBibParsed.length === 1, 'Parsed 1 ACM BibTeX entry');
  assert(acmBibParsed[0].title === 'A Hybrid 2D-3D Tangible Interface for Virtual Reality', 'ACM BibTeX title matched');
  assert(acmBibParsed[0].authors?.length === 6, 'ACM BibTeX all 6 authors extracted');
  assert(acmBibParsed[0].doi === '10.1145/3450618.3469166', 'ACM BibTeX DOI matched');
  assert(acmBibParsed[0].publication === 'ACM SIGGRAPH 2021 Posters', 'ACM BibTeX booktitle matched');

  // Test 7: ACM EndNote Tagged / Refer Real-World User Sample
  const userEndNoteTagged = `%0 Conference Paper
%T A Hybrid 2D-3D Tangible Interface for Virtual Reality
%@ 9781450383714
%U https://doi.org/10.1145/3450618.3469166
%R 10.1145/3450618.3469166
%X Virtual Reality (VR) controllers are widely used for easy object selection and manipulation as a primary 3D input method in the virtual environment. Mobile devices with touchscreens like smartphones or tablets provide precise 2D tangible inputs. This research combines a VR controller and a touch-based smartphone to create a novel hybrid 2D-3D interface for enhanced VR interaction. We present the interface design and its implementation and also demonstrate four featured scenarios with the hybrid interface.
%B ACM SIGGRAPH 2021 Posters
%I Association for Computing Machinery
%A Li Zhang
%A Weiping He
%A Huidong Bai
%A Jun He
%A Yiyue Qiao
%A Mark Billinghurst
%D 2021
%P Article 9
%K Smartphone, VR controller, Virtual Reality, hybrid interface
%C Virtual Event, USA`;
  const enwParsed = LibraryImportResolver.parseLibrary(userEndNoteTagged, 'acm.enw');
  assert(enwParsed.length === 1, 'Parsed 1 EndNote Tagged entry');
  assert(enwParsed[0].title === 'A Hybrid 2D-3D Tangible Interface for Virtual Reality', 'EndNote Tagged title matched');
  assert(enwParsed[0].authors?.length === 6, 'EndNote Tagged all 6 %A authors extracted');
  assert(enwParsed[0].doi === '10.1145/3450618.3469166', 'EndNote Tagged DOI extracted');
  assert(enwParsed[0].type === 'conference', 'EndNote Tagged mapped to conference');
  assert(enwParsed[0].publication === 'ACM SIGGRAPH 2021 Posters', 'EndNote Tagged publication matched');

  // Test 8: ACM Formatted Reference String Real-World User Sample
  const userACMRefString = `Li Zhang, Weiping He, Huidong Bai, Jun He, Yiyue Qiao, and Mark Billinghurst. 2021. A Hybrid 2D-3D Tangible Interface for Virtual Reality. In ACM SIGGRAPH 2021 Posters (SIGGRAPH '21). Association for Computing Machinery, New York, NY, USA, Article 9, 1–2. https://doi.org/10.1145/3450618.3469166`;
  const acmRefParsed = LibraryImportResolver.parseLibrary(userACMRefString);
  assert(acmRefParsed.length === 1, 'Parsed 1 ACM Ref string');
  assert(acmRefParsed[0].year === 2021, 'ACM Ref string year 2021 extracted');
  assert(acmRefParsed[0].doi === '10.1145/3450618.3469166', 'ACM Ref string DOI extracted');
  assert(acmRefParsed[0].title === 'A Hybrid 2D-3D Tangible Interface for Virtual Reality', 'ACM Ref string title extracted');
  assert(acmRefParsed[0].authors && acmRefParsed[0].authors.length >= 5, 'ACM Ref string authors extracted');

  console.log("================================================================================");
  console.log(`  ALL CITATION LIBRARY IMPORT TESTS PASSED (${passCount}/${passCount})!`);
  console.log("================================================================================");
}

runLibraryImportTests().catch(err => {
  console.error(err);
  process.exit(1);
});
