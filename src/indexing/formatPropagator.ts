import { normalizePath, type App, type TFile } from 'obsidian';
import { 
  ProjectRecord, 
  ReferenceMetadata, 
  CitationStyle, 
  InBodyFormat, 
  ProjectHealthStats,
  ALL_PROJECTS_ID 
} from '../types';
import { CitationEngine } from '../citationEngine';
import { Logger } from '../logger';

export class FormatPropagator {
  /**
   * Propagates reference updates across linked project documents
   */
  static async syncReferenceUpdateAcrossDocuments(
    app: App,
    getProjectFiles: (project: ProjectRecord | null, refFolder: string) => TFile[],
    originalRef: ReferenceMetadata,
    updatedRef: ReferenceMetadata,
    project: ProjectRecord | null,
    style: CitationStyle = 'apa7',
    referencesFolder: string = '.references'
  ): Promise<{ modifiedFiles: number; timeMs: number }> {
    const t0 = performance.now();
    let modifiedFiles = 0;

    const files = getProjectFiles(project, referencesFolder);

    const origKey = originalRef.citekey;
    const newKey = updatedRef.citekey;

    const origOldFootnote = CitationEngine.formatFootnoteDefinition(originalRef, style);
    const newFootnote = CitationEngine.formatFootnoteDefinition(updatedRef, style);

    const origParenthetical = CitationEngine.formatInBody(originalRef, 'parenthetical');
    const newParenthetical = CitationEngine.formatInBody(updatedRef, 'parenthetical');

    const origNarrative = CitationEngine.formatInBody(originalRef, 'narrative');
    const newNarrative = CitationEngine.formatInBody(updatedRef, 'narrative');

    for (const file of files) {
      try {
        let content = await app.vault.read(file);
        let modified = false;

        if (origKey !== newKey) {
          const atCitekeyRegex = new RegExp('@' + origKey + '\\b', 'g');
          if (atCitekeyRegex.test(content)) {
            content = content.replace(atCitekeyRegex, '@' + newKey);
            modified = true;
          }

          const footnoteCallRegex = new RegExp('\\[\\^' + origKey + '\\](?!:)', 'g');
          if (footnoteCallRegex.test(content)) {
            content = content.replace(footnoteCallRegex, '[^' + newKey + ']');
            modified = true;
          }

          const footnoteDefRegex = new RegExp('^\\[\\^' + origKey + '\\]:.*$', 'gm');
          if (footnoteDefRegex.test(content)) {
            content = content.replace(footnoteDefRegex, newFootnote);
            modified = true;
          }
        }

        if (origOldFootnote !== newFootnote) {
          const footnoteDefRegex = new RegExp('^\\[\\^' + newKey + '\\]:.*$', 'gm');
          if (footnoteDefRegex.test(content)) {
            content = content.replace(footnoteDefRegex, newFootnote);
            modified = true;
          }
        }

        if (origParenthetical !== newParenthetical && content.includes(origParenthetical)) {
          content = content.split(origParenthetical).join(newParenthetical);
          modified = true;
        }

        if (origNarrative !== newNarrative && content.includes(origNarrative)) {
          content = content.split(origNarrative).join(newNarrative);
          modified = true;
        }

        if (modified) {
          await app.vault.modify(file, content);
          modifiedFiles++;
        }
      } catch (err) {
        Logger.warn('Failed syncing update to file: ' + file.path, err);
      }
    }

    const elapsed = Math.round(performance.now() - t0);
    return { modifiedFiles, timeMs: elapsed };
  }

  /**
   * Propagates global Footnote Mode changes across all registered files
   */
  static async propagateFootnoteModeGlobally(
    app: App,
    getProjectFiles: (project: ProjectRecord | null, refFolder: string) => TFile[],
    enableFootnoteMode: boolean,
    allReferences: Map<string, ReferenceMetadata>,
    projects: ProjectRecord[],
    referencesFolder: string = '.references'
  ): Promise<{ updatedFilesCount: number }> {
    let totalUpdated = 0;
    for (const proj of projects) {
      const files = getProjectFiles(proj, referencesFolder);
      const style = proj.citationStyle || 'apa7';
      const targetFormat: InBodyFormat = (proj.inBodyFormat === ('footnote' as any) || !proj.inBodyFormat)
        ? 'parenthetical'
        : (proj.inBodyFormat as InBodyFormat);

      for (const file of files) {
        try {
          let content = await app.vault.read(file);
          let modified = false;

          let fnIdx = 1;
          for (const [key, ref] of allReferences.entries()) {
            const targetInBody = enableFootnoteMode 
              ? ('[^' + key + ']') 
              : CitationEngine.formatInBody(ref, targetFormat, style, fnIdx);

            // 1. Citekey format [@key]
            const citekeyRegex = new RegExp('\\[@' + key + '\\]', 'g');
            if (citekeyRegex.test(content)) {
              content = content.replace(citekeyRegex, targetInBody);
              modified = true;
            }

            // 2. Footnote call [^key]
            const footnoteCallRegex = new RegExp('\\[\\^' + key + '\\](?!:)', 'g');
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
              const fnDefRegex = new RegExp('^\\s*\\[\\^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]:.*$', 'm');
              if (fnDefRegex.test(content)) {
                const currentDef = content.match(fnDefRegex)?.[0];
                if (currentDef !== expectedDef) {
                  content = content.replace(fnDefRegex, expectedDef);
                  modified = true;
                }
              } else if (ref.title && ref.title.length > 5 && content.includes(ref.title)) {
                const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const plainRegex = new RegExp('^.*' + escapedTitle + '.*$', 'm');
                content = content.replace(plainRegex, expectedDef);
                modified = true;
              }
            } else {
              const expectedBib = CitationEngine.formatBibliographyEntry(ref, style, fnIdx);
              const fnDefRegex = new RegExp('^\\s*\\[\\^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]:\\s*(.*)$', 'm');
              if (fnDefRegex.test(content)) {
                content = content.replace(fnDefRegex, expectedBib);
                modified = true;
              } else if (ref.title && ref.title.length > 5 && content.includes(ref.title)) {
                const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const plainRegex = new RegExp('^.*' + escapedTitle + '.*$', 'm');
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
            await app.vault.modify(file, content);
            totalUpdated++;
          }
        } catch (err) {
          Logger.warn('Failed propagating footnote mode for ' + file.path + ':', err);
        }
      }
    }
    return { updatedFilesCount: totalUpdated };
  }

  /**
   * Propagates in-text format change across project documents
   */
  static async propagateFormatChange(
    app: App,
    getProjectFiles: (project: ProjectRecord | null, refFolder: string) => TFile[],
    project: ProjectRecord,
    newFormat: InBodyFormat,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    referencesFolder: string = '.references',
    globalFootnoteMode: boolean = false
  ): Promise<number> {
    const files = getProjectFiles(project, referencesFolder);
    let modifiedFiles = 0;

    for (const file of files) {
      try {
        let content = await app.vault.read(file);
        let modified = false;
        let fnIdx = 1;

        for (const [key, ref] of allReferences.entries()) {
          const targetInBody = globalFootnoteMode ? ('[^' + key + ']') : CitationEngine.formatInBody(ref, newFormat, style, fnIdx);

          // 1. Citekey format [@key]
          const citekeyRegex = new RegExp('\\[@' + key + '\\]', 'g');
          if (citekeyRegex.test(content)) {
            content = content.replace(citekeyRegex, targetInBody);
            modified = true;
          }

          // 2. Footnote call [^key]
          const footnoteCallRegex = new RegExp('\\[\\^' + key + '\\](?!:)', 'g');
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
            const fnDefRegex = new RegExp('^\\s*\\[\\^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]:.*$', 'm');
            if (fnDefRegex.test(content)) {
              const currentDef = content.match(fnDefRegex)?.[0];
              if (currentDef !== fnDef) {
                content = content.replace(fnDefRegex, fnDef);
                modified = true;
              }
            } else if (content.includes('[^' + key + ']') || modified) {
              const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const plainRegex = new RegExp('^.*' + escapedTitle + '.*$', 'm');
              if (plainRegex.test(content)) {
                content = content.replace(plainRegex, fnDef);
                modified = true;
              }
            }
          } else {
            const expectedBib = CitationEngine.formatBibliographyEntry(ref, style, fnIdx);
            const fnDefRegex = new RegExp('^\\s*\\[\\^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]:\\s*(.*)$', 'm');
            if (fnDefRegex.test(content)) {
              content = content.replace(fnDefRegex, expectedBib);
              modified = true;
            } else if (ref.title && ref.title.length > 5 && content.includes(ref.title)) {
              const escapedTitle = ref.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const plainRegex = new RegExp('^.*' + escapedTitle + '.*$', 'm');
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
          await app.vault.modify(file, content);
          modifiedFiles++;
        }
      } catch (err) {
        Logger.warn('Failed propagating format change to file: ' + file.path, err);
      }
    }

    return modifiedFiles;
  }

  /**
   * Syncs and transforms footnote definitions at the bottom of all project files
   */
  static async syncFootnotesInRegisteredFiles(
    app: App,
    getProjectFiles: (project: ProjectRecord | null, refFolder: string) => TFile[],
    project: ProjectRecord,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    referencesFolder: string = '.references'
  ): Promise<{ updatedFilesCount: number; updatedFootnotesCount: number; removedFootnotesCount: number }> {
    const files = getProjectFiles(project, referencesFolder);
    let updatedFilesCount = 0;
    let updatedFootnotesCount = 0;
    let removedFootnotesCount = 0;

    const footnoteCallRegex = /\[\^([a-zA-Z0-9_:\.-]+)\](?!:)/g;
    const existingDefRegex = /^\s*\[\^([a-zA-Z0-9_:\.-]+)\]:.*$/gm;

    for (const file of files) {
      try {
        let content = await app.vault.read(file);
        let modified = false;

        const keysInFile = new Set<string>();

        let match: RegExpExecArray | null;
        footnoteCallRegex.lastIndex = 0;
        while ((match = footnoteCallRegex.exec(content)) !== null) {
          keysInFile.add(match[1]);
        }

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
            const fnDefRegex = new RegExp('^\\s*\\[\\^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]:.*$', 'm');

            if (fnDefRegex.test(content)) {
              const currentDef = content.match(fnDefRegex)?.[0];
              if (currentDef !== fnDef) {
                content = content.replace(fnDefRegex, fnDef);
                modified = true;
                updatedFootnotesCount++;
              }
            } else if (project.enableFootnoteMode) {
              content = content.trimEnd() + '\n\n' + fnDef + '\n';
              modified = true;
              updatedFootnotesCount++;
            }
            fnIndex++;
          }
        }

        if (modified) {
          await app.vault.modify(file, content);
          updatedFilesCount++;
        }
      } catch (err) {
        Logger.warn('Failed syncing footnotes for ' + file.path + ':', err);
      }
    }

    return { updatedFilesCount, updatedFootnotesCount, removedFootnotesCount };
  }

  /**
   * Generates formatted Bibliography for a project
   */
  static generateBibliography(
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

    return CitationEngine.generateBibliography(refsToInclude, style);
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

  /**
   * Batch compiles all files in a project for Global Scope publication.
   * Unifies sequential indexing (e.g. IEEE [1..N], Vancouver (1..N)) across all documents
   * and exports both compiled notes and a master bibliography to the configured publication folder.
   */
  /**
   * Universal document compiler that transforms all source citation formats (citekeys, footnotes, parentheticals, numerics)
   * into the target citation standard, respecting Footnote Mode authority and coalescing overloaded/compounded references.
   */
  static compileDocumentText(
    content: string,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    isFootnoteMode: boolean = false,
    indexMap: Map<string, number> = new Map(),
    cleanFootnotes: boolean = true
  ): string {
    let result = content;

    // 1. Resolve Pandoc Citekey Groups (e.g. [@Smith2020; @Jones2021] or [@Smith2020])
    const bracketGroupRegex = /\[([^\]]*@[\p{L}\p{N}_:.\-]+[^\]]*)\]/gu;
    const singleCitekeyRegex = /@([\p{L}\p{N}_:.\-]+)/gu;

    result = result.replace(bracketGroupRegex, (fullMatch, groupInner) => {
      const keysInGroup: string[] = [];
      let kMatch: RegExpExecArray | null;
      singleCitekeyRegex.lastIndex = 0;
      while ((kMatch = singleCitekeyRegex.exec(groupInner)) !== null) {
        keysInGroup.push(kMatch[1]);
      }

      if (keysInGroup.length === 0) return fullMatch;

      const refsInGroup = keysInGroup.map(k => allReferences.get(k)).filter(Boolean) as ReferenceMetadata[];
      if (refsInGroup.length === 0) return fullMatch;

      if (isFootnoteMode) {
        return refsInGroup.map(r => `[^${r.citekey}]`).join('');
      }

      if (style === 'ieee') {
        const numbers = keysInGroup.map(k => indexMap.get(k)).filter(n => n !== undefined) as number[];
        numbers.sort((a, b) => a - b);
        return numbers.length > 0 ? `[${Array.from(new Set(numbers)).join(', ')}]` : fullMatch;
      } else if (style === 'vancouver') {
        const numbers = keysInGroup.map(k => indexMap.get(k)).filter(n => n !== undefined) as number[];
        numbers.sort((a, b) => a - b);
        return numbers.length > 0 ? `(${Array.from(new Set(numbers)).join(', ')})` : fullMatch;
      } else {
        return CitationEngine.formatMultiInBody(refsInGroup, 'parenthetical', style);
      }
    });

    // 2. Resolve Multi-Citation / Single-Citation Parentheticals (e.g. (Smith, 2020; Jones, 2021))
    const parenGroupRegex = /\(([^)]*(?:19\d{2}|20\d{2})[^)]*)\)/gu;
    result = result.replace(parenGroupRegex, (fullMatch, groupInner) => {
      const entries = groupInner.split(';').map(s => s.trim()).filter(Boolean);
      const matchedRefs: ReferenceMetadata[] = [];

      for (const entry of entries) {
        const yearMatch = entry.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
          const year = yearMatch[1];
          const authorPart = entry.slice(0, entry.indexOf(year)).replace(/[,:\(\)]/g, '').trim().toLowerCase();
          const parts = authorPart.split(/[\s,&]+/).filter(Boolean).map(p => p.replace(/[^a-z0-9]/g, ''));
          for (const r of allReferences.values()) {
            if (r.year && String(r.year) === year && r.authors && r.authors.length > 0) {
              const firstAuthor = r.authors[0].split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
              if (parts.includes(firstAuthor) && !matchedRefs.some(ex => ex.citekey === r.citekey)) {
                matchedRefs.push(r);
                break;
              }
            }
          }
        }
      }

      if (matchedRefs.length === 0) return fullMatch;

      if (isFootnoteMode) {
        return matchedRefs.map(r => `[^${r.citekey}]`).join('');
      }

      if (style === 'ieee') {
        const numbers = matchedRefs.map(r => indexMap.get(r.citekey)).filter(n => n !== undefined) as number[];
        numbers.sort((a, b) => a - b);
        return numbers.length > 0 ? `[${Array.from(new Set(numbers)).join(', ')}]` : fullMatch;
      } else if (style === 'vancouver') {
        const numbers = matchedRefs.map(r => indexMap.get(r.citekey)).filter(n => n !== undefined) as number[];
        numbers.sort((a, b) => a - b);
        return numbers.length > 0 ? `(${Array.from(new Set(numbers)).join(', ')})` : fullMatch;
      } else {
        return CitationEngine.formatMultiInBody(matchedRefs, 'parenthetical', style);
      }
    });

    // 3. Resolve Narrative Citations: Author (Year) -> Author [1] / Author (1) / Author [^key]
    const narrativeRegex = /\b([\p{Lu}][\p{L}\s&]+(?:\s+et\s+al\.)?)\s+\((19\d{2}|20\d{2})\)/gu;
    result = result.replace(narrativeRegex, (fullMatch, authorStr, yearStr) => {
      const cleanAuthor = authorStr.replace(/\s+et\s+al\./i, '').trim().toLowerCase();
      const parts = cleanAuthor.split(/[\s,&]+/).filter(Boolean).map((p: string) => p.replace(/[^a-z0-9]/g, ''));
      
      let matchedRef: ReferenceMetadata | null = null;
      for (const r of allReferences.values()) {
        if (r.year && String(r.year) === yearStr && r.authors && r.authors.length > 0) {
          const firstAuthor = r.authors[0].split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (parts.includes(firstAuthor)) {
            matchedRef = r;
            break;
          }
        }
      }

      if (!matchedRef) return fullMatch;

      const idx = indexMap.get(matchedRef.citekey) || 1;
      if (isFootnoteMode) {
        return `${authorStr} [^${matchedRef.citekey}]`;
      } else if (style === 'ieee') {
        return `${authorStr} [${idx}]`;
      } else if (style === 'vancouver') {
        return `${authorStr} (${idx})`;
      } else {
        return `${authorStr} (${yearStr})`;
      }
    });

    // 4. Resolve Individual Footnote Callouts [^key] and Definitions
    const citedKeysInDoc: string[] = [];

    for (const [key, ref] of allReferences.entries()) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const globalIdx = indexMap.get(key) || 1;
      let inBodyFormatted = "";
      if (isFootnoteMode) {
        inBodyFormatted = `[^${key}]`;
      } else if (style === 'ieee') {
        inBodyFormatted = `[${globalIdx}]`;
      } else if (style === 'vancouver') {
        inBodyFormatted = `(${globalIdx})`;
      } else {
        inBodyFormatted = CitationEngine.formatInBody(ref, 'parenthetical', style);
      }

      const footnoteCallRegex = new RegExp(`\\[\\^${escapedKey}\\](?!:)`, 'g');
      if (footnoteCallRegex.test(result)) {
        citedKeysInDoc.push(key);
      }
      result = result.replace(footnoteCallRegex, inBodyFormatted);

      if (!isFootnoteMode && cleanFootnotes) {
        const fnCleanRegex = new RegExp(`^\\s*\\[\\^${escapedKey}\\]:.*$\\n?`, 'gm');
        result = result.replace(fnCleanRegex, "");
      } else if (isFootnoteMode) {
        const expectedDef = CitationEngine.formatFootnoteDefinition(ref, style, globalIdx);
        const fnDefRegex = new RegExp(`^\\s*\\[\\^${escapedKey}\\]:.*$`, 'm');
        if (fnDefRegex.test(result)) {
          result = result.replace(fnDefRegex, expectedDef);
        } else if (citedKeysInDoc.includes(key)) {
          // Append missing footnote definition
          result = result.trimEnd() + '\n\n' + expectedDef + '\n';
        }
      }
    }

    // 5. Overloaded Adjacent Citation Coalescing across all standards
    if (!isFootnoteMode) {
      if (style === 'ieee') {
        // Coalesce [1][2] or [1] [2] or [1, 2][3] -> [1, 2, 3]
        const adjacentBracketRegex = /\[(\d+(?:\s*,\s*\d+)*)\](?:\s*\[(\d+(?:\s*,\s*\d+)*)\])+/g;
        result = result.replace(adjacentBracketRegex, (match) => {
          const numMatches = match.match(/\d+/g) || [];
          const numbers = Array.from(new Set(numMatches.map(n => parseInt(n)))).sort((a, b) => a - b);
          return `[${numbers.join(', ')}]`;
        });
      } else if (style === 'vancouver') {
        // Coalesce (1)(2) or (1) (2) or (1, 2)(3) -> (1, 2, 3)
        const adjacentParenRegex = /\((\d+(?:\s*,\s*\d+)*)\)(?:\s*\((\d+(?:\s*,\s*\d+)*)\))+/g;
        result = result.replace(adjacentParenRegex, (match) => {
          const numMatches = match.match(/\d+/g) || [];
          const numbers = Array.from(new Set(numMatches.map(n => parseInt(n)))).sort((a, b) => a - b);
          return `(${numbers.join(', ')})`;
        });
      } else {
        // Author-Date Parenthetical Coalescing: (Smith, 2020)(Jones, 2021) -> (Jones, 2021; Smith, 2020)
        const adjacentAuthorDateRegex = /\(([^)]*(?:19\d{2}|20\d{2})[^)]*)\)(?:\s*\(([^)]*(?:19\d{2}|20\d{2})[^)]*)\))+/g;
        result = result.replace(adjacentAuthorDateRegex, (match) => {
          const innerMatches = Array.from(match.matchAll(/\(([^)]+)\)/g)).map(m => m[1]);
          const allEntries = innerMatches.flatMap(s => s.split(';').map(e => e.trim())).filter(Boolean);
          const uniqueEntries = Array.from(new Set(allEntries));
          uniqueEntries.sort((a, b) => {
            const nameA = a.replace(/^\(/, '').trim();
            const nameB = b.replace(/^\(/, '').trim();
            return nameA.localeCompare(nameB);
          });
          return `(${uniqueEntries.join('; ')})`;
        });
      }
    } else {
      // Footnote Mode Adjacent Coalescing: [^1] [^2] -> [^1][^2]
      result = result.replace(/(\[\^[^\s\]]+\])\s+(\[\^[^\s\]]+\])/g, '$1$2');
    }

    result = result.replace(/\n{3,}$/, "\n\n");
    return result;
  }

  /**
   * Batch compiles all files in a project for Global Scope publication.
   * Unifies sequential indexing (e.g. IEEE [1..N], Vancouver (1..N)) across all documents
   * and exports both compiled notes and a master bibliography to the configured publication folder.
   */
  static async compileProjectCorpus(
    app: App,
    getProjectFiles: (project: ProjectRecord | null, refFolder: string) => TFile[],
    project: ProjectRecord,
    allReferences: Map<string, ReferenceMetadata>,
    style: CitationStyle = 'apa7',
    publicationFolder: string = 'publication',
    referencesFolder: string = '.references'
  ): Promise<{ compiledFilesCount: number; totalCitationsCount: number; bibliographyPath: string }> {
    const files = getProjectFiles(project, referencesFolder);
    const pubDir = normalizePath(publicationFolder || 'publication');

    // Ensure publication output folder exists
    if (!(await app.vault.adapter.exists(pubDir))) {
      await app.vault.adapter.mkdir(pubDir);
    }

    const isFootnoteMode = !!project.enableFootnoteMode;

    // 1. Build Global Reference Order across all project files
    const globalCitekeyOrder: string[] = [];
    const fileContents: Map<string, string> = new Map();

    for (const file of files) {
      try {
        const content = await app.vault.read(file);
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
      const refObjs = globalCitekeyOrder.map(k => allReferences.get(k)).filter(Boolean) as ReferenceMetadata[];
      const sorted = CitationEngine.sortReferences(refObjs, style);
      globalCitekeyOrder.splice(0, globalCitekeyOrder.length, ...sorted.map(r => r.citekey));
    }

    // Create Global Index Map
    const globalIndexMap = new Map<string, number>();
    globalCitekeyOrder.forEach((key, idx) => {
      globalIndexMap.set(key, idx + 1);
    });

    let compiledFilesCount = 0;

    // 2. Batch Compile and write every file into publication folder
    for (const file of files) {
      let content = fileContents.get(file.path);
      if (content === undefined) continue;

      let compiled = FormatPropagator.compileDocumentText(
        content,
        allReferences,
        style,
        isFootnoteMode,
        globalIndexMap,
        true
      );

      // Strip citation manager frontmatter from exported publication note
      compiled = FormatPropagator.cleanExportFrontmatter(compiled);

      // Write compiled file to publication folder
      const targetOutPath = normalizePath(`${pubDir}/${file.name}`);
      await app.vault.adapter.write(targetOutPath, compiled);
      compiledFilesCount++;
    }

    // 3. Generate Master Global Bibliography file
    const targetRefs = globalCitekeyOrder.map(k => allReferences.get(k)!).filter(Boolean);
    const bibText = CitationEngine.generateBibliography(targetRefs, style, `References - ${project.name}`);
    const bibFilePath = normalizePath(`${pubDir}/References - ${project.name}.md`);
    await app.vault.adapter.write(bibFilePath, bibText);

    return {
      compiledFilesCount,
      totalCitationsCount: globalCitekeyOrder.length,
      bibliographyPath: bibFilePath
    };
  }
}
