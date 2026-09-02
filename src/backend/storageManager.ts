import { App, normalizePath, parseYaml, stringifyYaml } from 'obsidian';
import { ReferenceMetadata, CitationManagerSettings } from './types';
import { CitationEngine } from './citationEngine';
import { Logger } from './logger';

export class StorageManager {
  private app: App;
  private settings: CitationManagerSettings;

  constructor(app: App, settings: CitationManagerSettings) {
    this.app = app;
    this.settings = settings;
  }

  updateSettings(settings: CitationManagerSettings) {
    this.settings = settings;
  }

  async ensureStorageDirectories(): Promise<void> {
    const rootPath = normalizePath(this.settings.referencesFolder);
    const attachmentsPath = normalizePath(`${rootPath}/attachments`);
    const cachePath = normalizePath(`${rootPath}/.cache`);

    try {
      if (!(await this.app.vault.adapter.exists(rootPath))) {
        await this.app.vault.adapter.mkdir(rootPath);
        Logger.debug(`Created root references folder: ${rootPath}`);
      }
    } catch {}

    try {
      if (!(await this.app.vault.adapter.exists(attachmentsPath))) {
        await this.app.vault.adapter.mkdir(attachmentsPath);
        Logger.debug(`Created attachments folder: ${attachmentsPath}`);
      }
    } catch {}

    try {
      if (!(await this.app.vault.adapter.exists(cachePath))) {
        await this.app.vault.adapter.mkdir(cachePath);
      }
    } catch {}
  }

  async loadDismissedLints(): Promise<Set<string>> {
    await this.ensureStorageDirectories();
    const cacheFile = normalizePath(`${this.settings.referencesFolder}/.cache/dismissed_lints.json`);
    try {
      if (await this.app.vault.adapter.exists(cacheFile)) {
        const raw = await this.app.vault.adapter.read(cacheFile);
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          return new Set(list);
        }
      }
    } catch (e) {
      Logger.warn("Failed loading dismissed lints:", e);
    }
    return new Set();
  }

  async saveDismissedLint(id: string): Promise<void> {
    await this.ensureStorageDirectories();
    const current = await this.loadDismissedLints();
    current.add(id);
    const cacheFile = normalizePath(`${this.settings.referencesFolder}/.cache/dismissed_lints.json`);
    try {
      await this.app.vault.adapter.write(cacheFile, JSON.stringify(Array.from(current), null, 2));
    } catch (e) {
      Logger.error("Failed saving dismissed lints:", e);
    }
  }

  async clearDismissedLints(): Promise<void> {
    await this.ensureStorageDirectories();
    const cacheFile = normalizePath(`${this.settings.referencesFolder}/.cache/dismissed_lints.json`);
    try {
      if (await this.app.vault.adapter.exists(cacheFile)) {
        await this.app.vault.adapter.remove(cacheFile);
      }
    } catch {}
  }

  async loadAllReferences(): Promise<Map<string, ReferenceMetadata>> {
    await this.ensureStorageDirectories();
    const references = new Map<string, ReferenceMetadata>();
    const rootPath = normalizePath(this.settings.referencesFolder);

    try {
      const listing = await this.app.vault.adapter.list(rootPath);
      for (const filePath of listing.files) {
        if (filePath.endsWith('.md')) {
          try {
            const content = await this.app.vault.adapter.read(filePath);
            const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') || '';
            const ref = this.parseReferenceMarkdown(content, fileName);
            if (ref && ref.citekey) {
              references.set(ref.citekey, ref);
            }
          } catch (err) {
            Logger.error(`Error reading reference file ${filePath}:`, err);
          }
        }
      }
      Logger.debug(`Loaded ${references.size} references from ${rootPath}`);
    } catch (e) {
      Logger.error(`Error listing references directory ${rootPath}:`, e);
    }

    return references;
  }

  async saveReference(ref: ReferenceMetadata, originalCitekey?: string, bodyContent?: string): Promise<string> {
    await this.ensureStorageDirectories();
    const cleanCitekey = ref.citekey.replace(/[^a-zA-Z0-9_-]/g, "");
    ref.citekey = cleanCitekey;
    ref.dateModified = new Date().toISOString();

    const rootPath = normalizePath(this.settings.referencesFolder);
    const newFilePath = normalizePath(`${rootPath}/${cleanCitekey}.md`);

    // Handle Citekey Rename
    if (originalCitekey && originalCitekey !== cleanCitekey) {
      const oldFilePath = normalizePath(`${rootPath}/${originalCitekey}.md`);
      if (await this.app.vault.adapter.exists(oldFilePath)) {
        await this.app.vault.adapter.remove(oldFilePath);
        Logger.debug(`Deleted old reference note during rename: ${oldFilePath}`);
      }

      // Rename PDF attachment if present
      const oldPdfPath = normalizePath(`${rootPath}/attachments/${originalCitekey}.pdf`);
      const newPdfPath = normalizePath(`${rootPath}/attachments/${cleanCitekey}.pdf`);
      if (await this.app.vault.adapter.exists(oldPdfPath)) {
        const pdfData = await this.app.vault.adapter.readBinary(oldPdfPath);
        await this.app.vault.adapter.writeBinary(newPdfPath, pdfData);
        await this.app.vault.adapter.remove(oldPdfPath);
        ref.pdfAttachment = newPdfPath;
        Logger.debug(`Renamed attached PDF: ${oldPdfPath} -> ${newPdfPath}`);
      }
    }

    const enriched = CitationEngine.populateStyles(ref) as ReferenceMetadata;

    let existingBody = bodyContent;
    const fileExists = await this.app.vault.adapter.exists(newFilePath);

    if (fileExists && existingBody === undefined) {
      try {
        const fullContent = await this.app.vault.adapter.read(newFilePath);
        existingBody = this.extractBody(fullContent);
      } catch {}
    }

    if (existingBody) {
      if (enriched.abstract) {
        if (/## Abstract(?: & Notes)?/i.test(existingBody)) {
          existingBody = existingBody.replace(
            /(## Abstract(?: & Notes)?\r?\n)(?:[\s\S]*?)(?=\r?\n## |\r?\n# |$)/i,
            `$1${enriched.abstract}\n\n`
          );
        } else {
          existingBody = `\n# ${enriched.title}\n\n## Abstract\n${enriched.abstract}\n\n${existingBody.replace(/^#\s+[^\r\n]*\r?\n/, '')}`;
        }
      }
    } else {
      existingBody = `\n# ${enriched.title}\n\n## Abstract\n${enriched.abstract || "*No abstract available.*"}\n\n## Notes & Synthesis\n`;
    }

    const frontmatterObj = {
      citekey: enriched.citekey,
      type: enriched.type,
      title: enriched.title,
      authors: enriched.authors,
      year: enriched.year,
      month: enriched.month || null,
      publication: enriched.publication || null,
      volume: enriched.volume || null,
      issue: enriched.issue || null,
      pages: enriched.pages || null,
      publisher: enriched.publisher || null,
      doi: enriched.doi || null,
      url: enriched.url || null,
      isbn: enriched.isbn || null,
      issn: enriched.issn || null,
      accessedDate: enriched.accessedDate || null,
      duration: enriched.duration || null,
      abstract: enriched.abstract || null,
      bibtex: enriched.bibtex || null,
      pdfAttachment: enriched.pdfAttachment || null,
      projects: enriched.projects || [],
      collection: enriched.collectionId || "default",
      tags: enriched.tags || [],
      apa: enriched.apa || "",
      ieee: enriched.ieee || "",
      harvard: enriched.harvard || "",
      chicago: enriched.chicago || "",
      vancouver: enriched.vancouver || "",
      dateAdded: enriched.dateAdded || new Date().toISOString(),
      dateModified: enriched.dateModified,
    };

    const cleanFrontmatter: Record<string, any> = {};
    for (const [k, v] of Object.entries(frontmatterObj)) {
      if (v !== null && v !== undefined) cleanFrontmatter[k] = v;
    }

    const markdownText = `---\n${stringifyYaml(cleanFrontmatter)}---\n${existingBody.trim()}\n`;

    await this.app.vault.adapter.write(newFilePath, markdownText);
    Logger.debug(`Saved reference note to ${newFilePath}`);
    return newFilePath;
  }

  async deleteReference(citekey: string): Promise<void> {
    const rootPath = normalizePath(this.settings.referencesFolder);
    const filePath = normalizePath(`${rootPath}/${citekey}.md`);

    if (await this.app.vault.adapter.exists(filePath)) {
      await this.app.vault.adapter.remove(filePath);
      Logger.debug(`Deleted reference note: ${filePath}`);
    }

    const pdfPath = normalizePath(`${rootPath}/attachments/${citekey}.pdf`);
    if (await this.app.vault.adapter.exists(pdfPath)) {
      await this.app.vault.adapter.remove(pdfPath);
      Logger.debug(`Deleted attached PDF: ${pdfPath}`);
    }
  }

  async savePDFAttachment(citekey: string, data: ArrayBuffer): Promise<string> {
    await this.ensureStorageDirectories();
    const rootPath = normalizePath(this.settings.referencesFolder);
    const pdfPath = normalizePath(`${rootPath}/attachments/${citekey}.pdf`);

    await this.app.vault.adapter.writeBinary(pdfPath, data);
    Logger.debug(`Saved PDF binary to ${pdfPath}`);
    return pdfPath;
  }

  async loadReferenceUserNotes(citekey: string): Promise<string> {
    const rootPath = normalizePath(this.settings.referencesFolder);
    const filePath = normalizePath(`${rootPath}/${citekey}.md`);
    if (!(await this.app.vault.adapter.exists(filePath))) return "";

    try {
      const content = await this.app.vault.adapter.read(filePath);
      // 1. Check for comment delimiter boundaries
      const commentMatch = content.match(/<!--NOTE_START-->([\s\S]*?)<!--NOTE_END-->/i);
      if (commentMatch) {
        return commentMatch[1].trim();
      }

      // 2. Fallback to section heading
      const body = this.extractBody(content);
      const notesMatch = body.match(/## (?:Notes|Personal Notes|Notes & Synthesis|Synthesis|Literature Notes)\r?\n([\s\S]*)$/i);
      if (notesMatch && notesMatch[1].trim()) {
        return notesMatch[1].replace(/<!--NOTE_(?:START|END)-->/gi, '').trim();
      }
      return "";
    } catch {
      return "";
    }
  }

  async saveReferenceUserNotes(citekey: string, userNotes: string): Promise<void> {
    const rootPath = normalizePath(this.settings.referencesFolder);
    const filePath = normalizePath(`${rootPath}/${citekey}.md`);
    if (!(await this.app.vault.adapter.exists(filePath))) return;

    try {
      const fullContent = await this.app.vault.adapter.read(filePath);
      const match = fullContent.match(/^---\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
      if (!match) return;

      const fm = match[1];
      const body = match[2].trim();

      const titleMatch = body.match(/^#\s+([^\r\n]+)/m);
      const title = titleMatch ? titleMatch[1] : citekey;

      const abstractMatch = body.match(/## Abstract(?: & Notes)?\r?\n([\s\S]*?)(?=\r?\n## |\r?\n# |$)/i);
      const abstractText = abstractMatch ? abstractMatch[1].trim() : "*No abstract available.*";

      const cleanNotes = userNotes.trim();
      const notesSection = cleanNotes 
        ? `\n\n## Notes & Synthesis\n<!--NOTE_START-->\n${cleanNotes}\n<!--NOTE_END-->` 
        : "";
      const newBody = `\n# ${title}\n\n## Abstract\n${abstractText}${notesSection}\n`;
      const newFullContent = `---\n${fm.trim()}\n---\n${newBody.trim()}\n`;

      await this.app.vault.adapter.write(filePath, newFullContent);
      Logger.debug(`Saved user notes for [${citekey}]`);
    } catch (e) {
      Logger.error(`Failed saving user notes for [${citekey}]:`, e);
      throw e;
    }
  }

  private parseReferenceMarkdown(content: string, fallbackCitekey: string): ReferenceMetadata | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;

    try {
      const parsed = parseYaml(match[1]) as any;
      if (!parsed || typeof parsed !== "object") return null;

      const citekey = parsed.citekey || fallbackCitekey;
      const authors = Array.isArray(parsed.authors)
        ? parsed.authors
        : (typeof parsed.authors === "string" ? parsed.authors.split(",").map((a: string) => a.trim()) : ["Unknown"]);

      let abstract = parsed.abstract;
      if (!abstract) {
        const bodyMatch = content.match(/## Abstract(?: & Notes)?\r?\n([\s\S]*?)(?=\r?\n## |\r?\n# |$)/i);
        if (bodyMatch && bodyMatch[1].trim() && !bodyMatch[1].trim().includes("*No abstract available.*")) {
          abstract = bodyMatch[1].trim();
        }
      }

      let userNotes = "";
      const commentMatch = content.match(/<!--NOTE_START-->([\s\S]*?)<!--NOTE_END-->/i);
      if (commentMatch) {
        userNotes = commentMatch[1].trim();
      } else {
        const body = this.extractBody(content);
        const notesMatch = body.match(/## (?:Notes|Personal Notes|Notes & Synthesis|Synthesis|Literature Notes)\r?\n([\s\S]*)$/i);
        if (notesMatch && notesMatch[1].trim()) {
          userNotes = notesMatch[1].replace(/<!--NOTE_(?:START|END)-->/gi, '').trim();
        }
      }

      const ref: ReferenceMetadata = {
        citekey,
        type: parsed.type || "journal",
        title: parsed.title || "Untitled",
        authors,
        year: parsed.year || new Date().getFullYear(),
        month: parsed.month,
        publication: parsed.publication || parsed.journal || parsed.booktitle,
        volume: parsed.volume,
        issue: parsed.issue,
        pages: parsed.pages,
        publisher: parsed.publisher,
        doi: parsed.doi,
        url: parsed.url,
        isbn: parsed.isbn,
        issn: parsed.issn,
        accessedDate: parsed.accessedDate || parsed.accessed || undefined,
        duration: parsed.duration || undefined,
        abstract: abstract || "",
        userNotes: userNotes || "",
        pdfAttachment: parsed.pdfAttachment,
        projects: Array.isArray(parsed.projects) ? parsed.projects : (parsed.projects ? [parsed.projects] : []),
        collectionId: parsed.collectionId || parsed.collection || "default",
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        apa: parsed.apa,
        ieee: parsed.ieee,
        harvard: parsed.harvard,
        chicago: parsed.chicago,
        vancouver: parsed.vancouver,
        bibtex: parsed.bibtex,
        dateAdded: parsed.dateAdded || new Date().toISOString(),
        dateModified: parsed.dateModified || new Date().toISOString(),
      };

      return CitationEngine.populateStyles(ref) as ReferenceMetadata;
    } catch (e) {
      return null;
    }
  }

  private extractBody(fullContent: string): string {
    const match = fullContent.match(/^---\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
    return match ? match[2].trim() : fullContent.trim();
  }
}
