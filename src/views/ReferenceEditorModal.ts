import { App, Modal, Setting, Notice, setIcon, ButtonComponent } from 'obsidian';
import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';
import { MetadataResolvers } from '../metadataResolvers';
import { Logger } from '../logger';

export class ReferenceEditorModal extends Modal {
  private ref: ReferenceMetadata;
  private originalCitekey: string;
  private onSave: (ref: ReferenceMetadata, originalCitekey?: string) => Promise<void>;
  private isNew: boolean;

  private activeAccordion: string | null = null;
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
    contentEl.addClass("citation-modal-content-unified");

    // 1. Auto-Fetch Section Card
    const fetchBox = contentEl.createDiv({ cls: "citation-modal-section-card" });
    fetchBox.createEl("div", { cls: "section-card-title", text: "Auto-Fetch Metadata" });
    fetchBox.createEl("div", { cls: "section-card-desc", text: "Paste DOI, arXiv ID, ISBN, URL, or BibTeX snippet to auto-fill" });

    const fetchInputRow = fetchBox.createDiv({ cls: "fetch-input-row" });
    const fetchInput = fetchInputRow.createEl("input", {
      type: "text",
      placeholder: "e.g. 10.1145/3313831.3376722 or https://...",
      cls: "fetch-text-input"
    });
    const fetchBtn = fetchInputRow.createEl("button", { cls: "mod-cta", text: "Fetch & Fill" });

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

    // 2. Core Information Card
    const coreCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    coreCard.createEl("div", { cls: "section-card-title", text: "Core Information" });

    // Title
    new Setting(coreCard)
      .setName("Title")
      .addText(text => {
        text.setValue(this.ref.title)
          .setPlaceholder("Paper or document title...")
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

    // Metadata Grid (Year, Type, Citekey)
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
    const types: ReferenceType[] = ['journal', 'conference', 'book', 'webpage', 'blog', 'video', 'preprint', 'report', 'standard', 'thesis', 'other'];
    types.forEach(t => {
      const opt = typeSelect.createEl("option", { value: t, text: t.toUpperCase() });
      if (t === this.ref.type) opt.selected = true;
    });
    typeSelect.addEventListener("change", () => {
      this.ref.type = typeSelect.value as ReferenceType;
      this.updatePreviews();
    });

    const keyCol = metaGrid.createDiv({ cls: "form-grid-col" });
    keyCol.createEl("label", { cls: "stacked-label", text: "Citekey" });
    const keyInput = keyCol.createEl("input", { type: "text", cls: "grid-input", placeholder: "e.g. Li2026", value: this.ref.citekey });
    keyInput.addEventListener("input", () => {
      this.ref.citekey = keyInput.value.replace(/[^a-zA-Z0-9_-]/g, "");
      this.updatePreviews();
    });

    // 3. Accordion 1: Publication & Venue
    this.createExclusiveAccordion(
      contentEl,
      "pub",
      "Publication & Venue",
      (body) => {
        const pubGroup = body.createDiv({ cls: "form-stacked-group" });
        pubGroup.createEl("label", { cls: "stacked-label", text: "Journal / Conference / Publication" });
        const pubInput = pubGroup.createEl("input", { type: "text", cls: "grid-input", placeholder: "e.g. ACM Transactions on Computer-Human Interaction", value: this.ref.publication || "" });
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

        const publGroup = body.createDiv({ cls: "form-stacked-group" });
        publGroup.createEl("label", { cls: "stacked-label", text: "Publisher" });
        const publInput = publGroup.createEl("input", { type: "text", cls: "grid-input", placeholder: "e.g. ACM, IEEE, Springer", value: this.ref.publisher || "" });
        publInput.addEventListener("input", () => { this.ref.publisher = publInput.value; });
      }
    );

    // 4. Accordion 2: Identifiers, DOI & URL
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

        const isbnGrid = body.createDiv({ cls: "form-grid-2" });
        const isbnGroup = isbnGrid.createDiv({ cls: "form-grid-col" });
        isbnGroup.createEl("label", { cls: "stacked-label", text: "ISBN" });
        const isbnInput = isbnGroup.createEl("input", { type: "text", cls: "grid-input", value: this.ref.isbn || "" });
        isbnInput.addEventListener("input", () => { this.ref.isbn = isbnInput.value; });

        const issnGroup = isbnGrid.createDiv({ cls: "form-grid-col" });
        issGroup.createEl("label", { cls: "stacked-label", text: "ISSN" });
        const issnInput = issnGroup.createEl("input", { type: "text", cls: "grid-input", value: this.ref.issn || "" });
        issnInput.addEventListener("input", () => { this.ref.issn = issnInput.value; });
      }
    );

    // 5. Accordion 3: Abstract & Literature Summary
    this.createExclusiveAccordion(
      contentEl,
      "abstract",
      "Abstract & Literature Summary",
      (body) => {
        const absGroup = body.createDiv({ cls: "form-stacked-group" });
        const absArea = absGroup.createEl("textarea", { cls: "stacked-textarea", rows: 4, placeholder: "Paste document abstract or summary notes..." });
        absArea.value = this.ref.abstract || "";
        absArea.addEventListener("input", () => { this.ref.abstract = absArea.value; });
      }
    );

    // 6. Live Output Preview Box
    contentEl.createEl("div", { cls: "preview-section-title", text: "Live Output Preview" });
    this.previewEl = contentEl.createDiv({ cls: "citation-modal-preview-box" });
    this.updatePreviews();

    // 7. Obsidian Native Modal Button Container
    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
    
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonContainer.createEl("button", { 
      cls: "mod-cta", 
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
