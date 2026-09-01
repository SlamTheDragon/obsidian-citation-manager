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
    allKnownProjects?: ProjectRecord[],
    dismissedLints?: Set<string>,
    globalFootnoteMode?: boolean
  ): Promise<ProjectHealthStats> {
    const files = this.getProjectFiles(project, referencesFolder, allKnownProjects);
    const referenceUsageMap: Record<string, CitationOccurrence[]> = {};
    const unresolvedCitations: { rawCitation: string; file: string; line: number }[] = [];
    const lintWarnings: LintWarning[] = [];
    const dismissed = dismissedLints || new Set<string>();
    let totalCitationsInFiles = 0;

    const isFootnoteMode = Boolean(globalFootnoteMode ?? project.enableFootnoteMode);
    const targetFormat = project.inBodyFormat || 'parenthetical';
    const targetStyle = project.citationStyle || 'apa7';

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
                const ref = allReferences.get(key)!;
                if (!referenceUsageMap[key]) referenceUsageMap[key] = [];
                referenceUsageMap[key].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: displayLine,
                });

                // Lint check: Format Mismatch
                if (isFootnoteMode) {
                  const id = `${file.path}::${lineIdx + 1}::[@${key}]::format_mismatch`;
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: `[@${key}]`,
                      suggestedFix: `[^${ref.citekey}]`,
                      type: 'format_mismatch',
                      message: `Expected footnote [^${ref.citekey}] in Footnote Mode.`,
                    });
                  }
                } else if (targetFormat === 'parenthetical') {
                  const expected = CitationEngine.formatInBody(ref, 'parenthetical');
                  const id = `${file.path}::${lineIdx + 1}::[@${key}]::format_mismatch`;
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: `[@${key}]`,
                      suggestedFix: expected,
                      type: 'format_mismatch',
                      message: `Expected parenthetical citation for [@${key}].`,
                    });
                  }
                } else if (targetFormat === 'narrative') {
                  const expected = CitationEngine.formatInBody(ref, 'narrative');
                  const id = `${file.path}::${lineIdx + 1}::[@${key}]::format_mismatch`;
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: `[@${key}]`,
                      suggestedFix: expected,
                      type: 'format_mismatch',
                      message: `Expected narrative citation for [@${key}].`,
                    });
                  }
                }
              } else {
                unresolvedCitations.push({ rawCitation: `@${key}`, file: file.path, line: lineIdx + 1 });
                const id = `${file.path}::${lineIdx + 1}::@${key}::unresolved`;
                if (!dismissed.has(id)) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: `[@${key}]`,
                    citekey: key,
                    type: 'unresolved',
                    message: `Reference [@${key}] not found in library.`,
                  });
                }
              }
            }
          }

          // 2. Footnotes [^citekey]
          footnoteRegex.lastIndex = 0;
          while ((match = footnoteRegex.exec(lineText)) !== null) {
            const key = match[1];
            totalCitationsInFiles++;
            if (allReferences.has(key)) {
              const ref = allReferences.get(key)!;
              if (!referenceUsageMap[key]) referenceUsageMap[key] = [];
              referenceUsageMap[key].push({
                filePath: file.path,
                fileName: file.basename,
                lineNumber: lineIdx + 1,
                lineContent: displayLine,
              });

              // Lint check: If Footnote mode is OFF, flag as mismatch
              if (!isFootnoteMode) {
                const expected = CitationEngine.formatInBody(ref, targetFormat);
                const id = `${file.path}::${lineIdx + 1}::[^${key}]::format_mismatch`;
                if (!dismissed.has(id)) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: `[^${key}]`,
                    citekey: key,
                    suggestedFix: expected,
                    type: 'format_mismatch',
                    message: `Expected ${targetFormat} citation instead of [^${key}] (Footnote Mode is disabled).`,
                  });
                }
              }
            } else {
              const id = `${file.path}::${lineIdx + 1}::[^${key}]::unresolved`;
              if (!dismissed.has(id)) {
                lintWarnings.push({
                  id,
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: displayLine,
                  rawCitation: `[^${key}]`,
                  citekey: key,
                  type: 'unresolved',
                  message: `Reference [^${key}] not found in library.`,
                });
              }
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
                const ref = allReferences.get(matchedKey)!;
                totalCitationsInFiles++;
                if (!referenceUsageMap[matchedKey]) referenceUsageMap[matchedKey] = [];
                referenceUsageMap[matchedKey].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: displayLine,
                });

                // Lint check: If in footnote mode or citekey mode
                if (isFootnoteMode) {
                  const id = `${file.path}::${lineIdx + 1}::${match[0]}::format_mismatch`;
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: match[0],
                      suggestedFix: `[^${ref.citekey}]`,
                      type: 'format_mismatch',
                      message: `Expected [^${ref.citekey}] in Footnote Mode.`,
                    });
                  }
                } else if (targetFormat === 'citekey') {
                  const id = `${file.path}::${lineIdx + 1}::${match[0]}::format_mismatch`;
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: match[0],
                      suggestedFix: `[@${ref.citekey}]`,
                      type: 'format_mismatch',
                      message: `Expected citekey [@${ref.citekey}].`,
                    });
                  }
                }
              }
            }
          }
        });

        // 4. Style check on bottom footnote definitions
        const fnDefRegex = /^\s*\[\^([a-zA-Z0-9_:\.-]+)\]:\s*(.*)$/gm;
        let defMatch: RegExpExecArray | null;
        let footnoteIndex = 1;
        while ((defMatch = fnDefRegex.exec(rawContent)) !== null) {
          const key = defMatch[1];
          const currentDefLine = defMatch[0].trim();
          const currentDefText = defMatch[2]?.trim() || "";
          const ref = allReferences.get(key) || Array.from(allReferences.values()).find(r => 
            r.citekey.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
          );
          if (ref) {
            const expectedDef = CitationEngine.formatFootnoteDefinition(ref, targetStyle, footnoteIndex);
            if (currentDefLine !== expectedDef) {
              const id = `${file.path}::def::${key}::style_mismatch`;
              if (!dismissed.has(id)) {
                const lineIdx = rawLines.findIndex(l => l.includes(`[^${key}]:`));
                lintWarnings.push({
                  id,
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1,
                  lineContent: currentDefLine,
                  rawCitation: currentDefLine,
                  citekey: key,
                  suggestedFix: expectedDef,
                  type: 'style_mismatch',
                  message: `Definition style does not match bucket standard (${targetStyle.toUpperCase()}).`,
                });
              }
            }
            footnoteIndex++;
          } else {
            // Check if this unresolved key was already logged from in-body scan
            const existingWarning = lintWarnings.find(w => w.filePath === file.path && w.type === 'unresolved' && (w.citekey === key || w.rawCitation === `[^${key}]` || w.rawCitation === `[@${key}]`));
            if (existingWarning) {
              existingWarning.definitionSnippet = currentDefText;
            } else {
              const id = `${file.path}::def::${key}::unresolved`;
              if (!dismissed.has(id)) {
                const lineIdx = rawLines.findIndex(l => l.includes(`[^${key}]:`));
                lintWarnings.push({
                  id,
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1,
                  lineContent: currentDefLine,
                  rawCitation: `[^${key}]`,
                  citekey: key,
                  definitionSnippet: currentDefText,
                  type: 'unresolved',
                  message: `Reference [^${key}] not found in library.`,
                });
              }
            }
          }
        }
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
      lintWarnings,
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
   * Propagates global Footnote Mode changes across all registered files
   */
  async propagateFootnoteModeGlobally(
    enableFootnoteMode: boolean,
    allReferences: Map<string, ReferenceMetadata>,
    projects: ProjectRecord[],
    referencesFolder: string = ".references"
  ): Promise<{ updatedFilesCount: number }> {
    let totalUpdated = 0;
    for (const proj of projects) {
      if (enableFootnoteMode) {
        // Switch in-text to footnotes and sync definitions
        const files = this.getProjectFiles(proj, referencesFolder);
        for (const file of files) {
          try {
            let content = await this.app.vault.read(file);
            let modified = false;
            for (const [key, ref] of allReferences.entries()) {
              const parenthetical = CitationEngine.formatInBody(ref, 'parenthetical');
              const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
              if (citekeyRegex.test(content)) {
                content = content.replace(citekeyRegex, `[^${key}]`);
                modified = true;
              }
              if (parenthetical && content.includes(parenthetical)) {
                content = content.split(parenthetical).join(`[^${key}]`);
                modified = true;
              }
            }
            if (modified) {
              await this.app.vault.modify(file, content);
              totalUpdated++;
            }
          } catch {}
        }
        await this.syncFootnotesInRegisteredFiles(proj, allReferences, proj.citationStyle || 'apa7', referencesFolder);
      } else {
        // Switch in-text to bucket citation standard
        const targetFormat = proj.inBodyFormat || 'parenthetical';
        const modCount = await this.propagateFormatChange(proj, targetFormat, allReferences, proj.citationStyle || 'apa7', referencesFolder);
        totalUpdated += modCount;
      }
    }
    return { updatedFilesCount: totalUpdated };
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

          // Transform existing footnote definitions to the new style
          const fnDef = CitationEngine.formatFootnoteDefinition(ref, style);
          const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:.*$`, 'm');
          if (fnDefRegex.test(content)) {
            const currentDef = content.match(fnDefRegex)?.[0];
            if (currentDef !== fnDef) {
              content = content.replace(fnDefRegex, fnDef);
              modified = true;
            }
          } else if (project.enableFootnoteMode && (content.includes(`[^${key}]`) || modified)) {
            content = content.trimEnd() + `\n\n${fnDef}\n`;
            modified = true;
          }
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
   * Syncs and transforms footnote definitions at the bottom of all project files to match the selected style.
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

    const footnoteCallRegex = /\[\^([a-zA-Z0-9_:\.-]+)\](?!:)/g;
    const existingDefRegex = /^\s*\[\^([a-zA-Z0-9_:\.-]+)\]:.*$/gm;

    for (const file of files) {
      try {
        let content = await this.app.vault.read(file);
        let modified = false;

        const keysInFile = new Set<string>();

        // Collect from in-body footnote calls [^key]
        let match: RegExpExecArray | null;
        footnoteCallRegex.lastIndex = 0;
        while ((match = footnoteCallRegex.exec(content)) !== null) {
          keysInFile.add(match[1]);
        }

        // Also collect from existing bottom definitions [^key]: ...
        existingDefRegex.lastIndex = 0;
        while ((match = existingDefRegex.exec(content)) !== null) {
          keysInFile.add(match[1]);
        }

        let fnIndex = 1;
        for (const key of keysInFile) {
          const ref = allReferences.get(key) || Array.from(allReferences.values()).find(r => 
            r.citekey.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
          );

          if (ref) {
            const fnDef = CitationEngine.formatFootnoteDefinition(ref, style, fnIndex);
            const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:.*$`, 'm');

            if (fnDefRegex.test(content)) {
              const currentDef = content.match(fnDefRegex)?.[0];
              if (currentDef !== fnDef) {
                content = content.replace(fnDefRegex, fnDef);
                modified = true;
                updatedFootnotesCount++;
              }
            } else if (project.enableFootnoteMode) {
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

      // Strip citation manager frontmatter from exported publication note
      content = ProjectIndexer.cleanExportFrontmatter(content);

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

  /**
   * Cleans citation-manager tags from frontmatter so exported files in publication/
   * are not indexed back into the citation project as source notes.
   */
  static cleanExportFrontmatter(content: string): string {
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return content;

    let fmBody = fmMatch[1];
    // Remove citation-manager, citation_manager, citation-project lines (including multiline arrays)
    fmBody = fmBody.replace(/^(?:citation-manager|citation_manager|citation-project|citation_project):\s*(?:\[[^\]]*\]|[^\r\n]*(\r?\n\s+-[^\r\n]*)*)\r?\n?/gm, "");
    
    // If frontmatter is now empty, remove the whole frontmatter block
    if (!fmBody.trim()) {
      return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    }
    
    return content.replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${fmBody.trim()}\n---`);
  }
}
