# Obsidian Citation Manager

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Academic Standards](https://img.shields.io/badge/CSL-APA7%20%7C%20IEEE%20%7C%20Harvard%20%7C%20Chicago%20%7C%20Vancouver-green.svg)](https://citationstyles.org/)

A project-centric academic reference manager, live citation indexer, diagnostic linter, and publication export plugin for [Obsidian](https://obsidian.md). Uses a local `.references/` folder to store notes.

---

## Key Highlights

- **Local-First and Markdown Native**: Stores all reference records and notes as Markdown files in `.references/` with YAML frontmatter. Uses no cloud databases and no external servers.
- **5 Academic Standards**: Full CSL implementations for **APA 7th Edition**, **IEEE [1]**, **Harvard (Author Year)**, **Chicago 17th Author-Date**, and **Vancouver (1)**.
- **Citation Buckets**: Group notes by manuscript scope. Each bucket controls its citation standard, linked files, and sequential numeric indexing.
- **Citation Collections**: Organize literature across buckets with color-coded groups and multi-filter controls.
- **In-Editor Autocomplete**: Suggests citations at the cursor when you type `[@`, `\cite{`, or `((`.
- **Diagnostic Linter Engine**: Scans linked documents in real time for orphan definitions, missing citekeys, and style mismatches. Offers batch repair controls.
- **Obsidian Footnotes Companion**: Draft notes with `[^citekey]` footnote callouts. Converts footnotes to target citation styles during export.
- **Surfing and Web Viewer Support**: Opens external study sources (DOI, arXiv, URL) directly in Surfing tabs or in the native Obsidian Web Viewer.
- **Publication Export Pipeline**: Cleans internal tags, converts footnotes into citations, creates sorted bibliographies, and exports standalone notes.

---

## Architectural Workflow

```mermaid
flowchart LR
    subgraph S1["1. Ingestion"]
        direction TB
        I1["<b>Search Island</b><br/>DOI / arXiv / URL / ISBN"]
        I2["<b>+ New Citation</b><br/>Manual or quick resolution"]
        I3["<b>PDF Dropzone</b><br/>Auto DOI scan &amp; match"]
    end

    subgraph S2["2. Scope"]
        direction TB
        B1["<b>Citation Buckets</b><br/>Manuscript style isolation"]
        B2["<b>Collections</b><br/>Cross-bucket group tags"]
        B3["<b>Linked Notes</b><br/>Direct file binding"]
    end

    subgraph S3["3. Drafting"]
        direction TB
        D1["<b>Autocomplete</b><br/><code>[@</code>, <code>\\cite{</code>, <code>((</code>"]
        D2["<b>Insert Modal</b><br/>Multi-citation chips"]
        D3["<b>Footnotes</b><br/><code>[^citekey]</code> drafting"]
    end

    subgraph S4["4. Diagnostics"]
        direction TB
        L1["<b>Telemetry</b><br/>Usage &amp; instance counters"]
        L2["<b>Linter Accordion</b><br/>Format mismatches"]
        L3["<b>Batch Fix Modal</b><br/>1-Click repair"]
    end

    subgraph S5["5. Export"]
        direction TB
        E1["<b>In-App Browser</b><br/>Surfing &amp; Web Viewer"]
        E2["<b>Live Bibliography</b><br/>Auto-sorted reference list"]
        E3["<b>Export Pipeline</b><br/>Clean standalone notes"]
    end

    S1 --> S2 --> S3 --> S4 --> S5
```

---

## Installation

### Method 1: Obsidian Community Plugins
1. Open Obsidian **Settings** &rarr; **Community plugins**.
2. Turn off **Restricted mode**.
3. Click **Browse** and search for `Citation Manager`.
4. Click **Install**, then click **Enable**.

### Method 2: Obsidian BRAT
1. Install and enable the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat).
2. Open BRAT settings &rarr; **Add Beta plugin**.
3. Enter the repository URL: `https://github.com/SlamTheDragon/obsidian-citation-manager`.
4. Click **Add Plugin** and enable **Citation Manager** under Community Plugins.

### Method 3: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [Releases](https://github.com/SlamTheDragon/obsidian-citation-manager/releases) page.
2. In your Obsidian vault, open `.obsidian/plugins/`.
3. Create a folder named `citation-manager/` and move the three files into it.
4. Reload Obsidian. Enable **Citation Manager** in **Settings &rarr; Community plugins**.

---

## Feature Guide

### 1. Ingestion
- **Identifier Resolution**: Type any DOI (`10.1145/3313831`), arXiv ID (`2301.07041`), ISBN (`9780465050659`), or URL into the search bar. Press **Enter** to fetch metadata from CrossRef, arXiv, or OpenLibrary.
- **PDF Dropzone**: Drag and drop a PDF file into the editor modal. The plugin scans binary streams for embedded DOIs, compares them with metadata, and confirms matches.
- **Citation Library File Import (.bib, .ris, .xml)**: Drag and drop or paste complete reference libraries exported from **Zotero**, **Mendeley**, **EndNote**, or **Google Scholar**. Supports standard BibTeX (`.bib`), Research Information Systems (`.ris`), and EndNote XML (`.xml`) with batch parsing and 1-click library import directly into the active bucket.

### 2. Buckets and Collections
- **Citation Buckets**: Represent distinct research scopes such as chapters or papers.
  - Buckets control the active citation standard (such as IEEE or APA 7).
  - Buckets control sequential numeric indexing across all linked notes.
  - You can edit bucket names in the **Bucket Settings** subpanel.
- **Citation Collections**: Represent organizational groups across buckets.
  - Filter references with the 4-state filter island.
  - Move citations between collections with the two-column transfer modal.

### 3. Drafting and Insertion
- **In-Editor Suggestions**: Type `[@`, `\cite{`, or `((` to open the autocomplete popup. Select an entry to insert it in your bucket's active style.
- **Multi-Citation Modal (`Ctrl/Cmd + Shift + I`)**: Search references. Hold `Shift` to select multiple papers. The engine groups and sorts them automatically:
  - APA 7: `(Carter et al., 2026; Li, 2024; Norman, 2013)`
  - IEEE: `[1, 3, 5]`
  - Vancouver: `(1, 3, 5)`

### 4. Diagnostic Linter Engine
- **Continuous Verification**: Scans linked documents for format deviations, orphan footnote definitions, and unresolved citekeys.
- **Batch Fix Modal**: Shows issues in expandable accordions with before-and-after previews. Select checkboxes and click **Apply Selected Fixes** to repair issues in one step.

### 5. Plugin Integrations
- **Obsidian Footnotes Companion**: Enable Footnote Mode in settings. Inserting a citation adds a `[^citekey]` callout at the cursor and a definition at the bottom. Exporting for publication converts footnotes back into citations.
- **Surfing and Web Viewer**: Citation cards with a DOI, arXiv ID, or URL contain source links. Clicking a card opens the source in a Surfing tab, in the native Web Viewer, or in your default browser.

---

## Commands and Shortcuts

| Command | Default Shortcut | Description |
| :--- | :--- | :--- |
| `Citation Manager: Open Panel` | - | Opens the Citation Studio sidebar view. |
| `Citation Manager: Insert Citation` | - | Opens the search and insert modal. |
| `Citation Manager: Quick Add Citation` | - | Opens the quick identifier resolution prompt. |
| `Citation Manager: Link File to Bucket` | - | Links the active document to the active bucket. |
| `Citation Manager: Generate Bibliography` | - | Shows the bibliography modal for the active bucket. |
| `Citation Manager: Resync Notes in Bucket` | - | Verifies and syncs footnote definitions. |
| `Citation Manager: Export for Publication` | - | Opens the publication export modal. |

---

## Technical Documentation

Technical specifications and guides are available in the [`docs/`](./docs/) directory:

- [**Environment & Runtime Guide**](./docs/ENVIRONMENT.md): Node.js LTS, NVM configuration, and Bun execution matrix.
- [**Architecture & Subsystem Decomposition**](./docs/ARCHITECTURE.md): Class layout, data flows, and state machines.
- [**Schema Specifications**](./docs/SCHEMAS.md): TypeScript and JSON schemas for references, buckets, collections, and settings.
- [**CSL Academic Standards Guide**](./docs/STANDARDS.md): Formatting rules for APA 7, IEEE, Harvard, Chicago, and Vancouver.
- [**Diagnostic Linter Rules**](./docs/LINTING_RULES.md): Rule list, severity ratings, and automated repair logic.
- [**Contributing Guide**](./docs/CONTRIBUTING.md): Environment setup, Bun test suite, and coding rules.
- [**Release & Community Discovery Guide**](./docs/RELEASE_AND_DISCOVERY.md): Version bumping, GitHub Actions release pipeline, and Obsidian directory submission.

---

## External & Internal APIs Used

The plugin integrates with the following academic data APIs and Obsidian platform interfaces:

### 1. Academic Metadata Resolution APIs
| API | Endpoint / Protocol | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| **CrossRef REST API** | `https://api.crossref.org/works/{doi}` | Automated DOI metadata resolution (authors, journal, volume, issue, pages, publication year). | None (Public) |
| **arXiv Export API** | `https://export.arxiv.org/api/query?id_list={arxivId}` | Preprint metadata resolution (Atom XML parsing for authors, abstract, publication date, primary category). | None (Public) |
| **OpenLibrary Books API** | `https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data` | ISBN book resolution (title, publishers, authors, page counts, cover links). | None (Public) |
| **Dublin Core & Highwire Press Meta Parser** | Direct HTTP `fetch` | Direct webpage metadata extraction (`DC.title`, `DC.creator`, `citation_title`, `citation_author`, `citation_journal_title`, `og:title`). | None (Public) |

### 2. Obsidian Platform APIs
- **`Vault` & `DataAdapter`**: Native vault file operations, local binary PDF caching (`writeBinary`), atomic Markdown note persistence with YAML frontmatter.
- **`MetadataCache`**: Frontmatter inspection for project-scoped note detection (`citation-manager: [Bucket]`).
- **`Workspace` & `WorkspaceLeaf`**: Sidebar view mounting (`ItemView`), dynamic status bar rendering, document navigation.
- **`EditorSuggest`**: High-performance in-editor cursor trigger detection (`[@`, `\cite{`, `((`, `[^`) and token replacement.

### 3. Companion Plugin APIs
- **Surfing Plugin Leaf API** (`app.plugins.plugins['surfing'].openUrl(url)`): Native integration for opening external academic source links (DOI, arXiv, URLs) and locally attached PDFs in browser tabs, with automatic fallback to default Obsidian leaves.

---

## License

This project is licensed under the [MIT License](./LICENSE).

---

## Development

```bash
# Run all 30 automated test suites
bun run test:all

# Build production bundle with Bun (auto-compiles modular Sass)
bun run build

# Package release artifacts directly in dist/
bun run package

# Watch mode for active development
bun run dev
```
