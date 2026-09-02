import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';

export class RISResolver {
  /**
   * Parses Research Information Systems (RIS) formatted data
   * @param ris Raw RIS string containing one or multiple records
   */
  static parseRIS(ris: string): Partial<ReferenceMetadata>[] {
    const results: Partial<ReferenceMetadata>[] = [];
    const lines = ris.split(/\r?\n/);

    let currentRecord: Record<string, string[]> = {};
    let isInsideRecord = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      if (!line) continue;

      // Match RIS Tag: 2 uppercase alphanumeric characters followed by hyphen and space (e.g. 'TY  - ' or 'TY - ')
      const tagMatch = line.match(/^([A-Z0-9]{2})\s*-\s*(.*)$/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const value = tagMatch[2].trim();

        if (tag === 'TY') {
          currentRecord = { TY: [value] };
          isInsideRecord = true;
          continue;
        }

        if (tag === 'ER') {
          if (isInsideRecord) {
            const parsed = this.convertRecordToMetadata(currentRecord);
            if (parsed) results.push(parsed);
          }
          currentRecord = {};
          isInsideRecord = false;
          continue;
        }

        if (isInsideRecord) {
          if (!currentRecord[tag]) {
            currentRecord[tag] = [];
          }
          currentRecord[tag].push(value);
        }
      } else if (isInsideRecord) {
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

    // If file ended without explicit ER tag
    if (isInsideRecord && Object.keys(currentRecord).length > 0) {
      const parsed = this.convertRecordToMetadata(currentRecord);
      if (parsed) results.push(parsed);
    }

    return results;
  }

  private static convertRecordToMetadata(record: Record<string, string[]>): Partial<ReferenceMetadata> | null {
    const ty = (record['TY']?.[0] || '').toUpperCase();
    if (!ty && Object.keys(record).length === 0) return null;

    let type: ReferenceType = 'journal';
    if (['JOUR', 'MGZN', 'NEWS', 'EJOUR'].includes(ty)) type = 'journal';
    else if (['BOOK', 'EBOOK', 'CHAP', 'SER'].includes(ty)) type = 'book';
    else if (['CONF', 'CPAPER', 'INPR', 'PROCEEDING'].includes(ty)) type = 'conference';
    else if (['THES', 'DISST'].includes(ty)) type = 'thesis';
    else if (['RPRT', 'REPORT', 'GOVDOC'].includes(ty)) type = 'report';
    else if (['ELEC', 'WEB', 'ICOMM', 'BLOG'].includes(ty)) type = 'webpage';
    else if (['UNPB', 'PREPRINT'].includes(ty)) type = 'preprint';
    else if (['VIDEO', 'MPCT', 'SOUND'].includes(ty)) type = 'video';
    else type = 'other';

    // Authors (AU, A1, A2)
    const authors: string[] = [];
    const rawAuthors = [
      ...(record['AU'] || []),
      ...(record['A1'] || []),
      ...(record['A2'] || [])
    ];
    for (const a of rawAuthors) {
      const cleanA = a.replace(/,\s*$/, '').trim();
      if (cleanA && !authors.includes(cleanA)) {
        authors.push(cleanA);
      }
    }

    // Title (TI, T1, CT, BT)
    const title = record['TI']?.[0] || record['T1']?.[0] || record['CT']?.[0] || record['BT']?.[0] || 'Untitled';

    // Year (PY, Y1, DA)
    let year = new Date().getFullYear();
    const rawYear = record['PY']?.[0] || record['Y1']?.[0] || record['DA']?.[0];
    if (rawYear) {
      const yearMatch = rawYear.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }
    }

    // Publication / Journal (JO, JF, JA, T2, BT)
    const publication = record['JO']?.[0] || record['JF']?.[0] || record['JA']?.[0] || record['T2']?.[0] || (type !== 'book' ? record['BT']?.[0] : '') || '';

    // Volume (VL)
    const volume = record['VL']?.[0] || '';

    // Issue (IS, M1)
    const issue = record['IS']?.[0] || record['M1']?.[0] || '';

    // Pages (SP - EP)
    let pages = '';
    const sp = record['SP']?.[0] || '';
    const ep = record['EP']?.[0] || '';
    if (sp && ep) {
      pages = `${sp}-${ep}`;
    } else if (sp) {
      pages = sp;
    }

    // Publisher (PB)
    const publisher = record['PB']?.[0] || '';

    // DOI (DO)
    let doi = record['DO']?.[0] || '';
    if (doi) {
      doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim();
    }

    // URL (UR, LK)
    const url = record['UR']?.[0] || record['LK']?.[0] || (doi ? `https://doi.org/${doi}` : '');

    // ISBN (SN)
    const isbn = record['SN']?.[0] || '';

    // Abstract (AB, N2)
    const abstract = record['AB']?.[0] || record['N2']?.[0] || '';

    // Citekey (ID or generated)
    let citekey = record['ID']?.[0] || '';
    if (!citekey || citekey.includes(' ')) {
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
