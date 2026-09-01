import { App, Modal, Notice, setIcon } from 'obsidian';
import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';
import { MetadataResolvers } from '../metadataResolvers';
import { ProjectIndexer } from '../projectIndexer';

export class ReferenceEditorModal extends Modal {
  private ref: ReferenceMetadata;
  private originalCitekey: string;
  private onSave: (ref: ReferenceMetadata, originalCitekey?: string) => Promise<void>;
  private isNew: boolean;
  private pdfDOIStatus: { status: 'match' | 'mismatch' | 'unknown'; detectedDOI?: string } | null = null;
  private openAccordionId: string | null = null;

  private previewEl: HTMLElement | null = null;
  private accordionCards: Map<string, { cardEl: HTMLElement; iconEl: HTMLElement }> = new Map();

  constructor(
    app: App,
    ref: Partial<ReferenceMetadata>,
    onSave: (ref: ReferenceMetadata, originalCitekey?: string) => Promise<void>,
    isNew: boolean = false
  ) {
    super(app);
    this.originalCitekey = ref.citekey || "";
    this.ref = {
      citekey: ref.citekey || "",
      type: ref.type || "journal",
      title: ref.title || "",
      authors: ref.authors && ref.authors.length > 0 ? [...ref.authors] : [],
      year: ref.year || new Date().getFullYear(),
      month: ref.month || "",
      publication: ref.publication || "",
      volume: ref.volume || "",
      issue: ref.issue || "",
      pages: ref.pages || "",
      publisher: ref.publisher || "",
      doi: ref.doi || "",
      url: ref.url || "",
      isbn: ref.isbn || "",
      issn: ref.issn || "",
      abstract: ref.abstract || "",
      pdfAttachment: ref.pdfAttachment || "",
      projects: ref.projects || [],
      tags: ref.tags || [],
      apa: ref.apa || "",
      ieee: ref.ieee || "",
      harvard: ref.harvard || "",
      chicago: ref.chicago || "",
      vancouver: ref.vancouver || "",
      dateAdded: ref.dateAdded || new Date().toISOString(),
      dateModified: new Date().toISOString(),
    };
    this.onSave = onSave;
    this.isNew = isNew;
  }

  onOpen() {
    this.titleEl.setText(this.isNew ? "New Citation" : `Edit Citation: ${this.ref.citekey}`);
    this.renderModal();
  }

  private renderModal() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    // 1. AUTO-FETCH SECTION
    const fetchBox = contentEl.createDiv({ cls: "citation-modal-section-card" });
    fetchBox.createEl("div", { cls: "section-card-title", text: "Auto-Fetch Metadata" });
    fetchBox.createEl("div", { cls: "section-card-desc", text: "Paste DOI, arXiv ID, ISBN, URL, or BibTeX snippet to auto-fill" });

    const fetchInputRow = fetchBox.createDiv({ cls: "fetch-input-row" });
    const fetchInput = fetchInputRow.createEl("input", {
      type: "text",
      placeholder: "e.g. 10.1145/3313831.3376722 or https://...",
      cls: "fetch-text-input"
    });
    const fetchBtn = fetchInputRow.createEl("button", { cls: "mod-cta citation-fetch-btn", text: "Fetch & Fill" });

    const doFetch = async () => {
      const val = fetchInput.value.trim();
      if (!val) {
        new Notice("Please enter a DOI, URL, or identifier first.");
        return;
      }
      fetchBtn.disabled = true;
      fetchBtn.setText("Fetching...");
      try {
        const fetched = await MetadataResolvers.detectAndResolve(val);
        const currentProjects = this.ref.projects ? [...this.ref.projects] : [];
        this.ref = { 
          ...this.ref, 
          ...fetched,
          projects: currentProjects.length > 0 ? currentProjects : (fetched.projects || [])
        } as ReferenceMetadata;
        new Notice("Metadata successfully fetched!");
        this.renderModal();
      } catch (e: any) {
        new Notice(`Fetch failed: ${e.message}`);
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

    // 2. CORE INFORMATION SECTION (Immaculate Stacked Layout)
    const coreCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    coreCard.createEl("div", { cls: "section-card-title", text: "Core Information" });

    // Title
    const titleGroup = coreCard.createDiv({ cls: "citation-form-group" });
    titleGroup.createEl("label", { cls: "citation-form-label", text: "Title" });
    const titleInput = titleGroup.createEl("input", {
      type: "text",
      cls: "citation-form-input",
      placeholder: "Paper or document title...",
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
    authorLabelRow.createSpan({ cls: "citation-form-hint", text: "(Press Enter or semicolon ; to add author)" });
    
    const authorContainer = authorGroup.createDiv({ cls: "author-chips-input-container" });
    this.renderAuthorChips(authorContainer);

    // Year, Type, Citekey 3-Column Grid
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
    keyGroup.createEl("label", { cls: "citation-form-label", text: "Citekey" });
    const keyInput = keyGroup.createEl("input", {
      type: "text",
      cls: "citation-form-input",
      placeholder: "e.g. Li2026",
      value: this.ref.citekey
    });
    keyInput.addEventListener("input", () => {
      this.ref.citekey = keyInput.value.replace(/[^a-zA-Z0-9_-]/g, "");
      this.updatePreviews();
    });

    // 3. ACCORDION 1: PUBLICATION & VENUE
    this.createAnimatedAccordion(
      contentEl,
      'pub',
      "Publication & Venue",
      (body) => {
        // Journal / Conference
        const pubGroup = body.createDiv({ cls: "citation-form-group" });
        pubGroup.createEl("label", { cls: "citation-form-label", text: "Journal / Conference / Publication" });
        const pubInput = pubGroup.createEl("input", {
          type: "text",
          cls: "citation-form-input",
          placeholder: "e.g. ACM Transactions on Computer-Human Interaction",
          value: this.ref.publication || ""
        });
        pubInput.addEventListener("input", () => {
          this.ref.publication = pubInput.value;
          this.updatePreviews();
        });

        // Vol / Issue / Pages 3-Column Grid
        const vipGrid = body.createDiv({ cls: "citation-form-grid-3" });
        
        const volGroup = vipGrid.createDiv({ cls: "citation-form-group" });
        volGroup.createEl("label", { cls: "citation-form-label", text: "Volume" });
        const volInput = volGroup.createEl("input", {
          type: "text",
          cls: "citation-form-input",
          placeholder: "Vol",
          value: this.ref.volume || ""
        });
        volInput.addEventListener("input", () => {
          this.ref.volume = volInput.value;
          this.updatePreviews();
        });

        const issueGroup = vipGrid.createDiv({ cls: "citation-form-group" });
        issueGroup.createEl("label", { cls: "citation-form-label", text: "Issue" });
        const issueInput = issueGroup.createEl("input", {
          type: "text",
          cls: "citation-form-input",
          placeholder: "Issue",
          value: this.ref.issue || ""
        });
        issueInput.addEventListener("input", () => {
          this.ref.issue = issueInput.value;
          this.updatePreviews();
        });

        const pagesGroup = vipGrid.createDiv({ cls: "citation-form-group" });
        pagesGroup.createEl("label", { cls: "citation-form-label", text: "Pages" });
        const pagesInput = pagesGroup.createEl("input", {
          type: "text",
          cls: "citation-form-input",
          placeholder: "Pages",
          value: this.ref.pages || ""
        });
        pagesInput.addEventListener("input", () => {
          this.ref.pages = pagesInput.value;
          this.updatePreviews();
        });

        // Publisher
        const publisherGroup = body.createDiv({ cls: "citation-form-group" });
        publisherGroup.createEl("label", { cls: "citation-form-label", text: "Publisher" });
        const publisherInput = publisherGroup.createEl("input", {
          type: "text",
          cls: "citation-form-input",
          placeholder: "e.g. ACM, IEEE, Springer",
          value: this.ref.publisher || ""
        });
        publisherInput.addEventListener("input", () => {
          this.ref.publisher = publisherInput.value;
        });
      }
    );

    // 4. ACCORDION 2: IDENTIFIERS, DOI & URL
    this.createAnimatedAccordion(
      contentEl,
      'ids',
      "Identifiers, DOI & URL",
      (body) => {
        // DOI
        const doiGroup = body.createDiv({ cls: "citation-form-group" });
        doiGroup.createEl("label", { cls: "citation-form-label", text: "DOI" });
        const doiInput = doiGroup.createEl("input", {
          type: "text",
          cls: "citation-form-input",
          placeholder: "10.xxxx/yyyy",
          value: this.ref.doi || ""
        });
        doiInput.addEventListener("input", () => {
          this.ref.doi = doiInput.value;
          this.updatePreviews();
        });

        // URL
        const urlGroup = body.createDiv({ cls: "citation-form-group" });
        urlGroup.createEl("label", { cls: "citation-form-label", text: "URL" });
        const urlInput = urlGroup.createEl("input", {
          type: "text",
          cls: "citation-form-input",
          placeholder: "https://...",
          value: this.ref.url || ""
        });
        urlInput.addEventListener("input", () => {
          this.ref.url = urlInput.value;
          this.updatePreviews();
        });

        // ISBN & ISSN Grid
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
      }
    );

    // 5. ACCORDION 3: ABSTRACT & LITERATURE SUMMARY
    this.createAnimatedAccordion(
      contentEl,
      'abs',
      "Abstract & Literature Summary",
      (body) => {
        const absGroup = body.createDiv({ cls: "citation-form-group" });
        absGroup.createEl("label", { cls: "citation-form-label", text: "Abstract or Synthesis Notes" });
        const absArea = absGroup.createEl("textarea", { 
          cls: "citation-form-textarea", 
          rows: 5, 
          placeholder: "Paper abstract or literature synthesis notes..." 
        });
        absArea.value = this.ref.abstract || "";
        absArea.addEventListener("input", () => {
          this.ref.abstract = absArea.value;
        });
      }
    );

    // 6. ACCORDION 4: ATTACHED PDF DOCUMENT
    this.createAnimatedAccordion(
      contentEl,
      'pdf',
      "Attached PDF Document",
      (body) => {
        const pdfContainer = body.createDiv({ cls: "citation-pdf-attach-wrap" });
        pdfContainer.style.display = "flex";
        pdfContainer.style.flexDirection = "column";
        pdfContainer.style.gap = "8px";

        if (this.ref.pdfAttachment) {
          const pdfCard = pdfContainer.createDiv({ cls: "citation-modal-section-card" });
          pdfCard.style.display = "flex";
          pdfCard.style.alignItems = "center";
          pdfCard.style.justifyContent = "space-between";

          const leftInfo = pdfCard.createDiv({ cls: "pdf-file-info" });
          setIcon(leftInfo.createSpan({ cls: "inline-icon" }), "file-text");
          const fileName = this.ref.pdfAttachment.split("/").pop() || this.ref.pdfAttachment;
          leftInfo.createSpan({ text: ` ${fileName}`, cls: "file-basename" });

          const actionRow = pdfCard.createDiv({ cls: "pdf-card-actions" });
          actionRow.style.display = "flex";
          actionRow.style.gap = "6px";

          const removeBtn = actionRow.createEl("button", { cls: "citation-mini-btn btn-danger", title: "Detach PDF" });
          removeBtn.setText("Detach");
          removeBtn.style.width = "auto";
          removeBtn.style.padding = "2px 8px";
          removeBtn.addEventListener("click", () => {
            this.ref.pdfAttachment = undefined;
            this.pdfDOIStatus = null;
            this.openAccordionId = 'pdf';
            this.renderModal();
          });
        } else {
          // Dropzone & File Picker Card
          const dropzone = pdfContainer.createDiv({ cls: "citation-pdf-dropzone" });
          dropzone.style.padding = "16px";
          dropzone.style.display = "flex";
          dropzone.style.flexDirection = "column";
          dropzone.style.alignItems = "center";
          dropzone.style.justifyContent = "center";
          dropzone.style.gap = "6px";
          dropzone.style.border = "2px dashed var(--background-modifier-border)";
          dropzone.style.borderRadius = "var(--radius-m)";
          dropzone.style.cursor = "pointer";
          dropzone.style.textAlign = "center";

          setIcon(dropzone.createDiv({ cls: "empty-icon" }), "file-up");
          dropzone.createEl("strong", { text: "Drop PDF here or click to browse" });
          dropzone.createSpan({ cls: "status-hint", text: "PDF will be saved to .references/attachments and scanned for DOI" });

          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.accept = ".pdf";
          fileInput.style.display = "none";

          const processPDFFile = async (file: File) => {
            try {
              const buffer = await file.arrayBuffer();
              const detectedDOI = ProjectIndexer.extractDOIFromBuffer(buffer);
              const citekey = this.ref.citekey.trim() || CitationEngine.generateCitekey(this.ref.authors, this.ref.year, this.ref.title);
              const rootPath = ".references";
              const pdfPath = `${rootPath}/attachments/${citekey}.pdf`;
              await this.app.vault.adapter.writeBinary(pdfPath, buffer);
              this.ref.pdfAttachment = pdfPath;

              if (detectedDOI && this.ref.doi) {
                const cleanDetected = detectedDOI.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim();
                const cleanRef = this.ref.doi.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim();
                if (cleanDetected === cleanRef) {
                  this.pdfDOIStatus = { status: 'match', detectedDOI };
                } else {
                  this.pdfDOIStatus = { status: 'mismatch', detectedDOI };
                }
              } else if (detectedDOI) {
                this.pdfDOIStatus = { status: 'unknown', detectedDOI };
              } else {
                this.pdfDOIStatus = { status: 'unknown' };
              }

              new Notice(`Attached PDF: ${file.name}`);
              this.openAccordionId = 'pdf';
              this.renderModal();
            } catch (err: any) {
              new Notice(`Failed attaching PDF: ${err.message}`);
            }
          };

          dropzone.addEventListener("click", () => fileInput.click());
          dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.style.borderColor = "var(--interactive-accent)";
          });
          dropzone.addEventListener("dragleave", () => {
            dropzone.style.borderColor = "var(--background-modifier-border)";
          });
          dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.style.borderColor = "var(--background-modifier-border)";
            const file = e.dataTransfer?.files?.[0];
            if (file && file.name.endsWith(".pdf")) processPDFFile(file);
          });

          fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            if (file) processPDFFile(file);
          });
        }

        // DOI Verification Status Message
        if (this.pdfDOIStatus) {
          const statusBox = pdfContainer.createDiv({ cls: "citation-modal-section-card" });
          statusBox.style.padding = "6px 10px";
          statusBox.style.fontSize = "11px";

          if (this.pdfDOIStatus.status === 'match') {
            statusBox.style.borderColor = "var(--text-success, #22c55e)";
            statusBox.createSpan({ 
              text: `DOI Match Verified: Detected DOI (${this.pdfDOIStatus.detectedDOI}) matches citation metadata.`,
              cls: "diff-new"
            });
          } else if (this.pdfDOIStatus.status === 'mismatch') {
            statusBox.style.borderColor = "var(--text-warning, #eab308)";
            const span = statusBox.createSpan({ 
              text: `DOI Mismatch Warning: Detected DOI (${this.pdfDOIStatus.detectedDOI}) differs from citation DOI (${this.ref.doi}).`,
              cls: "status-hint"
            });
            span.style.color = "var(--text-warning, #eab308)";
          } else {
            statusBox.createSpan({ 
              text: this.pdfDOIStatus.detectedDOI ? `Detected DOI in PDF: ${this.pdfDOIStatus.detectedDOI}` : "DOI Status: No DOI detected in PDF binary.",
              cls: "status-hint"
            });
          }
        }
      }
    );

    // 7. LIVE OUTPUT PREVIEW BOX
    contentEl.createEl("div", { cls: "preview-section-title", text: "Live Output Preview" });
    this.previewEl = contentEl.createDiv({ cls: "citation-modal-preview-box" });
    this.updatePreviews();

    // 7. OBSIDIAN NATIVE MODAL BUTTON CONTAINER
    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    
    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonRow.createEl("button", { 
      cls: "mod-cta", 
      text: this.isNew ? "Create Citation" : "Save Citation" 
    });
    saveBtn.addEventListener("click", async () => {
      // Auto-commit any pending author input
      if (this.authorInputEl && this.authorInputEl.value.trim()) {
        const parts = this.authorInputEl.value.trim().split(/[\r\n;]+/).map(p => p.trim()).filter(p => p.length > 0);
        for (const p of parts) {
          if (!this.ref.authors.includes(p)) {
            this.ref.authors.push(p);
          }
        }
        this.authorInputEl.value = "";
      }

      // Filter out 'Unknown' / 'Unknown Author' if real authors exist
      if (this.ref.authors.length > 1) {
        this.ref.authors = this.ref.authors.filter(a => a && a.trim() && !/^unknown/i.test(a.trim()));
      }

      if (!this.ref.title.trim()) {
        new Notice("Title is required.");
        return;
      }

      // If citekey is empty OR if new and citekey was an auto-fallback (like Unknown2026, Web2026, Untitled2026)
      if (!this.ref.citekey.trim() || (this.isNew && /^unknown|web|untitled/i.test(this.ref.citekey))) {
        this.ref.citekey = CitationEngine.generateCitekey(this.ref.authors, this.ref.year, this.ref.title);
      }

      saveBtn.disabled = true;
      saveBtn.setText("Saving...");
      try {
        await this.onSave(this.ref, this.isNew ? undefined : this.originalCitekey);
        new Notice(`Citation [${this.ref.citekey}] saved!`);
        this.close();
      } catch (e: any) {
        new Notice(`Save error: ${e.message}`);
        saveBtn.disabled = false;
        saveBtn.setText(this.isNew ? "Create Citation" : "Save Citation");
      }
    });
  }

  private authorInputEl: HTMLInputElement | null = null;

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
      } else if (e.key === "Backspace" && this.authorInputEl && !this.authorInputEl.value && this.ref.authors.length > 0) {
        this.ref.authors.pop();
        this.renderAuthorChips(container);
        this.updatePreviews();
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

    if (this.openAccordionId === sectionId) {
      card.addClass("open");
      setIcon(toggleIcon, "chevron-up");
    }

    header.addEventListener("click", () => {
      const willOpen = !card.hasClass("open");
      if (willOpen) {
        this.openAccordionId = sectionId;
        for (const [id, other] of this.accordionCards.entries()) {
          if (id !== sectionId) {
            other.cardEl.removeClass("open");
            setIcon(other.iconEl, "chevron-down");
          }
        }
        card.addClass("open");
        setIcon(toggleIcon, "chevron-up");
      } else {
        this.openAccordionId = null;
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
