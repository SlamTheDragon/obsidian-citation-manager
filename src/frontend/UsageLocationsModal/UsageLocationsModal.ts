import { App, Modal, TFile, MarkdownView, setIcon } from 'obsidian';
import { CitationOccurrence } from '../../backend/types';

export class UsageLocationsModal extends Modal {
  private citekey: string;
  private occurrences: CitationOccurrence[];

  constructor(app: App, citekey: string, occurrences: CitationOccurrence[]) {
    super(app);
    this.citekey = citekey;
    this.occurrences = occurrences;
  }

  onOpen() {
    this.titleEl.setText(`Active Citations for [${this.citekey}]`);

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    // Clear instruction signifier
    const hintBox = contentEl.createDiv({ cls: "citation-usage-instruction-box" });
    setIcon(hintBox.createSpan({ cls: "inline-icon" }), "info");
    hintBox.createSpan({ text: " Deletion is protected. Click any occurrence below to jump directly to that note." });

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

          setTimeout(() => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
              const editor = view.editor;
              const lineIdx = occ.lineNumber - 1;
              const lineText = editor.getLine(lineIdx) || "";
              
              let chStart = lineText.indexOf(this.citekey);
              let chEnd = chStart >= 0 ? chStart + this.citekey.length : 0;
              
              if (chStart > 0 && lineText[chStart - 1] === '@') chStart--;
              if (chStart > 0 && lineText[chStart - 1] === '[') chStart--;
              if (chEnd < lineText.length && lineText[chEnd] === ']') chEnd++;

              if (chStart < 0) {
                chStart = 0;
                chEnd = lineText.length;
              }

              editor.setSelection({ line: lineIdx, ch: chStart }, { line: lineIdx, ch: chEnd });
              editor.scrollIntoView({ from: { line: lineIdx, ch: chStart }, to: { line: lineIdx, ch: chEnd } }, true);
              editor.focus();
            }
          }, 80);
          this.close();
        }
      });
    }

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    const closeBtn = buttonContainer.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}
