import { ReferenceMetadata } from './types';
import { DOIResolver } from './resolvers/doiResolver';
import { ArxivResolver } from './resolvers/arxivResolver';
import { ISBNResolver } from './resolvers/isbnResolver';
import { URLResolver } from './resolvers/urlResolver';
import { BibTeXResolver } from './resolvers/bibtexResolver';
import { RISResolver } from './resolvers/risResolver';
import { EndNoteXMLResolver } from './resolvers/endnoteXmlResolver';
import { LibraryImportResolver } from './resolvers/libraryImportResolver';

export class MetadataResolvers {
  /**
   * Automatically detects input type (DOI, ISBN, arXiv, URL, BibTeX, RIS, EndNote XML) and resolves metadata
   */
  static async detectAndResolve(input: string): Promise<Partial<ReferenceMetadata>> {
    const trimmed = input.trim();

    // 1. BibTeX
    if (trimmed.startsWith('@') && trimmed.includes('{')) {
      const parsed = this.parseBibTeX(trimmed);
      if (parsed.length > 0) return parsed[0];
      throw new Error('Invalid BibTeX format');
    }

    // 2. RIS
    if (/^TY\s*-\s*/i.test(trimmed) || /^[A-Z0-9]{2}\s*-\s*/m.test(trimmed)) {
      const parsed = this.parseRIS(trimmed);
      if (parsed.length > 0) return parsed[0];
    }

    // 3. EndNote XML
    if (/<record>/i.test(trimmed) || /<xml/i.test(trimmed)) {
      const parsed = this.parseEndNoteXML(trimmed);
      if (parsed.length > 0) return parsed[0];
    }

    // 4. DOI
    const doiMatch = trimmed.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
    if (doiMatch) {
      return await this.resolveDOI(doiMatch[1]);
    }

    // 5. arXiv ID
    const arxivMatch = trimmed.match(/arxiv(?:\.org\/(?:abs|pdf)\/|:)?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
    if (arxivMatch) {
      return await this.resolveArXiv(arxivMatch[1]);
    }

    // 6. ISBN
    const isbnClean = trimmed.replace(/[- ]/g, '');
    if (/^(978|979)?\d{9}[\dX]$/i.test(isbnClean)) {
      return await this.resolveISBN(isbnClean);
    }

    // 7. URL (Webpage, YouTube, Blog)
    if (/^https?:\/\//i.test(trimmed)) {
      return await this.resolveURL(trimmed);
    }

    throw new Error('Could not detect identifier format. Please enter a valid DOI, arXiv ID, ISBN, URL, BibTeX, RIS, or EndNote XML snippet.');
  }

  /**
   * Resolves literature metadata from CrossRef using a DOI string
   * @param doi Digital Object Identifier (e.g. 10.1145/3313831)
   */
  static async resolveDOI(doi: string): Promise<Partial<ReferenceMetadata>> {
    return DOIResolver.resolveDOI(doi);
  }

  /**
   * Resolves preprint metadata from arXiv Atom API
   * @param arxivId arXiv identifier (e.g. 2301.07041 or 1706.03762)
   */
  static async resolveArXiv(arxivId: string): Promise<Partial<ReferenceMetadata>> {
    return ArxivResolver.resolveArXiv(arxivId);
  }

  /**
   * Resolves book metadata from OpenLibrary API using an ISBN-10 or ISBN-13
   * @param isbn International Standard Book Number
   */
  static async resolveISBN(isbn: string): Promise<Partial<ReferenceMetadata>> {
    return ISBNResolver.resolveISBN(isbn);
  }

  /**
   * Resolves webpage, blog, video, or online article metadata via Dublin Core / OpenGraph tags
   * @param url Web URL
   */
  static async resolveURL(url: string): Promise<Partial<ReferenceMetadata>> {
    return URLResolver.resolveURL(url);
  }

  /**
   * Parses raw BibTeX string into structured ReferenceMetadata objects
   * @param bibtex Raw BibTeX input containing one or multiple @article/@book/@misc entries
   */
  static parseBibTeX(bibtex: string): Partial<ReferenceMetadata>[] {
    return BibTeXResolver.parseBibTeX(bibtex);
  }

  /**
   * Parses Research Information Systems (RIS) string into structured ReferenceMetadata objects
   * @param ris Raw RIS input
   */
  static parseRIS(ris: string): Partial<ReferenceMetadata>[] {
    return RISResolver.parseRIS(ris);
  }

  /**
   * Parses EndNote XML string into structured ReferenceMetadata objects
   * @param xml Raw EndNote XML input
   */
  static parseEndNoteXML(xml: string): Partial<ReferenceMetadata>[] {
    return EndNoteXMLResolver.parseEndNoteXML(xml);
  }

  /**
   * Automatically detects and parses library files (.bib, .ris, .xml) or text
   * @param content File content or raw snippet
   * @param filename Optional filename or extension
   */
  static parseLibrary(content: string, filename?: string): Partial<ReferenceMetadata>[] {
    return LibraryImportResolver.parseLibrary(content, filename);
  }
}
