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
   * Masks code blocks, inline code, HTML comments, LaTeX math blocks, and frontmatter
   * to ensure academic citations are extracted without false positives from mathematical
   * notation, programming snippets, comments, or YAML.
   */
  static maskIgnoredMarkdown(content: string): string {
    // 1. Mask frontmatter
    let masked = content.replace(/^---[\s\S]*?---\n?/m, (match) => ' '.repeat(match.length));
    // 2. Mask fenced code blocks (backticks or tildes)
    masked = masked.replace(/(?:```|~~~)[^`~]*?[\s\S]*?(?:```|~~~)/g, (match) => ' '.repeat(match.length));
    // 3. Mask HTML comments <!-- ... -->
    masked = masked.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));
    // 4. Mask LaTeX display math $$ ... $$
    masked = masked.replace(/\$\$[\s\S]*?\$\$/g, (match) => ' '.repeat(match.length));
    // 5. Mask LaTeX inline math $ ... $
    masked = masked.replace(/\$(?!\s)[^\$\n]+(?<!\s)\$/g, (match) => ' '.repeat(match.length));
    // 6. Mask inline code ` ... `
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

    const isFootnoteMode = Boolean(globalFootnoteMode);
    const targetFormat: InBodyFormat = (project.inBodyFormat === ('footnote' as any) || !project.inBodyFormat) 
      ? 'parenthetical' 
      : project.inBodyFormat;
    const targetStyle: CitationStyle = project.citationStyle || 'apa7';

    const bracketCitekeyGroupRegex = /\[([^\]]*@[\p{L}\p{N}_:\.-]+[^\]]*)\]/gu;
    const citekeyRegex = /@([\p{L}\p{N}_:\.-]+)/gu;
    const footnoteRegex = /\[\^([\p{L}\p{N}_:\.-]+)\](?!:)/gu;
    const parentheticalGroupRegex = /\(([^)]*(?:19\d{2}|20\d{2})[^)]*)\)/gu;
    const narrativeRegex = /\b([\p{Lu}][\p{L}\s&]+(?:\s+et\s+al\.)?)\s+\((19\d{2}|20\d{2})\)/gu;

    const authorYearIndex = new Map<string, string>();
    for (const [key, ref] of allReferences.entries()) {
      if (ref.authors && ref.authors.length > 0 && ref.year) {
        const firstAuthor = ref.authors[0].split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const y = String(ref.year).trim();
        authorYearIndex.set(`${firstAuthor}_${y}`, key);
        if (ref.authors.length > 1) {
          const secondAuthor = ref.authors[1].split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          authorYearIndex.set(`${firstAuthor}_${secondAuthor}_${y}`, key);
        }
      }
      authorYearIndex.set(key.toLowerCase(), key);
    }

    const resolveAuthorYearKey = (authorStr: string, yearStr: string): string | null => {
      const y = yearStr.trim();
      const cleanAuthor = authorStr.replace(/\s+et\s+al\./i, "").trim().toLowerCase();
      const parts = cleanAuthor.split(/[\s,&]+/).filter(Boolean).map(p => p.replace(/[^a-z0-9]/g, ''));
      if (parts.length === 0) return null;
      if (parts.length === 1) {
        return authorYearIndex.get(`${parts[0]}_${y}`) || null;
      }
      return authorYearIndex.get(`${parts[0]}_${parts[1]}_${y}`) || authorYearIndex.get(`${parts[0]}_${y}`) || null;
    };

    for (const file of files) {
      try {
        const rawContent = await this.app.vault.cachedRead(file);
        const maskedContent = ProjectIndexer.maskIgnoredMarkdown(rawContent);
        const rawLines = rawContent.split('\n');
        const lines = maskedContent.split('\n');
        const inBodyKeysInFile = new Set<string>();

        // Pre-build numeric index mapping for IEEE [N] and Vancouver (N) from bottom reference entries
        const numericIndexToKeyMap = new Map<number, string>();
        rawLines.forEach((l) => {
          const trimmed = l.trim();
          const ieeeMatch = trimmed.match(/^\s*\[(\d+)\]\s*(.*)$/);
          if (ieeeMatch) {
            const num = parseInt(ieeeMatch[1]);
            const rest = ieeeMatch[2];
            for (const [k, r] of allReferences.entries()) {
              if (rest.includes(r.title) || (r.doi && rest.includes(r.doi))) {
                numericIndexToKeyMap.set(num, k);
                break;
              }
            }
          }
          const vancMatch = trimmed.match(/^\s*(\d+)\.\s*(.*)$/);
          if (vancMatch) {
            const num = parseInt(vancMatch[1]);
            const rest = vancMatch[2];
            for (const [k, r] of allReferences.entries()) {
              if (rest.includes(r.title) || (r.doi && rest.includes(r.doi))) {
                numericIndexToKeyMap.set(num, k);
                break;
              }
            }
          }
        });

        lines.forEach((lineText, lineIdx) => {
          let match: RegExpExecArray | null;
          const displayLine = (rawLines[lineIdx] || lineText).trim();

          // 1. Citekeys in bracket groups [@key] or [@key1; @key2]
          bracketCitekeyGroupRegex.lastIndex = 0;
          while ((match = bracketCitekeyGroupRegex.exec(lineText)) !== null) {
            const rawGroup = match[0];
            const groupContent = match[1];
            let subMatch: RegExpExecArray | null;
            citekeyRegex.lastIndex = 0;
            const groupRefs: ReferenceMetadata[] = [];
            while ((subMatch = citekeyRegex.exec(groupContent)) !== null) {
              const key = subMatch[1];
              totalCitationsInFiles++;
              inBodyKeysInFile.add(key.toLowerCase());
              if (allReferences.has(key)) {
                const ref = allReferences.get(key)!;
                groupRefs.push(ref);
                inBodyKeysInFile.add(ref.citekey.toLowerCase());
                if (!referenceUsageMap[key]) referenceUsageMap[key] = [];
                referenceUsageMap[key].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: displayLine,
                });
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
                    rawCitation: `@${key}`,
                    citekey: key,
                    type: 'unresolved',
                    message: `Citekey @${key} is not registered in any connected reference library.`,
                  });
                }
              }
            }

            if (groupRefs.length > 0) {
              if (isFootnoteMode) {
                const id = `${file.path}::${lineIdx + 1}::${rawGroup}::format_mismatch`;
                if (!dismissed.has(id)) {
                  const expected = CitationEngine.formatMultiInBody(groupRefs, 'footnote', targetStyle);
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: rawGroup,
                    suggestedFix: expected,
                    type: 'format_mismatch',
                    message: `Expected footnote citation in Footnote Mode.`,
                  });
                }
              } else if (targetFormat !== 'citekey') {
                const expected = CitationEngine.formatMultiInBody(groupRefs, targetFormat, targetStyle);
                const id = `${file.path}::${lineIdx + 1}::${rawGroup}::format_mismatch`;
                if (!dismissed.has(id)) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: rawGroup,
                    suggestedFix: expected,
                    type: 'format_mismatch',
                    message: `Expected ${targetFormat} citation for ${rawGroup}.`,
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
            inBodyKeysInFile.add(key.toLowerCase());
            if (allReferences.has(key)) {
              const ref = allReferences.get(key)!;
              inBodyKeysInFile.add(ref.citekey.toLowerCase());
              if (!referenceUsageMap[key]) referenceUsageMap[key] = [];
              referenceUsageMap[key].push({
                filePath: file.path,
                fileName: file.basename,
                lineNumber: lineIdx + 1,
                lineContent: displayLine,
              });

              // Lint check: If Footnote mode is OFF, flag as mismatch
              if (!isFootnoteMode) {
                const expected = CitationEngine.formatInBody(ref, targetFormat, targetStyle);
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
                    message: `Expected ${targetFormat} citation for [^${key}] (Footnote Mode is disabled).`,
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

          // 3. Parenthetical Groups (Author, Year) or (AuthorA, Year; AuthorB, Year)
          parentheticalGroupRegex.lastIndex = 0;
          while ((match = parentheticalGroupRegex.exec(lineText)) !== null) {
            const rawGroup = match[0];
            const groupContent = match[1];
            const entries = groupContent.split(';').map(s => s.trim()).filter(Boolean);
            const groupRefs: ReferenceMetadata[] = [];
            for (const entry of entries) {
              const yearMatch = entry.match(/\b(19\d{2}|20\d{2})\b/);
              if (yearMatch) {
                const year = yearMatch[1];
                const authorPart = entry.slice(0, entry.indexOf(year)).replace(/[,:\(\)]/g, '').trim();
                const matchedKey = resolveAuthorYearKey(authorPart, year);
                if (matchedKey && allReferences.has(matchedKey)) {
                  const ref = allReferences.get(matchedKey)!;
                  groupRefs.push(ref);
                  totalCitationsInFiles++;
                  inBodyKeysInFile.add(matchedKey.toLowerCase());
                  inBodyKeysInFile.add(ref.citekey.toLowerCase());
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

            if (groupRefs.length > 0) {
              if (isFootnoteMode) {
                const id = `${file.path}::${lineIdx + 1}::${rawGroup}::format_mismatch`;
                if (!dismissed.has(id)) {
                  const expected = CitationEngine.formatMultiInBody(groupRefs, 'footnote', targetStyle);
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: rawGroup,
                    suggestedFix: expected,
                    type: 'format_mismatch',
                    message: `Expected footnote citation in Footnote Mode.`,
                  });
                }
              } else if (targetFormat === 'citekey') {
                const id = `${file.path}::${lineIdx + 1}::${rawGroup}::format_mismatch`;
                if (!dismissed.has(id)) {
                  const expected = CitationEngine.formatMultiInBody(groupRefs, 'citekey', targetStyle);
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: rawGroup,
                    suggestedFix: expected,
                    type: 'format_mismatch',
                    message: `Expected citekey format for ${rawGroup}.`,
                  });
                }
              } else if (targetStyle === 'ieee' || targetStyle === 'vancouver') {
                const expected = CitationEngine.formatMultiInBody(groupRefs, targetFormat, targetStyle);
                const id = `${file.path}::${lineIdx + 1}::${rawGroup}::format_mismatch`;
                if (!dismissed.has(id) && rawGroup !== expected) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: rawGroup,
                    suggestedFix: expected,
                    type: 'format_mismatch',
                    message: `Expected ${targetStyle.toUpperCase()} format for ${rawGroup}.`,
                  });
                }
              }
            }
          }

          // 4. Narrative Citations: Author et al. (Year)
          narrativeRegex.lastIndex = 0;
          while ((match = narrativeRegex.exec(lineText)) !== null) {
            const authorStr = match[1];
            const yearStr = match[2];
            const matchedKey = resolveAuthorYearKey(authorStr, yearStr);
            if (matchedKey && allReferences.has(matchedKey)) {
              const ref = allReferences.get(matchedKey)!;
              totalCitationsInFiles++;
              inBodyKeysInFile.add(matchedKey.toLowerCase());
              inBodyKeysInFile.add(ref.citekey.toLowerCase());
              if (!referenceUsageMap[matchedKey]) referenceUsageMap[matchedKey] = [];
              referenceUsageMap[matchedKey].push({
                filePath: file.path,
                fileName: file.basename,
                lineNumber: lineIdx + 1,
                lineContent: displayLine,
              });

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
              }
            }
          }

          // 5. Numeric in-body citations (IEEE [1], [1, 2] or Vancouver (1), (1, 2)) when Footnote Mode is OFF
          if (!isFootnoteMode && (targetStyle === 'ieee' || targetStyle === 'vancouver')) {
            // Narrative numeric: Chen et al. [1] or Chen et al. (1)
            const narrativeNumericRegex = /\b([\p{Lu}][\p{L}\s&]+(?:\s+et\s+al\.)?)\s*(?:\[(\d+)\]|\((\d+)\))/gu;
            let numMatch: RegExpExecArray | null;
            while ((numMatch = narrativeNumericRegex.exec(lineText)) !== null) {
              const numStr = numMatch[2] || numMatch[3];
              const num = parseInt(numStr);
              const matchedKey = numericIndexToKeyMap.get(num);
              if (matchedKey && allReferences.has(matchedKey)) {
                const ref = allReferences.get(matchedKey)!;
                totalCitationsInFiles++;
                inBodyKeysInFile.add(matchedKey.toLowerCase());
                inBodyKeysInFile.add(ref.citekey.toLowerCase());
                if (!referenceUsageMap[matchedKey]) referenceUsageMap[matchedKey] = [];
                referenceUsageMap[matchedKey].push({
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: displayLine,
                });
              }
            }

            // Parenthetical numeric: [1] or [1, 2] or (1) or (1, 2)
            const numericGroupRegex = targetStyle === 'ieee' ? /\[(\d+(?:\s*,\s*\d+)*)\]/g : /\((\d+(?:\s*,\s*\d+)*)\)/g;
            while ((numMatch = numericGroupRegex.exec(lineText)) !== null) {
              const nums = numMatch[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
              for (const num of nums) {
                const matchedKey = numericIndexToKeyMap.get(num);
                if (matchedKey && allReferences.has(matchedKey)) {
                  const ref = allReferences.get(matchedKey)!;
                  totalCitationsInFiles++;
                  inBodyKeysInFile.add(matchedKey.toLowerCase());
                  inBodyKeysInFile.add(ref.citekey.toLowerCase());
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
          }
        });

        // 4. Style check on bottom footnote definitions
        const fnDefRegex = /^\s*\[\^([\p{L}\p{N}_:\.-]+)\]:\s*(.*)$/gmu;
        let defMatch: RegExpExecArray | null;
        let footnoteIndex = 1;
        while ((defMatch = fnDefRegex.exec(rawContent)) !== null) {
          const key = defMatch[1];
          const currentDefLine = defMatch[0].trim();
          const currentDefText = defMatch[2]?.trim() || "";
          const ref = allReferences.get(key) || Array.from(allReferences.values()).find(r => 
            r.citekey.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
          );

          const isCitedInBody = inBodyKeysInFile.has(key.toLowerCase()) || 
                                (ref ? inBodyKeysInFile.has(ref.citekey.toLowerCase()) : false);

          if (ref) {
            // Count citation presence from footnote body if not already recorded from in-body marker
            if (!referenceUsageMap[ref.citekey] || referenceUsageMap[ref.citekey].length === 0) {
              if (!referenceUsageMap[ref.citekey]) referenceUsageMap[ref.citekey] = [];
              const lineIdx = rawLines.findIndex(l => l.includes(`[^${key}]:`));
              referenceUsageMap[ref.citekey].push({
                filePath: file.path,
                fileName: file.basename,
                lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1,
                lineContent: currentDefLine,
              });
              totalCitationsInFiles++;
            }

            if (!isCitedInBody) {
              // Lint condition: citation declared on footnote, but not in markdown body
              const id = `${file.path}::def::${key}::orphan_definition`;
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
                  definitionSnippet: currentDefText,
                  suggestedFix: "",
                  type: 'orphan_definition',
                  message: `Footnote definition [^${key}] declared at bottom, but not cited in markdown body.`,
                });
              }
            } else if (!isFootnoteMode) {
              // Footnote mode is OFF: bottom definitions should be formatted without the [^key]: prefix
              const expectedBib = CitationEngine.formatBibliographyEntry(ref, targetStyle, footnoteIndex);
              const id = `${file.path}::def::${key}::footnote_prefix_in_standard_mode`;
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
                  suggestedFix: expectedBib,
                  type: 'format_mismatch',
                  message: `Convert [^${key}]: stub to standard ${targetStyle.toUpperCase()} reference entry.`,
                });
              }
              footnoteIndex++;
            } else {
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
            }
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
                  rawCitation: currentDefLine,
                  citekey: key,
                  definitionSnippet: currentDefText,
                  suggestedFix: "",
                  type: isCitedInBody ? 'unresolved' : 'orphan_definition',
                  message: isCitedInBody 
                    ? `Reference [^${key}] not found in library.`
                    : `Footnote definition [^${key}] not in library and not cited in markdown body.`,
                });
              }
            }
          }
        }

        // 5. Plain un-prefixed reference entries at document bottom (for Standard / Footnote Mode)
        for (const [key, ref] of allReferences.entries()) {
          const isCitedInBody = inBodyKeysInFile.has(key.toLowerCase()) || inBodyKeysInFile.has(ref.citekey.toLowerCase());
          
          // Search for matching plain reference line in the document
          const lineIdx = rawLines.findIndex(l => {
            const trimmed = l.trim();
            if (trimmed.startsWith("[^")) return false; // Handled by footnote def scanner
            if (ref.title && ref.title.length > 5 && trimmed.includes(ref.title)) return true;
            if (ref.doi && ref.doi.length > 5 && trimmed.includes(ref.doi)) return true;
            return false;
          });

          if (lineIdx >= 0) {
            const currentLine = rawLines[lineIdx].trim();

            if (!referenceUsageMap[key] || referenceUsageMap[key].length === 0) {
              if (!referenceUsageMap[key]) referenceUsageMap[key] = [];
              referenceUsageMap[key].push({
                filePath: file.path,
                fileName: file.basename,
                lineNumber: lineIdx + 1,
                lineContent: currentLine,
              });
              totalCitationsInFiles++;
            }

            if (!isCitedInBody) {
              // Orphan plain reference line: declared at bottom but not cited in body
              const id = `${file.path}::plain::${key}::orphan_definition`;
              if (!dismissed.has(id)) {
                lintWarnings.push({
                  id,
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: currentLine,
                  rawCitation: currentLine,
                  citekey: key,
                  definitionSnippet: currentLine,
                  suggestedFix: "",
                  type: 'orphan_definition',
                  message: `Reference for "${ref.citekey}" declared at bottom, but not cited in markdown body.`,
                });
              }
            } else if (isFootnoteMode) {
              // In footnote mode, plain references should be converted to [^key]: <Formatted>
              const expectedDef = CitationEngine.formatFootnoteDefinition(ref, targetStyle, 1);
              const id = `${file.path}::plain::${key}::missing_footnote_prefix`;
              if (!dismissed.has(id)) {
                lintWarnings.push({
                  id,
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx + 1,
                  lineContent: currentLine,
                  rawCitation: currentLine,
                  citekey: key,
                  suggestedFix: expectedDef,
                  type: 'format_mismatch',
                  message: `Convert reference line to [^${ref.citekey}]: footnote definition in Footnote Mode.`,
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
      const files = this.getProjectFiles(proj, referencesFolder);
      const style = proj.citationStyle || 'apa7';
      const targetFormat: InBodyFormat = (proj.inBodyFormat === ('footnote' as any) || !proj.inBodyFormat)
        ? 'parenthetical'
        : (proj.inBodyFormat as InBodyFormat);

      for (const file of files) {
        try {
          let content = await this.app.vault.read(file);
          let modified = false;

          let fnIdx = 1;
          for (const [key, ref] of allReferences.entries()) {
            const targetInBody = enableFootnoteMode 
              ? `[^${key}]` 
              : CitationEngine.formatInBody(ref, targetFormat, style, fnIdx);

            // 1. Citekey format [@key]
            const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
            if (citekeyRegex.test(content)) {
              content = content.replace(citekeyRegex, targetInBody);
              modified = true;
            }

            // 2. Footnote call [^key]
            const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
            if (!enableFootnoteMode && footnoteCallRegex.test(content)) {
              content = content.replace(footnoteCallRegex, targetInBody);
              modified = true;
            }

            // 3. Match across all possible citation style variations in-body
            const variations = [
              CitationEngine.formatInBody(ref, 'parenthetical', 'apa7', fnIdx),
              CitationEngine.formatInBody(ref, 'parenthetical', 'harvard', fnIdx),
              CitationEngine.formatInBody(ref, 'parenthetical', 'chicago', fnIdx),
              CitationEngine.formatInBody(ref, 'parenthetical', 'ieee', fnIdx),
              CitationEngine.formatInBody(ref, 'parenthetical', 'vancouver', fnIdx),
              CitationEngine.formatInBody(ref, 'narrative', 'apa7', fnIdx),
              CitationEngine.formatInBody(ref, 'narrative', 'harvard', fnIdx),
              CitationEngine.formatInBody(ref, 'narrative', 'chicago', fnIdx),
              CitationEngine.formatInBody(ref, 'narrative', 'ieee', fnIdx),
              CitationEngine.formatInBody(ref, 'narrative', 'vancouver', fnIdx),
            ];

            for (const v of variations) {
              if (v && v.length > 0 && content.includes(v)) {
                content = content.split(v).join(targetInBody);
                modified = true;
              }
            }

            // 4. Transform bottom definition / bibliography entry
            if (enableFootnoteMode) {
              const expectedDef = CitationEngine.formatFootnoteDefinition(ref, style, fnIdx);
              const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:.*$`, 'm');
              if (fnDefRegex.test(content)) {
                const currentDef = content.match(fnDefRegex)?.[0];
                if (currentDef !== expectedDef) {
                  content = content.replace(fnDefRegex, expectedDef);
                  modified = true;
                }
              } else if (ref.title && ref.title.length > 5 && content.includes(ref.title)) {
                const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const plainRegex = new RegExp(`^.*${escapedTitle}.*$`, 'm');
                content = content.replace(plainRegex, expectedDef);
                modified = true;
              }
            } else {
              const expectedBib = CitationEngine.formatBibliographyEntry(ref, style, fnIdx);
              const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:\\s*(.*)$`, 'm');
              if (fnDefRegex.test(content)) {
                content = content.replace(fnDefRegex, expectedBib);
                modified = true;
              } else if (ref.title && ref.title.length > 5 && content.includes(ref.title)) {
                const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const plainRegex = new RegExp(`^.*${escapedTitle}.*$`, 'm');
                const currentLine = content.match(plainRegex)?.[0];
                if (currentLine && currentLine.trim() !== expectedBib.trim()) {
                  content = content.replace(plainRegex, expectedBib);
                  modified = true;
                }
              }
            }

            fnIdx++;
          }

          if (modified) {
            await this.app.vault.modify(file, content);
            totalUpdated++;
          }
        } catch (err) {
          Logger.warn(`Failed propagating footnote mode for ${file.path}:`, err);
        }
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
    referencesFolder: string = ".references",
    globalFootnoteMode: boolean = false
  ): Promise<number> {
    const files = this.getProjectFiles(project, referencesFolder);
    let modifiedFiles = 0;

    for (const file of files) {
      try {
        let content = await this.app.vault.read(file);
        let modified = false;
        let fnIdx = 1;

        for (const [key, ref] of allReferences.entries()) {
          const targetInBody = globalFootnoteMode ? `[^${key}]` : CitationEngine.formatInBody(ref, newFormat, style, fnIdx);

          // 1. Citekey format [@key]
          const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
          if (citekeyRegex.test(content)) {
            content = content.replace(citekeyRegex, targetInBody);
            modified = true;
          }

          // 2. Footnote call [^key]
          const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
          if (footnoteCallRegex.test(content)) {
            content = content.replace(footnoteCallRegex, targetInBody);
            modified = true;
          }

          // 3. Match across all possible citation style variations
          const variations = [
            CitationEngine.formatInBody(ref, 'parenthetical', 'apa7', fnIdx),
            CitationEngine.formatInBody(ref, 'parenthetical', 'harvard', fnIdx),
            CitationEngine.formatInBody(ref, 'parenthetical', 'chicago', fnIdx),
            CitationEngine.formatInBody(ref, 'parenthetical', 'ieee', fnIdx),
            CitationEngine.formatInBody(ref, 'parenthetical', 'vancouver', fnIdx),
            CitationEngine.formatInBody(ref, 'narrative', 'apa7', fnIdx),
            CitationEngine.formatInBody(ref, 'narrative', 'harvard', fnIdx),
            CitationEngine.formatInBody(ref, 'narrative', 'chicago', fnIdx),
            CitationEngine.formatInBody(ref, 'narrative', 'ieee', fnIdx),
            CitationEngine.formatInBody(ref, 'narrative', 'vancouver', fnIdx),
          ];

          for (const v of variations) {
            if (v && v.length > 0 && content.includes(v)) {
              content = content.split(v).join(targetInBody);
              modified = true;
            }
          }

          // Transform bottom definitions / bibliography entries to the new style
          if (globalFootnoteMode) {
            const fnDef = CitationEngine.formatFootnoteDefinition(ref, style, fnIdx);
            const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:.*$`, 'm');
            if (fnDefRegex.test(content)) {
              const currentDef = content.match(fnDefRegex)?.[0];
              if (currentDef !== fnDef) {
                content = content.replace(fnDefRegex, fnDef);
                modified = true;
              }
            } else if (content.includes(`[^${key}]`) || modified) {
              // Check if un-prefixed line exists
              const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const plainRegex = new RegExp(`^.*${escapedTitle}.*$`, 'm');
              if (plainRegex.test(content)) {
                content = content.replace(plainRegex, fnDef);
                modified = true;
              }
            }
          } else {
            // Standard mode: update bottom reference line to un-prefixed target style
            const expectedBib = CitationEngine.formatBibliographyEntry(ref, style, fnIdx);
            const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:\\s*(.*)$`, 'm');
            if (fnDefRegex.test(content)) {
              content = content.replace(fnDefRegex, expectedBib);
              modified = true;
            } else if (ref.title && ref.title.length > 5 && content.includes(ref.title)) {
              const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const plainRegex = new RegExp(`^.*${escapedTitle}.*$`, 'm');
              const currentLine = content.match(plainRegex)?.[0];
              if (currentLine && currentLine.trim() !== expectedBib.trim()) {
                content = content.replace(plainRegex, expectedBib);
                modified = true;
              }
            }
          }
          fnIdx++;
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

      // Sanitization: Coalesce accidental adjacent bracket collisions for Markdown/PDF/Docs export
      if (style === 'ieee') {
        const adjacentBracketRegex = /\[(\d+(?:\s*,\s*\d+)*)\]\s*\[(\d+(?:\s*,\s*\d+)*)\]/g;
        while (adjacentBracketRegex.test(content)) {
          content = content.replace(adjacentBracketRegex, '[$1, $2]');
        }
      } else if (style === 'vancouver') {
        const adjacentParenRegex = /\((\d+(?:\s*,\s*\d+)*)\)\s*\((\d+(?:\s*,\s*\d+)*)\)/g;
        while (adjacentParenRegex.test(content)) {
          content = content.replace(adjacentParenRegex, '($1, $2)');
        }
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
