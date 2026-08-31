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
    // Attempt automatic DOI detection from PDF binary
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

    const header = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = header.createSpan({ cls: "modal-header-icon" });
    setIcon(iconSpan, "paperclip");
    header.createEl("h2", { text: "Import PDF Document" });

    const infoBox = contentEl.createDiv({ cls: "citation-quick-fetch-box" });
    infoBox.createEl("strong", { text: `File: ${this.pdfFile.name} ` });
    if (this.pdfFile.size) {
      infoBox.createSpan({ text: `(${(this.pdfFile.size / 1024 / 1024).toFixed(2)} MB)` });
    }

    if (this.statusLog) {
      const statusPill = infoBox.createDiv({ cls: "status-log-line", text: this.statusLog });
    }

    new Setting(contentEl)
      .setName("Import Action")
      .addDropdown(drop => {
        drop.addOption("new", "Create New Citation from PDF");
        if (this.existingRefs.length > 0) {
          drop.addOption("existing", "Attach PDF to an Existing Citation");
        }
        drop.setValue(this.mode);
        drop.onChange(val => {
          this.mode = val as 'new' | 'existing';
          this.renderModalContent();
        });
      });

    const formArea = contentEl.createDiv({ cls: "citation-form-container" });

    if (this.mode === 'existing') {
      new Setting(formArea)
        .setName("Target Citation")
        .setDesc("Choose which citation in your library should hold this PDF attachment")
        .addDropdown(drop => {
          for (const ref of this.existingRefs) {
            drop.addOption(ref.citekey, `[${ref.citekey}] ${ref.title.slice(0, 45)}...`);
          }
          drop.setValue(this.selectedExistingCitekey);
          drop.onChange(val => { this.selectedExistingCitekey = val; });
        });
    } else {
      new Setting(formArea)
        .setName("DOI / Online Identifier")
        .setDesc("Paste DOI or URL to pull publication details automatically")
        .addText(text => text
          .setPlaceholder("e.g. 10.1145/3313831.3376722")
          .setValue(this.doiOrIdentifier)
          .onChange(val => { this.doiOrIdentifier = val; }))
        .addButton(btn => btn
          .setButtonText("Fetch")
          .onClick(async () => {
            if (!this.doiOrIdentifier.trim()) {
              new Notice("Please enter a DOI or URL first.");
              return;
            }
            btn.setDisabled(true);
            btn.setButtonText("Fetching...");
            try {
              const res = await MetadataResolvers.detectAndResolve(this.doiOrIdentifier.trim());
              if (res.title) this.title = res.title;
              if (res.authors && res.authors.length > 0) this.author = res.authors.join(", ");
              if (res.year) this.year = String(res.year);
              this.statusLog = "Metadata successfully populated.";
              new Notice("Metadata populated!");
              this.renderModalContent();
            } catch (e: any) {
              new Notice(`Fetch error: ${e.message}`);
              btn.setDisabled(false);
              btn.setButtonText("Fetch");
            }
          }));

      new Setting(formArea)
        .setName("Title")
        .addText(text => text
          .setValue(this.title)
          .onChange(val => { this.title = val; }));

      new Setting(formArea)
        .setName("Authors")
        .setDesc("e.g. Smith, John or Smith, J. & Doe, A.")
        .addText(text => text
          .setPlaceholder("Authors")
          .setValue(this.author)
          .onChange(val => { this.author = val; }));

      new Setting(formArea)
        .setName("Year")
        .addText(text => text
          .setValue(this.year)
          .onChange(val => { this.year = val; }));
    }

    const btnRow = contentEl.createDiv({ cls: "citation-modal-button-row" });
    new Setting(btnRow)
      .addButton(btn => btn
        .setButtonText("Cancel")
        .onClick(() => this.close()))
      .addButton(btn => btn
        .setButtonText("Import & Save")
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Importing...");

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
              const authors = this.author ? this.author.split(/,|&/).map(a => a.trim()).filter(a => a.length > 0) : ["Unknown Author"];
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
            btn.setDisabled(false);
            btn.setButtonText("Import & Save");
          }
        }));
  }

  onClose() {
    this.contentEl.empty();
  }
}
