export type ReferenceType = 
  | 'journal'
  | 'conference'
  | 'book'
  | 'webpage'
  | 'blog'
  | 'video'
  | 'preprint'
  | 'report'
  | 'standard'
  | 'thesis'
  | 'other';

export type CitationStyle = 'apa7' | 'ieee' | 'harvard' | 'chicago' | 'vancouver';

export type InBodyFormat = 'parenthetical' | 'narrative' | 'citekey';

export interface ReferenceMetadata {
  citekey: string;
  type: ReferenceType;
  title: string;
  authors: string[];
  year: number | string;
  month?: string;
  publication?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  url?: string;
  isbn?: string;
  issn?: string;
  accessedDate?: string;
  duration?: string;
  abstract?: string;
  pdfAttachment?: string;
  projects: string[];
  collectionId?: string; // Group / collection assignment, defaults to "default"
  tags?: string[];
  apa?: string;
  ieee?: string;
  harvard?: string;
  chicago?: string;
  vancouver?: string;
  bibtex?: string;
  userNotes?: string;
  dateAdded: string;
  dateModified: string;
}

export interface CitationCollection {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isDefault?: boolean;
  created: string;
  modified: string;
}

export const DEFAULT_COLLECTION_ID = "default";

export const DEFAULT_COLLECTION: CitationCollection = {
  id: DEFAULT_COLLECTION_ID,
  name: "General",
  description: "Default unassigned citation collection",
  isDefault: true,
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
};

export interface ProjectExportSettings {
  style?: CitationStyle;
  scope?: 'local' | 'global';
  cleanFootnotes?: boolean;
  appendBib?: boolean;
  outputFolder?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  registeredFiles: string[]; // Vault paths of registered markdown documents
  referenceIds: string[];    // Citekeys belonging to this project
  citationStyle?: CitationStyle;
  inBodyFormat?: InBodyFormat;
  publicationFolder?: string;
  exportSettings?: ProjectExportSettings;
  created: string;
  modified: string;
}

export interface CitationManagerSettings {
  referencesFolder: string;
  defaultCitationStyle: CitationStyle;
  defaultInBodyFormat: InBodyFormat;
  enableFootnoteMode: boolean;
  projects: ProjectRecord[];
  collections: CitationCollection[];
  activeProjectId: string; // "ALL" or specific project id
  enableEditorSuggest: boolean;
  blockDeletionIfInUse: boolean;
  debugMode: boolean;
}

export const ALL_PROJECTS_ID = "__ALL_REFERENCES__";

export const DEFAULT_SETTINGS: CitationManagerSettings = {
  referencesFolder: ".references",
  defaultCitationStyle: "apa7",
  defaultInBodyFormat: "parenthetical",
  enableFootnoteMode: false,
  projects: [],
  collections: [DEFAULT_COLLECTION],
  activeProjectId: ALL_PROJECTS_ID,
  enableEditorSuggest: true,
  blockDeletionIfInUse: true,
  debugMode: false,
};

export interface CitationOccurrence {
  filePath: string;
  fileName: string;
  lineNumber: number;
  lineContent: string;
  citekey: string;
  rawCitation: string;
}

export type LintSeverity = 'error' | 'warning' | 'info';

export type LintWarningType = 
  | 'unresolved' 
  | 'format_mismatch' 
  | 'style_mismatch' 
  | 'orphan_definition'
  | 'missing_footnote_definition'
  | 'author_typo_fuzzy'
  | 'tampered_definition'
  | 'numeric_order_mismatch'
  | 'unformatted_prose_mention'
  | 'compounded_order_mismatch'
  | 'bibliography_order_mismatch';

export interface LintFixOption {
  label: string;
  replacementText?: string;
  action: 'replace' | 'create_entry' | 'purge' | 'sort' | 'dismiss' | 'info_only';
}

export interface LintWarning {
  id: string; // Hash of file path, line, rawCitation, and type
  filePath: string;
  fileName: string;
  lineNumber: number;
  lineContent: string;
  rawCitation: string;
  citekey?: string;
  severity?: LintSeverity;
  shortTitle?: string;
  explanation?: string;
  definitionSnippet?: string;
  suggestedFix?: string;
  fixOptions?: LintFixOption[];
  type: LintWarningType;
  message: string;
}

export interface ProjectHealthStats {
  totalReferences: number;
  totalCitationsInFiles: number;
  usedReferencesCount: number;
  unusedReferencesCount: number;
  unresolvedCitations: { citekey: string; file: string; line: number; rawCitation: string }[];
  referenceUsageMap: Record<string, CitationOccurrence[]>;
  lintWarnings: LintWarning[];
}
