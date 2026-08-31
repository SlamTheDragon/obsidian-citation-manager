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

  // Accordion states
  private isPubOpen: boolean = false;
  private isIdsOpen: boolean = false;
  private isAbstractOpen: boolean = false;

  private previewEl: HTMLElement | null = null;
  private authorChipsContainer: HTMLElement | null = null;

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
      authors: ref.authors && ref.authors.length > 0 ? ref.authors : [],
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
    contentEl.addClass("citation-editor-modal-root");

    // Modal Header
    const headerRow = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = headerRow.createSpan({ cls: "modal-header-icon" });
    setIcon(iconSpan, this.isNew ? "plus-circle" : "edit-3");
    headerRow.createEl("h2", { text: this.isNew ? "New Citation" : `Edit Citation: ${this.ref.citekey}` });

    // Scrollable Center Body
    const scrollBody = contentEl.createDiv({ cls: "citation-modal-scroll-area" });

    // Auto-Fetch Card
    const fetchBox = scrollBody.createDiv({ cls: "citation-modal-section-card" });
    const fetchTitleRow = fetchBox.createDiv({ cls: "section-card-header" });
    fetchTitleRow.createEl("div", { cls: "section-card-title", text: "Auto-Fetch Metadata" });
    fetchTitleRow.createEl("div", { cls: "section-card-desc", text: "Paste DOI, arXiv ID, ISBN, URL, or BibTeX snippet" });

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

    // --- SECTION 1: CORE INFORMATION ---
    const coreCard = scrollBody.createDiv({ cls: "citation-modal-section-card" });
    coreCard.createEl("div", { cls: "section-card-title", text: "Core Information" });

    // Title (Single or two line clean input)
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

    // Interactive Authors Chip Field
    const authorSetting = new Setting(coreCard)
      .setName("Authors")
      .setDesc("Type an author and press Enter or comma");

    const authorContainer = authorSetting.controlEl.createDiv({ cls: "author-chips-input-container" });
    this.authorChipsContainer = authorContainer;
    this.renderAuthorChips(authorContainer);

    // Year, Type, Citekey in standard Setting row
    const metaRow = new Setting(coreCard)
      .setName("Metadata")
      .addText(text => text
        .setPlaceholder("Year (e.g. 2026)")
        .setValue(String(this.ref.year || ""))
        .onChange(val => {
          this.ref.year = val;
          this.updatePreviews();
        }))
      .addDropdown(drop => {
        const types: ReferenceType[] = ['journal', 'conference', 'book', 'webpage', 'blog', 'video', 'preprint', 'report', 'standard', 'thesis', 'other'];
        types.forEach(t => drop.addOption(t, t.toUpperCase()));
        drop.setValue(this.ref.type);
        drop.onChange(val => {
          this.ref.type = val as ReferenceType;
          this.updatePreviews();
        });
      })
      .addText(text => text
        .setPlaceholder("Citekey (e.g. Li2026)")
        .setValue(this.ref.citekey)
        .onChange(val => {
          this.ref.citekey = val.replace(/[^a-zA-Z0-9_-]/g, "");
          this.updatePreviews();
        }));

    // --- ACCORDION 1: PUBLICATION & VENUE ---
    this.createAccordion(
      scrollBody,
      "Publication & Venue",
      this.isPubOpen,
      (open) => { this.isPubOpen = open; },
      (body) => {
        new Setting(body)
          .setName("Journal / Conference")
          .addText(text => {
            text.setValue(this.ref.publication || "")
              .setPlaceholder("e.g. ACM Transactions on Computer-Human Interaction")
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

        new Setting(body)
          .setName("Publisher")
          .addText(text => {
            text.setValue(this.ref.publisher || "")
              .setPlaceholder("e.g. ACM, IEEE, Springer")
              .onChange(val => { this.ref.publisher = val; });
            text.inputEl.addClass("setting-full-width-input");
          });
      }
    );

    // --- ACCORDION 2: IDENTIFIERS, DOI & URL ---
    this.createAccordion(
      scrollBody,
      "Identifiers, DOI & URL",
      this.isIdsOpen,
      (open) => { this.isIdsOpen = open; },
      (body) => {
        new Setting(body)
          .setName("DOI")
          .addText(text => text
            .setPlaceholder("10.xxxx/yyyy")
            .setValue(this.ref.doi || "")
            .onChange(val => {
              this.ref.doi = val;
              this.updatePreviews();
            }));

        new Setting(body)
          .setName("URL")
          .addText(text => text
            .setPlaceholder("https://...")
            .setValue(this.ref.url || "")
            .onChange(val => {
              this.ref.url = val;
              this.updatePreviews();
            }));

        new Setting(body)
          .setName("ISBN / ISSN")
          .addText(t => t.setPlaceholder("ISBN").setValue(this.ref.isbn || "").onChange(v => { this.ref.isbn = v; }))
          .addText(t => t.setPlaceholder("ISSN").setValue(this.ref.issn || "").onChange(v => { this.ref.issn = v; }));
      }
    );

    // --- ACCORDION 3: ABSTRACT & LITERATURE SUMMARY ---
    this.createAccordion(
      scrollBody,
      "Abstract & Literature Summary",
      this.isAbstractOpen,
      (open) => { this.isAbstractOpen = open; },
      (body) => {
        new Setting(body)
          .addTextArea(text => {
            text.setValue(this.ref.abstract || "")
              .setPlaceholder("Paste document abstract or summary notes...")
              .onChange(val => { this.ref.abstract = val; });
            text.inputEl.rows = 4;
            text.inputEl.addClass("setting-full-width-input");
          });
      }
    );

    // Live Monospaced Output Preview Box (Always rendered)
    scrollBody.createEl("div", { cls: "preview-section-title", text: "Live Output Preview" });
    this.previewEl = scrollBody.createDiv({ cls: "citation-modal-preview-box" });
    this.updatePreviews();

    // Fixed Bottom Modal Footer Bar
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

  private renderAuthorChips(container: HTMLElement) {
    container.empty();

    const chipsWrap = container.createDiv({ cls: "author-chips-wrap" });

    // Render active author chips
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

    // Inline input to add author
    const authorInput = chipsWrap.createEl("input", {
      type: "text",
      placeholder: this.ref.authors.length === 0 ? "e.g. Li, Ziheng 'Leo'" : "+ Add author...",
      cls: "author-chip-inline-input"
    });

    const addAuthorFromInput = () => {
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
        addAuthorFromInput();
      } else if (e.key === "Backspace" && !authorInput.value && this.ref.authors.length > 0) {
        this.ref.authors.pop();
        this.renderAuthorChips(container);
        this.updatePreviews();
      }
    });

    authorInput.addEventListener("blur", () => {
      addAuthorFromInput();
    });

    // Clicking container focuses the input
    container.addEventListener("click", () => {
      authorInput.focus();
    });
  }

  private createAccordion(
    parent: HTMLElement,
    title: string,
    isOpen: boolean,
    onToggle: (open: boolean) => void,
    renderBody: (bodyEl: HTMLElement) => void
  ) {
    const card = parent.createDiv({ cls: `citation-modal-accordion-card ${isOpen ? 'open' : ''}` });

    const header = card.createDiv({ cls: "accordion-header-row" });
    header.createEl("span", { cls: "accordion-title-text", text: title });
    const toggleIcon = header.createSpan({ cls: "accordion-icon-wrap" });
    setIcon(toggleIcon, isOpen ? "chevron-up" : "chevron-down");

    const body = card.createDiv({ cls: "accordion-body-collapse" });
    renderBody(body);

    header.addEventListener("click", () => {
      const willOpen = !card.hasClass("open");
      if (willOpen) {
        card.addClass("open");
        setIcon(toggleIcon, "chevron-up");
      } else {
        card.removeClass("open");
        setIcon(toggleIcon, "chevron-down");
      }
      onToggle(willOpen);
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
