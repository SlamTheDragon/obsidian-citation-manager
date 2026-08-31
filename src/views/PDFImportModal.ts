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
  private activeAccordion: string | null = null;
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
    contentEl.addClass("citation-native-modal-content");

    // Modal Header
    const header = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = header.createSpan({ cls: "modal-header-icon" });
    setIcon(iconSpan, "paperclip");
    header.createEl("h2", { text: "Import PDF Document" });

    // File Info Card
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
      // Auto-Fetch Card
      const fetchBox = contentEl.createDiv({ cls: "citation-modal-section-card" });
      const fetchTitleRow = fetchBox.createDiv({ cls: "section-card-header" });
      fetchTitleRow.createEl("div", { cls: "section-card-title", text: "Auto-Fetch Metadata" });
      fetchTitleRow.createEl("div", { cls: "section-card-desc", text: "Paste DOI or URL to pull publication details automatically" });

      const fetchInputRow = fetchBox.createDiv({ cls: "fetch-input-row" });
      const fetchInput = fetchInputRow.createEl("input", {
        type: "text",
        placeholder: "e.g. 10.1145/3313831.3376722",
        cls: "fetch-text-input",
        value: this.ref.doi || ""
      });
      const fetchBtn = fetchInputRow.createEl("button", { cls: "citation-small-btn", text: "Fetch & Fill" });

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

      // --- SECTION 1: CORE INFORMATION ---
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

      // Authors (Header on top, full-width chip box on new line)
      const authorSection = coreCard.createDiv({ cls: "form-stacked-group" });
      const authorHeader = authorSection.createDiv({ cls: "stacked-label-with-desc" });
      authorHeader.createEl("label", { cls: "stacked-label", text: "Authors" });
      authorHeader.createSpan({ cls: "stacked-desc", text: "(Type name and press Enter or comma)" });
      
      const authorContainer = authorSection.createDiv({ cls: "author-chips-input-container" });
      this.renderAuthorChips(authorContainer);

      // 3. Year, Type, Citekey in a spacious 3-column stacked grid
      const metaGrid = coreCard.createDiv({ cls: "form-grid-3" });

      const yearCol = metaGrid.createDiv({ cls: "form-grid-col" });
      yearCol.createEl("label", { cls: "stacked-label", text: "Year" });
      const yearInput = yearCol.createEl("input", { type: "text", cls: "grid-input", placeholder: "e.g. 2026", value: String(this.ref.year || "") });
      yearInput.addEventListener("input", () => {
        this.ref.year = yearInput.value;
        this.updatePreviews();
      });

      const typeCol = metaGrid.createDiv({ cls: "form-grid-col" });
      typeCol.createEl("label", { cls: "stacked-label", text: "Type" });
      const typeSelect = typeCol.createEl("select", { cls: "dropdown grid-input-dropdown" });
      const types = ['journal', 'conference', 'book', 'webpage', 'blog', 'video', 'preprint', 'report', 'standard', 'thesis', 'other'];
      types.forEach(t => {
        const opt = typeSelect.createEl("option", { value: t, text: t.toUpperCase() });
        if (t === this.ref.type) opt.selected = true;
      });
      typeSelect.addEventListener("change", () => {
        this.ref.type = typeSelect.value as any;
        this.updatePreviews();
      });

      const keyCol = metaGrid.createDiv({ cls: "form-grid-col" });
      keyCol.createEl("label", { cls: "stacked-label", text: "Citekey" });
      const keyInput = keyCol.createEl("input", { type: "text", cls: "grid-input", placeholder: "Auto-generated", value: this.ref.citekey });
      keyInput.addEventListener("input", () => {
        this.ref.citekey = keyInput.value.replace(/[^a-zA-Z0-9_-]/g, "");
        this.updatePreviews();
      });

      // --- ACCORDION 1: PUBLICATION & VENUE ---
      this.createExclusiveAccordion(
        contentEl,
        "pub",
        "Publication & Venue",
        (body) => {
          const pubGroup = body.createDiv({ cls: "form-stacked-group" });
          pubGroup.createEl("label", { cls: "stacked-label", text: "Journal / Conference / Publication" });
          const pubInput = pubGroup.createEl("input", { type: "text", cls: "grid-input", placeholder: "Publication venue", value: this.ref.publication || "" });
          pubInput.addEventListener("input", () => {
            this.ref.publication = pubInput.value;
            this.updatePreviews();
          });

          const volGrid = body.createDiv({ cls: "form-grid-3" });
          
          const volItem = volGrid.createDiv({ cls: "form-grid-col" });
          volItem.createEl("label", { cls: "stacked-label", text: "Volume" });
          const volIn = volItem.createEl("input", { type: "text", cls: "grid-input", placeholder: "Vol", value: this.ref.volume || "" });
          volIn.addEventListener("input", () => { this.ref.volume = volIn.value; this.updatePreviews(); });

          const issItem = volGrid.createDiv({ cls: "form-grid-col" });
          issItem.createEl("label", { cls: "stacked-label", text: "Issue" });
          const issIn = issItem.createEl("input", { type: "text", cls: "grid-input", placeholder: "Issue", value: this.ref.issue || "" });
          issIn.addEventListener("input", () => { this.ref.issue = issIn.value; this.updatePreviews(); });

          const pageItem = volGrid.createDiv({ cls: "form-grid-col" });
          pageItem.createEl("label", { cls: "stacked-label", text: "Pages" });
          const pageIn = pageItem.createEl("input", { type: "text", cls: "grid-input", placeholder: "Pages", value: this.ref.pages || "" });
          pageIn.addEventListener("input", () => { this.ref.pages = pageIn.value; this.updatePreviews(); });
        }
      );

      // --- ACCORDION 2: IDENTIFIERS & DOI ---
      this.createExclusiveAccordion(
        contentEl,
        "ids",
        "Identifiers, DOI & URL",
        (body) => {
          const idGrid = body.createDiv({ cls: "form-grid-2" });

          const doiGroup = idGrid.createDiv({ cls: "form-grid-col" });
          doiGroup.createEl("label", { cls: "stacked-label", text: "DOI" });
          const doiInput = doiGroup.createEl("input", { type: "text", cls: "grid-input", placeholder: "10.xxxx/yyyy", value: this.ref.doi || "" });
          doiInput.addEventListener("input", () => {
            this.ref.doi = doiInput.value;
            this.updatePreviews();
          });

          const urlGroup = idGrid.createDiv({ cls: "form-grid-col" });
          urlGroup.createEl("label", { cls: "stacked-label", text: "URL" });
          const urlInput = urlGroup.createEl("input", { type: "text", cls: "grid-input", placeholder: "https://...", value: this.ref.url || "" });
          urlInput.addEventListener("input", () => {
            this.ref.url = urlInput.value;
            this.updatePreviews();
          });
        }
      );

      // --- ACCORDION 3: ABSTRACT ---
      this.createExclusiveAccordion(
        contentEl,
        "abstract",
        "Abstract & Notes",
        (body) => {
          const absGroup = body.createDiv({ cls: "form-stacked-group" });
          const absArea = absGroup.createEl("textarea", { cls: "stacked-textarea", rows: 4, placeholder: "Paste document abstract or notes..." });
          absArea.value = this.ref.abstract || "";
          absArea.addEventListener("input", () => { this.ref.abstract = absArea.value; });
        }
      );

      // Live Output Preview Box
      contentEl.createEl("div", { cls: "preview-section-title", text: "Live Output Preview" });
      this.previewEl = contentEl.createDiv({ cls: "citation-modal-preview-box" });
      this.updatePreviews();
    }

    // Sticky Bottom Footer Bar
    const footerBar = contentEl.createDiv({ cls: "citation-modal-sticky-footer" });
    
    const cancelBtn = footerBar.createEl("button", { cls: "citation-small-btn citation-btn-secondary", text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const importBtn = footerBar.createEl("button", { cls: "citation-small-btn", text: "Import & Save" });
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

  private createExclusiveAccordion(
    parent: HTMLElement,
    id: string,
    title: string,
    renderBody: (bodyEl: HTMLElement) => void
  ) {
    const card = parent.createDiv({ cls: "citation-modal-accordion-card" });
    const isCurrentlyOpen = this.activeAccordion === id;
    if (isCurrentlyOpen) card.addClass("open");

    const header = card.createDiv({ cls: "accordion-header-row" });
    header.createEl("span", { cls: "accordion-title-text", text: title });
    const toggleIcon = header.createSpan({ cls: "accordion-icon-wrap" });
    setIcon(toggleIcon, isCurrentlyOpen ? "chevron-up" : "chevron-down");

    const body = card.createDiv({ cls: "accordion-body-collapse" });
    renderBody(body);

    this.accordionCards.set(id, { cardEl: card, iconEl: toggleIcon });

    header.addEventListener("click", () => {
      if (this.activeAccordion === id) {
        this.activeAccordion = null;
        card.removeClass("open");
        setIcon(toggleIcon, "chevron-down");
      } else {
        for (const [otherId, item] of this.accordionCards.entries()) {
          if (otherId !== id) {
            item.cardEl.removeClass("open");
            setIcon(item.iconEl, "chevron-down");
          }
        }
        this.activeAccordion = id;
        card.addClass("open");
        setIcon(toggleIcon, "chevron-up");
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
