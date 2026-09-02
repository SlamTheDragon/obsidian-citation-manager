import { requestUrl } from 'obsidian';
import { ReferenceMetadata } from '../types';
import { CitationEngine } from '../citationEngine';

export class ISBNResolver {
  static async resolveISBN(isbn: string): Promise<Partial<ReferenceMetadata>> {
    const cleanIsbn = isbn.replace(/[- ]/g, '').trim();
    const url = 'https://openlibrary.org/api/books?bibkeys=ISBN:' + cleanIsbn + '&format=json&jscmd=data';

    const res = await requestUrl({ url });
    if (res.status === 200 && res.json && res.json['ISBN:' + cleanIsbn]) {
      const data = res.json['ISBN:' + cleanIsbn];
      const title = data.title || 'Untitled';
      const authors = (data.authors || []).map((a: any) => a.name);
      let year = new Date().getFullYear();
      if (data.publish_date) {
        const yMatch = data.publish_date.match(/\b(19\d{2}|20\d{2})\b/);
        if (yMatch) year = parseInt(yMatch[1]);
      }
      const publisher = (data.publishers && data.publishers[0]) ? data.publishers[0].name : '';
      const pages = data.number_of_pages ? String(data.number_of_pages) : '';

      return {
        citekey: CitationEngine.generateCitekey(authors, year, title),
        title,
        authors: authors.length > 0 ? authors : ['Unknown Author'],
        year,
        publisher,
        pages,
        isbn: cleanIsbn,
        url: data.url || ('https://openlibrary.org/isbn/' + cleanIsbn),
        type: 'book'
      };
    }
    throw new Error('ISBN not found on OpenLibrary');
  }
}
