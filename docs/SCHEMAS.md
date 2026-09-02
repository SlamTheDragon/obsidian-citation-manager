# Data Schemas & Model Reference

This document defines the TypeScript interfaces, JSON schemas, and YAML frontmatter structures used across the plugin.

---

## 1. Reference Metadata Schema (`ReferenceMetadata`)

Stored in `.references/<citekey>.md` as YAML frontmatter:

```yaml
---
citekey: Vaswani2017
type: conference
title: "Attention Is All You Need"
authors:
  - "Vaswani, Ashish"
  - "Shazeer, Noam"
  - "Parmar, Niki"
  - "Uszkoreit, Jakob"
  - "Jones, Llion"
  - "Gomez, Aidan N."
  - "Kaiser, Lukasz"
  - "Polosukhin, Illia"
year: 2017
publication: "Advances in Neural Information Processing Systems (NeurIPS 2017)"
volume: "30"
issue: ""
pages: "5998-6008"
publisher: "Curran Associates, Inc."
doi: "10.48550/arXiv.1706.03762"
url: "https://arxiv.org/abs/1706.03762"
isbn: ""
issn: "2331-8422"
abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks..."
projects:
  - "deep-learning-core"
tags:
  - "transformer"
  - "attention"
  - "nlp"
collectionId: "default"
pdfAttachment: ".references/attachments/Vaswani2017.pdf"
dateAdded: "2026-09-01T12:00:00.000Z"
dateModified: "2026-09-01T12:00:00.000Z"
---

<!--NOTE_START-->
Literature review notes, summaries, quotes, and research ideas go here.
<!--NOTE_END-->
```

### TypeScript Interface
```typescript
export interface ReferenceMetadata {
  citekey: string;
  type: 'journal' | 'book' | 'conference' | 'thesis' | 'web' | 'preprint' | 'other';
  title: string;
  authors: string[];
  year: number;
  month?: string;
  publication?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  isbn?: string;
  issn?: string;
  abstract?: string;
  projects: string[];
  tags: string[];
  userNotes?: string;
  collectionId?: string;
  pdfAttachment?: string;
  apa?: string;
  ieee?: string;
  harvard?: string;
  chicago?: string;
  vancouver?: string;
  bibtex?: string;
  dateAdded: string;
  dateModified: string;
}
```

---

## 2. Citation Bucket Record (`ProjectRecord`)

Manages scoped research projects and manuscript linkage:

```typescript
export interface ProjectRecord {
  id: string;                      // Normalized slug (e.g. 'spatial-hci')
  name: string;                    // Human-readable title
  registeredFiles: string[];       // Vault relative paths of attached notes
  referenceIds: string[];          // Citekeys associated with this project
  citationStyle: CitationStyle;    // 'apa7' | 'ieee' | 'harvard' | 'chicago' | 'vancouver'
  inBodyFormat: InBodyFormat;      // 'parenthetical' | 'narrative' | 'citekey'
  created: string;                 // ISO date
  modified: string;                // ISO date
}
```

---

## 3. Citation Collection (`CitationCollection`)

Manages cross-bucket metadata filtering groups, cached in `.references/.cache/collections.json`:

```typescript
export interface CitationCollection {
  id: string;                      // Unique ID (e.g. 'default', 'col-1234')
  name: string;                    // Collection name (e.g. 'General', 'Primary Sources')
  description?: string;            // Summary description
  color?: string;                  // Hex or theme color
  created: string;                 // ISO date
  modified: string;                // ISO date
  isDefault?: boolean;             // True for permanent 'General' collection
}
```

---

## 4. Plugin Settings Schema (`CitationManagerSettings`)

Stored in plugin standard `data.json`:

```typescript
export interface CitationManagerSettings {
  referencesFolder: string;          // Default: '.references'
  defaultCitationStyle: CitationStyle; // Default: 'apa7'
  defaultInBodyFormat: InBodyFormat; // Default: 'parenthetical'
  enableFootnoteMode: boolean;       // Default: false
  blockDeletionIfInUse: boolean;     // Default: true
  activeProjectId: string;           // Default: '__ALL_PROJECTS__'
  projects: ProjectRecord[];         // Registered buckets
  collections?: CitationCollection[];// Registered collections
  debugMode: boolean;                // Default: false
}
```
