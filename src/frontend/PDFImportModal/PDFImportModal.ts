import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, ReferenceType, CitationCollection, DEFAULT_COLLECTION, DEFAULT_COLLECTION_ID } from '../../backend/types';
import { StorageManager } from '../../backend/storageManager';
import { MetadataResolvers } from '../../backend/metadataResolvers';
import { CitationEngine } from '../../backend/citationEngine';
import { ProjectIndexer } from '../../backend/projectIndexer';
import { Logger } from '../../backend/logger';

export class PDFImportModal extends Modal {
  private pdfFile: File;
  private project: ProjectRecord | null;
  private existingRefs: ReferenceMetadata[];
  private collections: CitationCollection[];
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
    onComplete: () => Promise<void>,
    collections: CitationCollection[] = [DEFAULT_COLLECTION]
  ) {
    super(app);
    this.pdfFile = pdfFile;
    this.project = project;
    this.existingRefs = existingRefs;
    this.collections = collections.length > 0 ? collections : [DEFAULT_COLLECTION];
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
      collectionId: DEFAULT_COLLECTION_ID,
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

  onOpen() {
    this.titleEl.setText("Import PDF Document");
    this.renderLoadingSkeleton();
    this.extractAndRender();
  }

  private renderLoadingSkeleton() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    const card = contentEl.createDiv({ cls: "citation-modal-section-card" });
    const row = card.createDiv({ cls: "fetch-title" });
    setIcon(row.createSpan({ cls: "inline-icon" }), "file-text");
    row.createSpan({ text: ` Scanning & extracting metadata from ${this.pdfFile.name}...` });

    const skeletonWrap = contentEl.createDiv({ cls: "citation-skeleton-container" });
    skeletonWrap.style.display = "flex";
    skeletonWrap.style.flexDirection = "column";
    skeletonWrap.style.gap = "12px";
    skeletonWrap.style.padding = "8px 0";

    const createPulseBar = (h: string, w: string) => {
      const bar = skeletonWrap.createDiv({ cls: "skeleton-pulse-bar" });
      bar.style.height = h;
      bar.style.width = w;
      bar.style.borderRadius = "var(--radius-s)";
      bar.style.background = "var(--background-modifier-border)";
      bar.style.opacity = "0.6";
    };

    createPulseBar("26px", "80%");
    createPulseBar("34px", "100%");
    createPulseBar("24px", "55%");
    createPulseBar("40px", "100%");
  }

  private async extractAndRender() {
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
          const currentProjects = this.ref.projects ? [...this.ref.projects] : [];
          this.ref = { 
            ...this.ref, 
            ...res, 
            projects: currentProjects.length > 0 ? currentProjects : (res.projects || []) 
          } as ReferenceMetadata;
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
      const titleGroup = coreCard.createDiv({ cls: "citation-form-group" });
      titleGroup.createEl("label", { cls: "citation-form-label", text: "Title" });
      const titleInput = titleGroup.createEl("input", {
        type: "text",
        cls: "citation-form-input",
        placeholder: "Title...",
        value: this.ref.title
      });
      titleInput.addEventListener("input", () => {
        this.ref.title = titleInput.value;
        this.updatePreviews();
      });

      // Authors
      const authorGroup = coreCard.createDiv({ cls: "citation-form-group" });
      const authorLabelRow = authorGroup.createDiv({ cls: "citation-label-row" });
      authorLabelRow.createEl("label", { cls: "citation-form-label", text: "Authors" });
      authorLabelRow.createSpan({ cls: "citation-form-hint", text: "(Press Enter or comma to add author)" });
      
      const authorContainer = authorGroup.createDiv({ cls: "author-chips-input-container" });
      this.renderAuthorChips(authorContainer);

      // Metadata (Year, Type, Citekey)
      const metaGrid = coreCard.createDiv({ cls: "citation-form-grid-3" });
      
      const yearGroup = metaGrid.createDiv({ cls: "citation-form-group" });
      yearGroup.createEl("label", { cls: "citation-form-label", text: "Year" });
      const yearInput = yearGroup.createEl("input", {
        type: "text",
        cls: "citation-form-input",
        placeholder: "e.g. 2026",
        value: String(this.ref.year || "")
      });
      yearInput.addEventListener("input", () => {
        this.ref.year = yearInput.value;
        this.updatePreviews();
      });

      const typeGroup = metaGrid.createDiv({ cls: "citation-form-group" });
      typeGroup.createEl("label", { cls: "citation-form-label", text: "Type" });
      const typeSelect = typeGroup.createEl("select", { cls: "citation-form-select" });
      const types: ReferenceType[] = ['journal', 'conference', 'book', 'webpage', 'blog', 'video', 'preprint', 'report', 'standard', 'thesis', 'other'];
      types.forEach(t => {
        const opt = typeSelect.createEl("option", { value: t, text: t.toUpperCase() });
        if (t === this.ref.type) opt.selected = true;
      });
      typeSelect.addEventListener("change", () => {
        this.ref.type = typeSelect.value as ReferenceType;
        this.updatePreviews();
      });

      const keyGroup = metaGrid.createDiv({ cls: "citation-form-group" });
      const keyLabelRow = keyGroup.createDiv({ cls: "citation-label-row" });
      keyLabelRow.createEl("label", { cls: "citation-form-label", text: "Citekey" });
      keyLabelRow.createSpan({ cls: "citation-form-hint", text: "(Auto-derived)" });
      this.keyInputEl = keyGroup.createEl("input", {
        type: "text",
        cls: "citation-form-input citation-key-readonly",
        value: this.ref.citekey,
        attr: { readonly: "true" },
        title: "Citekey is automatically derived from author & year"
      });
      this.keyInputEl.tabIndex = -1;

      // Collection Selector
      const collectionGroup = coreCard.createDiv({ cls: "citation-form-group" });
      const colLabelRow = collectionGroup.createDiv({ cls: "citation-label-row" });
      colLabelRow.createEl("label", { cls: "citation-form-label", text: "Citation Collection / Group" });
      const colSelect = collectionGroup.createEl("select", { cls: "citation-form-select" });
      for (const col of this.collections) {
        const opt = colSelect.createEl("option", { value: col.id, text: `${col.name}${col.isDefault ? ' (Default)' : ''}` });
        if (col.id === (this.ref.collectionId || DEFAULT_COLLECTION_ID)) opt.selected = true;
      }
      colSelect.addEventListener("change", () => {
        this.ref.collectionId = colSelect.value;
      });

      // Accordion 1: Publication & Venue
      this.createAnimatedAccordion(
        contentEl,
        'pub',
        "Publication & Venue",
        (body) => {
          const pubGroup = body.createDiv({ cls: "citation-form-group" });
          pubGroup.createEl("label", { cls: "citation-form-label", text: "Journal / Conference / Publication" });
          const pubInput = pubGroup.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "e.g. ACM CHI Conference",
            value: this.ref.publication || ""
          });
          pubInput.addEventListener("input", () => {
            this.ref.publication = pubInput.value;
            this.updatePreviews();
          });

          const vipGrid = body.createDiv({ cls: "citation-form-grid-3" });
          
          const volGroup = vipGrid.createDiv({ cls: "citation-form-group" });
          volGroup.createEl("label", { cls: "citation-form-label", text: "Volume" });
          const volInput = vipGrid.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "Vol",
            value: this.ref.volume || ""
          });
          volInput.addEventListener("input", () => { this.ref.volume = volInput.value; this.updatePreviews(); });

          const issueGroup = vipGrid.createDiv({ cls: "citation-form-group" });
          issueGroup.createEl("label", { cls: "citation-form-label", text: "Issue" });
          const issueInput = vipGrid.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "Issue",
            value: this.ref.issue || ""
          });
          issueInput.addEventListener("input", () => { this.ref.issue = issueInput.value; this.updatePreviews(); });

          const pagesGroup = vipGrid.createDiv({ cls: "citation-form-group" });
          pagesGroup.createEl("label", { cls: "citation-form-label", text: "Pages" });
          const pagesInput = vipGrid.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "Pages",
            value: this.ref.pages || ""
          });
          pagesInput.addEventListener("input", () => { this.ref.pages = pagesInput.value; this.updatePreviews(); });

          const publisherGroup = body.createDiv({ cls: "citation-form-group" });
          publisherGroup.createEl("label", { cls: "citation-form-label", text: "Publisher" });
          const publisherInput = publisherGroup.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "e.g. ACM, IEEE",
            value: this.ref.publisher || ""
          });
          publisherInput.addEventListener("input", () => { this.ref.publisher = publisherInput.value; });
        }
      );

      // Accordion 2: Identifiers & DOI
      this.createAnimatedAccordion(
        contentEl,
        'ids',
        "Identifiers, DOI & URL",
        (body) => {
          const doiGroup = body.createDiv({ cls: "citation-form-group" });
          doiGroup.createEl("label", { cls: "citation-form-label", text: "DOI" });
          const doiInput = body.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "10.xxxx/yyyy",
            value: this.ref.doi || ""
          });
          doiInput.addEventListener("input", () => { this.ref.doi = doiInput.value; this.updatePreviews(); });

          const urlGroup = body.createDiv({ cls: "citation-form-group" });
          urlGroup.createEl("label", { cls: "citation-form-label", text: "URL" });
          const urlInput = body.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "https://...",
            value: this.ref.url || ""
          });
          urlInput.addEventListener("input", () => { this.ref.url = urlInput.value; this.updatePreviews(); });

          const numGrid = body.createDiv({ cls: "citation-form-grid-2" });
          
          const isbnGroup = numGrid.createDiv({ cls: "citation-form-group" });
          isbnGroup.createEl("label", { cls: "citation-form-label", text: "ISBN" });
          const isbnInput = isbnGroup.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "ISBN",
            value: this.ref.isbn || ""
          });
          isbnInput.addEventListener("input", () => { this.ref.isbn = isbnInput.value; });

          const issnGroup = numGrid.createDiv({ cls: "citation-form-group" });
          issnGroup.createEl("label", { cls: "citation-form-label", text: "ISSN" });
          const issnInput = issnGroup.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "ISSN",
            value: this.ref.issn || ""
          });
          issnInput.addEventListener("input", () => { this.ref.issn = issnInput.value; });

          // Media & Access Details Grid
          const mediaGrid = body.createDiv({ cls: "citation-form-grid-2" });

          const accessGroup = mediaGrid.createDiv({ cls: "citation-form-group" });
          accessGroup.createEl("label", { cls: "citation-form-label", text: "Accessed Date" });
          const accessInput = accessGroup.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "e.g. September 2, 2026",
            value: this.ref.accessedDate || ""
          });
          accessInput.addEventListener("input", () => {
            this.ref.accessedDate = accessInput.value;
            this.updatePreviews();
          });

          const durationGroup = mediaGrid.createDiv({ cls: "citation-form-group" });
          durationGroup.createEl("label", { cls: "citation-form-label", text: "Duration / Length" });
          const durationInput = durationGroup.createEl("input", {
            type: "text",
            cls: "citation-form-input",
            placeholder: "e.g. 14:20",
            value: this.ref.duration || ""
          });
          durationInput.addEventListener("input", () => {
            this.ref.duration = durationInput.value;
            this.updatePreviews();
          });
        }
      );

      // Accordion 3: Abstract
      this.createAnimatedAccordion(
        contentEl,
        'abs',
        "Abstract & Notes",
        (body) => {
          const absGroup = body.createDiv({ cls: "citation-form-group" });
          absGroup.createEl("label", { cls: "citation-form-label", text: "Abstract or Synthesis Notes" });
          const absArea = absGroup.createEl("textarea", { 
            cls: "citation-form-textarea", 
            attr: { rows: "5", placeholder: "Paper abstract or notes..." } 
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
          // Auto-commit any pending author input
          if (this.authorInputEl && this.authorInputEl.value.trim()) {
            const parts = this.authorInputEl.value.trim().split(/[\r\n,]+/).map(p => p.trim()).filter(p => p.length > 0);
            for (const p of parts) {
              if (!this.ref.authors.includes(p)) {
                this.ref.authors.push(p);
              }
            }
            this.authorInputEl.value = "";
          }

          if (this.ref.authors.length > 1) {
            this.ref.authors = this.ref.authors.filter(a => a && a.trim() && !/^unknown/i.test(a.trim()));
          }

          if (!this.ref.title.trim()) {
            this.ref.title = this.pdfFile.name.replace(/\.pdf$/i, "");
          }
          if (this.ref.authors.length === 0) {
            this.ref.authors = ["Unknown Author"];
          }
          if (!this.ref.citekey.trim() || (/^unknown|web|untitled/i.test(this.ref.citekey))) {
            this.ref.citekey = CitationEngine.generateCitekey(this.ref.authors, this.ref.year, this.ref.title);
          }

          if (this.project) {
            this.ref.projects = [this.project.id];
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

  private authorInputEl: HTMLInputElement | null = null;
  private keyInputEl: HTMLInputElement | null = null;

  private renderAuthorChips(container: HTMLElement) {
    container.empty();
    const chipsWrap = container.createDiv({ cls: "author-chips-wrap" });

    for (let i = 0; i < this.ref.authors.length; i++) {
      const author = this.ref.authors[i];
      if (!author) continue;

      const chip = chipsWrap.createSpan({ cls: "author-chip" });
      chip.createSpan({ cls: "author-name", text: author });
      
      const removeBtn = chip.createSpan({ cls: "chip-remove-btn" });
      setIcon(removeBtn, "x");
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.ref.authors.splice(i, 1);
        this.renderAuthorChips(container);
        this.updatePreviews();
      });
    }

    this.authorInputEl = chipsWrap.createEl("input", {
      type: "text",
      placeholder: this.ref.authors.length === 0 ? "e.g. Li, Ziheng 'Leo'" : "+ Add author...",
      cls: "author-chip-inline-input"
    });

    const addAuthor = () => {
      if (!this.authorInputEl) return;
      const val = this.authorInputEl.value.trim();
      if (val) {
        const parts = val.split(/[\r\n;]+/).map(p => p.trim()).filter(p => p.length > 0);
        for (const p of parts) {
          if (!this.ref.authors.includes(p)) {
            this.ref.authors.push(p);
          }
        }
        this.authorInputEl.value = "";
        this.renderAuthorChips(container);
        this.updatePreviews();
      }
    };

    this.authorInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ";") {
        e.preventDefault();
        addAuthor();
      }
    });

    this.authorInputEl.addEventListener("blur", () => {
      addAuthor();
    });

    container.addEventListener("click", () => {
      this.authorInputEl?.focus();
    });
  }

  private createAnimatedAccordion(
    parent: HTMLElement,
    sectionId: string,
    titleText: string,
    renderBody: (bodyEl: HTMLElement) => void
  ) {
    const card = parent.createDiv({ cls: "citation-modal-accordion-card" });
    
    const header = card.createDiv({ cls: "accordion-header-row" });
    header.createSpan({ cls: "accordion-title-text", text: titleText });
    
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
    this.ref.citekey = CitationEngine.generateCitekey(this.ref.authors, this.ref.year, this.ref.title);
    if (this.keyInputEl) {
      this.keyInputEl.value = this.ref.citekey;
    }

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
