import { App, TFile, normalizePath, MarkdownView } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, ProjectHealthStats, CitationOccurrence, CitationStyle, InBodyFormat, ALL_PROJECTS_ID } from './types';
import { CitationEngine } from './citationEngine';
import { Logger } from './logger';

export class ProjectIndexer {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Fast DOI extraction from raw PDF buffer
   */
  static extractDOIFromBuffer(buffer: ArrayBuffer): string | null {
    try {
      const sliceSize = Math.min(buffer.byteLength, 524288); // Scan up to 512KB
      const bytes = new Uint8Array(buffer.slice(0, sliceSize));
      let text = "";
      for (let i = 0; i < bytes.length; i++) {
        const c = bytes[i];
        if (c >= 32 && c <= 126) text += String.fromCharCode(c);
        else if (c === 10 || c === 13) text += "\n";
        else text += " ";
      }

      // 1. Prism / XMP / XML DOI tags
      const xmpMatch = text.match(/<[^>]*doi[^>]*>\s*(10\.\d{4,9}\/[^<>\s]+)\s*<\/[^>]*>/i);
      if (xmpMatch) {
        return xmpMatch[1].trim().replace(/[,;.)>\]]+$/, "");
      }

      // 2. URL or standard prefix DOI
      const prefixMatch = text.match(/(?:doi(?:\.org\/|\/|:|\s+)|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
      if (prefixMatch) {
        return prefixMatch[1].trim().replace(/[,;.)>\]]+$/, "");
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
    } catch (e) {
      Logger.warn("Failed extracting DOI from PDF buffer:", e);
    }
    return null;
  }

  /**
   * Retrieves all TFiles associated with a project (via YAML frontmatter 'citation-manager' OR registry list)
   */
  getProjectFiles(project: ProjectRecord | null, referencesFolder: string = ".references"): TFile[] {
    const matchedFiles: TFile[] = [];
    const allMarkdownFiles = this.app.vault.getMarkdownFiles();
    const cleanRefFolder = normalizePath(referencesFolder);

    const isAll = !project || project.id === ALL_PROJECTS_ID;

    for (const file of allMarkdownFiles) {
      if (file.path.startsWith(cleanRefFolder)) continue;

      if (isAll) {
        matchedFiles.push(file);
        continue;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
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
    Logger.debug(`Added project '${projectName}' to frontmatter of ${file.path}`);
  }

  async removeProjectFromFrontmatter(file: TFile, projectName: string): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const current = fm['citation-manager'] || fm['citation_manager'];
      if (Array.isArray(current)) {
        const updated = current.filter((p: any) => String(p).toLowerCase() !== projectName.toLowerCase());
        if (updated.length > 0) {
          fm['citation-manager'] = updated;
        } else {
          delete fm['citation-manager'];
          delete fm['citation_manager'];
        }
      } else if (typeof current === 'string') {
        if (current.toLowerCase() === projectName.toLowerCase()) {
          delete fm['citation-manager'];
          delete fm['citation_manager'];
        }
      }
    });
    Logger.debug(`Removed project '${projectName}' from frontmatter of ${file.path}`);
  }

  async deleteProjectGlobally(projectName: string, referencesFolder: string = ".references"): Promise<number> {
    let modifiedCount = 0;
    const cleanRefFolder = normalizePath(referencesFolder);

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path.startsWith(cleanRefFolder)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (fm && (fm['citation-manager'] || fm['citation_manager'])) {
        await this.removeProjectFromFrontmatter(file, projectName);
        modifiedCount++;
      }
    }
    Logger.debug(`Globally deleted project '${projectName}' from ${modifiedCount} file frontmatters`);
    return modifiedCount;
  }

  async indexProject(
    project: ProjectRecord,
    referencesMap: Map<string, ReferenceMetadata>,
    referencesFolder: string = ".references"
  ): Promise<ProjectHealthStats> {
    const usageMap: Record<string, CitationOccurrence[]> = {};
    const unresolved: { citekey: string; file: string; line: number; rawCitation: string }[] = [];
    let totalCitations = 0;

    for (const [key] of referencesMap.entries()) {
      usageMap[key] = [];
    }

    const isAll = project.id === ALL_PROJECTS_ID;
    const filesToIndex = isAll ? [] : this.getProjectFiles(project, referencesFolder);

    if (isAll) {
      // In ALL scope, use fast indexed link scan
      for (const file of this.app.vault.getMarkdownFiles()) {
        if (file.path.startsWith(normalizePath(referencesFolder))) continue;
        const cache = this.app.metadataCache.getFileCache(file);
        // Quick check
        if (!cache) continue;

        try {
          const content = await this.app.vault.read(file);
          for (const [key] of referencesMap.entries()) {
            if (content.includes(key)) {
              const matches = content.match(new RegExp(`\\[\\^${key}\\]|\\[@${key}\\]|\\[\\[${key}(?:\\|[^\\]]+)?\\]\\]`, 'g'));
              if (matches) {
                totalCitations += matches.length;
                if (!usageMap[key]) usageMap[key] = [];
                usageMap[key].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: 1,
                  lineContent: `Cited in ${file.basename}`,
                  citekey: key,
                  rawCitation: matches[0],
                });
              }
            }
          }
        } catch {}
      }
    } else {
      for (const file of filesToIndex) {
        try {
          const content = await this.app.vault.read(file);
          const lines = content.split(/\r?\n/);

          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            const lineNum = lineIdx + 1;

            // Footnotes [^citekey]
            const footnoteMatches = line.matchAll(/\[\^([a-zA-Z0-9_-]+)\]/g);
            for (const match of footnoteMatches) {
              const citekey = match[1];
              if (line.trim().startsWith(`[^${citekey}]:`)) continue;

              // Filter out pure numbers unless in .references
              if (/^\d+$/.test(citekey) && !referencesMap.has(citekey)) {
                continue;
              }

              totalCitations++;
              const occurrence: CitationOccurrence = {
                filePath: file.path,
                fileName: file.basename,
                lineNumber: lineNum,
                lineContent: line.trim(),
                citekey,
                rawCitation: match[0],
              };

              if (referencesMap.has(citekey)) {
                if (!usageMap[citekey]) usageMap[citekey] = [];
                usageMap[citekey].push(occurrence);
              } else {
                unresolved.push({
                  citekey,
                  file: file.path,
                  line: lineNum,
                  rawCitation: match[0],
                });
              }
            }

            // Wikilinks [[citekey]]
            const wikilinkMatches = line.matchAll(/\[\[([a-zA-Z0-9_-]+)(?:\|[^\]]+)?\]\]/g);
            for (const match of wikilinkMatches) {
              const key = match[1];
              if (referencesMap.has(key)) {
                totalCitations++;
                if (!usageMap[key]) usageMap[key] = [];
                usageMap[key].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineNum,
                  lineContent: line.trim(),
                  citekey: key,
                  rawCitation: match[0],
                });
              }
            }

            // Pandoc [@citekey]
            const pandocMatches = line.matchAll(/\[@([a-zA-Z0-9_-]+)\]/g);
            for (const match of pandocMatches) {
              const key = match[1];
              totalCitations++;
              if (referencesMap.has(key)) {
                if (!usageMap[key]) usageMap[key] = [];
                usageMap[key].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineNum,
                  lineContent: line.trim(),
                  citekey: key,
                  rawCitation: match[0],
                });
              } else {
                unresolved.push({
                  citekey: key,
                  file: file.path,
                  line: lineNum,
                  rawCitation: match[0],
                });
              }
            }
          }
        } catch (e) {
          Logger.error(`Error indexing file ${file.path}:`, e);
        }
      }
    }

    const projectRefs = isAll
      ? Array.from(referencesMap.values())
      : Array.from(referencesMap.values()).filter(r => 
          !r.projects || r.projects.length === 0 || 
          r.projects.some(p => p.toLowerCase() === project.id.toLowerCase() || p.toLowerCase() === project.name.toLowerCase())
        );

    let usedCount = 0;
    for (const ref of projectRefs) {
      if (usageMap[ref.citekey] && usageMap[ref.citekey].length > 0) {
        usedCount++;
      }
    }

    return {
      totalReferences: projectRefs.length,
      totalCitationsInFiles: totalCitations,
      usedReferencesCount: usedCount,
      unusedReferencesCount: Math.max(0, projectRefs.length - usedCount),
      unresolvedCitations: isAll ? [] : unresolved,
      referenceUsageMap: usageMap,
    };
  }

  canDelete(citekey: string, stats: ProjectHealthStats): { allowed: boolean; occurrences: CitationOccurrence[] } {
    const occurrences = stats.referenceUsageMap[citekey] || [];
    return {
      allowed: occurrences.length === 0,
      occurrences,
    };
  }

  /**
   * Ultra-fast scoped bi-directional in-text synchronization (ONLY scans project linked files)
   */
  async syncReferenceUpdateAcrossDocuments(
    oldRef: Partial<ReferenceMetadata>,
    newRef: ReferenceMetadata,
    project: ProjectRecord | null,
    style: CitationStyle = 'apa7',
    referencesFolder: string = ".references"
  ): Promise<{ modifiedFiles: number; timeMs: number }> {
    const startTime = performance.now();
    const oldCitekey = oldRef.citekey || newRef.citekey;
    const newCitekey = newRef.citekey;
    const cleanRefFolder = normalizePath(referencesFolder);

    const oldInBodyParenthetical = oldRef.authors ? CitationEngine.formatInBody(oldRef as ReferenceMetadata, 'parenthetical') : '';
    const newInBodyParenthetical = CitationEngine.formatInBody(newRef, 'parenthetical');

    const oldInBodyNarrative = oldRef.authors ? CitationEngine.formatInBody(oldRef as ReferenceMetadata, 'narrative') : '';
    const newInBodyNarrative = CitationEngine.formatInBody(newRef, 'narrative');

    const newFootnoteDef = CitationEngine.formatFootnoteDefinition(newRef, style);

    let modifiedFiles = 0;

    // 1. Fast active open editor buffer replacement
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && !activeView.file?.path.startsWith(cleanRefFolder)) {
      const editor = activeView.editor;
      let text = editor.getValue();
      let changed = false;

      const fnRegex = new RegExp(`^(\\[\\^${oldCitekey}\\]:).*$`, 'm');
      if (fnRegex.test(text)) {
        text = text.replace(fnRegex, newFootnoteDef);
        changed = true;
      }

      if (oldCitekey !== newCitekey) {
        text = text.replaceAll(`[^${oldCitekey}]`, `[^${newCitekey}]`);
        text = text.replaceAll(`[@${oldCitekey}]`, `[@${newCitekey}]`);
        text = text.replaceAll(`[[${oldCitekey}]]`, `[[${newCitekey}]]`);
        changed = true;
      }

      if (oldInBodyParenthetical && oldInBodyParenthetical !== newInBodyParenthetical && text.includes(oldInBodyParenthetical)) {
        text = text.replaceAll(oldInBodyParenthetical, newInBodyParenthetical);
        changed = true;
      }

      if (oldInBodyNarrative && oldInBodyNarrative !== newInBodyNarrative && text.includes(oldInBodyNarrative)) {
        text = text.replaceAll(oldInBodyNarrative, newInBodyNarrative);
        changed = true;
      }

      if (changed) {
        editor.setValue(text);
        modifiedFiles++;
      }
    }

    // 2. Scoped file iteration (ONLY linked project files)
    const targetFiles = this.getProjectFiles(project, referencesFolder);

    for (const file of targetFiles) {
      if (activeView && activeView.file?.path === file.path) continue; // Already updated active buffer
      try {
        const content = await this.app.vault.read(file);
        // Fast skip check
        if (!content.includes(oldCitekey) && (!oldInBodyParenthetical || !content.includes(oldInBodyParenthetical))) {
          continue;
        }

        let updated = content;
        let fileChanged = false;

        const fnRegex = new RegExp(`^(\\[\\^${oldCitekey}\\]:).*$`, 'm');
        if (fnRegex.test(updated)) {
          updated = updated.replace(fnRegex, newFootnoteDef);
          fileChanged = true;
        }

        if (oldCitekey !== newCitekey) {
          updated = updated.replaceAll(`[^${oldCitekey}]`, `[^${newCitekey}]`);
          updated = updated.replaceAll(`[@${oldCitekey}]`, `[@${newCitekey}]`);
          updated = updated.replaceAll(`[[${oldCitekey}]]`, `[[${newCitekey}]]`);
          fileChanged = true;
        }

        if (oldInBodyParenthetical && oldInBodyParenthetical !== newInBodyParenthetical && updated.includes(oldInBodyParenthetical)) {
          updated = updated.replaceAll(oldInBodyParenthetical, newInBodyParenthetical);
          fileChanged = true;
        }

        if (oldInBodyNarrative && oldInBodyNarrative !== newInBodyNarrative && updated.includes(oldInBodyNarrative)) {
          updated = updated.replaceAll(oldInBodyNarrative, newInBodyNarrative);
          fileChanged = true;
        }

        if (fileChanged) {
          await this.app.vault.modify(file, updated);
          modifiedFiles++;
        }
      } catch (err) {
        Logger.error(`Error updating reference across ${file.path}:`, err);
      }
    }

    const timeMs = Math.round(performance.now() - startTime);
    Logger.debug(`Scoped reference sync complete in ${timeMs}ms across ${modifiedFiles} files`);
    return { modifiedFiles, timeMs };
  }

  /**
   * Propagate In-Body Format Change across project documents
   */
  async propagateFormatChange(
    project: ProjectRecord,
    targetFormat: InBodyFormat,
    referencesMap: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    referencesFolder: string = ".references"
  ): Promise<number> {
    let modifiedFiles = 0;
    const targetFiles = this.getProjectFiles(project, referencesFolder);

    for (const file of targetFiles) {
      try {
        const content = await this.app.vault.read(file);
        let updated = content;
        let fileChanged = false;

        for (const [key, ref] of referencesMap.entries()) {
          const parenthetical = CitationEngine.formatInBody(ref, 'parenthetical');
          const footnoteMarker = `[^${key}]`;
          const footnoteDef = CitationEngine.formatFootnoteDefinition(ref, style);

          if (targetFormat === 'footnote') {
            if (updated.includes(parenthetical)) {
              updated = updated.replaceAll(parenthetical, footnoteMarker);
              if (!updated.includes(`[^${key}]:`)) {
                updated += `\n\n${footnoteDef}\n`;
              }
              fileChanged = true;
            }
          } else if (targetFormat === 'parenthetical') {
            if (updated.includes(footnoteMarker)) {
              updated = updated.replaceAll(footnoteMarker, parenthetical);
              fileChanged = true;
            }
          }
        }

        if (fileChanged) {
          await this.app.vault.modify(file, updated);
          modifiedFiles++;
        }
      } catch {}
    }

    return modifiedFiles;
  }

  async syncFootnotesInRegisteredFiles(
    project: ProjectRecord,
    referencesMap: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    referencesFolder: string = ".references"
  ): Promise<{ updatedFilesCount: number; updatedFootnotesCount: number }> {
    let updatedFilesCount = 0;
    let updatedFootnotesCount = 0;

    const filesToSync = this.getProjectFiles(project, referencesFolder);

    for (const file of filesToSync) {
      try {
        const content = await this.app.vault.read(file);
        let modifiedContent = content;
        let fileChanged = false;

        for (const [citekey, ref] of referencesMap.entries()) {
          const regex = new RegExp(`^(\\[\\^${citekey}\\]:).*$`, 'm');
          if (regex.test(modifiedContent)) {
            const newDefinition = CitationEngine.formatFootnoteDefinition(ref, style);
            modifiedContent = modifiedContent.replace(regex, newDefinition);
            fileChanged = true;
            updatedFootnotesCount++;
          }
        }

        if (fileChanged) {
          await this.app.vault.modify(file, modifiedContent);
          updatedFilesCount++;
        }
      } catch (e) {
        Logger.error(`Error syncing footnotes in ${file.path}:`, e);
      }
    }

    return { updatedFilesCount, updatedFootnotesCount };
  }

  generateBibliography(
    project: ProjectRecord,
    references: ReferenceMetadata[],
    style: CitationStyle = 'apa7',
    onlyCited: boolean = false,
    stats?: ProjectHealthStats
  ): string {
    let filtered = references;
    if (onlyCited && stats) {
      filtered = references.filter(r => (stats.referenceUsageMap[r.citekey]?.length || 0) > 0);
    }

    if (style === 'ieee' || style === 'vancouver') {
      filtered.sort((a, b) => (String(a.year)).localeCompare(String(b.year)));
    } else {
      filtered.sort((a, b) => {
        const aAuthor = a.authors?.[0] || "";
        const bAuthor = b.authors?.[0] || "";
        return aAuthor.localeCompare(bAuthor);
      });
    }

    const lines: string[] = [];
    lines.push(`# Bibliography: ${project.name}`);
    lines.push(`*Generated on ${new Date().toLocaleDateString()} | Style: ${style.toUpperCase()}*\n`);

    filtered.forEach((ref, idx) => {
      let entry = "";
      switch (style) {
        case 'apa7':
          entry = CitationEngine.formatAPA7(ref);
          lines.push(`- ${entry}`);
          break;
        case 'ieee':
          entry = CitationEngine.formatIEEE(ref, idx + 1);
          lines.push(entry);
          break;
        case 'harvard':
          entry = CitationEngine.formatHarvard(ref);
          lines.push(`- ${entry}`);
          break;
        case 'chicago':
          entry = CitationEngine.formatChicago(ref);
          lines.push(`- ${entry}`);
          break;
        case 'vancouver':
          entry = CitationEngine.formatVancouver(ref, idx + 1);
          lines.push(entry);
          break;
        default:
          entry = CitationEngine.formatAPA7(ref);
          lines.push(`- ${entry}`);
      }
    });

    return lines.join("\n\n");
  }
}
