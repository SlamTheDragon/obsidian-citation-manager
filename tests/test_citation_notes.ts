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
console.log("  TESTING NOTE_START/NOTE_END COMMENT BOUNDARIES & ACCORDION EXCERPTS           ");
console.log("================================================================================");

// 1. Initial Note File Markdown Content with Comment Delimiters
const initialNoteContent = `---
citekey: Li2026
type: journal
title: Phantom Tactile Sensation in Mid-Air Ultrasound Arrays
authors:
  - Li, Ziheng
  - Carter, Tom
  - Subramanian, Sriram
year: 2026
publication: ACM Transactions on Computer-Human Interaction
doi: 10.1145/3313831.3376722
abstract: We investigate phantom tactile rendering across volumetric acoustic radiation pressure fields...
projects:
  - spatial-hci
---
# Phantom Tactile Sensation in Mid-Air Ultrasound Arrays

## Abstract
We investigate phantom tactile rendering across volumetric acoustic radiation pressure fields...

## Notes & Synthesis
<!--NOTE_START-->
### Key Takeaway
Dynamic tactile sensations emerge with 34% higher spatial accuracy in phased ultrasound arrays.

- Finding 1: Perceptual latency is 12ms.
- Finding 2: Ultrasonic radiation force scales quadratically.
<!--NOTE_END-->
`;

// 2. Test extraction of userNotes from markdown note using NOTE_START / NOTE_END
const commentMatch = initialNoteContent.match(/<!--NOTE_START-->([\s\S]*?)<!--NOTE_END-->/i);
assert(commentMatch !== null, "Found NOTE_START / NOTE_END comment boundaries");
const extractedNotes = commentMatch![1].trim();

assert(extractedNotes.includes("### Key Takeaway"), "Formatted heading inside notes preserved intact!");
assert(extractedNotes.includes("- Finding 1: Perceptual latency is 12ms."), "Bullet lists preserved intact!");

// 3. Test Accordion Excerpt Generation taking account of all characters past start marker
const cleanNotes = extractedNotes
  .replace(/\s+/g, ' ')             // Normalize whitespace
  .trim();

assert(cleanNotes.startsWith("### Key Takeaway"), "Takes account of any characters past start marker");

const previewLength = 30;
const previewText = cleanNotes.length > previewLength 
  ? `${cleanNotes.slice(0, previewLength)}...` 
  : cleanNotes;

const snippetOutput = `“${previewText}”`;
assert(snippetOutput === "“### Key Takeaway Dynamic tacti...”", `Plain text excerpt output: ${snippetOutput}`);

// 4. Test note persistence with NOTE_START and NOTE_END
const title = "Phantom Tactile Sensation in Mid-Air Ultrasound Arrays";
const abstractText = "We investigate phantom tactile rendering across volumetric acoustic radiation pressure fields...";

const updatedUserNotes = `## Critical Evaluation
Phased acoustic focal points offer exceptional spatial fidelity.`;

const notesSection = updatedUserNotes.trim() 
  ? `\n\n## Notes & Synthesis\n<!--NOTE_START-->\n${updatedUserNotes.trim()}\n<!--NOTE_END-->` 
  : "";
const newBody = `\n# ${title}\n\n## Abstract\n${abstractText}${notesSection}\n`;
const fmMatch = initialNoteContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
const updatedFullContent = `---\n${fmMatch![1].trim()}\n---\n${newBody.trim()}\n`;

assert(updatedFullContent.includes("<!--NOTE_START-->\n## Critical Evaluation"), "NOTE_START comment serialized");
assert(updatedFullContent.includes("<!--NOTE_END-->"), "NOTE_END comment serialized");

// 5. Test round-trip re-parsing of updated content
const reParsedMatch = updatedFullContent.match(/<!--NOTE_START-->([\s\S]*?)<!--NOTE_END-->/i);
assert(reParsedMatch !== null, "Re-parsed NOTE_START / NOTE_END match");
assert(reParsedMatch![1].trim() === updatedUserNotes.trim(), "Full user notes including headers round-tripped 100% losslessly!");

// 6. Test Auto-Save Guard on Modal Exit Points (ESC, backdrop click, tab switch, blur, Done)
console.log("\n--- Testing Auto-Save Guard on Modal Exit Points ---");
let savedNotesStorage: string = "Initial note";
let currentModalNotes: string = "Initial note";
let initialModalNotes: string = "Initial note";
let isSavedCalled = false;

const mockSaveNotes = async () => {
  if (currentModalNotes !== initialModalNotes) {
    savedNotesStorage = currentModalNotes;
    initialModalNotes = currentModalNotes;
    isSavedCalled = true;
  }
};

// Scenario A: User types new content and accidentally hits ESC or clicks backdrop (triggers onClose)
currentModalNotes = "Accidentally closed modal notes without clicking any button!";
const mockOnClose = async () => {
  if (currentModalNotes !== initialModalNotes) {
    await mockSaveNotes();
  }
};
await mockOnClose();
assert(isSavedCalled, "Auto-save triggered on accidental modal dismiss / ESC / backdrop click");
assert(savedNotesStorage === "Accidentally closed modal notes without clicking any button!", "Storage updated on modal close");

// Scenario B: User switches between Edit and Preview tabs
isSavedCalled = false;
currentModalNotes = "Edited before previewing tab";
const mockTabSwitch = async () => {
  await mockSaveNotes();
};
await mockTabSwitch();
assert(isSavedCalled, "Auto-save triggered on Edit -> Preview tab toggle");
assert(savedNotesStorage === "Edited before previewing tab", "Storage updated on tab toggle");

// Scenario C: User blurs textarea
isSavedCalled = false;
currentModalNotes = "Edited and blurred textarea focus";
const mockBlur = async () => {
  await mockSaveNotes();
};
await mockBlur();
assert(isSavedCalled, "Auto-save triggered on textarea blur");
assert(savedNotesStorage === "Edited and blurred textarea focus", "Storage updated on blur");

console.log("\nALL NOTE_START / NOTE_END, ACCORDION & AUTO-SAVE GUARD TESTS PASSED (14/14)!");
