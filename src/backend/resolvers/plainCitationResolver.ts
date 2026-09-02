import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';

export class PlainCitationResolver {
  /**
   * Parses formatted reference strings (ACM, APA, IEEE, Harvard, Chicago) into structured ReferenceMetadata
   * @param text Formatted citation text string
   */
  static parseCitationString(text: string): Partial<ReferenceMetadata> | null {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 15) return null;

    // 1. Extract DOI
    let doi = '';
    const doiMatch = trimmed.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i) ||
                     trimmed.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i);
    if (doiMatch) {
      doi = doiMatch[1].replace(/[,.;]+$/, '').trim();
    }

    // 2. Extract URL
    let url = '';
    const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      url = urlMatch[1].replace(/[,.;]+$/, '').trim();
    } else if (doi) {
      url = `https://doi.org/${doi}`;
    }

    // 3. Extract Year
    let year = new Date().getFullYear();
    const yearMatch = trimmed.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    }

    // 4. Extract Authors & Title
    // Pattern A: "Author1, Author2, and Author3. Year. Title. In Publication..."
    // Pattern B: "Author1, Author2 (Year). Title. Publication..."
    let authors: string[] = [];
    let title = '';
    let publication = '';

    // Split before year
    const yearIndex = yearMatch ? trimmed.indexOf(yearMatch[0]) : -1;
    if (yearIndex > 0) {
      const authorPart = trimmed.slice(0, yearIndex).replace(/[.(,\s]+$/, '').trim();
      authors = authorPart
        .split(/(?:,\s+and\s+|;\s*|,\s*|\s+and\s+)/i)
        .map(a => a.trim())
        .filter(a => a.length > 0 && !/^\d+$/.test(a));

      const afterYear = trimmed.slice(yearIndex + 4).replace(/^[.)\s]+/, '').trim();
      
      // Match Title and Publication
      const inMatch = afterYear.match(/^(.*?)\.\s+(?:In\s+)?(.*?)(?:\.\s+|$)/i);
      if (inMatch) {
        title = inMatch[1].trim();
        publication = inMatch[2].trim();
      } else {
        const segments = afterYear.split(/\.\s+/);
        if (segments.length >= 1) title = segments[0].trim();
        if (segments.length >= 2) publication = segments[1].trim();
      }
    } else {
      title = trimmed.slice(0, 100);
    }

    if (!title) title = 'Untitled Reference';

    let type: ReferenceType = 'journal';
    if (/proceedings|posters|conference|symposium|siggraph|chi|acm/i.test(publication || trimmed)) {
      type = 'conference';
    } else if (/book|edition|press|publisher/i.test(publication || trimmed)) {
      type = 'book';
    }

    const citekey = CitationEngine.generateCitekey(authors, year, title);

    return {
      citekey,
      title,
      authors,
      year,
      publication,
      doi,
      url,
      type,
    };
  }
}
