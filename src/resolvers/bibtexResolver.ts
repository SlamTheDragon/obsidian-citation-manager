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
      const fieldRegex = /([a-zA-Z_]+)\s*=\s*[{|"]([\s\S]*?)[}|"]/g;
      let fMatch: RegExpExecArray | null;
      while ((fMatch = fieldRegex.exec(body)) !== null) {
        fields[fMatch[1].toLowerCase()] = fMatch[2].replace(/\s+/g, ' ').trim();
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
