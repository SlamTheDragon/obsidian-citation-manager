---
name: citation-studio
description: Universal academic citation manager, literature indexer, and bi-directional reference studio for Obsidian and markdown knowledge vaults. Governs automated DOI resolution, PDF binary metadata extraction, tamper-proof Markdown parsing, live footnote sync, multi-standard bibliography generation (APA 7, IEEE, Harvard, Chicago, Vancouver), and publication export pipeline.
---

# Citation Studio: Architectural Blueprint & Plugin Structure

## 1. Core Tenets & Bucket Architecture

1. **Zero External Lock-In**: Citations stored locally as YAML-frontmatter markdown notes (`.references/<citekey>.md`) with raw attachments (`.references/attachments/<citekey>.pdf`).
2. **Citation Buckets**: Projects are represented as **Citation Buckets** (`ProjectRecord`), declared via YAML frontmatter (`citation-manager: ["BucketName"]`) and managed with 1-click status bar affordances.
3. **Single Unified Citation Standard**: In-body format and bibliography style are governed by a single dropdown per bucket (`APA 7`, `APA 7 Narrative`, `Footnote [^key]`, `IEEE [1]`, `Harvard`, `Chicago`, `Vancouver`, `Pandoc Citekey [@key]`).
4. **Always-On Background Sync**: Silent debounced file-watcher maintains bottom footnote definitions when format is `footnote` and automatically cleans bottom definitions in non-footnote formats. Manual sync button exists purely for offline recovery.

---

## 2. Directory & Component Structure

```
obsidian-citation-manager/
├── src/
│   ├── types.ts                # TypeScript interfaces (ReferenceMetadata, ProjectRecord, ProjectExportSettings)
│   ├── logger.ts               # Ring-buffered in-memory execution logger
│   ├── storageManager.ts       # Vault adapter I/O (.references/*.md, attachments/*.pdf)
│   ├── projectIndexer.ts       # Scoped document parsing, code-block masking, frontmatter cleaner, corpus compiler
│   ├── citationEngine.ts       # CSL formatters (APA 7, IEEE, Harvard, Chicago, Vancouver, multi-citation formatters)
│   ├── metadataResolvers.ts    # Multi-API resolver (CrossRef, DataCite, SemanticScholar, arXiv, BibTeX)
│   ├── editorSuggest.ts        # Obsidian native autocomplete trigger ([@query, \cite{query)
│   ├── settingsTab.ts          # Vault configuration tab
│   ├── main.ts                 # Plugin lifecycle, file watchers, commands, context menus
│   └── views/
│       ├── CitationManagerView.ts   # Main sidebar view (Header, Search Island, Cards, Footer Island)
│       ├── ReferenceEditorModal.ts  # Add/Edit citation modal with interactive author chips
│       ├── InsertCitationModal.ts   # Multi-citation suggest modal with format dropdown & chips
│       ├── ExportPublicationModal.ts# Publication export modal with vault folder picker
│       ├── PDFImportModal.ts        # Drag & drop PDF importer with binary DOI extraction
│       ├── BibliographyModal.ts     # Standalone bibliography generator with clipboard/note export
│       ├── UsageLocationsModal.ts   # Deletion guard & occurrence inspector
│       ├── PromptModal.ts           # Native autofocus prompt dialog
│       └── ConfirmModal.ts          # Native destructive confirmation dialog
├── styles.css                  # Unified minimal styling (responsive flexbox, zero layout shift)
└── esbuild.config.mjs          # Bun/Node production bundling pipeline
```

---

## 3. Subsystem Specifications

### 3.1 Tamper-Proof Markdown Parsing & Masking
* **Masking Engine (`maskIgnoredMarkdown`)**: Masks fenced code blocks (` ```...``` `), inline code (`` `...` ``), and YAML frontmatter (`---...---`) before scanning. Code snippets never produce false-positive citation occurrences or get modified during propagation.
* **Character Set**: Supports Pandoc / Zotero citekeys `[a-zA-Z0-9_:\.-]+` (including colons and accents).
* **Multi-Citation Insertion**: Inserts space-separated individual tokens (`[@Baltar2012] [@Spielberg2016]`) to prevent syntax overloading across parsers.

### 3.2 Publication & Compilation Pipeline
* **Frontmatter Stripping (`cleanExportFrontmatter`)**: Removes all `citation-manager:` / `citation_manager:` metadata blocks from exported notes so copies in `publication/` are never indexed back as source documents.
* **Corpus Batch Compilation (`compileProjectCorpus`)**: Gathers all linked notes in a bucket, computes a unified sequential numeric index (e.g. IEEE `[1..N]`, Vancouver `(1..N)`), batch compiles all notes to `[outputFolder]/[FileName].md`, and generates `[outputFolder]/References - [BucketName].md`.
* **Folder Picker (`FolderPickerModal`)**: Provides an interactive vault directory browser and saves custom export destinations per bucket.

### 3.3 Search & Acquisition Shortcuts
* **Search Bar Fetching**: Pasting/typing a DOI, arXiv ID, ISBN, or URL into the top search bar and pressing `Enter` directly triggers metadata resolution and opens `ReferenceEditorModal` pre-filled.
* **Tab-Safe PDF Leaf**: Opens attached PDF files via `workspace.getLeaf('tab').openFile(file)` for clean workspace tab preview.

---

## 4. Verification & Quality Assurance Protocol

When compiling and testing new builds:
1. **Compilation**: Run `bun run build` in `F:/.repo/obsidian-citation-manager`.
2. **Reload**: Reload Obsidian with `Ctrl+R`.
3. **Modal Check**:
   - Verify modal opens at `620px` width with `82vh` constrained height.
   - Verify accordions are mutually exclusive.
   - Verify author chips allow adding names via `Enter` / `,` and removing via `✕`.
   - Verify the modal body scrolls vertically while bottom action buttons remain pinned and visible.
4. **Linking Check**:
   - Click `+ Link to Bucket` in the bottom status bar and verify the status badge changes to `In <Bucket>` on the **first click**.
