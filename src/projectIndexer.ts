import { App, TFile, normalizePath, MarkdownView } from 'obsidian';
import { ProjectRecord, ReferenceMetadata, ProjectHealthStats, CitationOccurrence, CitationStyle, InBodyFormat, ALL_PROJECTS_ID } from './types';
import { CitationEngine } from './citationEngine';
import { Logger } from './logger';

export class ProjectIndexer {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

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
        const clean = xmpDoiMatch[1].replace(/^doi:\s*/i, "").trim();
        if (clean.startsWith("10.")) {
          Logger.debug(`Extracted DOI from XMP stream: ${clean}`);
          return clean;
        }
      }

      // 2. Standard DOI URL prefixes
      const urlDoiMatch = text.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/|\/DOI\s*\()(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
      if (urlDoiMatch) {
        const clean = urlDoiMatch[1].trim().replace(/[,;.)>\]]+$/, "");
        Logger.debug(`Extracted DOI from URL prefix: ${clean}`);
        return clean;
      }

      // 3. Raw DOI pattern
      const rawMatch = text.match(/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
      if (rawMatch) {
        const clean = rawMatch[1].trim().replace(/[,;.)>\]]+$/, "");
        if (clean.length > 7 && clean.includes("/")) {
          Logger.debug(`Extracted DOI from PDF binary: ${clean}`);
          return clean;
        }
      }

      // 4. arXiv ID fallback
      const arxivMatch = text.match(/arxiv\s*[:\/]\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i);
      if (arxivMatch) {
        return arxivMatch[1].trim();
      }
    } catch (e) {
      Logger.warn("Failed extracting DOI from PDF buffer:", e);
    }
    return null;
  }

  /**
   * Retrieves all TFiles associated with a project (via YAML frontmatter 'citation-manager' OR registry list)
   * If in "All References", only includes files belonging to declared projects (not the entire vault).
   */
  getProjectFiles(
    project: ProjectRecord | null, 
    referencesFolder: string = ".references",
    allKnownProjects?: ProjectRecord[]
  ): TFile[] {
    const matchedFiles: TFile[] = [];
    const allMarkdownFiles = this.app.vault.getMarkdownFiles();
    const cleanRefFolder = normalizePath(referencesFolder);

    const isAll = !project || project.id === ALL_PROJECTS_ID;

    for (const file of allMarkdownFiles) {
      if (file.path.startsWith(cleanRefFolder)) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;

      if (isAll) {
        // "All References" strictly scans only files declared in at least one project
        let hasAnyProjectFrontmatter = false;
        if (fm) {
          const fmProjects = fm['citation-manager'] || fm['citation_manager'] || fm['citation-project'] || fm['citation_project'] || fm['citation_projects'];
          if (fmProjects && (Array.isArray(fmProjects) ? fmProjects.length > 0 : String(fmProjects).trim().length > 0)) {
            hasAnyProjectFrontmatter = true;
          }
        }
        const isInAnyProjectRegistry = allKnownProjects?.some(p => p.registeredFiles && p.registeredFiles.includes(file.path));

        if (hasAnyProjectFrontmatter || isInAnyProjectRegistry) {
          matchedFiles.push(file);
        }
        continue;
      }

      let matchedInFm = false;
      if (fm) {
        const fmProjects = fm['citation-manager'] || fm['citation_manager'] || fm['citation-project'] || fm['citation_project'] || fm['citation_projects'];
        if (Array.isArray(fmProjects)) {
          matchedInFm = fmProjects.some((p: any) => 
            String(p).trim().toLowerCase() === project.name.toLowerCase() || 
            String(p).trim().toLowerCase() === project.id.toLowerCase()
          );
        } else if (typeof fmProjects === 'string') {
          matchedInFm = (
            fmProjects.trim().toLowerCase() === project.name.toLowerCase() ||
            fmProjects.trim().toLowerCase() === project.id.toLowerCase()
          );
        }
      }

      const matchedInRegistry = project.registeredFiles && project.registeredFiles.includes(file.path);

      if (matchedInFm || matchedInRegistry) {
        matchedFiles.push(file);
      }
    }

    return matchedFiles;
  }

  isFileInProject(file: TFile, project: ProjectRecord): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (fm) {
      const fmProjects = fm['citation-manager'] || fm['citation_manager'] || fm['citation-project'] || fm['citation_project'];
      if (Array.isArray(fmProjects)) {
        if (fmProjects.some((p: any) => String(p).trim().toLowerCase() === project.name.toLowerCase() || String(p).trim().toLowerCase() === project.id.toLowerCase())) {
          return true;
        }
      } else if (typeof fmProjects === 'string') {
        if (fmProjects.trim().toLowerCase() === project.name.toLowerCase() || fmProjects.trim().toLowerCase() === project.id.toLowerCase()) {
          return true;
        }
      }
    }

    return Boolean(project.registeredFiles && project.registeredFiles.includes(file.path));
  }

  async addProjectToFrontmatter(file: TFile, projectName: string): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const current = fm['citation-manager'] || fm['citation_manager'];
      if (!current) {
        fm['citation-manager'] = [projectName];
      } else if (Array.isArray(current)) {
        if (!current.some((p: any) => String(p).toLowerCase() === projectName.toLowerCase())) {
          current.push(projectName);
          fm['citation-manager'] = current;
        }
      } else if (typeof current === 'string') {
        if (current.toLowerCase() !== projectName.toLowerCase()) {
          fm['citation-manager'] = [current, projectName];
        }
      }
    });
  }

  async removeProjectFromFrontmatter(file: TFile, projectName: string): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const current = fm['citation-manager'] || fm['citation_manager'];
      if (Array.isArray(current)) {
        const filtered = current.filter((p: any) => String(p).toLowerCase() !== projectName.toLowerCase());
        if (filtered.length > 0) {
          fm['citation-manager'] = filtered;
        } else {
          delete fm['citation-manager'];
          delete fm['citation_manager'];
        }
      } else if (typeof current === 'string' && current.toLowerCase() === projectName.toLowerCase()) {
        delete fm['citation-manager'];
        delete fm['citation_manager'];
      }
    });
  }

  async deleteProjectGlobally(projectName: string, referencesFolder: string = ".references"): Promise<number> {
    let count = 0;
    const allMarkdown = this.app.vault.getMarkdownFiles();
    const cleanRef = normalizePath(referencesFolder);

    for (const file of allMarkdown) {
      if (file.path.startsWith(cleanRef)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (fm) {
        const current = fm['citation-manager'] || fm['citation_manager'];
        if (current) {
          await this.removeProjectFromFrontmatter(file, projectName);
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Masks code blocks, inline code, and frontmatter to ensure academic citations
   * are extracted without false positives from programming snippets or YAML.
   */
  static maskIgnoredMarkdown(content: string): string {
    // 1. Mask frontmatter
    let masked = content.replace(/^---[\s\S]*?---\n?/m, (match) => ' '.repeat(match.length));
    // 2. Mask fenced code blocks ``` ... ```
    masked = masked.replace(/```[\s\S]*?```/g, (match) => ' '.repeat(match.length));
    // 3. Mask inline code ` ... `
    masked = masked.replace(/`[^`\n]+`/g, (match) => ' '.repeat(match.length));
    return masked;
  }

  /**
   * Scans project documents and computes ProjectHealthStats
   */
  async indexProject(
    project: ProjectRecord,
    allReferences: Map<string, ReferenceMetadata>,
    referencesFolder: string = ".references",
    allKnownProjects?: ProjectRecord[]
  ): Promise<ProjectHealthStats> {
    const files = this.getProjectFiles(project, referencesFolder, allKnownProjects);
    const referenceUsageMap: Record<string, CitationOccurrence[]> = {};
    const unresolvedCitations: { rawCitation: string; file: string; line: number }[] = [];
    let totalCitationsInFiles = 0;

    const bracketCitekeyGroupRegex = /\[([^\]]*@[a-zA-Z0-9_:\.-]+[^\]]*)\]/g;
    const citekeyRegex = /@([a-zA-Z0-9_:\.-]+)/g;
    const footnoteRegex = /\[\^([a-zA-Z0-9_:\.-]+)\](?!:)/g;
    const parentheticalRegex = /\(([A-Z][a-zA-Z\s&]+(?:,\s*\d{4}|\s+et\s+al\.,\s*\d{4}))\)/g;

    const authorYearIndex = new Map<string, string>();
    for (const [key, ref] of allReferences.entries()) {
      if (ref.authors && ref.authors.length > 0 && ref.year) {
        const firstAuthor = ref.authors[0].split(',')[0].trim().toLowerCase();
        const y = String(ref.year).trim();
        authorYearIndex.set(`${firstAuthor}_${y}`, key);
      }
    }

    for (const file of files) {
      try {
        const rawContent = await this.app.vault.cachedRead(file);
        const maskedContent = ProjectIndexer.maskIgnoredMarkdown(rawContent);
        const lines = maskedContent.split('\n');
        const rawLines = rawContent.split('\n');

        lines.forEach((lineText, lineIdx) => {
          let match: RegExpExecArray | null;
          const displayLine = (rawLines[lineIdx] || lineText).trim();

          // 1. Citekeys in bracket groups [@key] or [@key1; @key2]
          bracketCitekeyGroupRegex.lastIndex = 0;
          while ((match = bracketCitekeyGroupRegex.exec(lineText)) !== null) {
            const groupContent = match[1];
            let subMatch: RegExpExecArray | null;
            citekeyRegex.lastIndex = 0;
            while ((subMatch = citekeyRegex.exec(groupContent)) !== null) {
              const key = subMatch[1];
              totalCitationsInFiles++;
              if (allReferences.has(key)) {
                if (!referenceUsageMap[key]) referenceUsageMap[key] = [];
                referenceUsageMap[key].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: displayLine,
                });
              } else {
                unresolvedCitations.push({ rawCitation: `@${key}`, file: file.path, line: lineIdx + 1 });
              }
            }
          }

          // 2. Footnotes [^citekey]
          footnoteRegex.lastIndex = 0;
          while ((match = footnoteRegex.exec(lineText)) !== null) {
            const key = match[1];
            totalCitationsInFiles++;
            if (allReferences.has(key)) {
              if (!referenceUsageMap[key]) referenceUsageMap[key] = [];
              referenceUsageMap[key].push({
                filePath: file.path,
                fileName: file.basename,
                lineNumber: lineIdx + 1,
                lineContent: displayLine,
              });
            }
          }

          // 3. Parenthetical (Author, Year)
          parentheticalRegex.lastIndex = 0;
          while ((match = parentheticalRegex.exec(lineText)) !== null) {
            const raw = match[1];
            const parts = raw.split(',');
            if (parts.length >= 2) {
              const author = parts[0].replace(/\s+et\s+al\./i, "").trim().toLowerCase();
              const year = parts[parts.length - 1].trim();
              const matchedKey = authorYearIndex.get(`${author}_${year}`);
              if (matchedKey && allReferences.has(matchedKey)) {
                totalCitationsInFiles++;
                if (!referenceUsageMap[matchedKey]) referenceUsageMap[matchedKey] = [];
                referenceUsageMap[matchedKey].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: displayLine,
                });
              }
            }
          }
        });
      } catch (err) {
        Logger.warn(`Failed indexing file: ${file.path}`, err);
      }
    }

    const relevantReferenceKeys = project.id === ALL_PROJECTS_ID 
      ? Array.from(allReferences.keys())
      : (project.referenceIds.length > 0 ? project.referenceIds : Array.from(allReferences.keys()));

    const totalReferences = relevantReferenceKeys.length;
    let usedReferencesCount = 0;
    let unusedReferencesCount = 0;

    for (const key of relevantReferenceKeys) {
      if (referenceUsageMap[key] && referenceUsageMap[key].length > 0) {
        usedReferencesCount++;
      } else {
        unusedReferencesCount++;
      }
    }

    return {
      totalReferences,
      usedReferencesCount,
      unusedReferencesCount,
      totalCitationsInFiles,
      unresolvedCitations,
      referenceUsageMap,
    };
  }

  canDelete(citekey: string, stats: ProjectHealthStats): { allowed: boolean; occurrences: CitationOccurrence[] } {
    const usages = stats.referenceUsageMap[citekey] || [];
    return {
      allowed: usages.length === 0,
      occurrences: usages,
    };
  }

  /**
   * Propagates reference updates across linked project documents
   */
  async syncReferenceUpdateAcrossDocuments(
    originalRef: ReferenceMetadata,
    updatedRef: ReferenceMetadata,
    project: ProjectRecord | null,
    style: CitationStyle = 'apa7',
    referencesFolder: string = ".references"
  ): Promise<{ modifiedFiles: number; timeMs: number }> {
    const t0 = performance.now();
    let modifiedFiles = 0;

    const files = this.getProjectFiles(project, referencesFolder);

    const origKey = originalRef.citekey;
    const newKey = updatedRef.citekey;

    const origOldFootnote = CitationEngine.formatFootnoteDefinition(originalRef, style);
    const newFootnote = CitationEngine.formatFootnoteDefinition(updatedRef, style);

    const origParenthetical = CitationEngine.formatInBody(originalRef, 'parenthetical');
    const newParenthetical = CitationEngine.formatInBody(updatedRef, 'parenthetical');

    for (const file of files) {
      try {
        let content = await this.app.vault.read(file);
        let modified = false;

        if (origKey !== newKey) {
          const citekeyRegex = new RegExp(`\\[@${origKey}\\]`, 'g');
          if (citekeyRegex.test(content)) {
            content = content.replace(citekeyRegex, `[@${newKey}]`);
            modified = true;
          }

          const footnoteCallRegex = new RegExp(`\\[\\^${origKey}\\](?!:)`, 'g');
          if (footnoteCallRegex.test(content)) {
            content = content.replace(footnoteCallRegex, `[^${newKey}]`);
            modified = true;
          }

          const footnoteDefRegex = new RegExp(`^\\[\\^${origKey}\\]:.*$`, 'gm');
          if (footnoteDefRegex.test(content)) {
            content = content.replace(footnoteDefRegex, newFootnote);
            modified = true;
          }
        }

        if (origOldFootnote !== newFootnote) {
          const footnoteDefRegex = new RegExp(`^\\[\\^${newKey}\\]:.*$`, 'gm');
          if (footnoteDefRegex.test(content)) {
            content = content.replace(footnoteDefRegex, newFootnote);
            modified = true;
          }
        }

        if (origParenthetical !== newParenthetical && content.includes(origParenthetical)) {
          content = content.split(origParenthetical).join(newParenthetical);
          modified = true;
        }

        if (modified) {
          await this.app.vault.modify(file, content);
          modifiedFiles++;
        }
      } catch (err) {
        Logger.warn(`Failed syncing update to file: ${file.path}`, err);
      }
    }

    const elapsed = Math.round(performance.now() - t0);
    return { modifiedFiles, timeMs: elapsed };
  }

  /**
   * Propagates in-text format change across project documents
   */
  async propagateFormatChange(
    project: ProjectRecord,
    newFormat: InBodyFormat,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    referencesFolder: string = ".references"
  ): Promise<number> {
    const files = this.getProjectFiles(project, referencesFolder);
    let modifiedFiles = 0;

    for (const file of files) {
      try {
        let content = await this.app.vault.read(file);
        let modified = false;

        for (const [key, ref] of allReferences.entries()) {
          const targetInBody = CitationEngine.formatInBody(ref, newFormat);
          const parenthetical = CitationEngine.formatInBody(ref, 'parenthetical');
          const narrative = CitationEngine.formatInBody(ref, 'narrative');

          // 1. Citekey format [@key]
          const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
          if (newFormat !== 'citekey' && citekeyRegex.test(content)) {
            content = content.replace(citekeyRegex, targetInBody);
            modified = true;
          }

          // 2. Footnote call [^key]
          const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
          if (newFormat !== 'footnote' && footnoteCallRegex.test(content)) {
            content = content.replace(footnoteCallRegex, targetInBody);
            modified = true;
          }

          // 3. Parenthetical format (Author, Year)
          if (newFormat !== 'parenthetical' && parenthetical && content.includes(parenthetical)) {
            content = content.split(parenthetical).join(targetInBody);
            modified = true;
          }

          // 4. Narrative format Author (Year)
          if (newFormat !== 'narrative' && narrative && content.includes(narrative)) {
            content = content.split(narrative).join(targetInBody);
            modified = true;
          }

          // Footnote definition sync or cleanup
          if (newFormat === 'footnote' || project.enableFootnoteAutoSync) {
            const fnDef = CitationEngine.formatFootnoteDefinition(ref, style);
            const fnRegex = new RegExp(`^\\[\\^${key}\\]:.*$`, 'm');
            if (!fnRegex.test(content) && (content.includes(`[^${key}]`) || modified)) {
              content = content.trimEnd() + `\n\n${fnDef}\n`;
              modified = true;
            }
          } else {
            // Non-footnote format: automatically clean up citation footnote definitions unless explicitly enabled
            const fnCleanRegex = new RegExp(`^\\s*\\[\\^${key}\\]:.*$\\n?`, 'gm');
            if (fnCleanRegex.test(content)) {
              content = content.replace(fnCleanRegex, "");
              modified = true;
            }
          }
        }

        // Clean up any trailing excessive empty lines left behind by footnote removals
        if (newFormat !== 'footnote' && !project.enableFootnoteAutoSync) {
          content = content.replace(/\n{3,}$/, "\n\n");
        }

        if (modified) {
          await this.app.vault.modify(file, content);
          modifiedFiles++;
        }
      } catch (err) {
        Logger.warn(`Failed propagating format change to file: ${file.path}`, err);
      }
    }

    return modifiedFiles;
  }

  /**
   * Syncs and ensures footnote definitions exist at the bottom of all project files
   */
  async syncFootnotesInRegisteredFiles(
    project: ProjectRecord,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    referencesFolder: string = ".references"
  ): Promise<{ updatedFilesCount: number; updatedFootnotesCount: number; removedFootnotesCount: number }> {
    const files = this.getProjectFiles(project, referencesFolder);
    let updatedFilesCount = 0;
    let updatedFootnotesCount = 0;
    let removedFootnotesCount = 0;

    const shouldKeepFootnotes = project.inBodyFormat === 'footnote' || Boolean(project.enableFootnoteAutoSync);
    const footnoteCallRegex = /\[\^([a-zA-Z0-9_-]+)\](?!:)/g;

    for (const file of files) {
      try {
        let content = await this.app.vault.read(file);
        let modified = false;

        if (!shouldKeepFootnotes) {
          // Clean up any citation footnote definitions
          for (const [key] of allReferences.entries()) {
            const fnCleanRegex = new RegExp(`^\\s*\\[\\^${key}\\]:.*$\\n?`, 'gm');
            if (fnCleanRegex.test(content)) {
              content = content.replace(fnCleanRegex, "");
              modified = true;
              removedFootnotesCount++;
            }
          }
          if (modified) {
            content = content.replace(/\n{3,}$/, "\n\n");
            await this.app.vault.modify(file, content);
            updatedFilesCount++;
          }
          continue;
        }

        const callsInFile = new Set<string>();
        let match: RegExpExecArray | null;
        footnoteCallRegex.lastIndex = 0;
        while ((match = footnoteCallRegex.exec(content)) !== null) {
          callsInFile.add(match[1]);
        }

        let fnIndex = 1;
        for (const key of callsInFile) {
          const ref = allReferences.get(key);
          if (ref) {
            const fnDef = CitationEngine.formatFootnoteDefinition(ref, style, fnIndex);
            const fnDefRegex = new RegExp(`^\\[\\^${key}\\]:.*$`, 'm');

            if (fnDefRegex.test(content)) {
              const currentDef = content.match(fnDefRegex)?.[0];
              if (currentDef !== fnDef) {
                content = content.replace(fnDefRegex, fnDef);
                modified = true;
                updatedFootnotesCount++;
              }
            } else {
              content = content.trimEnd() + `\n\n${fnDef}\n`;
              modified = true;
              updatedFootnotesCount++;
            }
            fnIndex++;
          }
        }

        if (modified) {
          await this.app.vault.modify(file, content);
          updatedFilesCount++;
        }
      } catch (err) {
        Logger.warn(`Failed syncing footnotes for ${file.path}:`, err);
      }
    }

    return { updatedFilesCount, updatedFootnotesCount, removedFootnotesCount };
  }

  /**
   * Generates formatted Bibliography for a project
   */
  generateBibliography(
    project: ProjectRecord,
    allReferences: ReferenceMetadata[],
    style: CitationStyle = 'apa7',
    onlyCited: boolean = false,
    stats?: ProjectHealthStats
  ): string {
    let refsToInclude = allReferences;

    if (project.id !== ALL_PROJECTS_ID && project.referenceIds.length > 0) {
      refsToInclude = allReferences.filter(r => 
        project.referenceIds.includes(r.citekey) || 
        (r.projects && (r.projects.includes(project.id) || r.projects.includes(project.name)))
      );
    }

    if (onlyCited && stats) {
      refsToInclude = refsToInclude.filter(r => stats.referenceUsageMap[r.citekey]?.length > 0);
    }

    return CitationEngine.generateBibliography(refsToInclude, style, project.name);
  }

  /**
   * Batch compiles all files in a project for Global Scope publication.
   * Unifies sequential indexing (e.g. IEEE [1..N], Vancouver (1..N)) across all documents
   * and exports both compiled notes and a master bibliography to the configured publication folder.
   */
  async compileProjectCorpus(
    project: ProjectRecord,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    publicationFolder: string = 'publication',
    referencesFolder: string = '.references'
  ): Promise<{ compiledFilesCount: number; totalCitationsCount: number; bibliographyPath: string }> {
    const files = this.getProjectFiles(project, referencesFolder);
    const pubDir = normalizePath(publicationFolder || 'publication');

    // Ensure publication output folder exists
    if (!(await this.app.vault.adapter.exists(pubDir))) {
      await this.app.vault.createFolder(pubDir);
    }

    // 1. Build Global Reference Order across all project files
    const globalCitekeyOrder: string[] = [];
    const fileContents: Map<string, string> = new Map();

    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        fileContents.set(file.path, content);

        for (const [key, ref] of allReferences.entries()) {
          const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
          const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
          const parenthetical = CitationEngine.formatInBody(ref, 'parenthetical');

          if (citekeyRegex.test(content) || footnoteCallRegex.test(content) || (parenthetical && content.includes(parenthetical))) {
            if (!globalCitekeyOrder.includes(key)) {
              globalCitekeyOrder.push(key);
            }
          }
        }
      } catch (err) {
        Logger.warn(`Failed reading file during corpus compilation: ${file.path}`, err);
      }
    }

    // Sort global citekeys alphabetically if Author-Date (APA, Harvard, Chicago)
    if (style === 'apa7' || style === 'harvard' || style === 'chicago') {
      globalCitekeyOrder.sort((a, b) => {
        const refA = allReferences.get(a);
        const refB = allReferences.get(b);
        const nameA = refA?.authors?.[0] || a;
        const nameB = refB?.authors?.[0] || b;
        return nameA.localeCompare(nameB);
      });
    }

    // Create Global Index Map
    const globalIndexMap = new Map<string, number>();
    globalCitekeyOrder.forEach((key, idx) => {
      globalIndexMap.set(key, idx + 1);
    });

    let compiledFilesCount = 0;

    // 2. Batch Compile and write every file into publication folder
    const bracketGroupRegex = /\[([^\]]*@[a-zA-Z0-9_:\.-]+[^\]]*)\]/g;
    const singleCitekeyRegex = /@([a-zA-Z0-9_:\.-]+)/g;

    for (const file of files) {
      let content = fileContents.get(file.path);
      if (content === undefined) continue;

      // Replace multi-citation or single-citation bracket groups
      content = content.replace(bracketGroupRegex, (fullMatch, groupInner) => {
        const keysInGroup: string[] = [];
        let kMatch: RegExpExecArray | null;
        singleCitekeyRegex.lastIndex = 0;
        while ((kMatch = singleCitekeyRegex.exec(groupInner)) !== null) {
          keysInGroup.push(kMatch[1]);
        }

        if (keysInGroup.length === 0) return fullMatch;

        if (style === 'ieee') {
          const numbers = keysInGroup.map(k => globalIndexMap.get(k)).filter(n => n !== undefined);
          return numbers.length > 0 ? `[${numbers.join(', ')}]` : fullMatch;
        } else if (style === 'vancouver') {
          const numbers = keysInGroup.map(k => globalIndexMap.get(k)).filter(n => n !== undefined);
          return numbers.length > 0 ? `(${numbers.join(', ')})` : fullMatch;
        } else {
          // APA 7 / Harvard / Chicago
          const formattedParts = keysInGroup.map(k => {
            const ref = allReferences.get(k);
            if (!ref) return null;
            const inBody = CitationEngine.formatInBody(ref, 'parenthetical');
            return inBody.replace(/^\(|\)$/g, '');
          }).filter(Boolean);
          return formattedParts.length > 0 ? `(${formattedParts.join('; ')})` : fullMatch;
        }
      });

      // Replace individual footnotes and clean footnote definitions
      for (const [key, globalIdx] of globalIndexMap.entries()) {
        const ref = allReferences.get(key);
        if (!ref) continue;

        let inBodyFormatted = "";
        if (style === 'ieee') {
          inBodyFormatted = `[${globalIdx}]`;
        } else if (style === 'vancouver') {
          inBodyFormatted = `(${globalIdx})`;
        } else {
          inBodyFormatted = CitationEngine.formatInBody(ref, 'parenthetical');
        }

        const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
        content = content.replace(footnoteCallRegex, inBodyFormatted);

        // Strip local footnote definition
        const fnCleanRegex = new RegExp(`^\\s*\\[\\^${key}\\]:.*$\\n?`, 'gm');
        content = content.replace(fnCleanRegex, "");
      }

      content = content.replace(/\n{3,}$/, "\n\n");

      // Write compiled file to publication folder
      const targetOutPath = normalizePath(`${pubDir}/${file.name}`);
      await this.app.vault.adapter.write(targetOutPath, content);
      compiledFilesCount++;
    }

    // 3. Generate Master Global Bibliography file
    const targetRefs = globalCitekeyOrder.map(k => allReferences.get(k)!).filter(Boolean);
    const bibText = CitationEngine.generateBibliography(targetRefs, style, `References - ${project.name}`);
    const bibFilePath = normalizePath(`${pubDir}/References - ${project.name}.md`);
    await this.app.vault.adapter.write(bibFilePath, bibText);

    return {
      compiledFilesCount,
      totalCitationsCount: globalCitekeyOrder.length,
      bibliographyPath: bibFilePath
    };
  }
}
