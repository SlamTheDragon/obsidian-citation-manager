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

  // Accordion section states
  private isPubOpen: boolean = false;
  private isIdsOpen: boolean = false;
  private isAbstractOpen: boolean = false;

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

    const headerRow = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = headerRow.createSpan({ cls: "modal-header-icon" });
    setIcon(iconSpan, this.isNew ? "plus-circle" : "edit-3");
    headerRow.createEl("h2", { text: this.isNew ? "New Citation" : `Edit Citation: ${this.ref.citekey}` });

    // Quick Auto-Fetch Bar
    const fetchDiv = contentEl.createDiv({ cls: "citation-quick-fetch-box" });
    let fetchInput = "";
    new Setting(fetchDiv)
      .setName("Auto-Fetch Metadata")
      .setDesc("Paste DOI, arXiv ID, ISBN, URL, or BibTeX snippet")
      .addText(text => {
        text.setPlaceholder("e.g. 10.1145/3313831.3376722")
          .onChange(val => { fetchInput = val; });
        text.inputEl.style.width = "220px";
      })
      .addButton(btn => {
        btn.setButtonText("Fetch & Fill")
          .setCta()
          .onClick(async () => {
            if (!fetchInput.trim()) {
              new Notice("Please enter a DOI, URL, or identifier first.");
              return;
            }
            btn.setDisabled(true);
            btn.setButtonText("Fetching...");
            try {
              const fetched = await MetadataResolvers.detectAndResolve(fetchInput.trim());
              this.ref = { ...this.ref, ...fetched } as ReferenceMetadata;
              new Notice("Metadata successfully fetched!");
              this.renderModal();
            } catch (e: any) {
              new Notice(`Fetch failed: ${e.message}`);
              btn.setDisabled(false);
              btn.setButtonText("Fetch & Fill");
            }
          });
      });

    // Form Container
    const formContainer = contentEl.createDiv({ cls: "citation-form-container" });

    // --- SECTION 1: CORE METADATA (Always visible) ---
    const coreSection = formContainer.createDiv({ cls: "citation-accordion-section active" });
    coreSection.createEl("h4", { cls: "accordion-title", text: "Core Information" });

    // Title
    new Setting(coreSection)
      .setName("Title")
      .addTextArea(text => {
        text.setValue(this.ref.title)
          .onChange(val => {
            this.ref.title = val;
            this.updatePreviews(previewEl);
          });
        text.inputEl.rows = 2;
        text.inputEl.style.width = "100%";
      });

    // Authors
    new Setting(coreSection)
      .setName("Authors")
      .setDesc("One author per line or comma-separated (e.g. Smith, J.)")
      .addTextArea(text => {
        text.setValue(this.ref.authors.join("\n"))
          .onChange(val => {
            this.ref.authors = val.split(/[\r\n]+/).map(a => a.trim()).filter(a => a.length > 0);
            this.updatePreviews(previewEl);
          });
        text.inputEl.rows = 2;
        text.inputEl.style.width = "100%";
      });

    // Year & Month & Type
    const metaRow = new Setting(coreSection)
      .setName("Year & Type")
      .addText(text => text
        .setPlaceholder("Year (e.g. 2024)")
        .setValue(String(this.ref.year || ""))
        .onChange(val => {
          this.ref.year = val;
          this.updatePreviews(previewEl);
        }))
      .addDropdown(drop => {
        const types: ReferenceType[] = ['journal', 'conference', 'book', 'webpage', 'blog', 'video', 'preprint', 'report', 'standard', 'thesis', 'other'];
        types.forEach(t => drop.addOption(t, t.toUpperCase()));
        drop.setValue(this.ref.type);
        drop.onChange(val => {
          this.ref.type = val as ReferenceType;
          this.updatePreviews(previewEl);
        });
      });

    // Citekey
    new Setting(coreSection)
      .setName("Citekey")
      .setDesc("Unique identifier (e.g. Baltar2012)")
      .addText(text => text
        .setValue(this.ref.citekey)
        .onChange(val => {
          this.ref.citekey = val.replace(/[^a-zA-Z0-9_-]/g, "");
          this.updatePreviews(previewEl);
        }));

    // --- SECTION 2: PUBLICATION DETAILS (Collapsible) ---
    const pubSection = formContainer.createDiv({ cls: `citation-accordion-section ${this.isPubOpen ? 'active' : ''}` });
    const pubHeader = pubSection.createDiv({ cls: "accordion-header-row" });
    pubHeader.createEl("h4", { cls: "accordion-title", text: "Publication & Venue" });
    const pubToggle = pubHeader.createSpan({ cls: "accordion-toggle-icon" });
    setIcon(pubToggle, this.isPubOpen ? "chevron-up" : "chevron-down");
    pubHeader.addEventListener("click", () => {
      this.isPubOpen = !this.isPubOpen;
      this.renderModal();
    });

    if (this.isPubOpen) {
      new Setting(pubSection)
        .setName("Journal / Conference / Publication")
        .addText(text => {
          text.setValue(this.ref.publication || "")
            .onChange(val => {
              this.ref.publication = val;
              this.updatePreviews(previewEl);
            });
          text.inputEl.style.width = "100%";
        });

      new Setting(pubSection)
        .setName("Vol / Issue / Pages")
        .addText(t => t.setPlaceholder("Vol").setValue(this.ref.volume || "").onChange(v => { this.ref.volume = v; this.updatePreviews(previewEl); }))
        .addText(t => t.setPlaceholder("Issue").setValue(this.ref.issue || "").onChange(v => { this.ref.issue = v; this.updatePreviews(previewEl); }))
        .addText(t => t.setPlaceholder("Pages").setValue(this.ref.pages || "").onChange(v => { this.ref.pages = v; this.updatePreviews(previewEl); }));

      new Setting(pubSection)
        .setName("Publisher")
        .addText(text => text
          .setValue(this.ref.publisher || "")
          .onChange(val => { this.ref.publisher = val; }));
    }

    // --- SECTION 3: IDENTIFIERS & LINKS (Collapsible) ---
    const idsSection = formContainer.createDiv({ cls: `citation-accordion-section ${this.isIdsOpen ? 'active' : ''}` });
    const idsHeader = idsSection.createDiv({ cls: "accordion-header-row" });
    idsHeader.createEl("h4", { cls: "accordion-title", text: "Identifiers, DOI & URL" });
    const idsToggle = idsHeader.createSpan({ cls: "accordion-toggle-icon" });
    setIcon(idsToggle, this.isIdsOpen ? "chevron-up" : "chevron-down");
    idsHeader.addEventListener("click", () => {
      this.isIdsOpen = !this.isIdsOpen;
      this.renderModal();
    });

    if (this.isIdsOpen) {
      new Setting(idsSection)
        .setName("DOI")
        .addText(text => text
          .setPlaceholder("10.xxxx/yyyy")
          .setValue(this.ref.doi || "")
          .onChange(val => {
            this.ref.doi = val;
            this.updatePreviews(previewEl);
          }));

      new Setting(idsSection)
        .setName("URL")
        .addText(text => text
          .setPlaceholder("https://...")
          .setValue(this.ref.url || "")
          .onChange(val => {
            this.ref.url = val;
            this.updatePreviews(previewEl);
          }));

      new Setting(idsSection)
        .setName("ISBN / ISSN")
        .addText(t => t.setPlaceholder("ISBN").setValue(this.ref.isbn || "").onChange(v => { this.ref.isbn = v; }))
        .addText(t => t.setPlaceholder("ISSN").setValue(this.ref.issn || "").onChange(v => { this.ref.issn = v; }));
    }

    // --- SECTION 4: ABSTRACT & NOTES (Collapsible) ---
    const absSection = formContainer.createDiv({ cls: `citation-accordion-section ${this.isAbstractOpen ? 'active' : ''}` });
    const absHeader = absSection.createDiv({ cls: "accordion-header-row" });
    absHeader.createEl("h4", { cls: "accordion-title", text: "Abstract & Literature Summary" });
    const absToggle = absHeader.createSpan({ cls: "accordion-toggle-icon" });
    setIcon(absToggle, this.isAbstractOpen ? "chevron-up" : "chevron-down");
    absHeader.addEventListener("click", () => {
      this.isAbstractOpen = !this.isAbstractOpen;
      this.renderModal();
    });

    if (this.isAbstractOpen) {
      new Setting(absSection)
        .addTextArea(text => {
          text.setValue(this.ref.abstract || "")
            .onChange(val => { this.ref.abstract = val; });
          text.inputEl.rows = 4;
          text.inputEl.style.width = "100%";
        });
    }

    // Live Monospaced Formatted Preview Box
    contentEl.createEl("h4", { text: "Live Output Preview" });
    const previewEl = contentEl.createDiv({ cls: "citation-modal-preview-box" });
    this.updatePreviews(previewEl);

    // Save / Cancel Button Row
    const buttonRow = contentEl.createDiv({ cls: "citation-modal-button-row" });
    new Setting(buttonRow)
      .addButton(btn => btn
        .setButtonText("Cancel")
        .onClick(() => this.close()))
      .addButton(btn => btn
        .setButtonText(this.isNew ? "Create Citation" : "Save Citation")
        .setCta()
        .onClick(async () => {
          if (!this.ref.title.trim()) {
            new Notice("Title is required.");
            return;
          }
          if (!this.ref.citekey.trim()) {
            this.ref.citekey = CitationEngine.generateCitekey(this.ref.authors, this.ref.year, this.ref.title);
          }

          try {
            await this.onSave(this.ref, this.isNew ? undefined : this.originalCitekey);
            new Notice(`Citation [${this.ref.citekey}] saved!`);
            this.close();
          } catch (e: any) {
            new Notice(`Save error: ${e.message}`);
          }
        }));
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
