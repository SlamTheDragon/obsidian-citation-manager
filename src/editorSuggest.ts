import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import CitationManagerPlugin from './main';
import { ReferenceMetadata, InBodyFormat } from './types';
import { CitationEngine } from './citationEngine';

export class CitationEditorSuggest extends EditorSuggest<ReferenceMetadata> {
  private plugin: CitationManagerPlugin;

  constructor(app: App, plugin: CitationManagerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    if (!this.plugin.settings.enableEditorSuggest) return null;

    const line = editor.getLine(cursor.line);
    const beforeCursor = line.slice(0, cursor.ch);

    // Trigger on [@query or \cite{query or ((query
    const match = beforeCursor.match(/(?:\[@|\\cite\{|\(\()([a-zA-Z0-9_\s-]*)$/);
    if (!match) return null;

    return {
      start: { line: cursor.line, ch: cursor.ch - match[0].length },
      end: cursor,
      query: match[1],
    };
  }

  async getSuggestions(context: EditorSuggestContext): Promise<ReferenceMetadata[]> {
    const refsMap = await this.plugin.storageManager.loadAllReferences();
    const allRefs = Array.from(refsMap.values());
    const query = context.query.toLowerCase().trim();

    if (!query) return allRefs.slice(0, 15);

    return allRefs.filter(r => {
      const citekey = r.citekey.toLowerCase();
      const title = r.title.toLowerCase();
      const authors = (r.authors || []).join(" ").toLowerCase();
      const year = String(r.year || "");
      return citekey.includes(query) || title.includes(query) || authors.includes(query) || year.includes(query);
    }).slice(0, 15);
  }

  renderSuggestion(ref: ReferenceMetadata, el: HTMLElement): void {
    el.empty();
    el.addClass("citation-suggest-item");

    const header = el.createDiv({ cls: "citation-suggest-header" });
    header.createEl("span", { cls: "citation-suggest-key", text: `[${ref.citekey}]` });
    header.createEl("span", { cls: "citation-suggest-type", text: ref.type.toUpperCase() });
    header.createEl("span", { cls: "citation-suggest-year", text: `(${ref.year})` });

    el.createDiv({ cls: "citation-suggest-title", text: ref.title });
    el.createDiv({ cls: "citation-suggest-authors", text: (ref.authors || []).join(", ") });
  }

  selectSuggestion(ref: ReferenceMetadata, evt: MouseEvent | KeyboardEvent): void {
    if (!this.context) return;
    const editor = this.context.editor;
    const project = this.plugin.getActiveProject();
    const isFootnote = Boolean(this.plugin.settings.enableFootnoteMode) || project?.inBodyFormat === ('footnote' as any);
    const style = project?.citationStyle || this.plugin.settings.defaultCitationStyle || 'apa7';
    const format: InBodyFormat = isFootnote
      ? ('footnote' as any)
      : (project?.inBodyFormat || this.plugin.settings.defaultInBodyFormat || 'parenthetical');

    const inBodyText = isFootnote 
      ? `[^${ref.citekey}]` 
      : CitationEngine.formatInBody(ref, format, style);

    // Cleanly consume any auto-paired trailing closing bracket/brace
    const line = editor.getLine(this.context.end.line);
    const afterCursor = line.slice(this.context.end.ch);
    let endPos = this.context.end;

    if (afterCursor.startsWith(']')) {
      endPos = { line: this.context.end.line, ch: this.context.end.ch + 1 };
    } else if (afterCursor.startsWith('}')) {
      endPos = { line: this.context.end.line, ch: this.context.end.ch + 1 };
    } else if (afterCursor.startsWith('))')) {
      endPos = { line: this.context.end.line, ch: this.context.end.ch + 2 };
    }

    editor.replaceRange(inBodyText, this.context.start, endPos);

    if (isFootnote) {
      const docText = editor.getValue();
      const existingFnMatches = docText.match(/^\[\^[^\]]+\]:/gm) || [];
      const footnoteIndex = existingFnMatches.length + 1;
      const fnDefRegex = new RegExp(`^\\[\\^${ref.citekey}\\]:`, 'm');
      if (!fnDefRegex.test(docText)) {
        const fnDefinition = CitationEngine.formatFootnoteDefinition(
          ref,
          style,
          footnoteIndex
        );
        const hasTrailingNewline = docText.endsWith("\n");
        const separator = hasTrailingNewline ? "\n" : "\n\n";
        editor.replaceRange(`${separator}${fnDefinition}\n`, { line: editor.lineCount(), ch: 0 });
      }
    }
  }
}
