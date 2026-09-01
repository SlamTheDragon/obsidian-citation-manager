import { ReferenceMetadata, CitationStyle, InBodyFormat } from './types';

export class CitationEngine {
  /**
   * Generates a clean, deterministic citekey based on first author and year (e.g. Smith2024)
   */
  static generateCitekey(authors: string[], year: number | string, title?: string): string {
    let authorPart = "Unknown";
    if (authors && authors.length > 0) {
      const first = authors[0].trim();
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
      }
    }

    // Clean special characters
    authorPart = authorPart.replace(/[^a-zA-Z0-9]/g, "");
    authorPart = authorPart.charAt(0).toUpperCase() + authorPart.slice(1);

    const yearStr = year ? String(year).replace(/[^0-9]/g, "").slice(-4) : new Date().getFullYear().toString();
    return `${authorPart}${yearStr || "nd"}`;
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
        const firstInitials = parts.slice(1).join(" ").trim().split(/\s+/).map(n => n.charAt(0) ? `${n.charAt(0)}.` : "").join(" ");
        return firstInitials ? `${last}, ${firstInitials}` : last;
      } else {
        const parts = clean.split(/\s+/);
        if (parts.length === 1) return parts[0];
        const last = parts[parts.length - 1];
        const initials = parts.slice(0, -1).map(n => `${n.charAt(0)}.`).join(" ");
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
        const initials = parts.slice(1).join(" ").trim().split(/\s+/).map(n => `${n.charAt(0)}.`).join(" ");
        return initials ? `${initials} ${last}` : last;
      } else {
        const parts = clean.split(/\s+/);
        if (parts.length === 1) return parts[0];
        const last = parts[parts.length - 1];
        const initials = parts.slice(0, -1).map(n => `${n.charAt(0)}.`).join(" ");
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

    if (style === 'ieee') return `[${index}]`;
    if (style === 'vancouver') return `(${index})`;

    const authors = ref.authors || [];
    let authorText = "Unknown";
    if (authors.length === 1) {
      authorText = this.getLastName(authors[0]);
    } else if (authors.length === 2) {
      authorText = `${this.getLastName(authors[0])} & ${this.getLastName(authors[1])}`;
    } else if (authors.length > 2) {
      authorText = `${this.getLastName(authors[0])} et al.`;
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
    startIndex: number = 1
  ): string {
    if (!refs || refs.length === 0) return "";
    if (refs.length === 1) return this.formatInBody(refs[0], format, style, startIndex);

    if (format === 'footnote') {
      return refs.map(r => `[^${r.citekey}]`).join('');
    }
    if (format === 'citekey') {
      return refs.map(r => `[@${r.citekey}]`).join(' ');
    }

    if (style === 'ieee') {
      const indices = refs.map((_, i) => startIndex + i);
      return `[${indices.join(', ')}]`;
    }
    if (style === 'vancouver') {
      const indices = refs.map((_, i) => startIndex + i);
      return `(${indices.join(', ')})`;
    }

    if (format === 'narrative') {
      const parts = refs.map(r => this.formatInBody(r, 'narrative', style));
      if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
      return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
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
   * Formats footnote definition text for bottom of markdown file
   */
  static formatFootnoteDefinition(ref: ReferenceMetadata, style: CitationStyle = 'apa7', index: number = 1): string {
    let citationString = "";
    switch (style) {
      case 'apa7':
        citationString = this.formatAPA7(ref);
        break;
      case 'ieee':
        citationString = this.formatIEEE(ref, index);
        break;
      case 'harvard':
        citationString = this.formatHarvard(ref);
        break;
      case 'chicago':
        citationString = this.formatChicago(ref);
        break;
      case 'vancouver':
        citationString = this.formatVancouver(ref, index);
        break;
      default:
        citationString = this.formatAPA7(ref);
    }
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
      bibtex: this.generateBibTeX(ref),
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
    return parts[parts.length - 1];
  }
}
