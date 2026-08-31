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

export type InBodyFormat = 'parenthetical' | 'footnote' | 'narrative' | 'citekey';

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
  abstract?: string;
  pdfAttachment?: string;
  projects: string[];
  tags?: string[];
  apa?: string;
  ieee?: string;
  harvard?: string;
  chicago?: string;
  vancouver?: string;
  bibtex?: string;
  dateAdded: string;
  dateModified: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  registeredFiles: string[]; // Vault paths of registered markdown documents
  referenceIds: string[];    // Citekeys belonging to this project
  citationStyle?: CitationStyle;
  inBodyFormat?: InBodyFormat;
  created: string;
  modified: string;
}

export interface CitationManagerSettings {
  referencesFolder: string;
  defaultCitationStyle: CitationStyle;
  defaultInBodyFormat: InBodyFormat;
  projects: ProjectRecord[];
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
  projects: [],
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

export interface ProjectHealthStats {
  totalReferences: number;
  totalCitationsInFiles: number;
  usedReferencesCount: number;
  unusedReferencesCount: number;
  unresolvedCitations: { citekey: string; file: string; line: number; rawCitation: string }[];
  referenceUsageMap: Record<string, CitationOccurrence[]>;
}
