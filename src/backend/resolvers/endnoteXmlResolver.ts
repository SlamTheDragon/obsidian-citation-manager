import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';

export class EndNoteXMLResolver {
  /**
   * Parses EndNote XML formatted citation library data
   * @param xml Raw EndNote XML string
   */
  static parseEndNoteXML(xml: string): Partial<ReferenceMetadata>[] {
    const results: Partial<ReferenceMetadata>[] = [];
    
    // Match all <record>...</record> blocks
    const recordRegex = /<record>([\s\S]*?)<\/record>/gi;
    let match: RegExpExecArray | null;

    while ((match = recordRegex.exec(xml)) !== null) {
      const recordBlock = match[1];
      const parsed = this.parseSingleRecord(recordBlock);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }

  private static parseSingleRecord(block: string): Partial<ReferenceMetadata> | null {
    // 1. Reference Type
    const refTypeMatch = block.match(/<ref-type(?:\s+name="([^"]+)")?[^>]*>([\s\S]*?)<\/ref-type>/i);
    const refTypeName = (refTypeMatch ? (refTypeMatch[1] || this.stripTags(refTypeMatch[2])) : '').toLowerCase();

    let type: ReferenceType = 'journal';
    if (refTypeName.includes('journal') || refTypeName.includes('article')) type = 'journal';
    else if (refTypeName.includes('book') || refTypeName.includes('chapter')) type = 'book';
    else if (refTypeName.includes('conference') || refTypeName.includes('proceeding')) type = 'conference';
    else if (refTypeName.includes('thesis') || refTypeName.includes('dissertation')) type = 'thesis';
    else if (refTypeName.includes('report')) type = 'report';
    else if (refTypeName.includes('electronic') || refTypeName.includes('web') || refTypeName.includes('online')) type = 'webpage';
    else if (refTypeName.includes('audiovisual') || refTypeName.includes('film') || refTypeName.includes('video')) type = 'video';
    else if (refTypeName.includes('preprint')) type = 'preprint';
    else type = 'other';

    // 2. Authors
    const authors: string[] = [];
    const authorRegex = /<author[^>]*>([\s\S]*?)<\/author>/gi;
    let authMatch: RegExpExecArray | null;
    while ((authMatch = authorRegex.exec(block)) !== null) {
      const cleanAuthor = this.cleanText(authMatch[1]);
      if (cleanAuthor && !authors.includes(cleanAuthor)) {
        authors.push(cleanAuthor);
      }
    }

    // 3. Title
    const titleMatch = block.match(/<titles>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) ||
                       block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? this.cleanText(titleMatch[1]) : 'Untitled';

    // 4. Year
    let year = new Date().getFullYear();
    const yearMatch = block.match(/<dates>[\s\S]*?<year[^>]*>([\s\S]*?)<\/year>/i) ||
                      block.match(/<year[^>]*>([\s\S]*?)<\/year>/i);
    if (yearMatch) {
      const parsedYear = parseInt(this.cleanText(yearMatch[1]), 10);
      if (!isNaN(parsedYear) && parsedYear > 1000) {
        year = parsedYear;
      }
    }

    // 5. Publication / Secondary Title / Periodical
    const pubMatch = block.match(/<secondary-title[^>]*>([\s\S]*?)<\/secondary-title>/i) ||
                     block.match(/<periodical>[\s\S]*?<full-title[^>]*>([\s\S]*?)<\/full-title>/i);
    const publication = pubMatch ? this.cleanText(pubMatch[1]) : '';

    // 6. Volume & Issue / Number
    const volMatch = block.match(/<volume[^>]*>([\s\S]*?)<\/volume>/i);
    const volume = volMatch ? this.cleanText(volMatch[1]) : '';

    const numMatch = block.match(/<number[^>]*>([\s\S]*?)<\/number>/i) ||
                     block.match(/<issue[^>]*>([\s\S]*?)<\/issue>/i);
    const issue = numMatch ? this.cleanText(numMatch[1]) : '';

    // 7. Pages
    const pagesMatch = block.match(/<pages[^>]*>([\s\S]*?)<\/pages>/i);
    const pages = pagesMatch ? this.cleanText(pagesMatch[1]) : '';

    // 8. Publisher
    const publMatch = block.match(/<publisher[^>]*>([\s\S]*?)<\/publisher>/i);
    const publisher = publMatch ? this.cleanText(publMatch[1]) : '';

    // 9. DOI
    let doi = '';
    const doiMatch = block.match(/<electronic-resource-num[^>]*>([\s\S]*?)<\/electronic-resource-num>/i) ||
                     block.match(/<doi[^>]*>([\s\S]*?)<\/doi>/i);
    if (doiMatch) {
      doi = this.cleanText(doiMatch[1]).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim();
    }

    // 10. URL
    let url = '';
    const urlMatch = block.match(/<urls>[\s\S]*?<url[^>]*>([\s\S]*?)<\/url>/i) ||
                     block.match(/<url[^>]*>([\s\S]*?)<\/url>/i);
    if (urlMatch) {
      url = this.cleanText(urlMatch[1]);
    } else if (doi) {
      url = `https://doi.org/${doi}`;
    }

    // 11. Abstract
    const abstractMatch = block.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
    const abstract = abstractMatch ? this.cleanText(abstractMatch[1]) : '';

    // 12. ISBN
    const isbnMatch = block.match(/<isbn[^>]*>([\s\S]*?)<\/isbn>/i);
    const isbn = isbnMatch ? this.cleanText(isbnMatch[1]) : '';

    // 13. Citekey
    const recNumMatch = block.match(/<rec-number[^>]*>([\s\S]*?)<\/rec-number>/i);
    const citekey = CitationEngine.generateCitekey(authors, year, title);

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

  private static stripTags(xmlFragment: string): string {
    return xmlFragment.replace(/<[^>]+>/g, '').trim();
  }

  private static cleanText(xmlFragment: string): string {
    return this.stripTags(xmlFragment)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
