import { CitationEngine } from '../src/citationEngine';
import { ReferenceMetadata } from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("================================================================================");
console.log("  TESTING VIDEO CITATIONS & SAME-AUTHOR RECURRING BIBLIOGRAPHY COMPILATION       ");
console.log("================================================================================");

// --- SECTION 1: VIDEO CITATION FORMATTING ACROSS ALL 5 STANDARDS ---
console.log("\n--- Section 1: Video Citation Formatting ---");

const videoRef: ReferenceMetadata = {
  citekey: "DeepMind2026",
  type: "video",
  title: "Democratizing AI with Frontier Reasoning",
  authors: ["Google DeepMind"],
  year: 2026,
  month: "March 15",
  publication: "YouTube",
  url: "https://www.youtube.com/watch?v=sample123",
  accessedDate: "September 2, 2026",
  duration: "14:20",
  projects: ["ai-research"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString(),
};

// 1. APA 7 Video
const apaVideo = CitationEngine.formatAPA7(videoRef);
console.log(`APA 7 Video: ${apaVideo}`);
assert(apaVideo.includes("Google DeepMind. (2026, March 15)."), "APA 7 Video Author & Date correct");
assert(apaVideo.includes("*Democratizing AI with Frontier Reasoning* [Video]."), "APA 7 Video Title & [Video] correct");
assert(apaVideo.includes("YouTube. https://www.youtube.com/watch?v=sample123"), "APA 7 Video Platform & URL correct");

// 2. IEEE Video
const ieeeVideo = CitationEngine.formatIEEE(videoRef, 1);
console.log(`IEEE Video: ${ieeeVideo}`);
assert(ieeeVideo.includes("[1] Google DeepMind, \"Democratizing AI with Frontier Reasoning,\""), "IEEE Video Author & Title correct");
assert(ieeeVideo.includes("YouTube, March 15 2026."), "IEEE Video Platform & Date correct");
assert(ieeeVideo.includes("Accessed: September 2, 2026."), "IEEE Video Accessed Date correct");
assert(ieeeVideo.includes("[Online Video]. Available: https://www.youtube.com/watch?v=sample123"), "IEEE Video [Online Video] & Available URL correct");

// 3. Harvard Video
const harvardVideo = CitationEngine.formatHarvard(videoRef);
console.log(`Harvard Video: ${harvardVideo}`);
assert(harvardVideo.includes("Google DeepMind (2026) 'Democratizing AI with Frontier Reasoning' [Video]."), "Harvard Video Author & Title correct");
assert(harvardVideo.includes("YouTube. March 15."), "Harvard Video Platform & Date correct");
assert(harvardVideo.includes("(Accessed: September 2, 2026)"), "Harvard Video Accessed Date correct");

// 4. Chicago Author-Date Video
const chicagoVideo = CitationEngine.formatChicago(videoRef);
console.log(`Chicago Video: ${chicagoVideo}`);
assert(chicagoVideo.includes("Google DeepMind. 2026. \"Democratizing AI with Frontier Reasoning.\""), "Chicago Video Author & Title correct");
assert(chicagoVideo.includes("YouTube video, 14:20, accessed September 2, 2026."), "Chicago Video Platform, duration, and accessed date correct");
assert(chicagoVideo.includes("https://www.youtube.com/watch?v=sample123"), "Chicago Video URL correct");

// 5. Vancouver Video
const vancouverVideo = CitationEngine.formatVancouver(videoRef, 1);
console.log(`Vancouver Video: ${vancouverVideo}`);
assert(vancouverVideo.includes("1. Google DeepMind. Democratizing AI with Frontier Reasoning [Video]."), "Vancouver Video Author & Title correct");
assert(vancouverVideo.includes("YouTube; 2026."), "Vancouver Video Platform & Year correct");
assert(vancouverVideo.includes("[Accessed September 2, 2026]"), "Vancouver Video Accessed Date correct");


// --- SECTION 2: RECURRING CITATIONS OF THE SAME AUTHOR & CHRONOLOGICAL SORTING ---
console.log("\n--- Section 2: Same-Author Recurring Citations & Sorting ---");

const refSmith2020: ReferenceMetadata = {
  citekey: "Smith2020",
  type: "journal",
  title: "Early Foundations of Ultrasound Haptics",
  authors: ["Smith, John"],
  year: 2020,
  publication: "IEEE Trans Haptics",
  projects: ["haptics"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const refSmith2024A: ReferenceMetadata = {
  citekey: "Smith2024a",
  type: "journal",
  title: "Advanced Acoustic Radiation Arrays",
  authors: ["Smith, John"],
  year: 2024,
  publication: "ACM TOCHI",
  projects: ["haptics"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const refSmith2024B: ReferenceMetadata = {
  citekey: "Smith2024b",
  type: "conference",
  title: "Volumetric Mid-Air Rendering",
  authors: ["Smith, John"],
  year: 2024,
  publication: "ACM CHI",
  projects: ["haptics"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const refSmithCoAuthor: ReferenceMetadata = {
  citekey: "SmithJones2022",
  type: "journal",
  title: "Co-located Sensory Integration",
  authors: ["Smith, John", "Jones, Alice"],
  year: 2022,
  publication: "Nature Sci Rep",
  projects: ["haptics"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const refBrown: ReferenceMetadata = {
  citekey: "Brown2019",
  type: "book",
  title: "Sensory Augmentation Systems",
  authors: ["Brown, Charles"],
  year: 2019,
  publisher: "MIT Press",
  projects: ["haptics"],
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString()
};

const unsortedRefs = [refSmith2024B, refBrown, refSmith2020, refSmithCoAuthor, refSmith2024A];

const sortedRefs = CitationEngine.sortReferences(unsortedRefs, 'apa7');

assert(sortedRefs[0].citekey === "Brown2019", "1st sorted entry is Brown (B before S)");
assert(sortedRefs[1].citekey === "Smith2020", "2nd sorted entry is Smith (2020 before 2024)");
assert(sortedRefs[2].citekey === "Smith2024a", "3rd sorted entry is Smith 2024 Advanced (A before V title)");
assert(sortedRefs[3].citekey === "Smith2024b", "4th sorted entry is Smith 2024 Volumetric");
assert(sortedRefs[4].citekey === "SmithJones2022", "5th sorted entry is Smith & Jones (co-authored after single author)");

const generatedBib = CitationEngine.generateBibliography(unsortedRefs, 'apa7', 'References');
assert(generatedBib.indexOf("Brown, C.") < generatedBib.indexOf("Smith, J. (2020)"), "Bibliography ordered Brown before Smith 2020");
assert(generatedBib.indexOf("Smith, J. (2020)") < generatedBib.indexOf("Smith, J. (2024). Advanced"), "Bibliography ordered Smith 2020 before Smith 2024");

console.log("\nALL VIDEO & SAME-AUTHOR RECURRING BIBLIOGRAPHY TESTS PASSED (17/17)!");
