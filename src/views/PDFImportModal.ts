import { App, Modal, Setting, Notice, setIcon, normalizePath } from 'obsidian';
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
  private doiOrIdentifier: string = '';
  private title: string = '';
  private author: string = '';
  private year: string = '';
  private statusLog: string = '';

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

    this.title = pdfFile.name ? pdfFile.name.replace(/\.pdf$/i, "") : "Untitled Document";
    this.year = String(new Date().getFullYear());
    if (existingRefs.length > 0) {
      this.selectedExistingCitekey = existingRefs[0].citekey;
    }
  }

  async onOpen() {
    try {
      const buffer = await this.pdfFile.arrayBuffer();
      const detectedDOI = ProjectIndexer.extractDOIFromBuffer(buffer);
      if (detectedDOI) {
        this.doiOrIdentifier = detectedDOI;
        this.statusLog = `Auto-detected DOI: ${detectedDOI}`;
        try {
          const res = await MetadataResolvers.detectAndResolve(detectedDOI);
          if (res.title) this.title = res.title;
          if (res.authors && res.authors.length > 0) this.author = res.authors.join(", ");
          if (res.year) this.year = String(res.year);
          this.statusLog = `Auto-resolved metadata via DOI: ${detectedDOI}`;
        } catch (err) {
          this.statusLog = `DOI detected (${detectedDOI}). Click Fetch or edit below.`;
        }
      }
    } catch (e) {
      Logger.warn("Error in PDFImportModal onOpen DOI extraction:", e);
    }

    this.renderModalContent();
  }

  private renderModalContent() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-pdf-import-modal");

    // Modal Header
    const header = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = header.createSpan({ cls: "modal-header-icon" });
    setIcon(iconSpan, "paperclip");
    header.createEl("h2", { text: "Import PDF Document" });

    // Scrollable Body
    const scrollBody = contentEl.createDiv({ cls: "citation-modal-scroll-body" });

    // File Summary Box
    const infoBox = scrollBody.createDiv({ cls: "citation-quick-fetch-card" });
    const fileRow = infoBox.createDiv({ cls: "fetch-title" });
    setIcon(fileRow.createSpan({ cls: "inline-icon" }), "file-text");
    fileRow.createSpan({ text: ` ${this.pdfFile.name} ` });
    if (this.pdfFile.size) {
      fileRow.createSpan({ cls: "file-size-tag", text: `(${(this.pdfFile.size / 1024 / 1024).toFixed(2)} MB)` });
    }

    if (this.statusLog) {
      infoBox.createDiv({ cls: "status-log-line", text: this.statusLog });
    }

    // Import Mode Selector Card
    const modeCard = scrollBody.createDiv({ cls: "citation-form-card" });
    const modeGroup = modeCard.createDiv({ cls: "form-stacked-group" });
    modeGroup.createEl("label", { cls: "stacked-label", text: "Import Action" });
    const modeSelect = modeGroup.createEl("select", { cls: "dropdown grid-input" });
    modeSelect.createEl("option", { value: "new", text: "Create New Citation from PDF" });
    if (this.existingRefs.length > 0) {
      const opt = modeSelect.createEl("option", { value: "existing", text: "Attach PDF to an Existing Citation" });
      if (this.mode === "existing") opt.selected = true;
    }
    modeSelect.addEventListener("change", () => {
      this.mode = modeSelect.value as 'new' | 'existing';
      this.renderModalContent();
    });

    if (this.mode === 'existing') {
      const attachCard = scrollBody.createDiv({ cls: "citation-form-card" });
      const targetGroup = attachCard.createDiv({ cls: "form-stacked-group" });
      targetGroup.createEl("label", { cls: "stacked-label", text: "Target Citation" });
      const targetSelect = targetGroup.createEl("select", { cls: "dropdown grid-input" });
      for (const ref of this.existingRefs) {
        const opt = targetSelect.createEl("option", { 
          value: ref.citekey, 
          text: `[${ref.citekey}] ${ref.title.slice(0, 50)}...` 
        });
        if (ref.citekey === this.selectedExistingCitekey) opt.selected = true;
      }
      targetSelect.addEventListener("change", () => { this.selectedExistingCitekey = targetSelect.value; });
    } else {
      const metaCard = scrollBody.createDiv({ cls: "citation-form-card" });
      metaCard.createEl("div", { cls: "form-section-title", text: "Metadata & Online Resolution" });

      // DOI / Online Identifier input
      const doiGroup = metaCard.createDiv({ cls: "form-stacked-group" });
      doiGroup.createEl("label", { cls: "stacked-label", text: "DOI / Online Identifier" });
      
      const doiInputRow = doiGroup.createDiv({ cls: "fetch-input-row" });
      const doiInput = doiInputRow.createEl("input", {
        type: "text",
        placeholder: "e.g. 10.1145/3313831.3376722",
        cls: "fetch-text-input",
        value: this.doiOrIdentifier
      });
      const fetchBtn = doiInputRow.createEl("button", { cls: "citation-small-btn", text: "Fetch" });

      const doFetch = async () => {
        const val = doiInput.value.trim();
        if (!val) {
          new Notice("Please enter a DOI or URL first.");
          return;
        }
        fetchBtn.disabled = true;
        fetchBtn.setText("Fetching...");
        try {
          const res = await MetadataResolvers.detectAndResolve(val);
          if (res.title) this.title = res.title;
          if (res.authors && res.authors.length > 0) this.author = res.authors.join(", ");
          if (res.year) this.year = String(res.year);
          this.doiOrIdentifier = val;
          this.statusLog = "Metadata successfully populated.";
          new Notice("Metadata populated!");
          this.renderModalContent();
        } catch (e: any) {
          new Notice(`Fetch error: ${e.message}`);
          fetchBtn.disabled = false;
          fetchBtn.setText("Fetch");
        }
      };

      fetchBtn.addEventListener("click", doFetch);
      doiInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doFetch();
        }
      });
      doiInput.addEventListener("input", () => { this.doiOrIdentifier = doiInput.value; });

      // Title (Stacked full-width)
      const titleGroup = metaCard.createDiv({ cls: "form-stacked-group" });
      titleGroup.createEl("label", { cls: "stacked-label", text: "Title" });
      const titleArea = titleGroup.createEl("textarea", { cls: "stacked-textarea", rows: 2 });
      titleArea.value = this.title;
      titleArea.addEventListener("input", () => { this.title = titleArea.value; });

      // Authors (Stacked full-width)
      const authorGroup = metaCard.createDiv({ cls: "form-stacked-group" });
      const authorLabelRow = authorGroup.createDiv({ cls: "label-with-desc" });
      authorLabelRow.createEl("label", { cls: "stacked-label", text: "Authors" });
      authorLabelRow.createSpan({ cls: "label-desc", text: "(e.g. Smith, John or Smith, J. & Doe, A.)" });
      const authorArea = authorGroup.createEl("textarea", { cls: "stacked-textarea", rows: 2 });
      authorArea.value = this.author;
      authorArea.addEventListener("input", () => { this.author = authorArea.value; });

      // Year
      const yearGroup = metaCard.createDiv({ cls: "form-stacked-group" });
      yearGroup.createEl("label", { cls: "stacked-label", text: "Year" });
      const yearInput = yearGroup.createEl("input", { type: "text", cls: "grid-input", value: this.year });
      yearInput.addEventListener("input", () => { this.year = yearInput.value; });
    }

    // Modal Footer Bar (Fixed at bottom)
    const footerBar = contentEl.createDiv({ cls: "citation-modal-footer-bar" });
    
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
          const authors = this.author ? this.author.split(/,|&|\n/).map(a => a.trim()).filter(a => a.length > 0) : ["Unknown Author"];
          const cleanTitle = this.title || this.pdfFile.name.replace(/\.pdf$/i, "");
          const citekey = CitationEngine.generateCitekey(authors, this.year, cleanTitle);

          const pdfPath = await this.storageManager.savePDFAttachment(citekey, buffer);

          const newRef: ReferenceMetadata = {
            citekey,
            type: "journal",
            title: cleanTitle,
            authors: authors.length > 0 ? authors : ["Unknown Author"],
            year: this.year || new Date().getFullYear(),
            doi: this.doiOrIdentifier || undefined,
            pdfAttachment: pdfPath,
            projects: this.project ? [this.project.id] : [],
            dateAdded: new Date().toISOString(),
            dateModified: new Date().toISOString(),
          };

          await this.storageManager.saveReference(newRef);
          new Notice(`Created citation with PDF: [${citekey}]`);
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

  onClose() {
    this.contentEl.empty();
  }
}
