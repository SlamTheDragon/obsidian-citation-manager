import { App, FuzzySuggestModal, MarkdownView, Notice, setIcon } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, InBodyFormat, CitationStyle } from '../types';
import { CitationEngine } from '../citationEngine';

export class InsertCitationModal extends FuzzySuggestModal<ReferenceMetadata> {
  private references: ReferenceMetadata[];
  private project: ProjectRecord | null;
  private defaultStyle: CitationStyle;
  private selectedFormat: InBodyFormat;
  private selectedRefs: ReferenceMetadata[] = [];
  private chipsContainer: HTMLElement | null = null;
  private actionFooter: HTMLElement | null = null;

  constructor(
    app: App,
    references: ReferenceMetadata[],
    project: ProjectRecord | null,
    defaultStyle: CitationStyle = 'apa7',
    defaultFormat: InBodyFormat = 'parenthetical',
    enableFootnoteMode: boolean = false
  ) {
    super(app);
    this.references = references;
    this.project = project;
    this.defaultStyle = project?.citationStyle || defaultStyle;
    this.selectedFormat = enableFootnoteMode ? 'footnote' : (project?.inBodyFormat || defaultFormat);
    this.setPlaceholder("Search citations (Shift+Click or Shift+Enter for multi-citation)...");
  }

  onOpen() {
    super.onOpen();

    // Add format selector and chips container above the suggest results
    const modalEl = this.modalEl;
    const promptEl = modalEl.querySelector('.prompt-input-container') as HTMLElement;

    if (promptEl) {
      // 1. Format Bar
      const formatBar = document.createElement("div");
      formatBar.className = "citation-insert-format-bar";
      formatBar.style.display = "flex";
      formatBar.style.alignItems = "center";
      formatBar.style.justifyContent = "space-between";
      formatBar.style.padding = "6px 8px";
      formatBar.style.borderBottom = "1px solid var(--background-modifier-border)";

      const formatLabel = formatBar.createSpan({ text: "Format: ", cls: "control-label" });
      const select = formatBar.createEl("select", { cls: "dropdown mini-dropdown" });
      select.createEl("option", { value: "parenthetical", text: "Parenthetical (Author, Year)" });
      select.createEl("option", { value: "citekey", text: "Citekey [@key; @key2]" });
      select.createEl("option", { value: "narrative", text: "Narrative Author (Year)" });
      select.createEl("option", { value: "footnote", text: "Footnote [^key]" });
      select.value = this.selectedFormat;
      select.addEventListener("change", () => {
        this.selectedFormat = select.value as InBodyFormat;
      });

      promptEl.parentElement?.insertBefore(formatBar, promptEl);

      // 2. Selected Chips Container
      this.chipsContainer = document.createElement("div");
      this.chipsContainer.className = "citation-selected-chips-bar";
      this.chipsContainer.style.display = "none";
      this.chipsContainer.style.flexWrap = "wrap";
      this.chipsContainer.style.gap = "4px";
      this.chipsContainer.style.padding = "6px 8px";
      this.chipsContainer.style.backgroundColor = "var(--background-secondary)";
      this.chipsContainer.style.borderBottom = "1px solid var(--background-modifier-border)";

      promptEl.parentElement?.insertBefore(this.chipsContainer, promptEl.nextSibling);

      // 3. Multi-Citation Action Footer
      this.actionFooter = document.createElement("div");
      this.actionFooter.className = "citation-multi-insert-footer";
      this.actionFooter.style.display = "none";
      this.actionFooter.style.padding = "8px 12px";
      this.actionFooter.style.borderTop = "1px solid var(--background-modifier-border)";
      this.actionFooter.style.justifyContent = "flex-end";

      const insertBtn = this.actionFooter.createEl("button", {
        cls: "mod-cta",
        text: "Insert Group"
      });
      insertBtn.addEventListener("click", () => this.insertSelectedGroup());

      modalEl.appendChild(this.actionFooter);
    }
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
    const isMultiSelect = evt.shiftKey || evt.altKey || (evt as any).ctrlKey || (evt as any).metaKey;

    if (isMultiSelect) {
      if (!this.selectedRefs.some(r => r.citekey === item.citekey)) {
        this.selectedRefs.push(item);
        this.updateChipsUI();
      }
      return;
    }

    if (this.selectedRefs.length > 0) {
      if (!this.selectedRefs.some(r => r.citekey === item.citekey)) {
        this.selectedRefs.push(item);
      }
      this.insertSelectedGroup();
      return;
    }

    // Single item insertion
    this.insertCitations([item]);
  }

  private updateChipsUI() {
    if (!this.chipsContainer || !this.actionFooter) return;

    if (this.selectedRefs.length === 0) {
      this.chipsContainer.style.display = "none";
      this.actionFooter.style.display = "none";
      return;
    }

    this.chipsContainer.style.display = "flex";
    this.chipsContainer.empty();

    for (const ref of this.selectedRefs) {
      const chip = this.chipsContainer.createDiv({ cls: "author-chip" });
      chip.createSpan({ text: ref.citekey });
      const removeBtn = chip.createSpan({ text: "×", cls: "chip-remove-btn" });
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectedRefs = this.selectedRefs.filter(r => r.citekey !== ref.citekey);
        this.updateChipsUI();
      });
    }

    this.actionFooter.style.display = "flex";
    const btn = this.actionFooter.querySelector('button');
    if (btn) {
      btn.setText(`Insert (${this.selectedRefs.length} Citations)`);
    }
  }

  private insertSelectedGroup() {
    if (this.selectedRefs.length === 0) return;
    this.insertCitations(this.selectedRefs);
    this.close();
  }

  private insertCitations(refs: ReferenceMetadata[]) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice("No active markdown editor open.");
      return;
    }

    const editor = activeView.editor;
    const format = this.selectedFormat;
    const inBodyText = CitationEngine.formatMultiInBody(refs, format, this.defaultStyle);

    const cursor = editor.getCursor();
    editor.replaceRange(inBodyText, cursor);

    // If footnote format, ensure all footnote definitions are added
    if (format === 'footnote') {
      const docText = editor.getValue();
      const newDefs: string[] = [];

      for (const ref of refs) {
        const fnDefRegex = new RegExp(`^\\[\\^${ref.citekey}\\]:`, 'm');
        if (!fnDefRegex.test(docText)) {
          const fnDefinition = CitationEngine.formatFootnoteDefinition(ref, this.defaultStyle);
          newDefs.push(fnDefinition);
        }
      }

      if (newDefs.length > 0) {
        const hasTrailingNewline = docText.endsWith("\n");
        const separator = hasTrailingNewline ? "\n" : "\n\n";
        editor.replaceRange(`${separator}${newDefs.join("\n")}\n`, { line: editor.lineCount(), ch: 0 });
      }
    }

    new Notice(`Inserted: ${inBodyText}`);
  }
}
