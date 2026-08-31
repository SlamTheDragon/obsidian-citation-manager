import { requestUrl } from 'obsidian';
import { ReferenceMetadata, ReferenceType } from './types';
import { CitationEngine } from './citationEngine';

export class MetadataResolvers {
  /**
   * Automatically detects input type (DOI, ISBN, arXiv, URL, BibTeX) and resolves metadata
   */
  static async detectAndResolve(input: string): Promise<Partial<ReferenceMetadata>> {
    const trimmed = input.trim();

    // 1. BibTeX
    if (trimmed.startsWith('@') && trimmed.includes('{')) {
      return this.parseBibTeX(trimmed);
    }

    // 2. DOI
    const doiMatch = trimmed.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
    if (doiMatch) {
      return await this.resolveDOI(doiMatch[1]);
    }

    // 3. arXiv ID
    const arxivMatch = trimmed.match(/arxiv(?:\.org\/(?:abs|pdf)\/|:)?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
    if (arxivMatch) {
      return await this.resolveArXiv(arxivMatch[1]);
    }

    // 4. ISBN
    const isbnClean = trimmed.replace(/[- ]/g, "");
    if (/^(978|979)?\d{9}[\dX]$/i.test(isbnClean)) {
      return await this.resolveISBN(isbnClean);
    }

    // 5. URL (Webpage, YouTube, Blog)
    if (/^https?:\/\//i.test(trimmed)) {
      return await this.resolveURL(trimmed);
    }

    throw new Error("Could not detect identifier format. Please enter a valid DOI, arXiv ID, ISBN, URL, or BibTeX snippet.");
  }

  /**
   * Resolves DOI via Crossref, CSL-JSON Content Negotiation, and Semantic Scholar
   */
  static async resolveDOI(doi: string): Promise<Partial<ReferenceMetadata>> {
    const cleanDoi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();

    // Try Crossref API first
    try {
      const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
      const res = await requestUrl({
        url: crossrefUrl,
        headers: { "User-Agent": "ObsidianCitationManager/1.0 (mailto:academic-research@obsidian.md)" },
      });

      if (res.status === 200 && res.json && res.json.message) {
        const item = res.json.message;
        const authors = (item.author || []).map((a: any) => {
          if (a.family && a.given) return `${a.family}, ${a.given}`;
          if (a.family) return a.family;
          if (a.name) return a.name;
          return "Unknown";
        });

        let year: number | string = new Date().getFullYear();
        if (item.published && item.published["date-parts"] && item.published["date-parts"][0]) {
          year = item.published["date-parts"][0][0];
        } else if (item["published-print"] && item["published-print"]["date-parts"] && item["published-print"]["date-parts"][0]) {
          year = item["published-print"]["date-parts"][0][0];
        }

        const title = (item.title && item.title[0]) ? item.title[0].replace(/<\/?[^>]+(>|$)/g, "") : "Untitled";
        const publication = (item["container-title"] && item["container-title"][0]) ? item["container-title"][0] : "";
        const volume = item.volume || "";
        const issue = item.issue || "";
        const pages = item.page || "";
        const publisher = item.publisher || "";

        let refType: ReferenceType = "journal";
        if (item.type === "proceedings-article" || item.type === "conference-paper") {
          refType = "conference";
        } else if (item.type === "book" || item.type === "monograph") {
          refType = "book";
        } else if (item.type === "posted-content" || item.subtype === "preprint") {
          refType = "preprint";
        } else if (item.type === "report" || item.type === "standard") {
          refType = "report";
        }

        const citekey = CitationEngine.generateCitekey(authors, year, title);

        return CitationEngine.populateStyles({
          citekey,
          type: refType,
          title,
          authors: authors.length > 0 ? authors : ["Unknown Author"],
          year,
          publication,
          volume,
          issue,
          pages,
          publisher,
          doi: cleanDoi,
          url: `https://doi.org/${cleanDoi}`,
          abstract: item.abstract ? item.abstract.replace(/<\/?[^>]+(>|$)/g, "") : "",
          projects: [],
          dateAdded: new Date().toISOString(),
          dateModified: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("[CitationManager] Crossref API lookup failed, falling back to CSL content negotiation...", e);
    }

    // Fallback: DOI Content Negotiation
    try {
      const res = await requestUrl({
        url: `https://doi.org/${encodeURIComponent(cleanDoi)}`,
        headers: { Accept: "application/vnd.citationstyles.csl+json" },
      });

      if (res.status === 200 && res.json) {
        const csl = res.json;
        const authors = (csl.author || []).map((a: any) => {
          if (a.family && a.given) return `${a.family}, ${a.given}`;
          if (a.family) return a.family;
          if (a.literal) return a.literal;
          return "Unknown";
        });

        let year: number | string = new Date().getFullYear();
        if (csl.issued && csl.issued["date-parts"] && csl.issued["date-parts"][0]) {
          year = csl.issued["date-parts"][0][0];
        }

        const title = csl.title || "Untitled";
        const citekey = CitationEngine.generateCitekey(authors, year, title);

        let refType: ReferenceType = "journal";
        if (csl.type === "paper-conference") refType = "conference";
        else if (csl.type === "book") refType = "book";
        else if (csl.type === "article") refType = "preprint";

        return CitationEngine.populateStyles({
          citekey,
          type: refType,
          title,
          authors: authors.length > 0 ? authors : ["Unknown Author"],
          year,
          publication: csl["container-title"] || "",
          volume: csl.volume || "",
          issue: csl.issue || "",
          pages: csl.page || "",
          publisher: csl.publisher || "",
          doi: cleanDoi,
          url: csl.URL || `https://doi.org/${cleanDoi}`,
          abstract: csl.abstract || "",
          projects: [],
          dateAdded: new Date().toISOString(),
          dateModified: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("[CitationManager] CSL content negotiation failed...", e);
    }

    throw new Error(`Could not resolve metadata for DOI: ${cleanDoi}`);
  }

  /**
   * Resolves arXiv papers
   */
  static async resolveArXiv(arxivId: string): Promise<Partial<ReferenceMetadata>> {
    const cleanId = arxivId.replace(/^arxiv:/i, "").trim();
    try {
      const url = `https://api.semanticscholar.org/graph/v1/paper/ARXIV:${encodeURIComponent(cleanId)}?fields=title,authors,year,abstract,externalIds,venue,openAccessPdf`;
      const res = await requestUrl({ url });
      if (res.status === 200 && res.json) {
        const data = res.json;
        const authors = (data.authors || []).map((a: any) => a.name);
        const year = data.year || new Date().getFullYear();
        const title = data.title || "Untitled";
        const citekey = CitationEngine.generateCitekey(authors, year, title);

        return CitationEngine.populateStyles({
          citekey,
          type: "preprint",
          title,
          authors,
          year,
          publication: data.venue || "arXiv Preprint",
          doi: data.externalIds?.DOI || "",
          url: `https://arxiv.org/abs/${cleanId}`,
          abstract: data.abstract || "",
          projects: [],
          dateAdded: new Date().toISOString(),
          dateModified: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("[CitationManager] Semantic scholar arXiv lookup failed...", e);
    }

    // Direct fallback
    const citekey = `Arxiv${cleanId.replace(/[^a-zA-Z0-9]/g, "")}`;
    return CitationEngine.populateStyles({
      citekey,
      type: "preprint",
      title: `arXiv preprint: ${cleanId}`,
      authors: ["arXiv Author"],
      year: new Date().getFullYear(),
      publication: "arXiv",
      url: `https://arxiv.org/abs/${cleanId}`,
      projects: [],
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    });
  }

  /**
   * Resolves ISBN for Books
   */
  static async resolveISBN(isbn: string): Promise<Partial<ReferenceMetadata>> {
    const clean = isbn.replace(/[- ]/g, "");
    try {
      const res = await requestUrl({ url: `https://openlibrary.org/isbn/${clean}.json` });
      if (res.status === 200 && res.json) {
        const data = res.json;
        let authors: string[] = [];
        if (data.authors && data.authors.length > 0) {
          for (const authorRef of data.authors) {
            try {
              const aRes = await requestUrl({ url: `https://openlibrary.org${authorRef.key}.json` });
              if (aRes.status === 200 && aRes.json && aRes.json.name) {
                authors.push(aRes.json.name);
              }
            } catch {}
          }
        }

        const year = data.publish_date ? (data.publish_date.match(/\d{4}/)?.[0] || new Date().getFullYear()) : new Date().getFullYear();
        const title = data.title || "Untitled Book";
        const publisher = (data.publishers && data.publishers[0]) ? data.publishers[0] : "";
        const citekey = CitationEngine.generateCitekey(authors, year, title);

        return CitationEngine.populateStyles({
          citekey,
          type: "book",
          title,
          authors: authors.length > 0 ? authors : ["Unknown Author"],
          year,
          publisher,
          isbn: clean,
          url: `https://openlibrary.org/isbn/${clean}`,
          projects: [],
          dateAdded: new Date().toISOString(),
          dateModified: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("[CitationManager] OpenLibrary lookup failed...", e);
    }

    throw new Error(`Could not resolve metadata for ISBN: ${clean}`);
  }

  /**
   * Resolves Websites, YouTube Videos, and Blogs
   */
  static async resolveURL(url: string): Promise<Partial<ReferenceMetadata>> {
    // Check for YouTube
    if (/youtube\.com\/watch|youtu\.be\//i.test(url)) {
      try {
        const oembedRes = await requestUrl({ url: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json` });
        if (oembedRes.status === 200 && oembedRes.json) {
          const data = oembedRes.json;
          const author = data.author_name || "YouTube Creator";
          const title = data.title || "YouTube Video";
          const year = new Date().getFullYear();
          const citekey = CitationEngine.generateCitekey([author], year, title);

          return CitationEngine.populateStyles({
            citekey,
            type: "video",
            title,
            authors: [author],
            year,
            publication: "YouTube",
            url,
            projects: [],
            dateAdded: new Date().toISOString(),
            dateModified: new Date().toISOString(),
          });
        }
      } catch {}
    }

    // Generic HTML Fetch & OpenGraph Parsing
    try {
      const res = await requestUrl({ url });
      if (res.status === 200 && res.text) {
        const html = res.text;

        const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i)?.[1]
          || html.match(/<title>(.*?)<\/title>/i)?.[1]
          || "Web Document";

        const ogSite = html.match(/<meta\s+property=["']og:site_name["']\s+content=["'](.*?)["']/i)?.[1]
          || new URL(url).hostname.replace(/^www\./, "");

        const authorMatch = html.match(/<meta\s+name=["']author["']\s+content=["'](.*?)["']/i)?.[1]
          || html.match(/<meta\s+property=["']article:author["']\s+content=["'](.*?)["']/i)?.[1]
          || ogSite;

        const dateMatch = html.match(/<meta\s+property=["']article:published_time["']\s+content=["'](\d{4})/i)?.[1]
          || new Date().getFullYear();

        const cleanTitle = ogTitle.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
        const citekey = CitationEngine.generateCitekey([authorMatch], dateMatch, cleanTitle);

        const isBlog = /blog|medium\.com|dev\.to|substack/i.test(url);

        return CitationEngine.populateStyles({
          citekey,
          type: isBlog ? "blog" : "webpage",
          title: cleanTitle,
          authors: [authorMatch],
          year: dateMatch,
          publication: ogSite,
          url,
          projects: [],
          dateAdded: new Date().toISOString(),
          dateModified: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("[CitationManager] Generic URL scrape failed...", e);
    }

    // Fallback
    const domain = new URL(url).hostname.replace(/^www\./, "");
    const citekey = CitationEngine.generateCitekey([domain], new Date().getFullYear(), "Web");
    return CitationEngine.populateStyles({
      citekey,
      type: "webpage",
      title: url,
      authors: [domain],
      year: new Date().getFullYear(),
      publication: domain,
      url,
      projects: [],
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    });
  }

  /**
   * Parses Raw BibTeX String into ReferenceMetadata
   */
  static parseBibTeX(bibtex: string): Partial<ReferenceMetadata> {
    const typeMatch = bibtex.match(/@([a-zA-Z]+)\s*\{\s*([^,]+),/);
    if (!typeMatch) throw new Error("Invalid BibTeX format");

    const rawType = typeMatch[1].toLowerCase();
    const citekey = typeMatch[2].trim();

    const getField = (field: string): string => {
      const reg = new RegExp(`${field}\\s*=\\s*[{"](.*?)[}"]`, "i");
      const match = bibtex.match(reg);
      return match ? match[1].trim() : "";
    };

    const title = getField("title");
    const rawAuthors = getField("author");
    const authors = rawAuthors ? rawAuthors.split(/\s+and\s+/i).map(a => a.trim()) : ["Unknown Author"];
    const year = getField("year") || new Date().getFullYear();
    const publication = getField("journal") || getField("booktitle") || getField("howpublished") || "";
    const volume = getField("volume");
    const issue = getField("number") || getField("issue");
    const pages = getField("pages");
    const publisher = getField("publisher");
    const doi = getField("doi");
    const url = getField("url");
    const isbn = getField("isbn");

    let type: ReferenceType = "other";
    if (rawType === "article") type = "journal";
    else if (rawType === "inproceedings" || rawType === "conference") type = "conference";
    else if (rawType === "book" || rawType === "booklet") type = "book";
    else if (rawType === "misc") type = "webpage";
    else if (rawType === "techreport") type = "report";
    else if (rawType === "phdthesis" || rawType === "mastersthesis") type = "thesis";

    return CitationEngine.populateStyles({
      citekey,
      type,
      title: title || "Untitled",
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
      projects: [],
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    });
  }
}
