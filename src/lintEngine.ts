import type { App, TFile } from 'obsidian';
import { 
  ReferenceMetadata, 
  ProjectRecord, 
  CitationStyle, 
  InBodyFormat, 
  LintWarning, 
  LintSeverity, 
  LintWarningType, 
  LintFixOption 
} from './types';
import { CitationEngine } from './citationEngine';
import { Logger } from './logger';

export class LintEngine {
  /**
   * Calculates Levenshtein edit distance between two strings
   */
  static levenshteinDistance(s1: string, s2: string): number {
    const a = s1.toLowerCase();
    const b = s2.toLowerCase();
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Finds nearest library citekey with edit distance <= 2
   */
  static findFuzzyRef(queryKey: string, allReferences: Map<string, ReferenceMetadata>): ReferenceMetadata | null {
    const cleanQuery = queryKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    let candidate: ReferenceMetadata | null = null;
    let minDistance = 3;

    for (const ref of allReferences.values()) {
      const cleanRefKey = ref.citekey.toLowerCase().replace(/[^a-z0-9]/g, '');
      const dist = LintEngine.levenshteinDistance(cleanQuery, cleanRefKey);
      if (dist > 0 && dist < minDistance) {
        minDistance = dist;
        candidate = ref;
      }
    }
    return candidate;
  }

  /**
   * Applies an individual lint warning fix or remediation
   */
  static async applyLintFix(app: App, warning: LintWarning, chosenFix?: LintFixOption): Promise<boolean> {
    const fileObj = app.vault.getAbstractFileByPath(warning.filePath);
    if (!fileObj || !(fileObj as any).path) return false;

    let content = await app.vault.read(fileObj as any);
    const action = chosenFix?.action || (warning.suggestedFix !== undefined ? 'replace' : 'purge');
    const replacement = chosenFix?.replacementText !== undefined ? chosenFix.replacementText : (warning.suggestedFix || '');

    let modified = false;

    if (action === 'replace' && warning.rawCitation) {
      if (content.includes(warning.rawCitation)) {
        content = content.replace(warning.rawCitation, replacement);
        modified = true;
      }
    } else if (action === 'purge') {
      const key = (warning.citekey || warning.rawCitation.replace(/^[\[\^]?|\]:?.*$/g, '').replace(/^@/, '')).trim();
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // 1. Remove in-body occurrences
      content = content.replace(new RegExp('\\[\\^' + escapedKey + '\\](?!:)', 'g'), '');
      content = content.replace(new RegExp('\\[@' + escapedKey + '\\]', 'g'), '');

      // 2. Remove footnote definition line (including indented lines)
      const fnDefRegex = new RegExp('^\\s*\\[\\^' + escapedKey + '\\]:.*$(\\r?\\n[ \\t]+.*$)*\\r?\\n?', 'gm');
      content = content.replace(fnDefRegex, '');

      // 3. Remove plain rawCitation if present
      if (warning.rawCitation && warning.rawCitation.length > 5) {
        const escapedRaw = warning.rawCitation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp('^.*' + escapedRaw + '.*$\\r?\\n?', 'gm'), '');
      }
      modified = true;
    }

    if (modified) {
      await app.vault.modify(fileObj as any, content);
      return true;
    }
    return false;
  }

  /**
   * Batch applies multiple selected lint fixes
   */
  static async batchApplyFixes(app: App, warnings: LintWarning[]): Promise<number> {
    const fileMap = new Map<string, LintWarning[]>();
    for (const w of warnings) {
      if (!fileMap.has(w.filePath)) fileMap.set(w.filePath, []);
      fileMap.get(w.filePath)!.push(w);
    }

    let modifiedFilesCount = 0;

    for (const [filePath, fileWarnings] of fileMap.entries()) {
      const fileObj = app.vault.getAbstractFileByPath(filePath);
      if (fileObj && (fileObj as any).path) {
        try {
          let content = await app.vault.read(fileObj as any);
          let modified = false;

          for (const w of fileWarnings) {
            if (w.suggestedFix !== undefined && w.rawCitation && content.includes(w.rawCitation)) {
              content = content.replace(w.rawCitation, w.suggestedFix);
              modified = true;
            } else if (w.type === 'orphan_definition' && w.rawCitation) {
              const escapedRaw = w.rawCitation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              content = content.replace(new RegExp('^.*' + escapedRaw + '.*$\\r?\\n?', 'gm'), '');
              modified = true;
            }
          }

          if (modified) {
            await app.vault.modify(fileObj as any, content);
            modifiedFilesCount++;
          }
        } catch (err) {
          Logger.warn('Failed batch applying fixes for ' + filePath + ':', err);
        }
      }
    }
    return modifiedFilesCount;
  }
}
