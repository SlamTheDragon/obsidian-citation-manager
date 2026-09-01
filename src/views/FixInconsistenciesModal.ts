import { App, Modal, Notice, setIcon, TFile } from 'obsidian';
import { LintWarning } from '../types';

export class FixInconsistenciesModal extends Modal {
  private warnings: LintWarning[];
  private selectedIds: Set<string>;
  private onApply: (selectedWarnings: LintWarning[]) => Promise<void>;

  constructor(
    app: App,
    warnings: LintWarning[],
    onApply: (selectedWarnings: LintWarning[]) => Promise<void>
  ) {
    super(app);
    this.warnings = warnings.filter(w => Boolean(w.suggestedFix));
    this.selectedIds = new Set(this.warnings.map(w => w.id));
    this.onApply = onApply;
  }

  onOpen() {
    this.titleEl.setText("Fix Citation Inconsistencies");
    this.renderModal();
  }

  private renderModal() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    // Header Card
    const headerCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    headerCard.createEl("div", { 
      cls: "section-card-desc", 
      text: `Review ${this.warnings.length} detected citation format mismatch(es) across your notes before applying automatic fixes.` 
    });

    if (this.warnings.length === 0) {
      const emptyBox = contentEl.createDiv({ cls: "citation-empty-clean" });
      setIcon(emptyBox.createDiv({ cls: "empty-icon" }), "check-circle");
      emptyBox.createEl("h3", { text: "No fixable inconsistencies found" });
      return;
    }

    // Select All / Deselect All Controls
    const selectAllRow = headerCard.createDiv({ cls: "citation-select-all-row" });
    selectAllRow.style.display = "flex";
    selectAllRow.style.justifyContent = "space-between";
    selectAllRow.style.alignItems = "center";
    selectAllRow.style.marginTop = "6px";

    const countLabel = selectAllRow.createSpan({ 
      cls: "status-hint", 
      text: `${this.selectedIds.size} of ${this.warnings.length} selected` 
    });

    const toggleAllBtn = selectAllRow.createEl("button", { 
      cls: "citation-mini-btn", 
      text: this.selectedIds.size === this.warnings.length ? "Deselect All" : "Select All" 
    });
    toggleAllBtn.style.width = "auto";
    toggleAllBtn.style.padding = "2px 8px";

    toggleAllBtn.addEventListener("click", () => {
      if (this.selectedIds.size === this.warnings.length) {
        this.selectedIds.clear();
      } else {
        this.warnings.forEach(w => this.selectedIds.add(w.id));
      }
      this.renderModal();
    });

    // Inconsistencies List Container
    const listContainer = contentEl.createDiv({ cls: "citation-diff-list-container" });
    listContainer.style.maxHeight = "48vh";
    listContainer.style.overflowY = "auto";
    listContainer.style.display = "flex";
    listContainer.style.flexDirection = "column";
    listContainer.style.gap = "6px";

    for (const w of this.warnings) {
      const row = listContainer.createDiv({ cls: "citation-diff-card" });
      row.style.background = "var(--background-secondary)";
      row.style.border = "1px solid var(--background-modifier-border)";
      row.style.borderRadius = "var(--radius-s)";
      row.style.padding = "8px 10px";
      row.style.display = "flex";
      row.style.flexDirection = "column";
      row.style.gap = "4px";

      // Row Top: Checkbox & File Location
      const topFlex = row.createDiv({ cls: "diff-top-flex" });
      topFlex.style.display = "flex";
      topFlex.style.alignItems = "center";
      topFlex.style.justifyContent = "space-between";

      const leftCheck = topFlex.createDiv({ cls: "diff-check-wrap" });
      leftCheck.style.display = "flex";
      leftCheck.style.alignItems = "center";
      leftCheck.style.gap = "6px";

      const cb = leftCheck.createEl("input", { type: "checkbox" });
      cb.checked = this.selectedIds.has(w.id);
      cb.addEventListener("change", () => {
        if (cb.checked) this.selectedIds.add(w.id);
        else this.selectedIds.delete(w.id);
        countLabel.setText(`${this.selectedIds.size} of ${this.warnings.length} selected`);
        applyBtn.setText(`Apply Fixes (${this.selectedIds.size})`);
        applyBtn.disabled = this.selectedIds.size === 0;
      });

      const fileLink = leftCheck.createSpan({ cls: "diff-file-name", text: `${w.fileName} (Line ${w.lineNumber})` });
      fileLink.style.fontWeight = "600";
      fileLink.style.cursor = "pointer";
      fileLink.addEventListener("click", () => {
        const fileObj = this.app.vault.getAbstractFileByPath(w.filePath);
        if (fileObj instanceof TFile) {
          this.app.workspace.getLeaf().openFile(fileObj);
        }
      });

      const typeBadge = topFlex.createSpan({ 
        cls: "status-badge-pill", 
        text: w.type === 'format_mismatch' ? "Format Mismatch" : "Style Mismatch" 
      });
      typeBadge.style.fontSize = "9px";
      typeBadge.style.padding = "1px 5px";

      // Row Bottom: Diff Display
      const diffWrap = row.createDiv({ cls: "diff-content-flex" });
      diffWrap.style.display = "flex";
      diffWrap.style.alignItems = "center";
      diffWrap.style.gap = "8px";
      diffWrap.style.fontSize = "11px";

      const oldSpan = diffWrap.createSpan({ cls: "diff-old" });
      oldSpan.style.color = "var(--text-error, #ef4444)";
      oldSpan.style.textDecoration = "line-through";
      oldSpan.createEl("code", { text: w.rawCitation });

      diffWrap.createSpan({ text: " → ", cls: "diff-arrow" });

      const newSpan = diffWrap.createSpan({ cls: "diff-new" });
      newSpan.style.color = "var(--text-success, #22c55e)";
      newSpan.style.fontWeight = "600";
      newSpan.createEl("code", { text: w.suggestedFix || "" });
    }

    // Modal Action Buttons
    const btnRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });

    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const applyBtn = btnRow.createEl("button", { 
      cls: "mod-cta", 
      text: `Apply Fixes (${this.selectedIds.size})` 
    });
    applyBtn.disabled = this.selectedIds.size === 0;

    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      applyBtn.setText("Applying...");

      const toApply = this.warnings.filter(w => this.selectedIds.has(w.id));
      await this.onApply(toApply);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
