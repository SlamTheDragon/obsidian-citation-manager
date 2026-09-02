import type { App, TFile } from 'obsidian';
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
}
