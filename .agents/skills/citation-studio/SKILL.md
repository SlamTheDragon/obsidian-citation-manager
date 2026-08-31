---
name: citation-studio
description: Universal academic citation manager, literature indexer, and bi-directional reference studio for Obsidian and markdown knowledge vaults. Governs automated DOI resolution, PDF binary metadata extraction, live in-text citation sync (<20ms), multi-standard bibliography generation (APA 7, IEEE, Harvard, Chicago, Vancouver), and deletion guard telemetry.
---

# Citation Studio: Architectural Blueprint & Universal Guide

## 1. Executive Summary & Philosophy

**Citation Studio** (Obsidian Citation Manager) is an offline-first, bi-directional reference studio and literature indexer embedded natively into Obsidian. It bridges the gap between external reference managers (Zotero, Mendeley, EndNote) and local Markdown vaults by treating references as first-class Markdown entities while maintaining a rigorous, zero-latency citation graph across all research documents.

### Core Tenets
1. **Zero External Lock-In**: References are stored locally on disk as standard YAML-frontmatter Markdown notes (`.references/<citekey>.md`) with raw PDF attachments (`.references/attachments/<citekey>.pdf`).
2. **Instant Bi-Directional Synchronization ($< 20\text{ ms}$)**: Modifying citation metadata (e.g. updating author names, year, or publication venue) propagates in-text parenthetical citations, narrative citations, and footnote definitions across all linked project files within milliseconds.
3. **Progressive Disclosure & Cognitive Ergonomics**: Eliminates cluttered multi-panel sidebars in favor of a single unified 28px header, inline segmented search and action pills, mutually exclusive animated accordions, and interactive inline author chips.
4. **Don Norman Human-Centered Design**: Every destructive or mutated state incorporates explicit signifiers, visible affordances, and non-blocking visual feedback. Deletions are guarded when citations are actively cited in notes.

---

## 2. Theoretical Grounding & Citation Standards

The system incorporates algorithmic formatting engines conforming strictly to major academic publication manuals:

| Standard | In-Body Default | Sample In-Body Format | Bibliography Reference Pattern |
| :--- | :--- | :--- | :--- |
| **APA 7th** | Parenthetical / Narrative | `(Baltar & Brunet, 2012)` / `Baltar & Brunet (2012)` | `Baltar, F., & Brunet, I. (2012). Social research 2.0. *IJMR*, 54(1), 57–74.` |
| **IEEE** | Bracketed Numerical / Footnote | `[^Baltar2012]` $\rightarrow$ `[1]` | `[1] F. Baltar and I. Brunet, "Social research 2.0," *IJMR*, vol. 54, no. 1, pp. 57–74, 2012.` |
| **Harvard** | Author-Date | `(Baltar and Brunet 2012)` | `Baltar, F. and Brunet, I. (2012) 'Social research 2.0', *IJMR*, 54(1), pp. 57–74.` |
| **Chicago** | Author-Date / Notes | `(Baltar and Brunet 2012)` / `[^Baltar2012]` | `Baltar, Fabián, and Ignasi Brunet. 2012. "Social Research 2.0." *IJMR* 54 (1): 57–74.` |
| **Vancouver** | Sequential Numeric | `(1)` / `[^Baltar2012]` | `(1) Baltar F, Brunet I. Social research 2.0. IJMR. 2012;54(1):57-74.` |

---

## 3. Architecture & Codebase Map

```
F:/.repo/obsidian-citation-manager/
├── src/
│   ├── types.ts                # TypeScript interfaces (ReferenceMetadata, ProjectRecord, HealthStats)
│   ├── logger.ts               # Ring-buffered in-memory execution logger (zero production overhead)
│   ├── storageManager.ts       # Direct vault adapter I/O (.references/*.md, attachments/*.pdf)
│   ├── projectIndexer.ts       # Scoped document parsing, 2MB PDF DOI extraction, footnote sync
│   ├── citationEngine.ts       # CSL-grade string formatters (APA 7, IEEE, Harvard, Chicago, Vancouver)
│   ├── metadataResolvers.ts    # Multi-API resolver (CrossRef, Datacite, SemanticScholar, arXiv, BibTeX)
│   ├── editorSuggest.ts        # Obsidian native autocomplete trigger ([@query, \cite{query)
│   ├── settingsTab.ts          # Vault configuration tab
│   ├── main.ts                 # Plugin lifecycle, ribbon icons, context menus, command palette
│   └── views/
│       ├── CitationManagerView.ts   # Main sidebar view (Header, Search Island, Cards, Footer Island)
│       ├── ReferenceEditorModal.ts  # Add/Edit citation modal with interactive Author Chips & Accordions
│       ├── PDFImportModal.ts        # Drag & drop PDF importer with automated DOI binary extraction
│       ├── BibliographyModal.ts     # Standalone bibliography generator with clipboard/note export
│       ├── InsertCitationModal.ts   # Fuzzy-search citation modal for instant cursor insertion
│       ├── UsageLocationsModal.ts   # Deletion guard & occurrence inspector with editor jumping
│       ├── PromptModal.ts           # Native autofocus prompt dialog (replacing window.prompt)
│       └── ConfirmModal.ts          # Native destructive confirmation dialog with loading feedback
├── styles.css                  # Unified minimal styling (responsive flexbox, zero layout shift)
└── esbuild.config.mjs          # Bun/Node production bundling pipeline
```

---

## 4. Key Subsystems & Algorithms

### 4.1 Deep PDF Binary DOI Extraction (2 MB Scan)
Traditional PDF plugins fail when papers lack clear text streams or store metadata in compressed FlateDecode streams. `ProjectIndexer.extractDOIFromBuffer()` reads up to **2 Megabytes** of raw binary data and applies a priority regex pipeline:
1. **XMP / XML Metadata Streams**: Inspects `<prism:doi>`, `<dc:identifier>`, `<pdfx:doi>`, and `<crossref:doi>`.
2. **DOI URL & Header Prefixes**: Matches `https://doi.org/10.xxxx/...`, `http://dx.doi.org/10.xxxx/...`, and `/DOI (10.xxxx/...)`.
3. **Raw DOI Pattern**: Resolves `10.\d{4,9}/[-._;()/:A-Za-z0-9]+` with automated trailing punctuation sanitization.
4. **Preprint Fallback**: Parses arXiv IDs (`arXiv:2301.12345`) for automated CrossRef/arXiv resolution.

### 4.2 Bi-Directional Synchronization & Footnote Propagation ($< 20\text{ ms}$)
When reference metadata is edited in `ReferenceEditorModal`:
1. `StorageManager.saveReference()` writes the updated YAML frontmatter to `.references/<citekey>.md`.
2. If citekey changed, `StorageManager` atomically renames the markdown note and associated PDF attachment without orphaned files.
3. `ProjectIndexer.syncReferenceUpdateAcrossDocuments()` executes a **scoped mutation pass** restricted strictly to files tagged with the project in YAML frontmatter (`citation-manager: ["ProjectName"]`) and the active editor buffer.
4. Updates parenthetical tokens `(Author, Year)` and footnotes `[^citekey]: Definition` in memory and writes cleanly to disk.

### 4.3 Frontmatter Project Registry
Projects are declared non-destructively in Markdown notes:
```yaml
---
citation-manager:
  - "Spatial HCI"
  - "UIUX Foundational"
---
```
The status bar detects project registration on the fly, offering instant 1-click **`[ + Link to Project ]`** and **`[ ✕ Unlink ]`** with zero-latency optimistic UI updates.

---

## 5. Universal Vault Implementation Blueprint

To deploy this citation management paradigm to any Markdown vault or knowledge system:

1. **Vault Structure Convention**:
   ```
   <Vault Root>/
   ├── .references/              # Hidden reference notes
   │   ├── Baltar2012.md         # Reference YAML frontmatter & study notes
   │   └── attachments/          # Associated PDF binaries
   │       └── Baltar2012.pdf
   └── Research Notes/           # User markdown documents
       └── Chapter1.md           # Contains in-text [@Baltar2012] or [^Baltar2012]
   ```

2. **CSL Expansion & Custom Formats**:
   - Add new citation styles directly in `src/citationEngine.ts` by implementing the `CitationFormatter` contract.
   - Formatter functions consume `ReferenceMetadata` and return pure formatted strings with Markdown italicization `*...*`.

3. **Multi-Vault Portability**:
   - Because all citations reside in `.references/`, a vault can be zipped, synced via Git, or transferred to mobile devices without database drift or broken cloud dependencies.

---

## 6. Verification & Quality Assurance Protocol

When compiling and testing new builds:
1. **Compilation**: Run `bun run build` in `F:/.repo/obsidian-citation-manager`.
2. **Reload**: Reload Obsidian with `Ctrl+R`.
3. **Modal Check**:
   - Verify modal opens at `620px` width with `82vh` constrained height.
   - Verify accordions are mutually exclusive (opening one smoothly collapses any other open accordion).
   - Verify author chips allow adding names via `Enter` / `,` and removing via `✕`.
   - Verify the modal body scrolls vertically with mousewheel/trackpad while the bottom action buttons remain pinned and visible.
4. **Linking Check**:
   - Click `+ Link to Project` in the bottom status bar and verify the status badge changes to `In <Project>` on the **first click**.
