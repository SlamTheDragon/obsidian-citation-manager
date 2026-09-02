import { App, Modal, Notice, setIcon, MarkdownRenderer } from 'obsidian';
import { ReferenceMetadata } from '../../backend/types';
import { StorageManager } from '../../backend/storageManager';
import { Logger } from '../../backend/logger';

export class CitationNotesModal extends Modal {
  private ref: ReferenceMetadata;
  private storageManager: StorageManager;
  private onSave: () => Promise<void>;
  private notesText: string = "";
  private initialNotesText: string = "";
  private isAbstractOpen: boolean = false;
  private activeTab: 'edit' | 'preview' = 'edit';
  private isSaving: boolean = false;

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
    this.initialNotesText = this.notesText;
    this.renderModal();
  }

  private async saveNotes(): Promise<void> {
    if (this.isSaving) return;
    if (this.notesText === this.initialNotesText) return;

    this.isSaving = true;
    try {
      await this.storageManager.saveReferenceUserNotes(this.ref.citekey, this.notesText);
      this.initialNotesText = this.notesText;
      await this.onSave();
    } catch (err: any) {
      Logger.error(`Failed auto-saving notes for [${this.ref.citekey}]:`, err);
      new Notice(`Error saving notes: ${err.message}`);
    } finally {
      this.isSaving = false;
    }
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

    // 3. Notes Editor Section (With Native Markdown Preview)
    const notesCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    const notesTitleRow = notesCard.createDiv({ cls: "section-card-title-row" });
    notesTitleRow.style.display = "flex";
    notesTitleRow.style.alignItems = "center";
    notesTitleRow.style.justifyContent = "space-between";
    notesTitleRow.style.marginBottom = "8px";

    notesTitleRow.createEl("div", { 
      cls: "section-card-title", 
      text: "Literature Synthesis & Notes" 
    });

    // Single Toggle Button for Edit vs Native Markdown Preview
    const toggleBtn = notesTitleRow.createEl("button", { 
      cls: "citation-card-btn citation-mode-toggle-btn", 
      title: this.activeTab === 'edit' ? "Switch to Markdown Preview" : "Switch to Edit Mode" 
    });
    
    if (this.activeTab === 'edit') {
      setIcon(toggleBtn.createSpan({ cls: "btn-icon" }), "eye");
      toggleBtn.createSpan({ text: "Preview" });
    } else {
      setIcon(toggleBtn.createSpan({ cls: "btn-icon" }), "pencil");
      toggleBtn.createSpan({ text: "Edit" });
    }

    toggleBtn.addEventListener("click", async () => {
      if (this.activeTab === 'edit') {
        await this.saveNotes();
      }
      this.activeTab = this.activeTab === 'edit' ? 'preview' : 'edit';
      this.renderModal();
    });

    const editorContainer = notesCard.createDiv({ cls: "citation-notes-container" });

    if (this.activeTab === 'edit') {
      const notesArea = editorContainer.createEl("textarea", {
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

      notesArea.addEventListener("blur", async () => {
        await this.saveNotes();
      });

      setTimeout(() => {
        notesArea.focus();
        notesArea.setSelectionRange(notesArea.value.length, notesArea.value.length);
      }, 50);
    } else {
      const previewPane = editorContainer.createDiv({ cls: "citation-notes-preview-pane markdown-rendered" });
      const rawText = this.notesText.trim() || "*No notes written yet.*";
      MarkdownRenderer.render(this.app, rawText, previewPane, '', this as any);
    }

    // 4. Modal Buttons Container (Cancel button removed; auto-save on all exit points)
    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });

    const doneBtn = buttonRow.createEl("button", { 
      cls: "mod-cta", 
      text: "Done" 
    });
    doneBtn.addEventListener("click", async () => {
      doneBtn.disabled = true;
      doneBtn.setText("Saving...");
      try {
        await this.saveNotes();
        new Notice(`Saved notes for [${this.ref.citekey}]`);
        this.close();
      } catch (err: any) {
        new Notice(`Failed saving notes: ${err.message}`);
        doneBtn.disabled = false;
        doneBtn.setText("Done");
      }
    });
  }

  async onClose() {
    // Auto-save guard on modal dismiss / backdrop click / ESC key
    if (this.notesText !== this.initialNotesText) {
      await this.saveNotes();
      new Notice(`Saved notes for [${this.ref.citekey}]`);
    }
    this.contentEl.empty();
  }
}
