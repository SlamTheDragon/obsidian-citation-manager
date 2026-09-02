import { ReferenceMetadata } from './types';
import { DOIResolver } from './resolvers/doiResolver';
import { ArxivResolver } from './resolvers/arxivResolver';
import { ISBNResolver } from './resolvers/isbnResolver';
import { URLResolver } from './resolvers/urlResolver';
import { BibTeXResolver } from './resolvers/bibtexResolver';

export class MetadataResolvers {
  /**
   * Automatically detects input type (DOI, ISBN, arXiv, URL, BibTeX) and resolves metadata
   */
  static async detectAndResolve(input: string): Promise<Partial<ReferenceMetadata>> {
    const trimmed = input.trim();

    // 1. BibTeX
    if (trimmed.startsWith('@') && trimmed.includes('{')) {
      const parsed = this.parseBibTeX(trimmed);
      if (parsed.length > 0) return parsed[0];
      throw new Error('Invalid BibTeX format');
    }

    // 2. DOI
    const doiMatch = trimmed.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
    if (doiMatch) {
      return await this.resolveDOI(doiMatch[1]);
    }

    // 3. arXiv ID
    const arxivMatch = trimmed.match(/arxiv(?:\.org\/(?:abs|pdf)\/|:)?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
    if (arxivMatch) {
      return await this.resolveArXiv(arxivMatch[1]);
    }

    // 4. ISBN
    const isbnClean = trimmed.replace(/[- ]/g, '');
    if (/^(978|979)?\d{9}[\dX]$/i.test(isbnClean)) {
      return await this.resolveISBN(isbnClean);
    }

    // 5. URL (Webpage, YouTube, Blog)
    if (/^https?:\/\//i.test(trimmed)) {
      return await this.resolveURL(trimmed);
    }

    throw new Error('Could not detect identifier format. Please enter a valid DOI, arXiv ID, ISBN, URL, or BibTeX snippet.');
  }

  static async resolveDOI(doi: string): Promise<Partial<ReferenceMetadata>> {
    return DOIResolver.resolveDOI(doi);
  }

  static async resolveArXiv(arxivId: string): Promise<Partial<ReferenceMetadata>> {
    return ArxivResolver.resolveArXiv(arxivId);
  }

  static async resolveISBN(isbn: string): Promise<Partial<ReferenceMetadata>> {
    return ISBNResolver.resolveISBN(isbn);
  }

  static async resolveURL(url: string): Promise<Partial<ReferenceMetadata>> {
    return URLResolver.resolveURL(url);
  }

  static parseBibTeX(bibtex: string): Partial<ReferenceMetadata>[] {
    return BibTeXResolver.parseBibTeX(bibtex);
  }
}
