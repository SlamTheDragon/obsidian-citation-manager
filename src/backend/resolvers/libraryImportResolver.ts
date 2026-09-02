import { ReferenceMetadata } from '../types';
import { BibTeXResolver } from './bibtexResolver';
import { RISResolver } from './risResolver';
import { EndNoteXMLResolver } from './endnoteXmlResolver';
import { EndNoteTaggedResolver } from './endnoteTaggedResolver';
import { PlainCitationResolver } from './plainCitationResolver';

export class LibraryImportResolver {
  /**
   * Automatically detects library file format (.bib, .ris, .xml, .enw, plain ref) or sniffs content, then parses into ReferenceMetadata records
   * @param content Raw file or pasted text content
   * @param filename Optional filename or extension to assist detection
   */
  static parseLibrary(content: string, filename: string = ''): Partial<ReferenceMetadata>[] {
    const trimmed = content.trim();
    if (!trimmed) return [];

    const lowerFilename = filename.toLowerCase();

    // 1. Extension-based detection
    if (lowerFilename.endsWith('.bib') || lowerFilename.endsWith('.bibtex')) {
      return BibTeXResolver.parseBibTeX(trimmed);
    }
    if (lowerFilename.endsWith('.ris')) {
      return RISResolver.parseRIS(trimmed);
    }
    if (lowerFilename.endsWith('.enw')) {
      return EndNoteTaggedResolver.parseEndNoteTagged(trimmed);
    }
    if (lowerFilename.endsWith('.xml')) {
      return EndNoteXMLResolver.parseEndNoteXML(trimmed);
    }

    // 2. Content sniffing
    // A. BibTeX (@article{..., @inproceedings{...)
    if (/@\w+\s*\{\s*[^,\s]+/i.test(trimmed)) {
      const bibtexResults = BibTeXResolver.parseBibTeX(trimmed);
      if (bibtexResults.length > 0) return bibtexResults;
    }

    // B. EndNote Tagged / Refer (%0 Conference Paper, %T ..., %A ...)
    if (/^%0\s+/m.test(trimmed) || (/^%[ATD]\s+/m.test(trimmed) && /^%[ARU]\s+/m.test(trimmed))) {
      const endnoteTaggedResults = EndNoteTaggedResolver.parseEndNoteTagged(trimmed);
      if (endnoteTaggedResults.length > 0) return endnoteTaggedResults;
    }

    // C. RIS (TY  - JOUR, AU  - ...)
    if (/^[A-Z0-9]{2}\s*-\s*/m.test(trimmed) || /^TY\s*-\s*/m.test(trimmed)) {
      const risResults = RISResolver.parseRIS(trimmed);
      if (risResults.length > 0) return risResults;
    }

    // D. EndNote XML (<records><record>...)
    if (/<record>[\s\S]*?<\/record>/i.test(trimmed) || /<xml[\s\S]*?<records>/i.test(trimmed)) {
      const xmlResults = EndNoteXMLResolver.parseEndNoteXML(trimmed);
      if (xmlResults.length > 0) return xmlResults;
    }

    // E. Plain Formatted Citation Strings (ACM Ref, APA, IEEE, etc.)
    const plainParsed = PlainCitationResolver.parseCitationString(trimmed);
    if (plainParsed && (plainParsed.doi || plainParsed.authors?.length || plainParsed.year)) {
      return [plainParsed];
    }

    // Fallback: try BibTeX, EndNote Tagged, RIS, XML in order
    try {
      const bRes = BibTeXResolver.parseBibTeX(trimmed);
      if (bRes.length > 0) return bRes;
    } catch {}

    try {
      const enwRes = EndNoteTaggedResolver.parseEndNoteTagged(trimmed);
      if (enwRes.length > 0) return enwRes;
    } catch {}

    try {
      const rRes = RISResolver.parseRIS(trimmed);
      if (rRes.length > 0) return rRes;
    } catch {}

    try {
      const xRes = EndNoteXMLResolver.parseEndNoteXML(trimmed);
      if (xRes.length > 0) return xRes;
    } catch {}

    return [];
  }
}

