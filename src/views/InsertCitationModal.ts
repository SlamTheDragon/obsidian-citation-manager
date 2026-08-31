import { App, FuzzySuggestModal, MarkdownView, Notice } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, InBodyFormat, CitationStyle } from '../types';
import { CitationEngine } from '../citationEngine';

export class InsertCitationModal extends FuzzySuggestModal<ReferenceMetadata> {
  private references: ReferenceMetadata[];
  private project: ProjectRecord | null;
  private defaultStyle: CitationStyle;
  private defaultFormat: InBodyFormat;

  constructor(
    app: App,
    references: ReferenceMetadata[],
    project: ProjectRecord | null,
    defaultStyle: CitationStyle = 'apa7',
    defaultFormat: InBodyFormat = 'parenthetical'
  ) {
    super(app);
    this.references = references;
    this.project = project;
    this.defaultStyle = project?.citationStyle || defaultStyle;
    this.defaultFormat = project?.inBodyFormat || defaultFormat;
    this.setPlaceholder("Search references by title, author, year, citekey, or DOI...");
  }

  getItems(): ReferenceMetadata[] {
    return this.references;
  }

  getItemText(item: ReferenceMetadata): string {
    const authors = (item.authors || []).join(" ");
    return `${item.citekey} ${item.title} ${authors} ${item.year} ${item.publication || ''} ${item.doi || ''}`;
  }

  renderSuggestion(item: { item: ReferenceMetadata; match: any }, el: HTMLElement) {
    const ref = item.item;
    el.empty();
    el.addClass("citation-suggest-item");

    const header = el.createDiv({ cls: "citation-suggest-header" });
    header.createEl("span", { cls: "citation-suggest-key", text: `[${ref.citekey}]` });
    header.createEl("span", { cls: "citation-suggest-type", text: ref.type.toUpperCase() });
    header.createEl("span", { cls: "citation-suggest-year", text: `(${ref.year})` });

    el.createDiv({ cls: "citation-suggest-title", text: ref.title });
    el.createDiv({ cls: "citation-suggest-authors", text: (ref.authors || []).join(", ") });
  }

  async onChooseItem(item: ReferenceMetadata, evt: MouseEvent | KeyboardEvent) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice("No active markdown editor to insert citation.");
      return;
    }

    const editor = activeView.editor;
    const format = this.defaultFormat;
    const inBodyText = CitationEngine.formatInBody(item, format);

    const cursor = editor.getCursor();
    editor.replaceRange(inBodyText, cursor);

    // If footnote format, also ensure footnote definition exists at bottom
    if (format === 'footnote') {
      const docText = editor.getValue();
      const fnDefRegex = new RegExp(`^\\[\\^${item.citekey}\\]:`, 'm');
      if (!fnDefRegex.test(docText)) {
        const fnDefinition = CitationEngine.formatFootnoteDefinition(item, this.defaultStyle);
        const hasTrailingNewline = docText.endsWith("\n");
        const separator = hasTrailingNewline ? "\n" : "\n\n";
        editor.replaceRange(`${separator}${fnDefinition}\n`, { line: editor.lineCount(), ch: 0 });
      }
    }

    new Notice(`Inserted citation: ${inBodyText}`);
  }
}
