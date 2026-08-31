import { App, Modal, TFile, MarkdownView, setIcon } from 'obsidian';
import { CitationOccurrence } from '../types';

export class UsageLocationsModal extends Modal {
  private citekey: string;
  private occurrences: CitationOccurrence[];

  constructor(app: App, citekey: string, occurrences: CitationOccurrence[]) {
    super(app);
    this.citekey = citekey;
    this.occurrences = occurrences;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-usage-modal");

    const header = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = header.createSpan({ cls: "modal-header-icon danger" });
    setIcon(iconSpan, "alert-triangle");
    header.createEl("h2", { text: `Active Citations for [${this.citekey}]` });

    // Clear instruction signifier
    const hintBox = contentEl.createDiv({ cls: "citation-usage-instruction-box" });
    setIcon(hintBox.createSpan({ cls: "inline-icon" }), "info");
    hintBox.createSpan({ text: " Deletion is protected. Click any line below to jump directly to that note." });

    const list = contentEl.createDiv({ cls: "citation-occurrence-list" });

    for (const occ of this.occurrences) {
      const card = list.createDiv({ cls: "citation-occurrence-card" });

      const titleRow = card.createDiv({ cls: "occurrence-title-row" });
      const fileWrap = titleRow.createSpan({ cls: "occ-file-wrap" });
      setIcon(fileWrap.createSpan({ cls: "inline-icon" }), "file-text");
      fileWrap.createSpan({ text: ` ${occ.fileName}` });

      const lineBadge = titleRow.createSpan({ cls: "occurrence-line-badge" });
      lineBadge.createSpan({ text: `Line ${occ.lineNumber} ` });
      setIcon(lineBadge.createSpan({ cls: "inline-icon" }), "external-link");

      const snippet = card.createDiv({ cls: "occurrence-snippet" });
      snippet.createEl("code", { text: occ.lineContent });

      card.addEventListener("click", async () => {
        const file = this.app.vault.getAbstractFileByPath(occ.filePath);
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(file);

          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            view.editor.setCursor({ line: occ.lineNumber - 1, ch: 0 });
            view.editor.scrollIntoView({ from: { line: occ.lineNumber - 1, ch: 0 }, to: { line: occ.lineNumber - 1, ch: 0 } }, true);
          }
          this.close();
        }
      });
    }

    const btnRow = contentEl.createDiv({ cls: "citation-modal-button-row" });
    const closeBtn = btnRow.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}
