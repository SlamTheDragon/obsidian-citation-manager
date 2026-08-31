import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { ReferenceMetadata, ReferenceType } from '../types';
import { CitationEngine } from '../citationEngine';
import { MetadataResolvers } from '../metadataResolvers';

export class ReferenceEditorModal extends Modal {
  private ref: ReferenceMetadata;
  private originalCitekey: string;
  private onSave: (ref: ReferenceMetadata, originalCitekey?: string) => Promise<void>;
  private isNew: boolean;

  // Accordion state (only 1 open at a time for clean progressive disclosure)
  private openSection: 'pub' | 'ids' | 'abs' | null = null;
  private previewEl: HTMLElement | null = null;

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

    // 2. CORE INFORMATION SECTION
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

    // Authors Interactive Chip System
    const authorSection = coreCard.createDiv({ cls: "form-stacked-group" });
    const authorHeader = authorSection.createDiv({ cls: "stacked-label-with-desc" });
    authorHeader.createEl("label", { cls: "stacked-label", text: "Authors" });
    authorHeader.createSpan({ cls: "stacked-desc", text: "(Type author name and press Enter or comma)" });
    
    const authorContainer = authorSection.createDiv({ cls: "author-chips-input-container" });
    this.renderAuthorChips(authorContainer);

    // Year, Type, Citekey
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

    // 3. ACCORDION 1: PUBLICATION & VENUE
    this.renderAccordionSection(
      contentEl,
      'pub',
      "Publication & Venue",
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

    // 4. ACCORDION 2: IDENTIFIERS, DOI & URL
    this.renderAccordionSection(
      contentEl,
      'ids',
      "Identifiers, DOI & URL",
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

    // 5. ACCORDION 3: ABSTRACT & LITERATURE SUMMARY
    this.renderAccordionSection(
      contentEl,
      'abs',
      "Abstract & Literature Summary",
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

    // 6. LIVE OUTPUT PREVIEW BOX
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

  private renderAccordionSection(
    parent: HTMLElement,
    sectionId: 'pub' | 'ids' | 'abs',
    title: string,
    renderBody: (bodyEl: HTMLElement) => void
  ) {
    const isOpen = this.openSection === sectionId;
    const card = parent.createDiv({ cls: `citation-modal-accordion-card ${isOpen ? 'open' : ''}` });

    const header = card.createDiv({ cls: "accordion-header-row" });
    header.createEl("span", { cls: "accordion-title-text", text: title });
    const toggleIcon = header.createSpan({ cls: "accordion-icon-wrap" });
    setIcon(toggleIcon, isOpen ? "chevron-up" : "chevron-down");

    if (isOpen) {
      const body = card.createDiv({ cls: "accordion-body-content" });
      renderBody(body);
    }

    header.addEventListener("click", () => {
      this.openSection = this.openSection === sectionId ? null : sectionId;
      this.renderModal();
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
