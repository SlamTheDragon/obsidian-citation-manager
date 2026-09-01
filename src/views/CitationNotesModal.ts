import { App, Modal, Notice, setIcon, TFile, normalizePath } from 'obsidian';
import { ReferenceMetadata } from '../types';
import { StorageManager } from '../storageManager';

export class CitationNotesModal extends Modal {
  private ref: ReferenceMetadata;
  private storageManager: StorageManager;
  private onSave: () => Promise<void>;
  private notesText: string = "";
  private isAbstractOpen: boolean = false;

  constructor(
    app: App,
    ref: ReferenceMetadata,
    storageManager: StorageManager,
    onSave: () => Promise<void>
  ) {
    super(app);
    this.ref = ref;
    this.storageManager = storageManager;
    this.onSave = onSave;
  }

  async onOpen() {
    this.titleEl.setText(`Research Notes: [${this.ref.citekey}]`);
    this.notesText = await this.storageManager.loadReferenceUserNotes(this.ref.citekey);
    this.renderModal();
  }

  private renderModal() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    // 1. Reference Metadata Header Card
    const headerCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    headerCard.style.padding = "10px 12px";

    const topRow = headerCard.createDiv();
    topRow.style.display = "flex";
    topRow.style.alignItems = "center";
    topRow.style.justifyContent = "space-between";
    topRow.style.marginBottom = "4px";

    const titleEl = topRow.createEl("div", { 
      cls: "section-card-title", 
      text: this.ref.title 
    });
    titleEl.style.fontSize = "13.5px";
    titleEl.style.fontWeight = "600";
    titleEl.style.lineHeight = "1.3";

    const metaRow = headerCard.createDiv({ cls: "status-hint" });
    metaRow.style.fontSize = "11px";
    metaRow.style.color = "var(--text-muted)";
    const authorStr = (this.ref.authors || []).slice(0, 3).join(", ") + ((this.ref.authors?.length || 0) > 3 ? " et al." : "");
    metaRow.setText(`${authorStr} • ${this.ref.year} • ${this.ref.publication || this.ref.publisher || this.ref.type.toUpperCase()}`);

    // 2. Collapsible Abstract Preview Accordion
    if (this.ref.abstract) {
      const absCard = contentEl.createDiv({ cls: "citation-modal-accordion-card" });
      absCard.style.marginBottom = "10px";

      const absHeader = absCard.createDiv({ cls: "accordion-header-row" });
      absHeader.createSpan({ cls: "accordion-title-text", text: "Abstract Preview" });
      const toggleIcon = absHeader.createSpan({ cls: "accordion-icon-wrap" });
      setIcon(toggleIcon, this.isAbstractOpen ? "chevron-up" : "chevron-down");

      const absBody = absCard.createDiv({ cls: "accordion-body-collapse" });
      if (this.isAbstractOpen) {
        absCard.addClass("open");
      }
      absBody.style.fontSize = "11.5px";
      absBody.style.lineHeight = "1.45";
      absBody.style.color = "var(--text-normal)";
      absBody.setText(this.ref.abstract);

      absHeader.addEventListener("click", () => {
        this.isAbstractOpen = !this.isAbstractOpen;
        if (this.isAbstractOpen) {
          absCard.addClass("open");
          setIcon(toggleIcon, "chevron-up");
        } else {
          absCard.removeClass("open");
          setIcon(toggleIcon, "chevron-down");
        }
      });
    }

    // 3. Notes Editor Section
    const notesCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    const notesTitleRow = notesCard.createDiv({ cls: "section-card-title-row" });
    notesTitleRow.style.display = "flex";
    notesTitleRow.style.alignItems = "center";
    notesTitleRow.style.justifyContent = "space-between";
    notesTitleRow.style.marginBottom = "6px";

    notesTitleRow.createEl("div", { 
      cls: "section-card-title", 
      text: "Literature Synthesis & Notes" 
    });

    const notesArea = notesCard.createEl("textarea", {
      cls: "citation-form-textarea",
      placeholder: "Write your literature review notes, methodology critique, key takeaways, synthesis, or relevant quotes..."
    });
    notesArea.style.minHeight = "220px";
    notesArea.style.width = "100%";
    notesArea.style.fontSize = "12.5px";
    notesArea.style.lineHeight = "1.5";
    notesArea.style.fontFamily = "var(--font-monospace, monospace)";
    notesArea.style.padding = "8px";
    notesArea.value = this.notesText;

    notesArea.addEventListener("input", () => {
      this.notesText = notesArea.value;
    });

    setTimeout(() => {
      notesArea.focus();
      notesArea.setSelectionRange(notesArea.value.length, notesArea.value.length);
    }, 50);

    // 4. Modal Buttons Container
    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });

    // Open File in Obsidian Leaf
    const openFileBtn = buttonRow.createEl("button", { text: "Open Note File" });
    openFileBtn.title = "Open full markdown note in Obsidian tab";
    openFileBtn.addEventListener("click", () => {
      const notePath = normalizePath(`.references/${this.ref.citekey}.md`);
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (file instanceof TFile) {
        this.app.workspace.getLeaf('tab').openFile(file);
        this.close();
      } else {
        new Notice(`Note file .references/${this.ref.citekey}.md not found.`);
      }
    });

    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonRow.createEl("button", { 
      cls: "mod-cta", 
      text: "Save Notes" 
    });
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.setText("Saving...");
      try {
        await this.storageManager.saveReferenceUserNotes(this.ref.citekey, this.notesText);
        new Notice(`Saved notes for [${this.ref.citekey}]`);
        await this.onSave();
        this.close();
      } catch (err) {
        new Notice(`Failed saving notes: ${err.message}`);
        saveBtn.disabled = false;
        saveBtn.setText("Save Notes");
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
