import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { ReferenceMetadata, ProjectRecord } from '../types';
import { StorageManager } from '../storageManager';
import { MetadataResolvers } from '../metadataResolvers';
import { CitationEngine } from '../citationEngine';
import { ProjectIndexer } from '../projectIndexer';
import { Logger } from '../logger';

export class PDFImportModal extends Modal {
  private pdfFile: File;
  private project: ProjectRecord | null;
  private existingRefs: ReferenceMetadata[];
  private storageManager: StorageManager;
  private onComplete: () => Promise<void>;

  private mode: 'new' | 'existing' = 'new';
  private selectedExistingCitekey: string = '';
  
  // Reference state
  private ref: ReferenceMetadata;
  private statusLog: string = '';
  private previewEl: HTMLElement | null = null;
  private accordionCards: Map<string, { cardEl: HTMLElement; iconEl: HTMLElement }> = new Map();

  constructor(
    app: App,
    pdfFile: File,
    project: ProjectRecord | null,
    existingRefs: ReferenceMetadata[],
    storageManager: StorageManager,
    onComplete: () => Promise<void>
  ) {
    super(app);
    this.pdfFile = pdfFile;
    this.project = project;
    this.existingRefs = existingRefs;
    this.storageManager = storageManager;
    this.onComplete = onComplete;

    const cleanTitle = pdfFile.name ? pdfFile.name.replace(/\.pdf$/i, "") : "Untitled Document";
    this.ref = {
      citekey: "",
      type: "journal",
      title: cleanTitle,
      authors: [],
      year: new Date().getFullYear(),
      month: "",
      publication: "",
      volume: "",
      issue: "",
      pages: "",
      publisher: "",
      doi: "",
      url: "",
      isbn: "",
      issn: "",
      abstract: "",
      pdfAttachment: "",
      projects: project ? [project.id] : [],
      tags: [],
      apa: "",
      ieee: "",
      harvard: "",
      chicago: "",
      vancouver: "",
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    };

    if (existingRefs.length > 0) {
      this.selectedExistingCitekey = existingRefs[0].citekey;
    }
  }

  async onOpen() {
    this.titleEl.setText("Import PDF Document");

    try {
      const buffer = await this.pdfFile.arrayBuffer();
      const detectedDOI = ProjectIndexer.extractDOIFromBuffer(buffer);
      if (detectedDOI) {
        this.ref.doi = detectedDOI;
        this.statusLog = `Auto-detected DOI: ${detectedDOI}`;
        try {
          const res = await MetadataResolvers.detectAndResolve(detectedDOI);
          this.ref = { ...this.ref, ...res } as ReferenceMetadata;
          this.statusLog = `Auto-resolved metadata via DOI: ${detectedDOI}`;
        } catch (err) {
          this.statusLog = `DOI detected (${detectedDOI}). Click Fetch & Fill below.`;
        }
      }
    } catch (e) {
      Logger.warn("Error in PDFImportModal onOpen DOI extraction:", e);
    }

    this.renderModal();
  }

  private renderModal() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    // 1. File Info Card
    const fileCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    const fileRow = fileCard.createDiv({ cls: "fetch-title" });
    setIcon(fileRow.createSpan({ cls: "inline-icon" }), "file-text");
    fileRow.createSpan({ text: ` ${this.pdfFile.name} ` });
    if (this.pdfFile.size) {
      fileRow.createSpan({ cls: "file-size-tag", text: `(${(this.pdfFile.size / 1024 / 1024).toFixed(2)} MB)` });
    }
    if (this.statusLog) {
      fileCard.createDiv({ cls: "status-log-line", text: this.statusLog });
    }

    // Import Mode Selector
    new Setting(fileCard)
      .setName("Import Mode")
      .addDropdown(drop => {
        drop.addOption("new", "Create New Citation from PDF");
        if (this.existingRefs.length > 0) {
          drop.addOption("existing", "Attach PDF to Existing Citation");
        }
        drop.setValue(this.mode);
        drop.onChange(val => {
          this.mode = val as 'new' | 'existing';
          this.renderModal();
        });
      });

    if (this.mode === 'existing') {
      const attachCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
      new Setting(attachCard)
        .setName("Target Citation")
        .setDesc("Choose which citation should hold this PDF attachment")
        .addDropdown(drop => {
          for (const ref of this.existingRefs) {
            drop.addOption(ref.citekey, `[${ref.citekey}] ${ref.title.slice(0, 45)}...`);
          }
          drop.setValue(this.selectedExistingCitekey);
          drop.onChange(val => { this.selectedExistingCitekey = val; });
        });
    } else {
      // 2. Auto-Fetch Card
      const fetchBox = contentEl.createDiv({ cls: "citation-modal-section-card" });
      fetchBox.createEl("div", { cls: "section-card-title", text: "Auto-Fetch Metadata" });
      fetchBox.createEl("div", { cls: "section-card-desc", text: "Paste DOI or URL to pull publication details automatically" });

      const fetchInputRow = fetchBox.createDiv({ cls: "fetch-input-row" });
      const fetchInput = fetchInputRow.createEl("input", {
        type: "text",
        placeholder: "e.g. 10.1145/3313831.3376722",
        cls: "fetch-text-input",
        value: this.ref.doi || ""
      });
      const fetchBtn = fetchInputRow.createEl("button", { cls: "mod-cta citation-fetch-btn", text: "Fetch & Fill" });

      const doFetch = async () => {
        const val = fetchInput.value.trim();
        if (!val) {
          new Notice("Please enter a DOI or URL first.");
          return;
        }
        fetchBtn.disabled = true;
        fetchBtn.setText("Fetching...");
        try {
          const res = await MetadataResolvers.detectAndResolve(val);
          this.ref = { ...this.ref, ...res } as ReferenceMetadata;
          this.statusLog = "Metadata successfully populated.";
          new Notice("Metadata populated!");
          this.renderModal();
        } catch (e: any) {
          new Notice(`Fetch error: ${e.message}`);
          fetchBtn.disabled = false;
          fetchBtn.setText("Fetch & Fill");
        }
      };

      fetchBtn.addEventListener("click", doFetch);
      fetchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doFetch();
        }
      });

      // 3. Core Information
      const coreCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
      coreCard.createEl("div", { cls: "section-card-title", text: "Core Information" });

      // Title
      new Setting(coreCard)
        .setName("Title")
        .addText(text => {
          text.setValue(this.ref.title)
            .setPlaceholder("Title...")
            .onChange(val => {
              this.ref.title = val;
              this.updatePreviews();
            });
          text.inputEl.addClass("setting-full-width-input");
        });

      // Authors
      const authorSection = coreCard.createDiv({ cls: "form-stacked-group" });
      const authorHeader = authorSection.createDiv({ cls: "stacked-label-with-desc" });
      authorHeader.createEl("label", { cls: "stacked-label", text: "Authors" });
      authorHeader.createSpan({ cls: "stacked-desc", text: "(Type author name and press Enter or comma)" });
      
      const authorContainer = authorSection.createDiv({ cls: "author-chips-input-container" });
      this.renderAuthorChips(authorContainer);

      // Metadata (Year, Type, Citekey)
      new Setting(coreCard)
        .setName("Metadata")
        .addText(text => text
          .setPlaceholder("Year (e.g. 2026)")
          .setValue(String(this.ref.year || ""))
          .onChange(val => {
            this.ref.year = val;
            this.updatePreviews();
          }))
        .addDropdown(drop => {
          const types: ('journal' | 'conference' | 'book' | 'webpage' | 'blog' | 'video' | 'preprint' | 'report' | 'standard' | 'thesis' | 'other')[] = 
            ['journal', 'conference', 'book', 'webpage', 'blog', 'video', 'preprint', 'report', 'standard', 'thesis', 'other'];
          types.forEach(t => drop.addOption(t, t.toUpperCase()));
          drop.setValue(this.ref.type);
          drop.onChange(val => {
            this.ref.type = val as any;
            this.updatePreviews();
          });
        })
        .addText(text => text
          .setPlaceholder("Citekey (Auto-generated)")
          .setValue(this.ref.citekey)
          .onChange(val => {
            this.ref.citekey = val.replace(/[^a-zA-Z0-9_-]/g, "");
            this.updatePreviews();
          }));

      // Accordion 1: Publication & Venue
      this.createAnimatedAccordion(
        contentEl,
        'pub',
        "Publication & Venue",
        (body) => {
          new Setting(body)
            .setName("Journal / Conference")
            .addText(text => {
              text.setValue(this.ref.publication || "")
                .onChange(val => {
                  this.ref.publication = val;
                  this.updatePreviews();
                });
              text.inputEl.addClass("setting-full-width-input");
            });

          new Setting(body)
            .setName("Vol / Issue / Pages")
            .addText(t => t.setPlaceholder("Vol").setValue(this.ref.volume || "").onChange(v => { this.ref.volume = v; this.updatePreviews(); }))
            .addText(t => t.setPlaceholder("Issue").setValue(this.ref.issue || "").onChange(v => { this.ref.issue = v; this.updatePreviews(); }))
            .addText(t => t.setPlaceholder("Pages").setValue(this.ref.pages || "").onChange(v => { this.ref.pages = v; this.updatePreviews(); }));
        }
      );

      // Accordion 2: Identifiers & DOI
      this.createAnimatedAccordion(
        contentEl,
        'ids',
        "Identifiers, DOI & URL",
        (body) => {
          new Setting(body)
            .setName("DOI")
            .addText(text => text
              .setValue(this.ref.doi || "")
              .onChange(val => {
                this.ref.doi = val;
                this.updatePreviews();
              }));

          new Setting(body)
            .setName("URL")
            .addText(text => text
              .setValue(this.ref.url || "")
              .onChange(val => {
                this.ref.url = val;
                this.updatePreviews();
              }));
        }
      );

      // Accordion 3: Abstract
      this.createAnimatedAccordion(
        contentEl,
        'abs',
        "Abstract & Notes",
        (body) => {
          const absWrap = body.createDiv({ cls: "form-stacked-group full-width-group" });
          const absArea = absWrap.createEl("textarea", { 
            cls: "stacked-textarea full-width-textarea", 
            rows: 5, 
            placeholder: "Paper abstract or notes..." 
          });
          absArea.value = this.ref.abstract || "";
          absArea.addEventListener("input", () => {
            this.ref.abstract = absArea.value;
          });
        }
      );

      // Live Output Preview Box
      contentEl.createEl("div", { cls: "preview-section-title", text: "Live Output Preview" });
      this.previewEl = contentEl.createDiv({ cls: "citation-modal-preview-box" });
      this.updatePreviews();
    }

    // Obsidian Native Button Container
    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    
    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const importBtn = buttonRow.createEl("button", { cls: "mod-cta", text: "Import & Save" });
    importBtn.addEventListener("click", async () => {
      importBtn.disabled = true;
      importBtn.setText("Importing...");

      try {
        const buffer = await this.pdfFile.arrayBuffer();

        if (this.mode === 'existing') {
          const targetRef = this.existingRefs.find(r => r.citekey === this.selectedExistingCitekey);
          if (!targetRef) throw new Error("Target reference not found");

          const pdfPath = await this.storageManager.savePDFAttachment(targetRef.citekey, buffer);
          targetRef.pdfAttachment = pdfPath;
          await this.storageManager.saveReference(targetRef);
          new Notice(`Attached PDF to [${targetRef.citekey}]!`);
        } else {
          if (!this.ref.title.trim()) {
            this.ref.title = this.pdfFile.name.replace(/\.pdf$/i, "");
          }
          if (this.ref.authors.length === 0) {
            this.ref.authors = ["Unknown Author"];
          }
          if (!this.ref.citekey.trim()) {
            this.ref.citekey = CitationEngine.generateCitekey(this.ref.authors, this.ref.year, this.ref.title);
          }

          const pdfPath = await this.storageManager.savePDFAttachment(this.ref.citekey, buffer);
          this.ref.pdfAttachment = pdfPath;

          await this.storageManager.saveReference(this.ref);
          new Notice(`Created citation with PDF: [${this.ref.citekey}]`);
        }

        await this.onComplete();
        this.close();
      } catch (err: any) {
        new Notice(`Import failed: ${err.message}`);
        importBtn.disabled = false;
        importBtn.setText("Import & Save");
      }
    });
  }

  private renderAuthorChips(container: HTMLElement) {
    container.empty();
    const chipsWrap = container.createDiv({ cls: "author-chips-wrap" });

    for (let i = 0; i < this.ref.authors.length; i++) {
      const author = this.ref.authors[i];
      if (!author) continue;

      const chip = chipsWrap.createSpan({ cls: "author-chip" });
      chip.createSpan({ cls: "author-name", text: author });
      
      const removeBtn = chip.createSpan({ cls: "chip-remove-btn", text: "✕" });
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.ref.authors.splice(i, 1);
        this.renderAuthorChips(container);
        this.updatePreviews();
      });
    }

    const authorInput = chipsWrap.createEl("input", {
      type: "text",
      placeholder: this.ref.authors.length === 0 ? "e.g. Li, Ziheng 'Leo'" : "+ Add author...",
      cls: "author-chip-inline-input"
    });

    const addAuthor = () => {
      const val = authorInput.value.trim();
      if (val) {
        const parts = val.split(/[\r\n,]+/).map(p => p.trim()).filter(p => p.length > 0);
        for (const p of parts) {
          if (!this.ref.authors.includes(p)) {
            this.ref.authors.push(p);
          }
        }
        authorInput.value = "";
        this.renderAuthorChips(container);
        this.updatePreviews();
      }
    };

    authorInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addAuthor();
      } else if (e.key === "Backspace" && !authorInput.value && this.ref.authors.length > 0) {
        this.ref.authors.pop();
        this.renderAuthorChips(container);
        this.updatePreviews();
      }
    });

    authorInput.addEventListener("blur", () => {
      addAuthor();
    });

    container.addEventListener("click", () => {
      authorInput.focus();
    });
  }

  private createAnimatedAccordion(
    parent: HTMLElement,
    sectionId: string,
    title: string,
    renderBody: (bodyEl: HTMLElement) => void
  ) {
    const card = parent.createDiv({ cls: "citation-modal-accordion-card" });

    const header = card.createDiv({ cls: "accordion-header-row" });
    header.createEl("span", { cls: "accordion-title-text", text: title });
    const toggleIcon = header.createSpan({ cls: "accordion-icon-wrap" });
    setIcon(toggleIcon, "chevron-down");

    const collapseBody = card.createDiv({ cls: "accordion-body-collapse" });
    renderBody(collapseBody);

    this.accordionCards.set(sectionId, { cardEl: card, iconEl: toggleIcon });

    header.addEventListener("click", () => {
      const willOpen = !card.hasClass("open");
      if (willOpen) {
        for (const [id, other] of this.accordionCards.entries()) {
          if (id !== sectionId) {
            other.cardEl.removeClass("open");
            setIcon(other.iconEl, "chevron-down");
          }
        }
        card.addClass("open");
        setIcon(toggleIcon, "chevron-up");
      } else {
        card.removeClass("open");
        setIcon(toggleIcon, "chevron-down");
      }
    });
  }

  private updatePreviews() {
    if (!this.previewEl) return;
    this.previewEl.empty();
    
    const apaPill = this.previewEl.createDiv({ cls: "preview-row" });
    apaPill.createEl("code", { cls: "preview-label", text: "APA 7:" });
    apaPill.createSpan({ cls: "preview-content", text: CitationEngine.formatAPA7(this.ref) });

    const inbodyPill = this.previewEl.createDiv({ cls: "preview-row" });
    inbodyPill.createEl("code", { cls: "preview-label", text: "In-Text:" });
    inbodyPill.createSpan({ cls: "preview-content", text: `${CitationEngine.formatInBody(this.ref, 'parenthetical')} | ${CitationEngine.formatInBody(this.ref, 'footnote')}` });
  }

  onClose() {
    this.contentEl.empty();
  }
}
