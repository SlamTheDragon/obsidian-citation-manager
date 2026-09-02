# Changelog

All notable changes to **Obsidian Citation Manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-09-03

### Added
- **Citation Library Ingestion**: Support for batch importing literature library files directly via BibTeX (`.bib`), RIS (`.ris`), and EndNote XML (`.xml`) in the Add Citation panel and modal.
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
