import { requestUrl } from 'obsidian';
import { ReferenceMetadata } from '../types';
import { CitationEngine } from '../citationEngine';

export class ArxivResolver {
  static async resolveArXiv(arxivId: string): Promise<Partial<ReferenceMetadata>> {
    const cleanId = arxivId.replace(/^arxiv:/i, '').trim();
    const apiUrl = 'https://export.arxiv.org/api/query?id_list=' + encodeURIComponent(cleanId);

    const res = await requestUrl({ url: apiUrl });
    if (res.status !== 200 || !res.text) {
      throw new Error('arXiv API request failed');
    }

    const xml = res.text;
    const titleMatch = xml.match(/<title>([\s\S]*?)<\/title>/g);
    let title = 'Untitled';
    if (titleMatch && titleMatch.length > 1) {
      title = titleMatch[1].replace(/<\/?title>/g, '').replace(/\s+/g, ' ').trim();
    }

    const authorMatches = xml.match(/<author>\s*<name>([^<]+)<\/name>/g);
    const authors: string[] = [];
    if (authorMatches) {
      authorMatches.forEach(a => {
        const name = a.replace(/<author>\s*<name>/, '').replace(/<\/name>/, '').trim();
        authors.push(name);
      });
    }

    const publishedMatch = xml.match(/<published>(\d{4})/);
    const year = publishedMatch ? parseInt(publishedMatch[1]) : new Date().getFullYear();

    const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/);
    const abstract = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';

    const doiMatch = xml.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/i);
    const doi = doiMatch ? doiMatch[1].trim() : '';

    return {
      citekey: CitationEngine.generateCitekey(authors, year, title),
      title,
      authors: authors.length > 0 ? authors : ['Unknown Author'],
      year,
      publication: 'arXiv preprint arXiv:' + cleanId,
      doi,
      url: 'https://arxiv.org/abs/' + cleanId,
      abstract,
      type: 'preprint'
    };
  }
}
