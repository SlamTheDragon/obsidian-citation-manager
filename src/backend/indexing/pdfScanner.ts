import { Logger } from '../logger';

export class PDFScanner {
  /**
   * Scans up to 2MB of a PDF ArrayBuffer to extract DOI, arXiv ID, or XMP metadata streams.
   */
  static extractDOIFromBuffer(buffer: ArrayBuffer): string | null {
    try {
      const sliceSize = Math.min(buffer.byteLength, 2 * 1024 * 1024);
      const uint8 = new Uint8Array(buffer, 0, sliceSize);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);

      // 1. XMP metadata XML tags
      const xmpDoiMatch = text.match(/<(?:prism:doi|dc:identifier|pdfx:doi|crossref:doi)[^>]*>([^<]+)<\//i);
      if (xmpDoiMatch) {
        const clean = xmpDoiMatch[1].replace(/^doi:\s*/i, '').trim();
        if (clean.startsWith('10.')) {
          Logger.debug('Extracted DOI from XMP stream: ' + clean);
          return clean;
        }
      }

      // 2. Standard DOI URL prefixes
      const urlDoiMatch = text.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/|\/DOI\s*\()(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
      if (urlDoiMatch) {
        const clean = urlDoiMatch[1].trim().replace(/[,;.)>\]]+$/, '');
        Logger.debug('Extracted DOI from URL prefix: ' + clean);
        return clean;
      }

      // 3. Raw DOI pattern
      const rawMatch = text.match(/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
      if (rawMatch) {
        const clean = rawMatch[1].trim().replace(/[,;.)>\]]+$/, '');
        if (clean.length > 7 && clean.includes('/')) {
          Logger.debug('Extracted DOI from PDF binary: ' + clean);
          return clean;
        }
      }

      // 4. arXiv ID fallback
      const arxivMatch = text.match(/arxiv\s*[:\/]\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i);
      if (arxivMatch) {
        return arxivMatch[1].trim();
      }
    } catch (e) {
      Logger.warn('Failed extracting DOI from PDF buffer:', e);
    }
    return null;
  }
}
