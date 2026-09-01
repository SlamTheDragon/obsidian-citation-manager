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
      const parsed = this.parseBibTeX(trimmed);
      if (parsed.length > 0) return parsed[0];
      throw new Error("Invalid BibTeX format");
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
   * Resolves DOI via Crossref, Semantic Scholar, OpenAlex, and CSL-JSON
   */
  static async resolveDOI(doi: string): Promise<Partial<ReferenceMetadata>> {
    const cleanDoi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();

    let title = "";
    let authors: string[] = [];
    let year: number | string = new Date().getFullYear();
    let publication = "";
    let volume = "";
    let issue = "";
    let pages = "";
    let publisher = "";
    let abstract = "";
    let refType: ReferenceType = "journal";

    // 1. Try Crossref API
    try {
      const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
      const res = await requestUrl({
        url: crossrefUrl,
        headers: { "User-Agent": "ObsidianCitationManager/1.0 (mailto:academic-research@obsidian.md)" },
      });

      if (res.status === 200 && res.json && res.json.message) {
        const item = res.json.message;
        authors = (item.author || []).map((a: any) => {
          if (a.family && a.given) return `${a.family}, ${a.given}`;
          if (a.family) return a.family;
          if (a.name) return a.name;
          return "Unknown";
        });

        if (item.published && item.published["date-parts"] && item.published["date-parts"][0]) {
          year = item.published["date-parts"][0][0];
        } else if (item["published-print"] && item["published-print"]["date-parts"] && item["published-print"]["date-parts"][0]) {
          year = item["published-print"]["date-parts"][0][0];
        }

        title = (item.title && item.title[0]) ? item.title[0].replace(/<\/?[^>]+(>|$)/g, "") : "Untitled";
        publication = (item["container-title"] && item["container-title"][0]) ? item["container-title"][0] : "";
        volume = item.volume || "";
        issue = item.issue || "";
        pages = item.page || "";
        publisher = item.publisher || "";
        if (item.abstract) {
          abstract = item.abstract.replace(/<\/?[^>]+(>|$)/g, "").trim();
        }

        if (item.type === "proceedings-article" || item.type === "conference-paper") {
          refType = "conference";
        } else if (item.type === "book" || item.type === "monograph") {
          refType = "book";
        } else if (item.type === "posted-content" || item.subtype === "preprint") {
          refType = "preprint";
        } else if (item.type === "report" || item.type === "standard") {
          refType = "report";
        }
      }
    } catch (e) {
      console.warn("[CitationManager] Crossref lookup failed, continuing to fallbacks...", e);
    }

    // 2. Fallback / Augment via Semantic Scholar (Especially for Abstract)
    if (!title || !abstract) {
      try {
        const s2Url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(cleanDoi)}?fields=title,authors,year,abstract,venue,publicationVenue,volume,issue,pages`;
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
        const oaUrl = `https://api.openalex.org/works/doi:${encodeURIComponent(cleanDoi)}`;
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
            abstract = words.map(w => w[0]).join(" ").trim();
          }
        }
      } catch {}
    }

    // 4. Fallback / Augment for arXiv DOIs (e.g. 10.48550/arXiv.2603.25223)
    const arxivDoiMatch = cleanDoi.match(/10\.48550\/arxiv\.([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
    if (arxivDoiMatch) {
      refType = "preprint";
      if (!publication) publication = "arXiv Preprint";
      const arxivId = arxivDoiMatch[1];
      if (!title || !abstract) {
        try {
          const arxivData = await this.resolveArXiv(arxivId);
          if (!title && arxivData.title) title = arxivData.title;
          if (authors.length === 0 && arxivData.authors && arxivData.authors.length > 0) authors = arxivData.authors;
          if (!abstract && arxivData.abstract) abstract = arxivData.abstract;
          if (!year && arxivData.year) year = arxivData.year;
        } catch {}
      }
    }

    // 4. Fallback via CSL-JSON
    if (!title) {
      try {
        const res = await requestUrl({
          url: `https://doi.org/${encodeURIComponent(cleanDoi)}`,
          headers: { Accept: "application/vnd.citationstyles.csl+json" },
        });

        if (res.status === 200 && res.json) {
          const csl = res.json;
          if (authors.length === 0) {
            authors = (csl.author || []).map((a: any) => {
              if (a.family && a.given) return `${a.family}, ${a.given}`;
              if (a.family) return a.family;
              if (a.literal) return a.literal;
              return "Unknown";
            });
          }
          if (csl.issued && csl.issued["date-parts"] && csl.issued["date-parts"][0]) {
            year = csl.issued["date-parts"][0][0];
          }
          title = csl.title || "Untitled";
          if (!publication) publication = csl["container-title"] || "";
          if (!volume) volume = csl.volume || "";
          if (!issue) issue = csl.issue || "";
          if (!pages) pages = csl.page || "";
          if (!publisher) publisher = csl.publisher || "";
          if (!abstract && csl.abstract) abstract = csl.abstract;
        }
      } catch {}
    }

    if (!title) {
      throw new Error(`Could not resolve metadata for DOI: ${cleanDoi}`);
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
      abstract,
      projects: [],
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    });
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
    // YouTube
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

    // HTML Fetch & OpenGraph Parsing
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

        const descriptionMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i)?.[1]
          || html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i)?.[1]
          || "";

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
          abstract: descriptionMatch.replace(/&amp;/g, "&").trim(),
          projects: [],
          dateAdded: new Date().toISOString(),
          dateModified: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("[CitationManager] Generic URL scrape failed...", e);
    }

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
   * Parses Raw BibTeX String into ReferenceMetadata array (supports single or multiple entries)
   */
  static parseBibTeX(bibtex: string): Partial<ReferenceMetadata>[] {
    const entries: Partial<ReferenceMetadata>[] = [];
    const entryRegex = /@([a-zA-Z]+)\s*\{\s*([^,]+),([\s\S]*?)(?=\n@|\n*$)/g;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(bibtex)) !== null) {
      const rawType = match[1].toLowerCase();
      const citekey = match[2].trim();
      const body = match[3];

      const getField = (field: string): string => {
        const reg = new RegExp(`${field}\\s*=\\s*[{"](.*?)[}"]`, "i");
        const m = body.match(reg);
        return m ? m[1].trim() : "";
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
      const abstract = getField("abstract");

      let type: ReferenceType = "other";
      if (rawType === "article") type = "journal";
      else if (rawType === "inproceedings" || rawType === "conference") type = "conference";
      else if (rawType === "book" || rawType === "booklet") type = "book";
      else if (rawType === "misc") type = "webpage";
      else if (rawType === "techreport") type = "report";
      else if (rawType === "phdthesis" || rawType === "mastersthesis") type = "thesis";

      entries.push(CitationEngine.populateStyles({
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
        abstract,
        projects: [],
        dateAdded: new Date().toISOString(),
        dateModified: new Date().toISOString(),
      }));
    }

    if (entries.length === 0) {
      const typeMatch = bibtex.match(/@([a-zA-Z]+)\s*\{\s*([^,]+),/);
      if (typeMatch) {
        const rawType = typeMatch[1].toLowerCase();
        const citekey = typeMatch[2].trim();
        const getField = (field: string): string => {
          const reg = new RegExp(`${field}\\s*=\\s*[{"](.*?)[}"]`, "i");
          const m = bibtex.match(reg);
          return m ? m[1].trim() : "";
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
        const abstract = getField("abstract");

        let type: ReferenceType = "other";
        if (rawType === "article") type = "journal";
        else if (rawType === "inproceedings" || rawType === "conference") type = "conference";
        else if (rawType === "book" || rawType === "booklet") type = "book";
        else if (rawType === "misc") type = "webpage";
        else if (rawType === "techreport") type = "report";
        else if (rawType === "phdthesis" || rawType === "mastersthesis") type = "thesis";

        entries.push(CitationEngine.populateStyles({
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
          abstract,
          projects: [],
          dateAdded: new Date().toISOString(),
          dateModified: new Date().toISOString(),
        }));
      }
    }

    return entries;
  }
}
