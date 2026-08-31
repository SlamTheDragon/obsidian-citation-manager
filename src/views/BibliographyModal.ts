import { App, Modal, Setting, Notice, MarkdownView, normalizePath, setIcon } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, ProjectHealthStats, CitationStyle } from '../types';
import { ProjectIndexer } from '../projectIndexer';

export class BibliographyModal extends Modal {
  private project: ProjectRecord | null;
  private references: ReferenceMetadata[];
  private stats: ProjectHealthStats | null;
  private selectedStyle: CitationStyle;
  private onlyCited: boolean = false;
  private projectIndexer: ProjectIndexer;

  private exportPath: string = "";

  constructor(
    app: App,
    project: ProjectRecord | null,
    references: ReferenceMetadata[],
    stats: ProjectHealthStats | null,
    defaultStyle: CitationStyle = 'apa7'
  ) {
    super(app);
    this.project = project;
    this.references = references;
    this.stats = stats;
    this.selectedStyle = project?.citationStyle || defaultStyle;
    this.projectIndexer = new ProjectIndexer(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-bib-modal");

    const header = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = header.createSpan({ cls: "modal-header-icon" });
    setIcon(iconSpan, "book-open");
    header.createEl("h2", { text: `Bibliography: ${this.project ? this.project.name : "All References"}` });

    // Controls Row
    const controlsDiv = contentEl.createDiv({ cls: "citation-quick-fetch-box" });

    new Setting(controlsDiv)
      .setName("Citation Standard")
      .addDropdown(drop => {
        drop.addOption("apa7", "APA 7th Edition");
        drop.addOption("ieee", "IEEE");
        drop.addOption("harvard", "Harvard");
        drop.addOption("chicago", "Chicago");
        drop.addOption("vancouver", "Vancouver");
        drop.setValue(this.selectedStyle);
        drop.onChange(val => {
          this.selectedStyle = val as CitationStyle;
          this.updatePreview(previewEl);
        });
      });

    if (this.project && this.stats) {
      new Setting(controlsDiv)
        .setName("Scope Filter")
        .setDesc("Include only references cited in project documents")
        .addToggle(toggle => toggle
          .setValue(this.onlyCited)
          .onChange(val => {
            this.onlyCited = val;
            this.updatePreview(previewEl);
          }));
    }

    // Live Preview Box
    contentEl.createEl("h4", { text: "Generated Output Preview" });
    const previewEl = contentEl.createEl("pre", { cls: "citation-live-previews" });
    previewEl.style.maxHeight = "240px";
    previewEl.style.overflowY = "auto";
    previewEl.style.whiteSpace = "pre-wrap";
    this.updatePreview(previewEl);

    // Export Options
    contentEl.createEl("h4", { text: "Export Destination" });
    const exportDiv = contentEl.createDiv({ cls: "citation-form-container" });

    // 1. Copy to Clipboard
    new Setting(exportDiv)
      .setName("Clipboard")
      .setDesc("Copy formatted text to system clipboard")
      .addButton(btn => btn
        .setButtonText("Copy to Clipboard")
        .setCta()
        .onClick(async () => {
          const bibText = this.getFormattedBib();
          await navigator.clipboard.writeText(bibText);
          new Notice("Bibliography copied to clipboard!");
          this.close();
        }));

    // 2. Append to Active Note
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      new Setting(exportDiv)
        .setName(`Append to Active Note (${activeView.file?.basename})`)
        .setDesc("Insert at the end of your open note")
        .addButton(btn => btn
          .setButtonText("Append to Note")
          .onClick(async () => {
            const bibText = this.getFormattedBib();
            const editor = activeView.editor;
            const doc = editor.getValue();
            const separator = doc.endsWith("\n") ? "\n" : "\n\n";
            editor.replaceRange(`${separator}${bibText}\n`, { line: editor.lineCount(), ch: 0 });
            new Notice(`Appended bibliography to ${activeView.file?.basename}`);
            this.close();
          }));
    }

    // 3. Save to Vault File
    new Setting(exportDiv)
      .setName("Save to Vault Note")
      .setDesc("Specify path in vault to create or overwrite")
      .addText(text => text
        .setPlaceholder("e.g. References.md or Literature/Bibliography.md")
        .setValue(this.exportPath)
        .onChange(val => { this.exportPath = val; }))
      .addButton(btn => btn
        .setButtonText("Export to File")
        .onClick(async () => {
          if (!this.exportPath.trim()) {
            new Notice("Please specify a target file path.");
            return;
          }
          const cleanPath = normalizePath(this.exportPath.endsWith('.md') ? this.exportPath : `${this.exportPath}.md`);
          const bibText = this.getFormattedBib();
          try {
            await this.app.vault.adapter.write(cleanPath, bibText);
            new Notice(`Saved bibliography to ${cleanPath}`);
            this.close();
          } catch (e: any) {
            new Notice(`Export error: ${e.message}`);
          }
        }));
  }

  private getFormattedBib(): string {
    const virtualProj: ProjectRecord = this.project || {
      id: "__ALL__",
      name: "All References",
      registeredFiles: [],
      referenceIds: [],
      created: "",
      modified: "",
    };

    return this.projectIndexer.generateBibliography(
      virtualProj,
      this.references,
      this.selectedStyle,
      this.onlyCited,
      this.stats || undefined
    );
  }

  private updatePreview(previewEl: HTMLElement) {
    previewEl.setText(this.getFormattedBib());
  }

  onClose() {
    this.contentEl.empty();
  }
}
