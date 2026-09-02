import { App, TFile, normalizePath } from 'obsidian';
import { 
  ProjectRecord, 
  ReferenceMetadata, 
  ProjectHealthStats, 
  CitationOccurrence, 
  CitationStyle, 
  InBodyFormat, 
  LintWarning,
  ALL_PROJECTS_ID 
} from './types';
import { CitationEngine } from './citationEngine';
import { LintEngine } from './lintEngine';
import { PDFScanner } from './indexing/pdfScanner';
import { MarkdownMasker } from './indexing/markdownMasker';
import { FormatPropagator } from './indexing/formatPropagator';
import { Logger } from './logger';

export class ProjectIndexer {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Static facade for PDF scanning
   */
  static extractDOIFromBuffer(buffer: ArrayBuffer): string | null {
    return PDFScanner.extractDOIFromBuffer(buffer);
  }

  /**
   * Static facade for markdown masking
   */
  static maskIgnoredMarkdown(content: string): string {
    return MarkdownMasker.maskIgnoredMarkdown(content);
  }

  /**
   * Retrieves all TFiles associated with a project
   */
  getProjectFiles(
    project: ProjectRecord | null, 
    referencesFolder: string = '.references',
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

  async deleteProjectGlobally(projectName: string, referencesFolder: string = '.references'): Promise<number> {
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
   * Scans project documents and computes ProjectHealthStats with full diagnostic rules
   */
  async indexProject(
    project: ProjectRecord,
    allReferences: Map<string, ReferenceMetadata>,
    referencesFolder: string = '.references',
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
        authorYearIndex.set(firstAuthor + '_' + y, key);
        if (ref.authors.length > 1) {
          const secondAuthor = ref.authors[1].split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          authorYearIndex.set(firstAuthor + '_' + secondAuthor + '_' + y, key);
        }
      }
      authorYearIndex.set(key.toLowerCase(), key);
    }

    const resolveAuthorYearKey = (authorStr: string, yearStr: string): string | null => {
      const y = yearStr.trim();
      const cleanAuthor = authorStr.replace(/\s+et\s+al\./i, '').trim().toLowerCase();
      const parts = cleanAuthor.split(/[\s,&]+/).filter(Boolean).map(p => p.replace(/[^a-z0-9]/g, ''));
      if (parts.length === 0) return null;
      if (parts.length === 1) return authorYearIndex.get(parts[0] + '_' + y) || null;
      return authorYearIndex.get(parts[0] + '_' + parts[1] + '_' + y) || authorYearIndex.get(parts[0] + '_' + y) || null;
    };

    for (const file of files) {
      try {
        const rawContent = await this.app.vault.cachedRead(file);
        const maskedContent = ProjectIndexer.maskIgnoredMarkdown(rawContent);
        const rawLines = rawContent.split('\n');
        const lines = maskedContent.split('\n');
        const inBodyKeysInFile = new Set<string>();

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

          // 1. Citekeys in bracket groups
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
                referenceUsageMap[key].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: displayLine });
              } else {
                const fuzzyMatch = LintEngine.findFuzzyRef(key, allReferences);
                if (fuzzyMatch) {
                  const isCaseMismatch = key.toLowerCase() === fuzzyMatch.citekey.toLowerCase();
                  if (isCaseMismatch) {
                    groupRefs.push(fuzzyMatch);
                    inBodyKeysInFile.add(fuzzyMatch.citekey.toLowerCase());
                    if (!referenceUsageMap[fuzzyMatch.citekey]) referenceUsageMap[fuzzyMatch.citekey] = [];
                    referenceUsageMap[fuzzyMatch.citekey].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: displayLine });
                  } else {
                    unresolvedCitations.push({ rawCitation: '@' + key, file: file.path, line: lineIdx + 1 });
                  }

                  const id = file.path + '::' + (lineIdx + 1) + '::@' + key + '::' + (isCaseMismatch ? 'case' : 'typo');
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: '@' + key,
                      citekey: key,
                      severity: isCaseMismatch ? 'info' : 'warning',
                      shortTitle: isCaseMismatch ? 'Citekey Capitalization Mismatch' : 'Possible Citekey Typo',
                      explanation: isCaseMismatch
                        ? 'Citekey "@' + key + '" has different capitalization than library entry "@' + fuzzyMatch.citekey + '".'
                        : 'Found "@' + key + '" which closely matches library entry "@' + fuzzyMatch.citekey + '".',
                      suggestedFix: '@' + fuzzyMatch.citekey,
                      fixOptions: [
                        { label: 'Fix ' + (isCaseMismatch ? 'Capitalization' : 'Typo') + ' -> @' + fuzzyMatch.citekey, action: 'replace', replacementText: '@' + fuzzyMatch.citekey },
                        { label: 'Dismiss', action: 'dismiss' }
                      ],
                      type: 'author_typo_fuzzy',
                      message: isCaseMismatch
                        ? 'Citekey @' + key + ' differs in case from @' + fuzzyMatch.citekey + '.'
                        : 'Possible typo in @' + key + '. Did you mean @' + fuzzyMatch.citekey + '?',
                    });
                  }
                } else {
                  const id = file.path + '::' + (lineIdx + 1) + '::@' + key + '::unresolved';
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: '@' + key,
                      citekey: key,
                      severity: 'error',
                      shortTitle: 'Unresolved Reference',
                      explanation: 'Citekey "@' + key + '" is not registered in your connected reference library.',
                      fixOptions: [
                        { label: '+ Create Reference Entry', action: 'create_entry' },
                        { label: 'Purge from Note', action: 'purge' },
                        { label: 'Dismiss', action: 'dismiss' }
                      ],
                      type: 'unresolved',
                      message: 'Citekey @' + key + ' is not registered in any connected reference library.',
                    });
                  }
                }
              }
            }

            if (groupRefs.length > 0) {
              if (isFootnoteMode) {
                const id = file.path + '::' + (lineIdx + 1) + '::' + rawGroup + '::format_mismatch';
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
                    severity: 'warning',
                    shortTitle: 'Footnote Mode Mismatch',
                    explanation: 'Citation should be in footnote format [^key] when Footnote Mode is enabled.',
                    fixOptions: [{ label: 'Convert to ' + expected, action: 'replace', replacementText: expected }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'format_mismatch',
                    message: 'Expected footnote citation in Footnote Mode.',
                  });
                }
              } else if (targetFormat !== 'citekey') {
                const expected = CitationEngine.formatMultiInBody(groupRefs, targetFormat, targetStyle);
                const id = file.path + '::' + (lineIdx + 1) + '::' + rawGroup + '::format_mismatch';
                if (!dismissed.has(id)) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: rawGroup,
                    suggestedFix: expected,
                    severity: 'warning',
                    shortTitle: 'Format Mismatch',
                    explanation: 'Citation format should match project format (' + targetFormat + ').',
                    fixOptions: [{ label: 'Convert to ' + expected, action: 'replace', replacementText: expected }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'format_mismatch',
                    message: 'Expected ' + targetFormat + ' citation for ' + rawGroup + '.',
                  });
                }
              } else if (groupRefs.length > 1) {
                const expected = CitationEngine.formatMultiInBody(groupRefs, 'citekey', targetStyle);
                if (rawGroup !== expected) {
                  const id = file.path + '::' + (lineIdx + 1) + '::' + rawGroup + '::compounded_order';
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: rawGroup,
                      suggestedFix: expected,
                      severity: 'info',
                      shortTitle: 'Unsorted Compounded Citation',
                      explanation: 'Citekeys in group ' + rawGroup + ' are not sorted alphabetically.',
                      fixOptions: [{ label: 'Re-order -> ' + expected, action: 'replace', replacementText: expected }, { label: 'Dismiss', action: 'dismiss' }],
                      type: 'compounded_order_mismatch',
                      message: 'Citekeys in compounded group should be sorted alphabetically: ' + expected,
                    });
                  }
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
              referenceUsageMap[key].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: displayLine });

              if (!isFootnoteMode) {
                const expected = CitationEngine.formatInBody(ref, targetFormat, targetStyle);
                const id = file.path + '::' + (lineIdx + 1) + '::[^' + key + ']::format_mismatch';
                if (!dismissed.has(id)) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: '[^' + key + ']',
                    citekey: key,
                    suggestedFix: expected,
                    severity: 'warning',
                    shortTitle: 'Footnote Callout in Standard Mode',
                    explanation: 'Footnote marker [^' + key + '] found while Footnote Mode is disabled.',
                    fixOptions: [{ label: 'Convert to ' + expected, action: 'replace', replacementText: expected }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'format_mismatch',
                    message: 'Expected ' + targetFormat + ' citation for [^' + key + '] (Footnote Mode is disabled).',
                  });
                }
              }
            } else {
              const fuzzyMatch = LintEngine.findFuzzyRef(key, allReferences);
              if (fuzzyMatch) {
                const isCaseMismatch = key.toLowerCase() === fuzzyMatch.citekey.toLowerCase();
                if (isCaseMismatch) {
                  inBodyKeysInFile.add(fuzzyMatch.citekey.toLowerCase());
                  if (!referenceUsageMap[fuzzyMatch.citekey]) referenceUsageMap[fuzzyMatch.citekey] = [];
                  referenceUsageMap[fuzzyMatch.citekey].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: displayLine });
                }

                const id = file.path + '::' + (lineIdx + 1) + '::[^' + key + ']::' + (isCaseMismatch ? 'case' : 'typo');
                if (!dismissed.has(id)) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: '[^' + key + ']',
                    citekey: key,
                    severity: isCaseMismatch ? 'info' : 'warning',
                    shortTitle: isCaseMismatch ? 'Footnote Capitalization Mismatch' : 'Possible Footnote Typo',
                    explanation: isCaseMismatch
                      ? 'Footnote marker [^' + key + '] has different capitalization than library entry [^' + fuzzyMatch.citekey + '].'
                      : 'Footnote marker [^' + key + '] closely matches library entry [^' + fuzzyMatch.citekey + '].',
                    suggestedFix: '[^' + fuzzyMatch.citekey + ']',
                    fixOptions: [{ label: 'Fix ' + (isCaseMismatch ? 'Capitalization' : 'Typo') + ' -> [^' + fuzzyMatch.citekey + ']', action: 'replace', replacementText: '[^' + fuzzyMatch.citekey + ']' }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'author_typo_fuzzy',
                    message: isCaseMismatch
                      ? 'Footnote marker [^' + key + '] differs in case from [^' + fuzzyMatch.citekey + '].'
                      : 'Possible typo in [^' + key + ']. Did you mean [^' + fuzzyMatch.citekey + ']?',
                  });
                }
              } else {
                const id = file.path + '::' + (lineIdx + 1) + '::[^' + key + ']::unresolved';
                if (!dismissed.has(id)) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: '[^' + key + ']',
                    citekey: key,
                    severity: 'error',
                    shortTitle: 'Unresolved Footnote Reference',
                    explanation: 'Footnote marker [^' + key + '] has no matching entry in your reference library.',
                    fixOptions: [{ label: '+ Create Reference Entry', action: 'create_entry' }, { label: 'Purge from Note', action: 'purge' }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'unresolved',
                    message: 'Reference [^' + key + '] not found in library.',
                  });
                }
              }
            }
          }

          // 3. Parenthetical Groups
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
                  referenceUsageMap[matchedKey].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: displayLine });
                }
              }
            }

            if (groupRefs.length > 0) {
              if (isFootnoteMode) {
                const id = file.path + '::' + (lineIdx + 1) + '::' + rawGroup + '::format_mismatch';
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
                    severity: 'warning',
                    shortTitle: 'Footnote Mode Mismatch',
                    explanation: 'Citation should be in footnote format [^key] when Footnote Mode is enabled.',
                    fixOptions: [{ label: 'Convert to ' + expected, action: 'replace', replacementText: expected }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'format_mismatch',
                    message: 'Expected footnote citation in Footnote Mode.',
                  });
                }
              } else if (targetFormat === 'citekey') {
                const id = file.path + '::' + (lineIdx + 1) + '::' + rawGroup + '::format_mismatch';
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
                    severity: 'warning',
                    shortTitle: 'Expected Citekey Format',
                    explanation: 'Citation group should be in citekey format [@key] for this project.',
                    fixOptions: [{ label: 'Convert to ' + expected, action: 'replace', replacementText: expected }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'format_mismatch',
                    message: 'Expected citekey format for ' + rawGroup + '.',
                  });
                }
              } else if (targetStyle === 'ieee' || targetStyle === 'vancouver') {
                const expected = CitationEngine.formatMultiInBody(groupRefs, targetFormat, targetStyle);
                const id = file.path + '::' + (lineIdx + 1) + '::' + rawGroup + '::format_mismatch';
                if (!dismissed.has(id) && rawGroup !== expected) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: rawGroup,
                    suggestedFix: expected,
                    severity: 'warning',
                    shortTitle: targetStyle.toUpperCase() + ' Style Mismatch',
                    explanation: 'Citation group should follow ' + targetStyle.toUpperCase() + ' formatting standard.',
                    fixOptions: [{ label: 'Convert to ' + expected, action: 'replace', replacementText: expected }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'format_mismatch',
                    message: 'Expected ' + targetStyle.toUpperCase() + ' format for ' + rawGroup + '.',
                  });
                }
              } else if (groupRefs.length > 1) {
                const expected = CitationEngine.formatMultiInBody(groupRefs, targetFormat, targetStyle);
                if (rawGroup !== expected) {
                  const id = file.path + '::' + (lineIdx + 1) + '::' + rawGroup + '::compounded_order';
                  if (!dismissed.has(id)) {
                    lintWarnings.push({
                      id,
                      filePath: file.path,
                      fileName: file.basename,
                      lineNumber: lineIdx + 1,
                      lineContent: displayLine,
                      rawCitation: rawGroup,
                      suggestedFix: expected,
                      severity: 'info',
                      shortTitle: 'Unsorted Compounded Citation',
                      explanation: 'Citations in group ' + rawGroup + ' are not sorted alphabetically by first author.',
                      fixOptions: [{ label: 'Re-order -> ' + expected, action: 'replace', replacementText: expected }, { label: 'Dismiss', action: 'dismiss' }],
                      type: 'compounded_order_mismatch',
                      message: 'Citations should be sorted alphabetically: ' + expected,
                    });
                  }
                }
              }
            }
          }

          // 4. Narrative Citations
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
              referenceUsageMap[matchedKey].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: displayLine });

              if (isFootnoteMode) {
                const id = file.path + '::' + (lineIdx + 1) + '::' + match[0] + '::format_mismatch';
                if (!dismissed.has(id)) {
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx + 1,
                    lineContent: displayLine,
                    rawCitation: match[0],
                    suggestedFix: '[^' + ref.citekey + ']',
                    severity: 'warning',
                    shortTitle: 'Narrative Citation in Footnote Mode',
                    explanation: 'Narrative citation "' + match[0] + '" should be converted to [^' + ref.citekey + '] in Footnote Mode.',
                    fixOptions: [{ label: 'Convert to [^' + ref.citekey + ']', action: 'replace', replacementText: '[^' + ref.citekey + ']' }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'format_mismatch',
                    message: 'Expected [^' + ref.citekey + '] in Footnote Mode.',
                  });
                }
              }
            }
          }

          // 5. Numeric in-body citations
          if (!isFootnoteMode && (targetStyle === 'ieee' || targetStyle === 'vancouver')) {
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
                referenceUsageMap[matchedKey].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: displayLine });
              }
            }

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
                  referenceUsageMap[matchedKey].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: displayLine });
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
          const currentDefText = defMatch[2]?.trim() || '';
          const ref = allReferences.get(key) || Array.from(allReferences.values()).find(r => 
            r.citekey.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
          );
          const isCitedInBody = inBodyKeysInFile.has(key.toLowerCase()) || (ref ? inBodyKeysInFile.has(ref.citekey.toLowerCase()) : false);

          if (ref) {
            if (!referenceUsageMap[ref.citekey] || referenceUsageMap[ref.citekey].length === 0) {
              if (!referenceUsageMap[ref.citekey]) referenceUsageMap[ref.citekey] = [];
              const lineIdx = rawLines.findIndex(l => l.includes('[^' + key + ']:'));
              referenceUsageMap[ref.citekey].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1, lineContent: currentDefLine });
              totalCitationsInFiles++;
            }

            if (!isCitedInBody) {
              const id = file.path + '::def::' + key + '::orphan_definition';
              if (!dismissed.has(id)) {
                const lineIdx = rawLines.findIndex(l => l.includes('[^' + key + ']:'));
                lintWarnings.push({
                  id,
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1,
                  lineContent: currentDefLine,
                  rawCitation: currentDefLine,
                  citekey: key,
                  definitionSnippet: currentDefText,
                  suggestedFix: '',
                  severity: 'warning',
                  shortTitle: 'Orphan Footnote Definition',
                  explanation: 'Footnote definition [^' + key + '] declared at bottom, but never cited in markdown body text.',
                  fixOptions: [{ label: 'Remove Orphan Definition', action: 'purge' }, { label: 'Dismiss', action: 'dismiss' }],
                  type: 'orphan_definition',
                  message: 'Footnote definition [^' + key + '] declared at bottom, but not cited in markdown body.',
                });
              }
            } else if (!isFootnoteMode) {
              const expectedBib = CitationEngine.formatBibliographyEntry(ref, targetStyle, footnoteIndex);
              const id = file.path + '::def::' + key + '::footnote_prefix_in_standard_mode';
              if (!dismissed.has(id)) {
                const lineIdx = rawLines.findIndex(l => l.includes('[^' + key + ']:'));
                lintWarnings.push({
                  id,
                  filePath: file.path,
                  fileName: file.basename,
                  lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1,
                  lineContent: currentDefLine,
                  rawCitation: currentDefLine,
                  citekey: key,
                  suggestedFix: expectedBib,
                  severity: 'warning',
                  shortTitle: 'Footnote Prefix in Standard Mode',
                  explanation: 'Footnote prefix [^' + key + ']: should be converted to standard un-prefixed ' + targetStyle.toUpperCase() + ' reference entry.',
                  fixOptions: [{ label: 'Convert to Standard Entry', action: 'replace', replacementText: expectedBib }, { label: 'Dismiss', action: 'dismiss' }],
                  type: 'format_mismatch',
                  message: 'Convert [^' + key + ']: stub to standard ' + targetStyle.toUpperCase() + ' reference entry.',
                });
              }
              footnoteIndex++;
            } else {
              const expectedDef = CitationEngine.formatFootnoteDefinition(ref, targetStyle, footnoteIndex);
              if (currentDefLine !== expectedDef) {
                const isTampered = currentDefText.length > 5 && !expectedDef.includes(currentDefText);
                const id = file.path + '::def::' + key + '::' + (isTampered ? 'tampered' : 'style') + '_mismatch';
                if (!dismissed.has(id)) {
                  const lineIdx = rawLines.findIndex(l => l.includes('[^' + key + ']:'));
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1,
                    lineContent: currentDefLine,
                    rawCitation: currentDefLine,
                    citekey: key,
                    suggestedFix: expectedDef,
                    severity: 'warning',
                    shortTitle: isTampered ? 'Tampered Footnote Text' : 'Definition Style Mismatch',
                    explanation: isTampered 
                      ? 'Footnote text was manually edited and differs from the canonical reference data.'
                      : 'Definition style does not match project standard (' + targetStyle.toUpperCase() + ').',
                    fixOptions: [{ label: 'Restore Canonical Definition', action: 'replace', replacementText: expectedDef }, { label: 'Dismiss', action: 'dismiss' }],
                    type: isTampered ? 'tampered_definition' : 'style_mismatch',
                    message: isTampered 
                      ? 'Footnote definition text differs from reference library data.'
                      : 'Definition style does not match bucket standard (' + targetStyle.toUpperCase() + ').',
                  });
                }
              }
              footnoteIndex++;
            }
          } else {
            const existingWarning = lintWarnings.find(w => w.filePath === file.path && (w.type === 'unresolved' || w.type === 'author_typo_fuzzy') && (w.citekey === key || w.rawCitation === '[^' + key + ']' || w.rawCitation === '[@' + key + ']'));
            if (existingWarning) {
              existingWarning.definitionSnippet = currentDefText;
            } else {
              const fuzzyMatch = LintEngine.findFuzzyRef(key, allReferences);
              if (fuzzyMatch) {
                const isCaseMismatch = key.toLowerCase() === fuzzyMatch.citekey.toLowerCase();
                const id = file.path + '::def::' + key + '::' + (isCaseMismatch ? 'case' : 'typo');
                if (!dismissed.has(id)) {
                  const lineIdx = rawLines.findIndex(l => l.includes('[^' + key + ']:'));
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1,
                    lineContent: currentDefLine,
                    rawCitation: currentDefLine,
                    citekey: key,
                    definitionSnippet: currentDefText,
                    suggestedFix: '[^' + fuzzyMatch.citekey + ']: ' + CitationEngine.formatFootnoteDefinition(fuzzyMatch, targetStyle, 1).replace(/^\[\^[^\\]]+\]:\s*/, ''),
                    severity: isCaseMismatch ? 'info' : 'warning',
                    shortTitle: isCaseMismatch ? 'Footnote Def Capitalization Mismatch' : 'Possible Footnote Def Typo',
                    explanation: isCaseMismatch
                      ? 'Footnote definition key [^' + key + '] has different capitalization than library entry [^' + fuzzyMatch.citekey + '].'
                      : 'Footnote definition key [^' + key + '] closely matches library reference [^' + fuzzyMatch.citekey + '].',
                    fixOptions: [{ label: 'Fix ' + (isCaseMismatch ? 'Capitalization' : 'Key') + ' -> [^' + fuzzyMatch.citekey + ']', action: 'replace', replacementText: '[^' + fuzzyMatch.citekey + ']: ' + currentDefText }, { label: 'Dismiss', action: 'dismiss' }],
                    type: 'author_typo_fuzzy',
                    message: isCaseMismatch
                      ? 'Footnote definition [^' + key + ']: differs in case from [^' + fuzzyMatch.citekey + '].'
                      : 'Possible typo in [^' + key + ']: definition. Did you mean [^' + fuzzyMatch.citekey + ']?',
                  });
                }
              } else {
                const id = file.path + '::def::' + key + '::unresolved';
                if (!dismissed.has(id)) {
                  const lineIdx = rawLines.findIndex(l => l.includes('[^' + key + ']:'));
                  lintWarnings.push({
                    id,
                    filePath: file.path,
                    fileName: file.basename,
                    lineNumber: lineIdx >= 0 ? lineIdx + 1 : 1,
                    lineContent: currentDefLine,
                    rawCitation: currentDefLine,
                    citekey: key,
                    definitionSnippet: currentDefText,
                    suggestedFix: '',
                    severity: 'error',
                    shortTitle: isCitedInBody ? 'Unresolved Footnote Definition' : 'Orphan Unresolved Definition',
                    explanation: isCitedInBody 
                      ? 'Footnote [^' + key + '] not found in reference library.'
                      : 'Footnote definition [^' + key + '] not in library and not cited in markdown body.',
                    fixOptions: [{ label: '+ Create Reference Entry', action: 'create_entry' }, { label: 'Purge from Note', action: 'purge' }, { label: 'Dismiss', action: 'dismiss' }],
                    type: isCitedInBody ? 'unresolved' : 'orphan_definition',
                    message: isCitedInBody 
                      ? 'Reference [^' + key + '] not found in library.'
                      : 'Footnote definition [^' + key + '] not in library and not cited in markdown body.',
                  });
                }
              }
            }
          }
        }

        // 5. Plain un-prefixed reference entries at document bottom
        for (const [key, ref] of allReferences.entries()) {
          const isCitedInBody = inBodyKeysInFile.has(key.toLowerCase()) || inBodyKeysInFile.has(ref.citekey.toLowerCase());
          const lineIdx = rawLines.findIndex(l => {
            const trimmed = l.trim();
            if (trimmed.startsWith('[^')) return false;
            if (ref.title && ref.title.length > 5 && trimmed.includes(ref.title)) return true;
            if (ref.doi && ref.doi.length > 5 && trimmed.includes(ref.doi)) return true;
            return false;
          });

          if (lineIdx >= 0) {
            const currentLine = rawLines[lineIdx].trim();
            if (!referenceUsageMap[key] || referenceUsageMap[key].length === 0) {
              if (!referenceUsageMap[key]) referenceUsageMap[key] = [];
              referenceUsageMap[key].push({ filePath: file.path, fileName: file.basename, lineNumber: lineIdx + 1, lineContent: currentLine });
              totalCitationsInFiles++;
            }

            if (!isCitedInBody) {
              const id = file.path + '::plain::' + key + '::orphan_definition';
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
                  suggestedFix: '',
                  severity: 'warning',
                  shortTitle: 'Orphan Plain Reference Line',
                  explanation: 'Plain reference line for "' + ref.citekey + '" declared at bottom, but never cited in body.',
                  fixOptions: [{ label: 'Remove Reference Line', action: 'purge' }, { label: 'Dismiss', action: 'dismiss' }],
                  type: 'orphan_definition',
                  message: 'Reference for "' + ref.citekey + '" declared at bottom, but not cited in markdown body.',
                });
              }
            } else if (isFootnoteMode) {
              const expectedDef = CitationEngine.formatFootnoteDefinition(ref, targetStyle, 1);
              const id = file.path + '::plain::' + key + '::missing_footnote_prefix';
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
                  severity: 'warning',
                  shortTitle: 'Missing Footnote Prefix',
                  explanation: 'Convert reference line to [^' + ref.citekey + ']: footnote definition in Footnote Mode.',
                  fixOptions: [{ label: 'Convert to [^' + ref.citekey + ']:', action: 'replace', replacementText: expectedDef }, { label: 'Dismiss', action: 'dismiss' }],
                  type: 'format_mismatch',
                  message: 'Convert reference line to [^' + ref.citekey + ']: footnote definition in Footnote Mode.',
                });
              }
            }
          }
        }
      } catch (err) {
        Logger.warn('Failed indexing file: ' + file.path, err);
      }
    }

    const relevantReferenceKeys = project.id === ALL_PROJECTS_ID 
      ? Array.from(allReferences.keys())
      : (project.referenceIds.length > 0 ? project.referenceIds : Array.from(allReferences.keys()));

    const totalReferences = relevantReferenceKeys.length;
    let usedReferencesCount = 0;
    let unusedReferencesCount = 0;

    for (const key of relevantReferenceKeys) {
      if (referenceUsageMap[key] && referenceUsageMap[key].length > 0) usedReferencesCount++;
      else unusedReferencesCount++;
    }

    const isAllProjects = (
      project.id === ALL_PROJECTS_ID || 
      project.id === '__ALL_PROJECTS__' || 
      project.id === '__ALL_REFERENCES__' || 
      project.name === 'All References' || 
      project.name === 'All Citations'
    );

    return {
      totalReferences,
      usedReferencesCount,
      unusedReferencesCount,
      totalCitationsInFiles,
      unresolvedCitations,
      referenceUsageMap,
      lintWarnings: isAllProjects ? [] : lintWarnings,
    };
  }

  canDelete(citekey: string, stats: ProjectHealthStats): { allowed: boolean; occurrences: CitationOccurrence[] } {
    const usages = stats.referenceUsageMap[citekey] || [];
    return {
      allowed: usages.length === 0,
      occurrences: usages,
    };
  }

  async syncReferenceUpdateAcrossDocuments(
    originalRef: ReferenceMetadata,
    updatedRef: ReferenceMetadata,
    project: ProjectRecord | null,
    style: CitationStyle = 'apa7',
    referencesFolder: string = '.references'
  ): Promise<{ modifiedFiles: number; timeMs: number }> {
    return FormatPropagator.syncReferenceUpdateAcrossDocuments(
      this.app,
      (p, r) => this.getProjectFiles(p, r),
      originalRef,
      updatedRef,
      project,
      style,
      referencesFolder
    );
  }

  async propagateFootnoteModeGlobally(
    enableFootnoteMode: boolean,
    allReferences: Map<string, ReferenceMetadata>,
    projects: ProjectRecord[],
    referencesFolder: string = '.references'
  ): Promise<{ updatedFilesCount: number }> {
    return FormatPropagator.propagateFootnoteModeGlobally(
      this.app,
      (p, r) => this.getProjectFiles(p, r),
      enableFootnoteMode,
      allReferences,
      projects,
      referencesFolder
    );
  }

  async propagateFormatChange(
    project: ProjectRecord,
    newFormat: InBodyFormat,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    referencesFolder: string = '.references',
    globalFootnoteMode: boolean = false
  ): Promise<number> {
    return FormatPropagator.propagateFormatChange(
      this.app,
      (p, r) => this.getProjectFiles(p, r),
      project,
      newFormat,
      allReferences,
      style,
      referencesFolder,
      globalFootnoteMode
    );
  }

  async syncFootnotesInRegisteredFiles(
    project: ProjectRecord,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    referencesFolder: string = '.references'
  ): Promise<{ updatedFilesCount: number; updatedFootnotesCount: number; removedFootnotesCount: number }> {
    return FormatPropagator.syncFootnotesInRegisteredFiles(
      this.app,
      (p, r) => this.getProjectFiles(p, r),
      project,
      allReferences,
      style,
      referencesFolder
    );
  }

  generateBibliography(
    project: ProjectRecord,
    allReferences: ReferenceMetadata[],
    style: CitationStyle = 'apa7',
    onlyCited: boolean = false,
    stats?: ProjectHealthStats
  ): string {
    return FormatPropagator.generateBibliography(project, allReferences, style, onlyCited, stats);
  }

  static cleanExportFrontmatter(content: string): string {
    return FormatPropagator.cleanExportFrontmatter(content);
  }

  static compileDocumentText(
    content: string,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    isFootnoteMode: boolean = false,
    indexMap: Map<string, number> = new Map(),
    cleanFootnotes: boolean = true
  ): string {
    return FormatPropagator.compileDocumentText(content, allReferences, style, isFootnoteMode, indexMap, cleanFootnotes);
  }

  async compileProjectCorpus(
    project: ProjectRecord,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    publicationFolder: string = 'publication',
    referencesFolder: string = '.references'
  ): Promise<{ compiledFilesCount: number; totalCitationsCount: number; bibliographyPath: string }> {
    return FormatPropagator.compileProjectCorpus(
      this.app,
      (p, r) => this.getProjectFiles(p, r),
      project,
      allReferences,
      style,
      publicationFolder,
      referencesFolder
    );
  }

}
