import { App, Modal, Setting, Notice, MarkdownView, normalizePath, setIcon } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, ProjectHealthStats, CitationStyle } from '../../backend/types';
import { ProjectIndexer } from '../../backend/projectIndexer';

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
    this.titleEl.setText(`Bibliography: ${this.project ? this.project.name : "All References"}`);
    
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-content-unified");

    // Controls Card
    const controlsDiv = contentEl.createDiv({ cls: "citation-modal-section-card" });

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
        .setDesc("Include only references cited in linked notes")
        .addToggle(toggle => toggle
          .setValue(this.onlyCited)
          .onChange(val => {
            this.onlyCited = val;
            this.updatePreview(previewEl);
          }));
    }

    // Live Preview Box
    contentEl.createEl("div", { cls: "preview-section-title", text: "Formatted Output" });
    const previewEl = contentEl.createEl("pre", { cls: "citation-bib-preview-box" });
    this.updatePreview(previewEl);

    // Export Note Card
    const exportDiv = contentEl.createDiv({ cls: "citation-modal-section-card" });
    new Setting(exportDiv)
      .setName("Export Target Note")
      .setDesc("Create or overwrite a dedicated bibliography note")
      .addText(text => {
        text.setPlaceholder("e.g. References.md")
          .setValue(this.exportPath)
          .onChange(val => { this.exportPath = val; });
        text.inputEl.addClass("setting-full-width-input");
      });

    // Native Modal Button Container
    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

    const closeBtn = buttonContainer.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());

    const copyBtn = buttonContainer.createEl("button", { text: "Copy to Clipboard" });
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(previewEl.getText());
      new Notice("Bibliography copied to clipboard!");
    });

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const appendBtn = buttonContainer.createEl("button", { text: "Append to Note" });
      appendBtn.addEventListener("click", () => {
        const bibText = previewEl.getText();
        const editor = activeView.editor;
        const doc = editor.getValue();
        const separator = doc.endsWith("\n") ? "\n" : "\n\n";
        editor.replaceRange(`${separator}${bibText}\n`, { line: editor.lineCount(), ch: 0 });
        new Notice(`Appended bibliography to ${activeView.file?.basename}`);
        this.close();
      });
    }

    const exportBtn = buttonContainer.createEl("button", { cls: "mod-cta", text: "Export File" });
    exportBtn.addEventListener("click", async () => {
      if (!this.exportPath.trim()) {
        new Notice("Please specify a target file path.");
        return;
      }
      const cleanPath = normalizePath(this.exportPath.endsWith('.md') ? this.exportPath : `${this.exportPath}.md`);
      try {
        await this.app.vault.adapter.write(cleanPath, previewEl.getText());
        new Notice(`Saved bibliography to ${cleanPath}`);
        this.close();
      } catch (err: any) {
        new Notice(`Export error: ${err.message}`);
      }
    });
  }

  private updatePreview(previewEl: HTMLElement) {
    const virtualProj: ProjectRecord = this.project || {
      id: "__ALL__",
      name: "All References",
      registeredFiles: [],
      referenceIds: [],
      created: "",
      modified: "",
    };

    const text = this.projectIndexer.generateBibliography(
      virtualProj,
      this.references,
      this.selectedStyle,
      this.onlyCited,
      this.stats || undefined
    );
    previewEl.setText(text);
  }

  onClose() {
    this.contentEl.empty();
  }
}
