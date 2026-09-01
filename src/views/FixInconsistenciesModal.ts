import { App, Modal, Notice, setIcon, TFile } from 'obsidian';
import { LintWarning, ReferenceMetadata } from '../types';
import { ReferenceEditorModal } from './ReferenceEditorModal';
import { StorageManager } from '../storageManager';

export class FixInconsistenciesModal extends Modal {
  private warnings: LintWarning[];
  private selectedIds: Set<string>;
  private storageManager: StorageManager;
  private onApplyFixes: (selectedWarnings: LintWarning[]) => Promise<void>;
  private onRefresh: () => Promise<void>;

  constructor(
    app: App,
    warnings: LintWarning[],
    storageManager: StorageManager,
    onApplyFixes: (selectedWarnings: LintWarning[]) => Promise<void>,
    onRefresh: () => Promise<void>
  ) {
    super(app);
    this.warnings = warnings;
    this.storageManager = storageManager;
    this.selectedIds = new Set(this.warnings.filter(w => Boolean(w.suggestedFix)).map(w => w.id));
    this.onApplyFixes = onApplyFixes;
    this.onRefresh = onRefresh;
  }

  onOpen() {
    this.titleEl.setText("Citation Diagnostics & Corrections");
    this.renderModal();
  }

  private renderModal() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    const fixableWarnings = this.warnings.filter(w => Boolean(w.suggestedFix));
    const unresolvedWarnings = this.warnings.filter(w => w.type === 'unresolved');

    if (this.warnings.length === 0) {
      const emptyBox = contentEl.createDiv({ cls: "citation-empty-clean" });
      setIcon(emptyBox.createDiv({ cls: "empty-icon" }), "check-circle");
      emptyBox.createEl("h3", { text: "No citation inconsistencies found" });
      emptyBox.createEl("p", { cls: "status-hint", text: "All citations across linked documents align with bucket standards." });
      return;
    }

    // 1. FORMAT & STYLE MISMATCHES SECTION
    if (fixableWarnings.length > 0) {
      const fixableCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
      const fHead = fixableCard.createDiv({ cls: "section-card-header-flex" });
      fHead.style.display = "flex";
      fHead.style.alignItems = "center";
      fHead.style.justifyContent = "space-between";
      fHead.style.marginBottom = "6px";

      fHead.createEl("div", { 
        cls: "section-card-title", 
        text: `Formatting & Style Mismatches (${fixableWarnings.length})` 
      });

      const selectAllBtn = fHead.createEl("button", { 
        cls: "citation-mini-btn", 
        text: this.selectedIds.size === fixableWarnings.length ? "Deselect All" : "Select All" 
      });
      selectAllBtn.style.width = "auto";
      selectAllBtn.style.padding = "2px 8px";
      selectAllBtn.addEventListener("click", () => {
        if (this.selectedIds.size === fixableWarnings.length) {
          this.selectedIds.clear();
        } else {
          fixableWarnings.forEach(w => this.selectedIds.add(w.id));
        }
        this.renderModal();
      });

      const fixList = fixableCard.createDiv({ cls: "citation-diff-list-container" });
      fixList.style.maxHeight = "28vh";
      fixList.style.overflowY = "auto";
      fixList.style.display = "flex";
      fixList.style.flexDirection = "column";
      fixList.style.gap = "6px";

      for (const w of fixableWarnings) {
        const row = fixList.createDiv({ cls: "citation-diff-card" });
        row.style.background = "var(--background-secondary)";
        row.style.border = "1px solid var(--background-modifier-border)";
        row.style.borderRadius = "var(--radius-s)";
        row.style.padding = "6px 8px";
        row.style.display = "flex";
        row.style.flexDirection = "column";
        row.style.gap = "3px";

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
          applyBtn.setText(`Apply Selected Fixes (${this.selectedIds.size})`);
          applyBtn.disabled = this.selectedIds.size === 0;
        });

        const fileLink = leftCheck.createSpan({ cls: "diff-file-name", text: `${w.fileName}:${w.lineNumber}` });
        fileLink.style.fontWeight = "600";
        fileLink.style.cursor = "pointer";
        fileLink.addEventListener("click", () => {
          const fileObj = this.app.vault.getAbstractFileByPath(w.filePath);
          if (fileObj instanceof TFile) this.app.workspace.getLeaf().openFile(fileObj);
        });

        const typeBadge = topFlex.createSpan({ 
          cls: "status-badge-pill", 
          text: w.type === 'format_mismatch' ? "Format" : "Style" 
        });
        typeBadge.style.fontSize = "9px";
        typeBadge.style.padding = "1px 5px";

        const diffWrap = row.createDiv({ cls: "diff-content-flex" });
        diffWrap.style.display = "flex";
        diffWrap.style.alignItems = "center";
        diffWrap.style.gap = "6px";
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

      const applyRow = fixableCard.createDiv({ cls: "apply-row" });
      applyRow.style.display = "flex";
      applyRow.style.justifyContent = "flex-end";
      applyRow.style.marginTop = "8px";

      const applyBtn = applyRow.createEl("button", { 
        cls: "mod-cta", 
        text: `Apply Selected Fixes (${this.selectedIds.size})` 
      });
      applyBtn.disabled = this.selectedIds.size === 0;
      applyBtn.addEventListener("click", async () => {
        applyBtn.disabled = true;
        applyBtn.setText("Applying...");
        const toApply = fixableWarnings.filter(w => this.selectedIds.has(w.id));
        await this.onApplyFixes(toApply);
        this.warnings = this.warnings.filter(w => !this.selectedIds.has(w.id));
        this.renderModal();
      });
    }

    // 2. UNRESOLVED REFERENCES & STUBS SECTION
    if (unresolvedWarnings.length > 0) {
      const unresCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
      unresCard.createEl("div", { 
        cls: "section-card-title", 
        text: `Unresolved References & Stubs (${unresolvedWarnings.length})` 
      });
      unresCard.createEl("div", { 
        cls: "section-card-desc", 
        text: "These citekeys were found in notes but do not exist in your reference library." 
      });

      const unresList = unresCard.createDiv({ cls: "citation-unres-list-container" });
      unresList.style.maxHeight = "28vh";
      unresList.style.overflowY = "auto";
      unresList.style.display = "flex";
      unresList.style.flexDirection = "column";
      unresList.style.gap = "6px";
      unresList.style.marginTop = "6px";

      for (const w of unresolvedWarnings) {
        const row = unresList.createDiv({ cls: "citation-diff-card" });
        row.style.background = "var(--background-secondary)";
        row.style.border = "1px solid var(--background-modifier-border)";
        row.style.borderRadius = "var(--radius-s)";
        row.style.padding = "8px";
        row.style.display = "flex";
        row.style.flexDirection = "column";
        row.style.gap = "4px";

        const topRow = row.createDiv({ cls: "unres-top-row" });
        topRow.style.display = "flex";
        topRow.style.alignItems = "center";
        topRow.style.justifyContent = "space-between";

        const leftInfo = topRow.createDiv();
        const fileLink = leftInfo.createSpan({ cls: "diff-file-name", text: `${w.fileName}:${w.lineNumber}` });
        fileLink.style.fontWeight = "600";
        fileLink.style.cursor = "pointer";
        fileLink.addEventListener("click", () => {
          const fileObj = this.app.vault.getAbstractFileByPath(w.filePath);
          if (fileObj instanceof TFile) this.app.workspace.getLeaf().openFile(fileObj);
        });

        leftInfo.createEl("code", { text: ` ${w.rawCitation} ` });

        const actionBtns = topRow.createDiv({ cls: "unres-action-btns" });
        actionBtns.style.display = "flex";
        actionBtns.style.gap = "4px";

        // Create Reference Button
        const createBtn = actionBtns.createEl("button", { cls: "citation-mini-btn", text: "+ Create Entry" });
        createBtn.style.width = "auto";
        createBtn.style.padding = "2px 8px";
        createBtn.style.background = "var(--interactive-accent)";
        createBtn.style.color = "var(--text-on-accent)";
        createBtn.addEventListener("click", () => {
          const key = w.citekey || w.rawCitation.replace(/^\[\^?|\]$/g, '').replace(/^@/, '');
          new ReferenceEditorModal(
            this.app,
            {
              citekey: key,
              title: w.definitionSnippet || `Reference ${key}`,
              authors: ["Author"],
              year: new Date().getFullYear(),
              type: "journal",
              projects: []
            },
            async (newRef) => {
              await this.storageManager.saveReference(newRef);
              await this.onRefresh();
              this.warnings = this.warnings.filter(item => item.id !== w.id);
              this.renderModal();
              new Notice(`Created reference entry [${newRef.citekey}]`);
            },
            true
          ).open();
        });

        // Purge from Note Button
        const purgeBtn = actionBtns.createEl("button", { cls: "citation-mini-btn btn-danger", text: "Purge" });
        purgeBtn.style.width = "auto";
        purgeBtn.style.padding = "2px 6px";
        purgeBtn.title = "Remove this reference token and definition from note";
        purgeBtn.addEventListener("click", async () => {
          const fileObj = this.app.vault.getAbstractFileByPath(w.filePath);
          if (fileObj instanceof TFile) {
            let content = await this.app.vault.read(fileObj);
            const key = w.citekey || w.rawCitation.replace(/^\[\^?|\]$/g, '').replace(/^@/, '');
            // Remove in-body occurrences
            content = content.replace(new RegExp(`\\[\\^${key}\\]`, 'g'), '');
            content = content.replace(new RegExp(`\\[@${key}\\]`, 'g'), '');
            // Remove bottom definition
            content = content.replace(new RegExp(`^\\s*\\[\\^${key}\\]:.*$\\r?\\n?`, 'gm'), '');
            await this.app.vault.modify(fileObj, content);
            await this.onRefresh();
            this.warnings = this.warnings.filter(item => item.id !== w.id);
            this.renderModal();
            new Notice(`Purged reference [${key}] from ${w.fileName}`);
          }
        });

        // Dismiss Button
        const dismissBtn = actionBtns.createEl("button", { cls: "citation-mini-btn", text: "Dismiss" });
        dismissBtn.style.width = "auto";
        dismissBtn.style.padding = "2px 6px";
        dismissBtn.title = "Dismiss this warning";
        dismissBtn.addEventListener("click", async () => {
          await this.storageManager.saveDismissedLint(w.id);
          this.warnings = this.warnings.filter(item => item.id !== w.id);
          this.renderModal();
          new Notice("Warning dismissed.");
        });

        if (w.definitionSnippet) {
          const snippetDiv = row.createDiv({ cls: "status-hint" });
          snippetDiv.style.fontSize = "10.5px";
          snippetDiv.createSpan({ text: "Note definition text: " });
          snippetDiv.createEl("em", { text: `"${w.definitionSnippet}"` });
        }
      }
    }

    // Modal Close Footer
    const footerRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    const closeBtn = footerRow.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}
