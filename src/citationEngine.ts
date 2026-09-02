import { ReferenceMetadata, CitationStyle, InBodyFormat } from './types';
import { CSLFormatters } from './csl/cslFormatters';
import { CSLSorter } from './csl/cslSorter';
import { BibTeXGenerator } from './csl/bibtexGenerator';

export class CitationEngine {
  static generateCitekey(authors: string[], year: number | string, title?: string): string {
    return CSLFormatters.generateCitekey(authors, year, title);
  }

  static formatAuthorsAPA(authors: string[]): string {
    return CSLFormatters.formatAuthorsAPA(authors);
  }

  static formatAuthorsIEEE(authors: string[]): string {
    return CSLFormatters.formatAuthorsIEEE(authors);
  }

  static formatAPA7(ref: Partial<ReferenceMetadata>): string {
    return CSLFormatters.formatAPA7(ref);
  }

  static formatIEEE(ref: Partial<ReferenceMetadata>, index?: number): string {
    return CSLFormatters.formatIEEE(ref, index);
  }

  static formatHarvard(ref: Partial<ReferenceMetadata>): string {
    return CSLFormatters.formatHarvard(ref);
  }

  static formatChicago(ref: Partial<ReferenceMetadata>): string {
    return CSLFormatters.formatChicago(ref);
  }

  static formatVancouver(ref: Partial<ReferenceMetadata>, index?: number): string {
    return CSLFormatters.formatVancouver(ref, index);
  }

  static formatFootnoteDefinition(ref: ReferenceMetadata, style: CitationStyle = 'apa7', index?: number): string {
    return CSLFormatters.formatFootnoteDefinition(ref, style, index);
  }

  static formatBibliographyEntry(ref: ReferenceMetadata, style: CitationStyle = 'apa7', index?: number): string {
    return CSLFormatters.formatBibliographyEntry(ref, style, index);
  }

  static formatInBody(ref: ReferenceMetadata, format: InBodyFormat = 'parenthetical', style: CitationStyle = 'apa7', index?: number): string {
    return CSLFormatters.formatInBody(ref, format, style, index);
  }

  static formatMultiInBody(refs: ReferenceMetadata[], format: InBodyFormat = 'parenthetical', style: CitationStyle = 'apa7'): string {
    return CSLFormatters.formatMultiInBody(refs, format, style);
  }

  static sortReferences(refs: ReferenceMetadata[], style: CitationStyle = 'apa7'): ReferenceMetadata[] {
    return CSLSorter.sortReferences(refs, style);
  }

  static generateBibTeX(ref: Partial<ReferenceMetadata>): string {
    return BibTeXGenerator.generateBibTeX(ref as ReferenceMetadata);
  }

  static populateStyles(ref: Partial<ReferenceMetadata>): Partial<ReferenceMetadata> {
    return {
      ...ref,
      apa: this.formatAPA7(ref),
      ieee: this.formatIEEE(ref, 1),
      harvard: this.formatHarvard(ref),
      chicago: this.formatChicago(ref),
      vancouver: this.formatVancouver(ref, 1),
      bibtex: ref.bibtex || this.generateBibTeX(ref),
    };
  }

  static generateBibliography(refs: ReferenceMetadata[], style: CitationStyle = 'apa7', title: string = 'Bibliography'): string {
    if (!refs || refs.length === 0) {
      return '## ' + title + '\n\n*No citations found in this project.*';
    }
    const sortedRefs = this.sortReferences(refs, style);
    const lines: string[] = ['## ' + title + '\n'];
    sortedRefs.forEach((ref, index) => {
      let text = '';
      switch (style) {
        case 'apa7': text = this.formatAPA7(ref); break;
        case 'ieee': text = this.formatIEEE(ref, index + 1); break;
        case 'harvard': text = this.formatHarvard(ref); break;
        case 'chicago': text = this.formatChicago(ref); break;
        case 'vancouver': text = this.formatVancouver(ref, index + 1); break;
        default: text = this.formatAPA7(ref);
      }
      lines.push(text);
    });
    return lines.join('\n\n');
  }

  static detectAndOverloadAtCursor(
    line: string,
    cursorCh: number,
    newRefs: ReferenceMetadata[],
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    targetFormat: InBodyFormat = 'parenthetical',
    isFootnoteMode: boolean = false,
    startIndex: number = 1
  ): { isOverloaded: boolean; replaceStartCh: number; replaceEndCh: number; replacementText: string; allRefsInGroup: ReferenceMetadata[] } {
    return this.computeOverloadedCitation(line, cursorCh, newRefs, targetFormat, style, isFootnoteMode, allReferences, startIndex);
  }

  static computeOverloadedCitation(
    line: string,
    cursorCh: number,
    newRefs: ReferenceMetadata[],
    targetFormat: InBodyFormat,
    style: CitationStyle,
    isFootnoteMode: boolean,
    allReferences: Map<string, ReferenceMetadata>,
    startIndex: number = 1
  ): { isOverloaded: boolean; replaceStartCh: number; replaceEndCh: number; replacementText: string; allRefsInGroup: ReferenceMetadata[] } {
    let match: RegExpExecArray | null;

    // 1. Pandoc Citekey Group: [@Smith2020] or [@Smith2020; @Jones2021]
    if (!isFootnoteMode && targetFormat === 'citekey') {
      const bracketRegex = /\[([^\]]*@[\p{L}\p{N}_:\.-]+[^\]]*)\]/gu;
      while ((match = bracketRegex.exec(line)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (cursorCh >= start && cursorCh <= end) {
          const groupContent = match[1];
          const citekeyRegex = /@([\p{L}\p{N}_:\.-]+)/gu;
          let subMatch: RegExpExecArray | null;
          const existingRefs: ReferenceMetadata[] = [];
          while ((subMatch = citekeyRegex.exec(groupContent)) !== null) {
            const k = subMatch[1];
            const r = allReferences.get(k);
            if (r) existingRefs.push(r);
            else existingRefs.push({ citekey: k, title: k, authors: ['Unknown'], year: new Date().getFullYear(), type: 'journal', projects: [] });
          }
          const mergedRefs = [...existingRefs];
          for (const nr of newRefs) {
            if (!mergedRefs.some(r => r.citekey === nr.citekey)) mergedRefs.push(nr);
          }
          const replacementText = this.formatMultiInBody(mergedRefs, 'citekey', style, startIndex);
          return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: mergedRefs };
        }
      }
    }

    // 2. Parenthetical Author-Date Group
    if (!isFootnoteMode && (style === 'apa7' || style === 'harvard' || style === 'chicago')) {
      const parenGroupRegex = /\(([^)]*(?:19\d{2}|20\d{2})[^)]*)\)/gu;
      while ((match = parenGroupRegex.exec(line)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (cursorCh >= start && cursorCh <= end) {
          const entries = match[1].split(';').map(s => s.trim()).filter(Boolean);
          const existingRefs: ReferenceMetadata[] = [];
          for (const entry of entries) {
            const yearMatch = entry.match(/\b(19\d{2}|20\d{2})\b/);
            if (yearMatch) {
              const year = yearMatch[1];
              const authorPart = entry.slice(0, entry.indexOf(year)).replace(/[,:\(\)]/g, '').trim().toLowerCase();
              const parts = authorPart.split(/[\s,&]+/).filter(Boolean).map(p => p.replace(/[^a-z0-9]/g, ''));
              for (const r of allReferences.values()) {
                if (r.year && String(r.year) === year && r.authors && r.authors.length > 0) {
                  const firstAuthor = (r.authors[0].includes(',') ? r.authors[0].split(',')[0] : r.authors[0].split(' ').pop() || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (parts.includes(firstAuthor) && !existingRefs.some(ex => ex.citekey === r.citekey)) {
                    existingRefs.push(r);
                    break;
                  }
                }
              }
            }
          }
          const mergedRefs = [...existingRefs];
          for (const nr of newRefs) {
            if (!mergedRefs.some(r => r.citekey === nr.citekey)) mergedRefs.push(nr);
          }
          const replacementText = this.formatMultiInBody(mergedRefs, targetFormat, style, startIndex);
          return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: mergedRefs };
        }
      }
    }

    // 3. IEEE Numeric Bracket Group
    if (!isFootnoteMode && style === 'ieee') {
      const ieeeBracketRegex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
      while ((match = ieeeBracketRegex.exec(line)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (cursorCh >= start && cursorCh <= end) {
          const existingIndices = match[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
          const newIndices = [...existingIndices];
          for (let i = 0; i < newRefs.length; i++) {
            const nextIdx = Math.max(...newIndices, 0) + 1;
            newIndices.push(nextIdx);
          }
          const replacementText = '[' + newIndices.join(', ') + ']';
          return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: newRefs };
        }
      }
    }

    // 4. Vancouver Numeric Paren Group
    if (!isFootnoteMode && style === 'vancouver') {
      const vancParenRegex = /\((\d+(?:\s*,\s*\d+)*)\)/g;
      while ((match = vancParenRegex.exec(line)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (cursorCh >= start && cursorCh <= end) {
          const existingIndices = match[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
          const newIndices = [...existingIndices];
          for (let i = 0; i < newRefs.length; i++) {
            const nextIdx = Math.max(...newIndices, 0) + 1;
            newIndices.push(nextIdx);
          }
          const replacementText = '(' + newIndices.join(', ') + ')';
          return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: newRefs };
        }
      }
    }

    // 5. Footnote Call
    if (isFootnoteMode || targetFormat === 'footnote') {
      const fnCallRegex = /\[\^([\p{L}\p{N}_:\.-]+)\](?!:)/gu;
      while ((match = fnCallRegex.exec(line)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (cursorCh >= start && cursorCh <= end) {
          const newFootnotes = newRefs.map(r => '[^' + r.citekey + ']').join('');
          return { isOverloaded: true, replaceStartCh: end, replaceEndCh: end, replacementText: newFootnotes, allRefsInGroup: newRefs };
        }
      }
    }

    // Default
    const defaultText = this.formatMultiInBody(newRefs, targetFormat, style, startIndex);
    return { isOverloaded: false, replaceStartCh: cursorCh, replaceEndCh: cursorCh, replacementText: defaultText, allRefsInGroup: newRefs };
  }
}
