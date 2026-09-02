import { requestUrl } from 'obsidian';
import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';
import { ArxivResolver } from './arxivResolver';

export class DOIResolver {
  static async resolveDOI(doi: string): Promise<Partial<ReferenceMetadata>> {
    const cleanDoi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();

    let title = '';
    let authors: string[] = [];
    let year: number | string = new Date().getFullYear();
    let publication = '';
    let volume = '';
    let issue = '';
    let pages = '';
    let publisher = '';
    let abstract = '';
    let refType: ReferenceType = 'journal';

    // 1. Try Crossref API
    try {
      const crossrefUrl = 'https://api.crossref.org/works/' + encodeURIComponent(cleanDoi);
      const res = await requestUrl({
        url: crossrefUrl,
        headers: { 'User-Agent': 'ObsidianCitationManager/1.0 (mailto:academic-research@obsidian.md)' },
      });

      if (res.status === 200 && res.json && res.json.message) {
        const item = res.json.message;
        authors = (item.author || []).map((a: any) => {
          if (a.family && a.given) return a.family + ', ' + a.given;
          if (a.family) return a.family;
          if (a.name) return a.name;
          return 'Unknown';
        });

        if (item.published && item.published['date-parts'] && item.published['date-parts'][0]) {
          year = item.published['date-parts'][0][0];
        } else if (item['published-print'] && item['published-print']['date-parts'] && item['published-print']['date-parts'][0]) {
          year = item['published-print']['date-parts'][0][0];
        }

        title = (item.title && item.title[0]) ? item.title[0].replace(/<\/?[^>]+(>|$)/g, '') : 'Untitled';
        publication = (item['container-title'] && item['container-title'][0]) ? item['container-title'][0] : '';
        volume = item.volume || '';
        issue = item.issue || '';
        pages = item.page || '';
        publisher = item.publisher || '';
        if (item.abstract) {
          abstract = item.abstract.replace(/<\/?[^>]+(>|$)/g, '').trim();
        }

        if (item.type === 'proceedings-article' || item.type === 'conference-paper') {
          refType = 'conference';
        } else if (item.type === 'book' || item.type === 'monograph') {
          refType = 'book';
        } else if (item.type === 'posted-content' || item.subtype === 'preprint') {
          refType = 'preprint';
        } else if (item.type === 'report' || item.type === 'standard') {
          refType = 'report';
        }
      }
    } catch (e) {
      console.warn('[CitationManager] Crossref lookup failed, continuing to fallbacks...', e);
    }

    // 2. Fallback / Augment via Semantic Scholar (Especially for Abstract)
    if (!title || !abstract) {
      try {
        const s2Url = 'https://api.semanticscholar.org/graph/v1/paper/DOI:' + encodeURIComponent(cleanDoi) + '?fields=title,authors,year,abstract,venue,publicationVenue,volume,issue,pages';
        const s2Res = await requestUrl({ url: s2Url });
        if (s2Res.status === 200 && s2Res.json) {
          const s2Data = s2Res.json;
          if (!title && s2Data.title) title = s2Data.title;
          if (authors.length === 0 && s2Data.authors) {
            authors = s2Data.authors.map((a: any) => a.name);
          }
          if (s2Data.year && !year) year = s2Data.year;
          if (!publication && s2Data.venue) publication = s2Data.venue;
          if (!abstract && s2Data.abstract) abstract = s2Data.abstract.trim();
        }
      } catch {}
    }

    // 3. Fallback / Augment via OpenAlex (For Abstract Inverted Index)
    if (!abstract) {
      try {
        const oaUrl = 'https://api.openalex.org/works/doi:' + encodeURIComponent(cleanDoi);
        const oaRes = await requestUrl({ url: oaUrl });
        if (oaRes.status === 200 && oaRes.json) {
          const oaData = oaRes.json;
          if (!title && oaData.title) title = oaData.title;
          if (oaData.abstract_inverted_index) {
            const index = oaData.abstract_inverted_index;
            const words: [string, number][] = [];
            for (const [w, pos] of Object.entries(index)) {
              for (const p of pos as number[]) words.push([w, p]);
            }
            words.sort((a, b) => a[1] - b[1]);
            abstract = words.map(w => w[0]).join(' ').trim();
          }
        }
      } catch {}
    }

    // 4. Fallback / Augment for arXiv DOIs
    const arxivDoiMatch = cleanDoi.match(/10\.48550\/arxiv\.([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
    if (arxivDoiMatch) {
      refType = 'preprint';
      if (!publication) publication = 'arXiv Preprint';
      const arxivId = arxivDoiMatch[1];
      if (!title || !abstract) {
        try {
          const arxivData = await ArxivResolver.resolveArXiv(arxivId);
          if (!title && arxivData.title) title = arxivData.title;
          if (authors.length === 0 && arxivData.authors && arxivData.authors.length > 0) authors = arxivData.authors;
          if (!abstract && arxivData.abstract) abstract = arxivData.abstract;
          if (!year && arxivData.year) year = arxivData.year;
        } catch {}
      }
    }

    // 5. Fallback via CSL-JSON
    if (!title) {
      try {
        const res = await requestUrl({
          url: 'https://doi.org/' + encodeURIComponent(cleanDoi),
          headers: { Accept: 'application/vnd.citationstyles.csl+json' },
        });

        if (res.status === 200 && res.json) {
          const csl = res.json;
          if (authors.length === 0) {
            authors = (csl.author || []).map((a: any) => {
              if (a.family && a.given) return a.family + ', ' + a.given;
              if (a.family) return a.family;
              if (a.literal) return a.literal;
              return 'Unknown';
            });
          }
          if (csl.issued && csl.issued['date-parts'] && csl.issued['date-parts'][0]) {
            year = csl.issued['date-parts'][0][0];
          }
          title = csl.title || 'Untitled';
          if (!publication) publication = csl['container-title'] || '';
          if (!volume) volume = csl.volume || '';
          if (!issue) issue = csl.issue || '';
          if (!pages) pages = csl.page || '';
          if (!publisher) publisher = csl.publisher || '';
          if (!abstract && csl.abstract) abstract = csl.abstract;
        }
      } catch {}
    }

    if (!title) {
      throw new Error('Could not resolve metadata for DOI: ' + cleanDoi);
    }

    const citekey = CitationEngine.generateCitekey(authors, year, title);

    return {
      citekey,
      type: refType,
      title,
      authors: authors.length > 0 ? authors : ['Unknown Author'],
      year,
      publication,
      volume,
      issue,
      pages,
      publisher,
      doi: cleanDoi,
      url: 'https://doi.org/' + cleanDoi,
      abstract,
      projects: [],
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    };
  }
}
