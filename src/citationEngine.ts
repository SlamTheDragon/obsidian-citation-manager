import { ReferenceMetadata, CitationStyle, InBodyFormat } from './types';

export class CitationEngine {
  /**
   * Generates a clean, deterministic citekey based on first author and year (e.g. Smith2024)
   */
  static generateCitekey(authors: string[], year: number | string, title?: string): string {
    let authorPart = "";
    const validAuthors = (authors || []).map(a => a ? a.trim() : "").filter(a => a.length > 0 && !/^unknown/i.test(a));
    if (validAuthors.length > 0) {
      const first = validAuthors[0];
      if (first.includes(",")) {
        authorPart = first.split(",")[0].trim();
      } else {
        const parts = first.split(" ");
        authorPart = parts[parts.length - 1].trim();
      }
    } else if (title) {
      const words = title.replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
      if (words.length > 0) {
        authorPart = words[0];
      } else {
        authorPart = "Ref";
      }
    } else {
      authorPart = "Unknown";
    }

    // Clean special characters
    authorPart = authorPart.replace(/[^a-zA-Z0-9]/g, "");
    if (!authorPart) authorPart = "Ref";
    authorPart = authorPart.charAt(0).toUpperCase() + authorPart.slice(1);

    const yearStr = year ? String(year).replace(/[^0-9]/g, "").slice(-4) : new Date().getFullYear().toString();
    return `${authorPart}${yearStr || "nd"}`;
  }

  /**
   * Helper to format given names into initials, supporting hyphenated names (e.g. Jean-Paul -> J.-P.)
   */
  private static formatInitials(givenNameStr: string): string {
    return givenNameStr
      .trim()
      .split(/\s+/)
      .map(part => {
        if (part.includes("-")) {
          return part.split("-").map(sub => sub.charAt(0) ? `${sub.charAt(0)}.` : "").join("-");
        }
        return part.charAt(0) ? `${part.charAt(0)}.` : "";
      })
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Formats author names for APA style (e.g., Smith, J. D., & Jones, A. B.)
   */
  static formatAuthorsAPA(authors: string[]): string {
    if (!authors || authors.length === 0) return "Unknown Author";
    
    const formatted = authors.map(a => {
      const clean = a.trim();
      if (clean.includes(",")) {
        const parts = clean.split(",");
        const last = parts[0].trim();
        const firstInitials = this.formatInitials(parts.slice(1).join(" "));
        return firstInitials ? `${last}, ${firstInitials}` : last;
      } else {
        const parts = clean.split(/\s+/);
        if (parts.length === 1) return parts[0];
        const lastToken = parts[parts.length - 1].replace(/\./g, "");
        if (parts.length > 2 && /^(jr|sr|ii|iii|iv|v)$/i.test(lastToken)) {
          const last = `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
          const initials = this.formatInitials(parts.slice(0, -2).join(" "));
          return `${last}, ${initials}`;
        }
        const last = parts[parts.length - 1];
        const initials = this.formatInitials(parts.slice(0, -1).join(" "));
        return `${last}, ${initials}`;
      }
    });

    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
    if (formatted.length <= 20) {
      return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
    }
    return `${formatted.slice(0, 19).join(", ")}, ... ${formatted[formatted.length - 1]}`;
  }

  /**
   * Formats author names for IEEE style (e.g., J. D. Smith and A. B. Jones)
   */
  static formatAuthorsIEEE(authors: string[]): string {
    if (!authors || authors.length === 0) return "Unknown";
    const formatted = authors.map(a => {
      const clean = a.trim();
      if (clean.includes(",")) {
        const parts = clean.split(",");
        const last = parts[0].trim();
        const initials = this.formatInitials(parts.slice(1).join(" "));
        return initials ? `${initials} ${last}` : last;
      } else {
        const parts = clean.split(/\s+/);
        if (parts.length === 1) return parts[0];
        const lastToken = parts[parts.length - 1].replace(/\./g, "");
        if (parts.length > 2 && /^(jr|sr|ii|iii|iv|v)$/i.test(lastToken)) {
          const last = `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
          const initials = this.formatInitials(parts.slice(0, -2).join(" "));
          return `${initials} ${last}`;
        }
        const last = parts[parts.length - 1];
        const initials = this.formatInitials(parts.slice(0, -1).join(" "));
        return `${initials} ${last}`;
      }
    });

    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
    if (formatted.length <= 6) return `${formatted.slice(0, -1).join(", ")}, and ${formatted[formatted.length - 1]}`;
    return `${formatted[0]} et al.`;
  }

  /**
   * Generates APA 7th Edition Full Reference
   */
  static formatAPA7(ref: Partial<ReferenceMetadata>): string {
    const authors = this.formatAuthorsAPA(ref.authors || []);
    const year = ref.year ? `(${ref.year})` : "(n.d.)";
    const title = ref.title ? (ref.title.endsWith(".") ? ref.title : `${ref.title}.`) : "Untitled.";

    let source = "";
    if (ref.type === "journal" || ref.type === "conference") {
      const pub = ref.publication ? `*${ref.publication}*` : "";
      const vol = ref.volume ? `, *${ref.volume}*` : "";
      const issue = ref.issue ? `(${ref.issue})` : "";
      const pages = ref.pages ? `, ${ref.pages}` : "";
      source = `${pub}${vol}${issue}${pages}.`;
    } else if (ref.type === "book") {
      source = ref.publisher ? `${ref.publisher}.` : "";
    } else if (ref.type === "webpage" || ref.type === "blog" || ref.type === "video") {
      source = ref.publication ? `*${ref.publication}*.` : "";
    } else if (ref.type === "preprint") {
      source = ref.publication ? `*${ref.publication}* (Preprint).` : "Preprint.";
    }

    let link = "";
    if (ref.doi) {
      const cleanDoi = ref.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
      link = `https://doi.org/${cleanDoi}`;
    } else if (ref.url) {
      link = ref.url;
    }

    return [authors, year, title, source, link].filter(p => p && p.trim().length > 0).join(" ").replace(/\s\s+/g, " ").trim();
  }

  /**
   * Generates IEEE Reference Format
   */
  static formatIEEE(ref: Partial<ReferenceMetadata>, index: number = 1): string {
    const authors = this.formatAuthorsIEEE(ref.authors || []);
    const title = ref.title ? `"${ref.title.replace(/"/g, "'")},"` : "\"Untitled,\"";
    const year = ref.year ? `${ref.year}` : "n.d.";

    let source = "";
    if (ref.type === "journal" || ref.type === "conference") {
      const pub = ref.publication ? `*${ref.publication}*` : "*Proc.*";
      const vol = ref.volume ? `, vol. ${ref.volume}` : "";
      const issue = ref.issue ? `, no. ${ref.issue}` : "";
      const pages = ref.pages ? `, pp. ${ref.pages}` : "";
      source = `${pub}${vol}${issue}${pages}, ${year}`;
    } else if (ref.type === "book") {
      const pub = ref.publisher ? `${ref.publisher}, ` : "";
      source = `${pub}${year}`;
    } else {
      source = `${ref.publication ? `*${ref.publication}*, ` : ""}${year}`;
    }

    let link = "";
    if (ref.doi) {
      const cleanDoi = ref.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
      link = `, doi: ${cleanDoi}`;
    } else if (ref.url) {
      link = `, [Online]. Available: ${ref.url}`;
    }

    return `[${index}] ${authors}, ${title} ${source}${link}.`.replace(/\s\s+/g, " ").trim();
  }

  /**
   * Generates Harvard Reference Format
   */
  static formatHarvard(ref: Partial<ReferenceMetadata>): string {
    const authors = this.formatAuthorsAPA(ref.authors || []).replace(/, &/g, " and");
    const year = ref.year ? `(${ref.year})` : "(no date)";
    const title = ref.title ? `'${ref.title}'` : "'Untitled'";

    let details = "";
    if (ref.publication) {
      details = `*${ref.publication}*`;
      if (ref.volume) details += `, ${ref.volume}`;
      if (ref.issue) details += `(${ref.issue})`;
      if (ref.pages) details += `, pp. ${ref.pages}`;
    } else if (ref.publisher) {
      details = ref.publisher;
    }

    let link = "";
    if (ref.doi) {
      link = `doi: ${ref.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}`;
    } else if (ref.url) {
      link = `Available at: ${ref.url}`;
    }

    return `${authors} ${year} ${title}, ${details}. ${link}`.replace(/\s\s+/g, " ").trim();
  }

  /**
   * Generates Chicago (Author-Date) Format
   */
  static formatChicago(ref: Partial<ReferenceMetadata>): string {
    const authors = (ref.authors && ref.authors.length > 0) ? ref.authors[0] : "Unknown";
    const year = ref.year ? `${ref.year}.` : "n.d.";
    const title = ref.title ? `"${ref.title}."` : "\"Untitled.\"";

    let pub = "";
    if (ref.publication) {
      pub = `*${ref.publication}*`;
      if (ref.volume) pub += ` ${ref.volume}`;
      if (ref.issue) pub += ` (${ref.issue})`;
      if (ref.pages) pub += `: ${ref.pages}`;
      pub += ".";
    }

    let link = "";
    if (ref.doi) link = `https://doi.org/${ref.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}`;
    else if (ref.url) link = ref.url;

    return `${authors} ${year} ${title} ${pub} ${link}`.replace(/\s\s+/g, " ").trim();
  }

  /**
   * Generates Vancouver (Numeric) Format
   */
  static formatVancouver(ref: Partial<ReferenceMetadata>, index: number = 1): string {
    const authors = (ref.authors || []).map(a => a.replace(/,/g, "").replace(/\./g, "")).slice(0, 6).join(", ") || "Unknown";
    const title = ref.title ? `${ref.title}.` : "Untitled.";
    const pub = ref.publication || "Journal";
    const year = ref.year || "Year";
    const vol = ref.volume || "";
    const issue = ref.issue ? `(${ref.issue})` : "";
    const pages = ref.pages ? `:${ref.pages}` : "";

    return `${index}. ${authors}. ${title} ${pub}. ${year};${vol}${issue}${pages}.`.replace(/\s\s+/g, " ").trim();
  }

  /**
   * Generates In-Body Citation string
   */
  static formatInBody(
    ref: ReferenceMetadata, 
    format: InBodyFormat | 'footnote', 
    style: CitationStyle = 'apa7', 
    index: number = 1
  ): string {
    if (format === 'footnote') return `[^${ref.citekey}]`;
    if (format === 'citekey') return `[@${ref.citekey}]`;

    const authors = ref.authors || [];
    let authorText = "Unknown";
    if (authors.length === 1) {
      authorText = this.getLastName(authors[0]);
    } else if (authors.length === 2) {
      authorText = `${this.getLastName(authors[0])} & ${this.getLastName(authors[1])}`;
    } else if (authors.length > 2) {
      authorText = `${this.getLastName(authors[0])} et al.`;
    }

    if (style === 'ieee') {
      if (format === 'narrative') return `${authorText} [${index}]`;
      return `[${index}]`;
    }
    if (style === 'vancouver') {
      if (format === 'narrative') return `${authorText} (${index})`;
      return `(${index})`;
    }

    const year = ref.year || "n.d.";

    if (format === 'narrative') {
      return `${authorText} (${year})`;
    }

    if (style === 'harvard' || style === 'chicago') {
      return `(${authorText} ${year})`;
    }
    return `(${authorText}, ${year})`;
  }

  /**
   * Formats multiple references into a single grouped in-body citation
   * (e.g. [@Smith2020; @Jones2021] or (Jones, 2021; Smith, 2020))
   */
  static formatMultiInBody(
    refs: ReferenceMetadata[], 
    format: InBodyFormat | 'footnote', 
    style: CitationStyle = 'apa7',
    startIndex: number | number[] = 1
  ): string {
    if (!refs || refs.length === 0) return "";
    if (refs.length === 1) return this.formatInBody(refs[0], format, style, Array.isArray(startIndex) ? startIndex[0] : startIndex);

    if (format === 'footnote') {
      return refs.map(r => `[^${r.citekey}]`).join('');
    }
    if (format === 'citekey') {
      return `[@${refs.map(r => r.citekey).join('; @')}]`;
    }

    if (format === 'narrative') {
      const parts = refs.map((r, i) => this.formatInBody(r, 'narrative', style, Array.isArray(startIndex) ? startIndex[i] : Number(startIndex) + i));
      if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
      return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
    }

    if (style === 'ieee') {
      const indices = Array.isArray(startIndex) ? startIndex : refs.map((_, i) => Number(startIndex) + i);
      return `[${indices.join(', ')}]`;
    }
    if (style === 'vancouver') {
      const indices = Array.isArray(startIndex) ? startIndex : refs.map((_, i) => Number(startIndex) + i);
      return `(${indices.join(', ')})`;
    }

    const sorted = [...refs].sort((a, b) => {
      const authorA = a.authors?.[0] || a.citekey;
      const authorB = b.authors?.[0] || b.citekey;
      return authorA.localeCompare(authorB);
    });
    const parts = sorted.map(r => {
      const single = this.formatInBody(r, 'parenthetical', style);
      return single.replace(/^\(|\)$/g, '');
    });
    return `(${parts.join('; ')})`;
  }

  /**
   * Detects whether the editor cursor is located inside an existing in-body citation
   * and intelligently overloads/merges the new reference(s) into the existing group.
   */
  static detectAndOverloadAtCursor(
    line: string,
    cursorCh: number,
    newRefs: ReferenceMetadata[],
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    format: InBodyFormat | 'footnote' = 'parenthetical',
    isFootnoteMode: boolean = false,
    startIndex: number = 1
  ): {
    isOverloaded: boolean;
    replaceStartCh: number;
    replaceEndCh: number;
    replacementText: string;
    allRefsInGroup: ReferenceMetadata[];
  } {
    const targetFormat: InBodyFormat | 'footnote' = isFootnoteMode ? 'footnote' : format;

    // 1. Pandoc Citekey Group: [... @key ...]
    const citeGroupRegex = /\[([^\]]*@[\p{L}\p{N}_:\.-]+[^\]]*)\]/gu;
    let match: RegExpExecArray | null;
    while ((match = citeGroupRegex.exec(line)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (cursorCh >= start && cursorCh <= end) {
        const keys = Array.from(match[1].matchAll(/@([\p{L}\p{N}_:\.-]+)/gu)).map(m => m[1]);
        const existingRefs: ReferenceMetadata[] = [];
        for (const k of keys) {
          if (allReferences.has(k)) existingRefs.push(allReferences.get(k)!);
        }
        const mergedRefs = [...existingRefs];
        for (const nr of newRefs) {
          if (!mergedRefs.some(r => r.citekey === nr.citekey)) mergedRefs.push(nr);
        }
        const replacementText = this.formatMultiInBody(mergedRefs, targetFormat, style, startIndex);
        return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: mergedRefs };
      }
    }

    // 2. Parenthetical Author-Date Group: (Smith, 2020) or (Smith, 2020; Jones & Brown, 2021)
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
                  const firstAuthor = this.getLastName(r.authors[0]).toLowerCase().replace(/[^a-z0-9]/g, '');
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

    // 3. IEEE Numeric Bracket Group: [1] or [1, 2]
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
          const replacementText = `[${newIndices.join(', ')}]`;
          return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: newRefs };
        }
      }
    }

    // 4. Vancouver Numeric Paren Group: (1) or (1, 2)
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
          const replacementText = `(${newIndices.join(', ')})`;
          return { isOverloaded: true, replaceStartCh: start, replaceEndCh: end, replacementText, allRefsInGroup: newRefs };
        }
      }
    }

    // 5. Footnote Call: [^key]
    if (isFootnoteMode || format === 'footnote') {
      const fnCallRegex = /\[\^([\p{L}\p{N}_:\.-]+)\](?!:)/gu;
      while ((match = fnCallRegex.exec(line)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (cursorCh >= start && cursorCh <= end) {
          const newFootnotes = newRefs.map(r => `[^${r.citekey}]`).join('');
          return { isOverloaded: true, replaceStartCh: end, replaceEndCh: end, replacementText: newFootnotes, allRefsInGroup: newRefs };
        }
      }
    }

    // Default: Normal prose insertion
    const defaultText = this.formatMultiInBody(newRefs, targetFormat, style, startIndex);
    return { isOverloaded: false, replaceStartCh: cursorCh, replaceEndCh: cursorCh, replacementText: defaultText, allRefsInGroup: newRefs };
  }

  /**
   * Formats a single bibliography entry according to the selected academic standard
   */
  static formatBibliographyEntry(ref: ReferenceMetadata, style: CitationStyle = 'apa7', index: number = 1): string {
    switch (style) {
      case 'apa7':
        return this.formatAPA7(ref);
      case 'ieee':
        return this.formatIEEE(ref, index);
      case 'harvard':
        return this.formatHarvard(ref);
      case 'chicago':
        return this.formatChicago(ref);
      case 'vancouver':
        return this.formatVancouver(ref, index);
      default:
        return this.formatAPA7(ref);
    }
  }

  /**
   * Formats footnote definition text for bottom of markdown file
   */
  static formatFootnoteDefinition(ref: ReferenceMetadata, style: CitationStyle = 'apa7', index: number = 1): string {
    const citationString = this.formatBibliographyEntry(ref, style, index);
    return `[^${ref.citekey}]: ${citationString}`;
  }

  /**
   * Generates BibTeX entry
   */
  static generateBibTeX(ref: Partial<ReferenceMetadata>): string {
    const typeMap: Record<string, string> = {
      journal: "article",
      conference: "inproceedings",
      book: "book",
      webpage: "misc",
      blog: "misc",
      video: "misc",
      preprint: "article",
      report: "techreport",
      standard: "manual",
      thesis: "phdthesis",
      other: "misc"
    };

    const bibType = typeMap[ref.type || "other"] || "misc";
    const citekey = ref.citekey || "unknown";
    const authors = (ref.authors || []).join(" and ");

    const fields: string[] = [];
    if (authors) fields.push(`  author = {${authors}}`);
    if (ref.title) fields.push(`  title = {${ref.title}}`);
    if (ref.year) fields.push(`  year = {${ref.year}}`);
    if (ref.month) fields.push(`  month = {${ref.month}}`);
    if (ref.publication) {
      if (bibType === "article") fields.push(`  journal = {${ref.publication}}`);
      else if (bibType === "inproceedings") fields.push(`  booktitle = {${ref.publication}}`);
      else fields.push(`  howpublished = {${ref.publication}}`);
    }
    if (ref.volume) fields.push(`  volume = {${ref.volume}}`);
    if (ref.issue) fields.push(`  number = {${ref.issue}}`);
    if (ref.pages) fields.push(`  pages = {${ref.pages}}`);
    if (ref.publisher) fields.push(`  publisher = {${ref.publisher}}`);
    if (ref.doi) fields.push(`  doi = {${ref.doi}}`);
    if (ref.url) fields.push(`  url = {${ref.url}}`);
    if (ref.isbn) fields.push(`  isbn = {${ref.isbn}}`);
    if (ref.issn) fields.push(`  issn = {${ref.issn}}`);

    return `@${bibType}{${citekey},\n${fields.join(",\n")}\n}`;
  }

  /**
   * Populates all citation style strings on a metadata object
   */
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

  /**
   * Generates formatted Bibliography markdown
   */
  static generateBibliography(refs: ReferenceMetadata[], style: CitationStyle = 'apa7', title: string = "Bibliography"): string {
    if (!refs || refs.length === 0) {
      return `## ${title}\n\n*No citations found in this project.*`;
    }

    const lines: string[] = [`## ${title}\n`];
    refs.forEach((ref, index) => {
      let text = "";
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

    return lines.join("\n\n");
  }

  private static getLastName(authorStr: string): string {
    const clean = authorStr.trim();
    if (clean.includes(",")) return clean.split(",")[0].trim();
    const parts = clean.split(/\s+/);
    if (parts.length > 1) {
      const lastToken = parts[parts.length - 1].replace(/\./g, "");
      if (/^(jr|sr|ii|iii|iv|v)$/i.test(lastToken)) {
        return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
      }
    }
    return parts[parts.length - 1];
  }
}
