import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';

export class EndNoteTaggedResolver {
  /**
   * Parses EndNote Tagged / Refer (.enw) formatted data
   * @param text Raw EndNote tagged string containing one or multiple records starting with %0
   */
  static parseEndNoteTagged(text: string): Partial<ReferenceMetadata>[] {
    const results: Partial<ReferenceMetadata>[] = [];
    const lines = text.split(/\r?\n/);

    let currentRecord: Record<string, string[]> = {};
    let isInside = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      if (!line) continue;

      // Match %Tag followed by space (e.g. '%0 Conference Paper' or '%A Zhang, Li')
      const match = line.match(/^%([0-9A-Za-z@!])\s+(.*)$/);
      if (match) {
        const tag = match[1];
        const value = match[2].trim();

        if (tag === '0') {
          // If previous record exists, flush it
          if (isInside && Object.keys(currentRecord).length > 0) {
            const parsed = this.convertRecordToMetadata(currentRecord);
            if (parsed) results.push(parsed);
          }
          currentRecord = { '0': [value] };
          isInside = true;
          continue;
        }

        if (isInside) {
          if (!currentRecord[tag]) currentRecord[tag] = [];
          currentRecord[tag].push(value);
        }
      } else if (isInside) {
        // Line continuation without tag
        const keys = Object.keys(currentRecord);
        if (keys.length > 0) {
          const lastKey = keys[keys.length - 1];
          const lastIdx = currentRecord[lastKey].length - 1;
          if (lastIdx >= 0) {
            currentRecord[lastKey][lastIdx] += ' ' + line.trim();
          }
        }
      }
    }

    if (isInside && Object.keys(currentRecord).length > 0) {
      const parsed = this.convertRecordToMetadata(currentRecord);
      if (parsed) results.push(parsed);
    }

    return results;
  }

  private static convertRecordToMetadata(record: Record<string, string[]>): Partial<ReferenceMetadata> | null {
    const rawType = (record['0']?.[0] || '').toLowerCase();
    
    let type: ReferenceType = 'journal';
    if (rawType.includes('journal') || rawType.includes('article')) type = 'journal';
    else if (rawType.includes('conference') || rawType.includes('proceeding')) type = 'conference';
    else if (rawType.includes('book') || rawType.includes('chapter')) type = 'book';
    else if (rawType.includes('thesis') || rawType.includes('dissertation')) type = 'thesis';
    else if (rawType.includes('report')) type = 'report';
    else if (rawType.includes('web') || rawType.includes('electronic') || rawType.includes('online')) type = 'webpage';
    else if (rawType.includes('audio') || rawType.includes('video') || rawType.includes('film')) type = 'video';
    else if (rawType.includes('preprint')) type = 'preprint';
    else type = 'other';

    // Authors (%A)
    const authors: string[] = [];
    for (const a of record['A'] || []) {
      const cleanA = a.replace(/,\s*$/, '').trim();
      if (cleanA && !authors.includes(cleanA)) {
        authors.push(cleanA);
      }
    }

    // Title (%T)
    const title = record['T']?.[0] || 'Untitled';

    // Year (%D)
    let year = new Date().getFullYear();
    const rawYear = record['D']?.[0] || record['8']?.[0];
    if (rawYear) {
      const yearMatch = rawYear.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }
    }

    // Publication (%B: Secondary title / %J: Journal / %S: Series)
    const publication = record['B']?.[0] || record['J']?.[0] || record['S']?.[0] || '';

    // Volume (%V)
    const volume = record['V']?.[0] || '';

    // Issue (%N)
    const issue = record['N']?.[0] || '';

    // Pages (%P)
    const pages = record['P']?.[0] || '';

    // Publisher (%I)
    const publisher = record['I']?.[0] || '';

    // DOI (%R)
    let doi = record['R']?.[0] || '';
    if (doi) {
      doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
    }

    // URL (%U)
    const url = record['U']?.[0] || (doi ? `https://doi.org/${doi}` : '');

    // Abstract (%X)
    const abstract = record['X']?.[0] || '';

    // ISBN (%@)
    const isbn = record['@']?.[0] || '';

    // Citekey (%F or generated)
    let citekey = record['F']?.[0] || '';
    if (!citekey || citekey.includes('/') || citekey.includes(' ')) {
      citekey = CitationEngine.generateCitekey(authors, year, title);
    }

    return {
      citekey,
      title,
      authors,
      year,
      publication,
      volume,
      issue,
      pages,
      publisher,
      doi,
      url,
      isbn,
      abstract,
      type,
    };
  }
}
