# Changelog

All notable changes to **Obsidian Citation Manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-09-03

### Added
- **Multi-Format Citation Library Ingestion**: Support for batch importing literature library files and raw snippets via BibTeX (`.bib`), RIS (`.ris`), EndNote Tagged / Refer (`.enw`), EndNote XML (`.xml`), and plain formatted citation strings (ACM Ref, APA 7, IEEE) in the Add Citation panel and modal.
- **Valid `file:///` Local PDF Protocol Routing**: Formatted local PDF paths as valid `file:///` URIs, enabling direct loading in Surfing tabs without `ERR_NAME_NOT_RESOLVED (-105)` errors.
- **Conditional PDF Action Button**: Restored dedicated `PDF` action button in the primary left card group beside `Notes`, visible conditionally when a reference has an attached PDF.
- **Library Import Island Styling**: Redesigned library import modal with consistent island card hierarchy, responsive dropzone, and rich preview badges.
- **Export Panel State Preservation**: Automatic persistence of Citation Standard, Output Folder path, Compilation Scope (`local` vs `global`), Clean Footnotes, and Append References toggles in project settings and global plugin state.
- **Surfing PDF Integration**: Direct opening of attached literature PDFs in active Surfing browser tabs with automatic fallback to Obsidian's default PDF viewer.
- **Per-File Diagnostic Scoping**: Scoped diagnostic warning IDs (`filePath::line::rawCitation::type`) to ensure masking in one note does not silence issues in other notes.
- **1-Click Diagnostics Cache Reset**: Added a dedicated `Clear Dismissed Cache` setting in the native plugin settings tab to restore hidden lint warnings.
- **Master Selection Button Logic**: Diagnostic accordion master selection handles partial-selection precedence (`Deselect All` when partially selected, `Select All` when none selected).
- **Single Accordion Invariant**: Opening any diagnostic accordion automatically collapses other open accordions.
- **External & Internal API Documentation**: Comprehensive specification of CrossRef, arXiv, OpenLibrary, Dublin Core/OpenGraph, and Obsidian platform APIs in `README.md`.
- **Environment Isolation Template**: Added `.env.example` and dynamic `.env` configuration for local development paths.

### Changed
- **Architectural Separation**: Decoupled UI components from backend services into 17 co-located modular SCSS component directories under `src/frontend/` and core logic under `src/backend/`.
- **Direct `dist/` Output Pipeline**: Build system exclusively outputs to `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` without emitting artifacts in the project root.
- **Stats Subpanel Decoupling**: Restructured stats subpanel into 3 distinct sequential groups: `[stats]` &rarr; `[bucket settings]` &rarr; `[subpanel views for file links and lints]`.
- **Authoritative Sass Restoration**: Restored 100% layout fidelity, icon dimensions (11px SVG sizing), and scrollable accordion containers (`max-height: 48vh`).

### Fixed
- Fixed autocomplete suggestion capitalization in Footnote Mode and standard styles to eliminate false-positive lint warnings.
- Resolved TypeScript compiler type-check issues in test runners and mock environments.
- Corrected dot-folder PDF resolution in `.references/attachments/` bypassing Obsidian's internal hidden-file mask.

### Planned for [1.0.2]
- Modal form field sequence and layout unification across `PDFImportModal`, `ReferenceEditorModal`, and metadata resolvers.
- add support for Medlars & RefWorks import
- add bibTex library export option with filtering for collections/selected citations
- fix import citations library modal spacing
- flip export for publication and [copy to clipboard] and [append to note] buttons in bibliography generation
- fix used citation indication chip within citation card styling to make citation indicators clearer, just like how it was written in collections card
- remove "hold shift to append" for citation overloading (this doesn't really work)
- fix margins of modal islands on some modals

---

## [1.0.0] - 2026-08-20

### Added
- Initial production release of Obsidian Citation Manager.
- Local-first markdown storage in `.references/*.md`.
- Full CSL formatters for APA 7th, IEEE, Harvard, Chicago 17th Author-Date, and Vancouver.
- Manuscript Citation Buckets and cross-bucket Collections.
- In-editor autocomplete suggest provider (`[@`, `\cite{`, `((`, `[^`).
- Diagnostic linter with automated batch repairs.
- Publication export pipeline for standalone publication copies.
