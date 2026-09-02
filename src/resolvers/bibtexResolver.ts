import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';

export class BibTeXResolver {
  static parseBibTeX(bibtex: string): Partial<ReferenceMetadata>[] {
    const results: Partial<ReferenceMetadata>[] = [];
    const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n@|\n*$)/g;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(bibtex)) !== null) {
      const rawType = match[1].toLowerCase();
      const citekey = match[2].trim();
      const body = match[3];

      let type: ReferenceType = 'journal';
      if (['article'].includes(rawType)) type = 'journal';
      else if (['inproceedings', 'conference'].includes(rawType)) type = 'conference';
      else if (['book', 'inbook', 'incollection'].includes(rawType)) type = 'book';
      else if (['misc', 'online', 'webpage'].includes(rawType)) type = 'webpage';
      else if (['phdthesis', 'mastersthesis'].includes(rawType)) type = 'thesis';
      else if (['techreport'].includes(rawType)) type = 'report';
      else if (['unpublished'].includes(rawType)) type = 'preprint';
      else type = 'other';

      const fields: Record<string, string> = {};
      const fieldStartRegex = /([a-zA-Z_]+)\s*=\s*/g;
      let fMatch: RegExpExecArray | null;
      while ((fMatch = fieldStartRegex.exec(body)) !== null) {
        const fieldName = fMatch[1].toLowerCase();
        let pos = fieldStartRegex.lastIndex;
        if (pos >= body.length) break;

        let val = '';
        const startChar = body[pos];
        if (startChar === '{') {
          let depth = 1;
          pos++;
          const startVal = pos;
          while (pos < body.length && depth > 0) {
            if (body[pos] === '{') depth++;
            else if (body[pos] === '}') depth--;
            pos++;
          }
          val = body.slice(startVal, depth === 0 ? pos - 1 : pos);
          fieldStartRegex.lastIndex = pos;
        } else if (startChar === '"') {
          pos++;
          const startVal = pos;
          while (pos < body.length && body[pos] !== '"') {
            if (body[pos] === '\\') pos++;
            pos++;
          }
          val = body.slice(startVal, pos);
          fieldStartRegex.lastIndex = pos + 1;
        } else {
          const tokenMatch = body.slice(pos).match(/^([^\s,}\n]+)/);
          if (tokenMatch) {
            val = tokenMatch[1];
            fieldStartRegex.lastIndex = pos + val.length;
          }
        }

        const cleanedVal = val
          .replace(/\\['"`^~=.]\{?([a-zA-Z])\}?/g, '$1')
          .replace(/\{([^{}]+)\}/g, '$1')
          .replace(/\s+/g, ' ')
          .trim();
        fields[fieldName] = cleanedVal;
      }

      let authors: string[] = [];
      if (fields['author']) {
        authors = fields['author'].split(/\s+and\s+/i).map(a => a.trim());
      }

      const title = fields['title'] || 'Untitled';
      const year = fields['year'] ? parseInt(fields['year']) : new Date().getFullYear();
      const publication = fields['journal'] || fields['booktitle'] || fields['school'] || fields['institution'] || '';
      const volume = fields['volume'] || '';
      const issue = fields['number'] || '';
      const pages = fields['pages'] || '';
      const publisher = fields['publisher'] || '';
      const doi = fields['doi'] || '';
      const url = fields['url'] || '';
      const abstract = fields['abstract'] || '';

      results.push({
        citekey: citekey || CitationEngine.generateCitekey(authors, year, title),
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
        abstract,
        type,
        rawBibTeX: match[0],
      });
    }
    return results;
  }
}
