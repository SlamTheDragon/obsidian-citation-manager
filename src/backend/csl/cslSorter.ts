import { ReferenceMetadata, CitationStyle } from '../types';

export class CSLSorter {
  /**
   * Multi-tier chronological and alphabetical sorting of references
   */
  static sortReferences(refs: ReferenceMetadata[], style: CitationStyle = 'apa7'): ReferenceMetadata[] {
    return [...refs].sort((a, b) => {
      // 1. First Author Last Name (case-insensitive)
      const aFirst = (a.authors && a.authors.length > 0) 
        ? (a.authors[0].includes(',') ? a.authors[0].split(',')[0].trim().toLowerCase() : a.authors[0].split(' ').pop()!.trim().toLowerCase()) 
        : (a.title || '').toLowerCase();
      const bFirst = (b.authors && b.authors.length > 0) 
        ? (b.authors[0].includes(',') ? b.authors[0].split(',')[0].trim().toLowerCase() : b.authors[0].split(' ').pop()!.trim().toLowerCase()) 
        : (b.title || '').toLowerCase();

      const authorComp = aFirst.localeCompare(bFirst);
      if (authorComp !== 0) return authorComp;

      // 2. Co-authors total count
      const aCount = a.authors?.length || 0;
      const bCount = b.authors?.length || 0;
      if (aCount !== bCount) return aCount - bCount;

      // 3. Publication Year (Chronological ascending)
      const aYear = typeof a.year === 'number' ? a.year : (parseInt(String(a.year)) || 0);
      const bYear = typeof b.year === 'number' ? b.year : (parseInt(String(b.year)) || 0);
      if (aYear !== bYear) return aYear - bYear;

      // 4. Title Alphabetical fallback
      return (a.title || '').localeCompare(b.title || '');
    });
  }
}
