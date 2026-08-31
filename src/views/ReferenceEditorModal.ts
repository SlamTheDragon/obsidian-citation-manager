import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';
import { MetadataResolvers } from '../metadataResolvers';
import { Logger } from '../logger';

export class ReferenceEditorModal extends Modal {
  private ref: ReferenceMetadata;
  private originalCitekey: string;
  private onSave: (ref: ReferenceMetadata, originalCitekey?: string) => Promise<void>;
  private isNew: boolean;

  constructor(app: App, ref: Partial<ReferenceMetadata>, onSave: (ref: ReferenceMetadata, originalCitekey?: string) => Promise<void>, isNew: boolean = false) {
    super(app);
    this.originalCitekey = ref.citekey || "";
    this.ref = {
      citekey: ref.citekey || "",
      type: ref.type || "journal",
      title: ref.title || "",
      authors: ref.authors || [""],
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
    this.renderModal();
  }

  private renderModal() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-editor-modal");

    // Modal Header
    const headerRow = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = headerRow.createSpan({ cls: "modal-header-icon" });
    setIcon(iconSpan, this.isNew ? "plus-circle" : "edit-3");
    headerRow.createEl("h2", { text: this.isNew ? "New Citation" : `Edit Citation: ${this.ref.citekey}` });

    // Scrollable Form Body
    const scrollBody = contentEl.createDiv({ cls: "citation-modal-scroll-body" });

    // Quick Auto-Fetch Box
    const fetchBox = scrollBody.createDiv({ cls: "citation-quick-fetch-card" });
    fetchBox.createEl("div", { cls: "fetch-title", text: "Auto-Fetch Metadata" });
    fetchBox.createEl("div", { cls: "fetch-subtitle", text: "Paste DOI, arXiv ID, ISBN, URL, or BibTeX snippet to fill fields automatically" });

    const fetchInputRow = fetchBox.createDiv({ cls: "fetch-input-row" });
    const fetchInput = fetchInputRow.createEl("input", {
      type: "text",
      placeholder: "e.g. 10.1145/3313831.3376722 or https://...",
      cls: "fetch-text-input"
    });
    const fetchBtn = fetchInputRow.createEl("button", { cls: "citation-small-btn", text: "Fetch & Fill" });

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
        this.ref = { ...this.ref, ...fetched } as ReferenceMetadata;
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

    // Form Container
    const formContainer = scrollBody.createDiv({ cls: "citation-form-vertical" });

    // --- SECTION 1: CORE METADATA ---
    const coreCard = formContainer.createDiv({ cls: "citation-form-card" });
    coreCard.createEl("div", { cls: "form-section-title", text: "Core Information" });

    // Title (Stacked full-width)
    const titleGroup = coreCard.createDiv({ cls: "form-stacked-group" });
    titleGroup.createEl("label", { cls: "stacked-label", text: "Title" });
    const titleArea = titleGroup.createEl("textarea", { cls: "stacked-textarea", rows: 2 });
    titleArea.value = this.ref.title;
    titleArea.addEventListener("input", () => {
      this.ref.title = titleArea.value;
      this.updatePreviews(previewEl);
    });

    // Authors (Stacked full-width)
    const authorGroup = coreCard.createDiv({ cls: "form-stacked-group" });
    const authorLabelRow = authorGroup.createDiv({ cls: "label-with-desc" });
    authorLabelRow.createEl("label", { cls: "stacked-label", text: "Authors" });
    authorLabelRow.createSpan({ cls: "label-desc", text: "(One per line or comma-separated)" });
    const authorArea = authorGroup.createEl("textarea", { cls: "stacked-textarea", rows: 2 });
    authorArea.value = this.ref.authors.join("\n");
    authorArea.addEventListener("input", () => {
      this.ref.authors = authorArea.value.split(/[\r\n]+/).map(a => a.trim()).filter(a => a.length > 0);
      this.updatePreviews(previewEl);
    });

    // Year, Type, Citekey in a clean grid
    const metaGrid = coreCard.createDiv({ cls: "form-grid-3" });

    const yearGroup = metaGrid.createDiv({ cls: "form-grid-item" });
    yearGroup.createEl("label", { cls: "stacked-label", text: "Year" });
    const yearInput = yearGroup.createEl("input", { type: "text", cls: "grid-input", value: String(this.ref.year || "") });
    yearInput.addEventListener("input", () => {
      this.ref.year = yearInput.value;
      this.updatePreviews(previewEl);
    });

    const typeGroup = metaGrid.createDiv({ cls: "form-grid-item" });
    typeGroup.createEl("label", { cls: "stacked-label", text: "Type" });
    const typeSelect = typeGroup.createEl("select", { cls: "dropdown grid-input" });
    const types: ReferenceType[] = ['journal', 'conference', 'book', 'webpage', 'blog', 'video', 'preprint', 'report', 'standard', 'thesis', 'other'];
    types.forEach(t => {
      const opt = typeSelect.createEl("option", { value: t, text: t.toUpperCase() });
      if (t === this.ref.type) opt.selected = true;
    });
    typeSelect.addEventListener("change", () => {
      this.ref.type = typeSelect.value as ReferenceType;
      this.updatePreviews(previewEl);
    });

    const keyGroup = metaGrid.createDiv({ cls: "form-grid-item" });
    keyGroup.createEl("label", { cls: "stacked-label", text: "Citekey" });
    const keyInput = keyGroup.createEl("input", { type: "text", cls: "grid-input", value: this.ref.citekey });
    keyInput.addEventListener("input", () => {
      this.ref.citekey = keyInput.value.replace(/[^a-zA-Z0-9_-]/g, "");
      this.updatePreviews(previewEl);
    });

    // --- ACCORDION 1: PUBLICATION & VENUE ---
    this.createAccordion(
      formContainer,
      "Publication & Venue",
      (body) => {
        const pubGroup = body.createDiv({ cls: "form-stacked-group" });
        pubGroup.createEl("label", { cls: "stacked-label", text: "Journal / Conference / Publication" });
        const pubInput = pubGroup.createEl("input", { type: "text", cls: "grid-input", value: this.ref.publication || "" });
        pubInput.addEventListener("input", () => {
          this.ref.publication = pubInput.value;
          this.updatePreviews(previewEl);
        });

        const volGrid = body.createDiv({ cls: "form-grid-3" });
        
        const volItem = volGrid.createDiv({ cls: "form-grid-item" });
        volItem.createEl("label", { cls: "stacked-label", text: "Volume" });
        const volIn = volItem.createEl("input", { type: "text", cls: "grid-input", value: this.ref.volume || "" });
        volIn.addEventListener("input", () => { this.ref.volume = volIn.value; this.updatePreviews(previewEl); });

        const issItem = volGrid.createDiv({ cls: "form-grid-item" });
        issItem.createEl("label", { cls: "stacked-label", text: "Issue" });
        const issIn = issItem.createEl("input", { type: "text", cls: "grid-input", value: this.ref.issue || "" });
        issIn.addEventListener("input", () => { this.ref.issue = issIn.value; this.updatePreviews(previewEl); });

        const pageItem = volGrid.createDiv({ cls: "form-grid-item" });
        pageItem.createEl("label", { cls: "stacked-label", text: "Pages" });
        const pageIn = pageItem.createEl("input", { type: "text", cls: "grid-input", value: this.ref.pages || "" });
        pageIn.addEventListener("input", () => { this.ref.pages = pageIn.value; this.updatePreviews(previewEl); });

        const publGroup = body.createDiv({ cls: "form-stacked-group" });
        publGroup.createEl("label", { cls: "stacked-label", text: "Publisher" });
        const publInput = publGroup.createEl("input", { type: "text", cls: "grid-input", value: this.ref.publisher || "" });
        publInput.addEventListener("input", () => { this.ref.publisher = publInput.value; });
      }
    );

    // --- ACCORDION 2: IDENTIFIERS, DOI & URL ---
    this.createAccordion(
      formContainer,
      "Identifiers, DOI & URL",
      (body) => {
        const idGrid = body.createDiv({ cls: "form-grid-2" });

        const doiGroup = idGrid.createDiv({ cls: "form-grid-item" });
        doiGroup.createEl("label", { cls: "stacked-label", text: "DOI" });
        const doiInput = doiGroup.createEl("input", { type: "text", cls: "grid-input", placeholder: "10.xxxx/yyyy", value: this.ref.doi || "" });
        doiInput.addEventListener("input", () => {
          this.ref.doi = doiInput.value;
          this.updatePreviews(previewEl);
        });

        const urlGroup = idGrid.createDiv({ cls: "form-grid-item" });
        urlGroup.createEl("label", { cls: "stacked-label", text: "URL" });
        const urlInput = urlGroup.createEl("input", { type: "text", cls: "grid-input", placeholder: "https://...", value: this.ref.url || "" });
        urlInput.addEventListener("input", () => {
          this.ref.url = urlInput.value;
          this.updatePreviews(previewEl);
        });

        const isbnGrid = body.createDiv({ cls: "form-grid-2" });
        const isbnGroup = isbnGrid.createDiv({ cls: "form-grid-item" });
        isbnGroup.createEl("label", { cls: "stacked-label", text: "ISBN" });
        const isbnInput = isbnGroup.createEl("input", { type: "text", cls: "grid-input", value: this.ref.isbn || "" });
        isbnInput.addEventListener("input", () => { this.ref.isbn = isbnInput.value; });

        const issnGroup = isbnGrid.createDiv({ cls: "form-grid-item" });
        issGroup.createEl("label", { cls: "stacked-label", text: "ISSN" });
        const issnInput = issnGroup.createEl("input", { type: "text", cls: "grid-input", value: this.ref.issn || "" });
        issnInput.addEventListener("input", () => { this.ref.issn = issnInput.value; });
      }
    );

    // --- ACCORDION 3: ABSTRACT & LITERATURE SUMMARY ---
    this.createAccordion(
      formContainer,
      "Abstract & Literature Summary",
      (body) => {
        const absGroup = body.createDiv({ cls: "form-stacked-group" });
        const absArea = absGroup.createEl("textarea", { cls: "stacked-textarea", rows: 4, placeholder: "Paste document abstract or personal study notes..." });
        absArea.value = this.ref.abstract || "";
        absArea.addEventListener("input", () => { this.ref.abstract = absArea.value; });
      }
    );

    // Live Monospaced Output Preview Box
    scrollBody.createEl("div", { cls: "preview-section-title", text: "Live Output Preview" });
    const previewEl = scrollBody.createDiv({ cls: "citation-modal-preview-box" });
    this.updatePreviews(previewEl);

    // Modal Footer Button Bar (Fixed at bottom)
    const footerBar = contentEl.createDiv({ cls: "citation-modal-footer-bar" });
    
    const cancelBtn = footerBar.createEl("button", { cls: "citation-small-btn citation-btn-secondary", text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = footerBar.createEl("button", { 
      cls: "citation-small-btn", 
      text: this.isNew ? "Create Citation" : "Save Citation" 
    });
    saveBtn.addEventListener("click", async () => {
      if (!this.ref.title.trim()) {
        new Notice("Title is required.");
        return;
      }
      if (!this.ref.citekey.trim()) {
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

  private createAccordion(parent: HTMLElement, title: string, renderBody: (bodyEl: HTMLElement) => void) {
    const card = parent.createDiv({ cls: "citation-accordion-card" });

    const header = card.createDiv({ cls: "accordion-header-row" });
    header.createEl("span", { cls: "accordion-title-text", text: title });
    const toggleIcon = header.createSpan({ cls: "accordion-icon-wrap" });
    setIcon(toggleIcon, "chevron-down");

    const body = card.createDiv({ cls: "accordion-body-collapse" });
    renderBody(body);

    header.addEventListener("click", () => {
      const isOpen = card.hasClass("open");
      if (isOpen) {
        card.removeClass("open");
        setIcon(toggleIcon, "chevron-down");
      } else {
        card.addClass("open");
        setIcon(toggleIcon, "chevron-up");
      }
    });
  }

  private updatePreviews(container: HTMLElement) {
    container.empty();
    
    const apaPill = container.createDiv({ cls: "preview-row" });
    apaPill.createEl("code", { cls: "preview-label", text: "APA 7:" });
    apaPill.createSpan({ cls: "preview-content", text: CitationEngine.formatAPA7(this.ref) });

    const inbodyPill = container.createDiv({ cls: "preview-row" });
    inbodyPill.createEl("code", { cls: "preview-label", text: "In-Text:" });
    inbodyPill.createSpan({ cls: "preview-content", text: `${CitationEngine.formatInBody(this.ref, 'parenthetical')} | ${CitationEngine.formatInBody(this.ref, 'footnote')}` });
  }

  onClose() {
    this.contentEl.empty();
  }
}
